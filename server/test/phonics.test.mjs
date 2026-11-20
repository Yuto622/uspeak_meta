// フォニックス（もじの おと）：つづり → おとの きまり・ぜんぶの おとに 音の ファイル・/phonics/<id>・運営の ろくおん・問題に おとが のる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.ADMIN_KEY = 'owner-password-123';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.LOG_LEVEL = 'error';

const P = await import('../../client/dist/phonics.js');
const A = await import('../src/game/abc.js');
const { isWav } = await import('../src/abc/phonics-voices.js');
const ASSETS = new URL('../../client/dist/assets/phonics/', import.meta.url);

let server; let http; let admin = '';
before(async () => {
  const { startServer } = await import('../src/index.js');
  server = await startServer({ port: 0 });
  http = `http://127.0.0.1:${server.server.address().port}`;
  const r = await fetch(`${http}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-password-123', redirect: 'manual' });
  admin = (r.headers.get('set-cookie') || '').split(';')[0];
});
after(async () => { await server.shutdown('test'); });

test('きまり：もじの おと・ことばの おと（ながい ぼいん・だまる e・やわらかい c・2 もじ）', () => {
  assert.equal(P.letterSound('c'), 'k');
  assert.equal(P.letterSound('x'), 'ks');
  assert.equal(P.letterSound('q'), 'kw');
  assert.equal(P.letterSound('sh'), 'sh');
  assert.equal(P.letterSound('ck'), 'k');
  assert.deepEqual(P.soundsOf('cat', ['c', 'a', 't']), ['k', 'a', 't']);
  assert.deepEqual(P.soundsOf('cake', ['c', 'a', 'k', 'e']), ['k', 'ay', 'k', null]);
  assert.deepEqual(P.soundsOf('rice', ['r', 'i', 'c', 'e']), ['r', 'ie', 's', null]);
  assert.deepEqual(P.soundsOf('nose', ['n', 'o', 's', 'e']), ['n', 'oa', 'z', null]);
  assert.deepEqual(P.soundsOf('cube', ['c', 'u', 'b', 'e']), ['k', 'yoo', 'b', null]);
  assert.deepEqual(P.soundsOf('flute', ['f', 'l', 'u', 't', 'e']), ['f', 'l', 'oo', 't', null]);
  assert.deepEqual(P.soundsOf('sheep', ['sh', 'ee', 'p']), ['sh', 'ee', 'p']);
  assert.deepEqual(P.soundsOf('cheese', ['ch', 'ee', 'se']), ['ch', 'ee', 'z']);
  assert.deepEqual(P.soundsOf('thumb', ['th', 'u', 'mb']), ['th', 'u', 'm']);
  assert.deepEqual(P.soundsOf('cherry', ['ch', 'e', 'rr', 'y']), ['ch', 'e', 'r', 'ee']);
});

test('ABC の ことば ぜんぶ・26 もじ ぜんぶに おとが あり、おとには ぜんぶ 音の ファイルが ある', () => {
  const d = A.data();
  for (const l of d.order) assert.ok(P.letterSound(l), `${l} has no sound`);
  const words = [...d.cvc, ...Object.values(d.digraphs).flat(), ...Object.values(d.magicE).flat()];
  for (const w of words) {
    const s = P.soundsOf(w.w, w.parts);
    assert.equal(s.length, w.parts.length);
    s.forEach((id, i) => assert.ok(id === null ? w.parts[i] === 'e' : P.PHONEMES[id], `${w.w}: ${w.parts[i]} → ${id}`));
  }
  const src = JSON.parse(readFileSync(new URL('SOURCE.json', ASSETS), 'utf8'));
  for (const id of P.PHONEME_IDS) {
    const f = new URL(`${id}.mp3`, ASSETS);
    assert.ok(existsSync(f), `no file for /${id}/`);
    const b = readFileSync(f);
    assert.equal(createHash('sha256').update(b).digest('hex'), src.files[`${id}.mp3`].sha256, `${id}.mp3 does not match SOURCE.json`);
  }
});

test('もんだいに おとが のる（答えは のらない）', () => {
  const d = A.data();
  const round = A.startRound(A.blankProgress(), {}, { hi: true, rng: () => 0.3 });
  const q = A.question(round);
  assert.equal(q.kind, 'blend');
  assert.equal(q.sounds.length, q.parts.length);
  assert.ok(!('word' in q) && !('answer' in q));
  assert.ok(d);
});

test('/phonics/<id>：同梱の 音・知らない id は 404・運営が ろくおん すると そちらに・もとに もどせる', async () => {
  let r = await fetch(`${http}/phonics/s?v=b1`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /audio\/mpeg/);
  assert.match(r.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(`${http}/phonics/zz`)).status, 404);
  assert.equal((await fetch(`${http}/phonics/..%2Fsecret`)).status, 404);

  // ろくおん：運営だけ・WAV だけ。
  const pcm = Buffer.alloc(3200);
  const head = Buffer.alloc(44); head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVE', 8); head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(16000, 24); head.writeUInt32LE(32000, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
  const wav = Buffer.concat([head, pcm]);
  assert.ok(isWav(wav));
  const H = { cookie: admin, 'x-requested-with': 'uspeak-admin', 'content-type': 'audio/wav' };
  assert.equal((await fetch(`${http}/admin/api/abc/phonics/s`, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body: wav })).status, 401);
  assert.equal((await fetch(`${http}/admin/api/abc/phonics/s`, { method: 'PUT', headers: H, body: Buffer.from('not a wav at all, just text that is long enough to pass the size check ...........') })).status, 400);
  r = await fetch(`${http}/admin/api/abc/phonics/s`, { method: 'PUT', headers: H, body: wav });
  const saved = await r.json();
  assert.equal(r.status, 200);
  assert.ok(saved.sounds.find((x) => x.id === 's').recorded);
  r = await fetch(`${http}/phonics/s?v=${saved.v}`);
  assert.match(r.headers.get('content-type'), /audio\/wav/);
  assert.equal(Buffer.from(await r.arrayBuffer()).length, wav.length);
  // 古い 版の ?v= は キャッシュさせない。
  assert.match((await fetch(`${http}/phonics/s?v=b1`)).headers.get('cache-control'), /no-cache/);
  r = await fetch(`${http}/admin/api/abc/phonics/s`, { method: 'DELETE', headers: H });
  assert.equal(r.status, 200);
  r = await fetch(`${http}/phonics/s`);
  assert.match(r.headers.get('content-type'), /audio\/mpeg/);
});
