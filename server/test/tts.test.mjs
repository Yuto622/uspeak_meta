// 自然な 声（/api/tts）：鍵が なければ 503・同じ 文は 1 回だけ 作って のこす・長すぎる 文・1 日の 上限。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
const { createTts, MAX_CHARS } = await import('../src/tts/service.js');
const quiet = { warn() {} };

test('鍵も 作る 口も なければ 503（ブラウザは 端末の 声に もどる）', async () => {
  const tts = createTts({ dir: '', apiKey: '', log: quiet });
  assert.equal(tts.enabled, false);
  assert.equal((await tts.get('Hello', 'en')).status, 503);
});

test('同じ 文は 1 回だけ 作り、DATA_DIR/tts に のこして 次から ファイルを 返す', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-'));
  const calls = [];
  const generate = async (text, o) => { calls.push([text, o.lang, o.instructions]); return Buffer.from(`mp3:${text}`); };
  const tts = createTts({ dir, generate, log: quiet });
  const [a, b] = await Promise.all([tts.get('  Hello,   friend! ', 'en'), tts.get('Hello, friend!', 'en')]);
  assert.equal(a.status, 200); assert.equal(String(a.audio), 'mp3:Hello, friend!');
  assert.equal(b.status, 200);
  assert.equal(calls.length, 1, '同時に たのまれても 1 回');
  assert.match(calls[0][2], /slowly/);
  const again = createTts({ dir, generate, log: quiet });
  const c = await again.get('Hello, friend!', 'en');
  assert.equal(c.cached, true); assert.equal(calls.length, 1);
  // 日本語は 日本語の 読み方で（lang を 書かなくても 文字で きめる）
  await tts.get('すきな 色は？');
  assert.equal(calls[1][1], 'ja');
  assert.equal((await fs.readdir(dir)).filter((f) => f.endsWith('.mp3')).length, 2);
});

test('からの 文・長すぎる 文は ことわる。1 日に 新しく 作るのは 上限まで', async () => {
  let n = 0;
  const tts = createTts({ dir: '', dailyNew: 2, generate: async () => { n += 1; return Buffer.from('x'); }, log: quiet });
  assert.equal((await tts.get('', 'en')).status, 400);
  assert.equal((await tts.get('a'.repeat(MAX_CHARS + 1), 'en')).status, 413);
  assert.equal((await tts.get('one', 'en')).status, 200);
  assert.equal((await tts.get('two', 'en')).status, 200);
  assert.equal((await tts.get('three', 'en')).status, 503);
  assert.equal(n, 2);
});

test('声（一覧の ものだけ）と ナレーションの 話しかたを えらべる。いつもの 声とは べつに のこす', async () => {
  const calls = [];
  const tts = createTts({ dir: '', generate: async (text, o) => { calls.push([o.voice, o.instructions]); return Buffer.from('x'); }, log: quiet });
  await tts.get('こんにちは', 'ja');
  await tts.get('こんにちは', 'ja', { voice: 'onyx', style: 'narr' });
  await tts.get('こんにちは', 'ja', { voice: 'evil; rm', style: 'x' });
  assert.equal(calls[0][0], 'coral'); assert.match(calls[0][1], /小学生/);
  assert.equal(calls[1][0], 'onyx'); assert.match(calls[1][1], /ナレーター/);
  assert.equal(calls.length, 3);
  assert.equal(calls[2][0], 'coral', '一覧に ない 声は いつもの 声');
});

test('作るのに しっぱいしたら 502（のこさない）', async () => {
  const tts = createTts({ dir: '', generate: async () => { throw new Error('down'); }, log: quiet });
  assert.equal((await tts.get('Hi', 'en')).status, 502);
});

test('サーバーの 口 GET /api/tts は mp3 を 返す', async () => {
  const { startServer } = await import('../src/index.js');
  const server = await startServer({ port: 0, ttsGenerate: async (t) => Buffer.from(`mp3:${t}`) });
  try {
    const base = `http://127.0.0.1:${server.server.address().port}`;
    const res = await fetch(`${base}/api/tts?lang=en&t=${encodeURIComponent('Good morning!')}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/mpeg');
    assert.match(res.headers.get('cache-control'), /immutable/);
    assert.equal(await res.text(), 'mp3:Good morning!');
    assert.equal((await fetch(`${base}/api/tts?t=`)).status, 400);
  } finally { await server.shutdown('test'); }
});
