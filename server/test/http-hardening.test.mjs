// HTTP の 守り（2026-11 の 監査）— 総当たりの 守りが 署名つきの 口にも 効く・Fly の 外で Fly-Client-IP を 信じない・
// zip 爆弾・正規表現の 止まり（ReDoS）・__proto__・CSV の 数式・BLOCKWILD の 口・TTS の 置き場の 上限・Roblox の 保護者ページの エスケープ。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.TASKS = 'off';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'hh-data-'));
delete process.env.FLY_APP_NAME;

const { startServer } = await import('../src/index.js');
const { rateLimit, clientIp } = await import('../src/privacy.js');
const { reportPath } = await import('../src/game/report.js');
const files = await import('../src/homework/files.js');
const { extractHomework } = await import('../src/homework/extract.js');
const { KidsStore } = await import('../src/classroom/kids-store.js');
const { RoadmapStore } = await import('../src/roadmap/store.js');
const { AbcStore } = await import('../src/abc/store.js');
const { rosterToCsv, rosterFromText } = await import('../src/store/roster-text.js');
const robloxPages = await import('../src/roblox/pages.js');
const { createBlockwildServer } = await import('../src/blockwild/server.js');
const { createTts } = await import('../src/tts/service.js');

let app; let base;
before(async () => { app = await startServer({ port: 0 }); base = `http://127.0.0.1:${app.server.address().port}`; });
after(async () => { await app.shutdown('test'); });

const ms = (f) => { const t = Date.now(); f(); return Date.now() - t; };

test('Fly の 外では Fly-Client-IP を 信じない（頭を かえても しめ出しを すり抜けられない）', () => {
  const lim = rateLimit({ windowMs: 60_000, max: 2 });
  const req = (ip) => ({ ip: '198.51.100.7', get: (h) => (h === 'fly-client-ip' ? ip : undefined) });
  const res = () => { const r = { code: 200, set() { return r; }, status(c) { r.code = c; return r; }, type() { return r; }, send() { return r; } }; return r; };
  const codes = [];
  for (let i = 0; i < 4; i += 1) { const r = res(); let passed = false; lim(req(`203.0.113.${i}`), r, () => { passed = true; }); codes.push(passed ? 200 : r.code); }
  assert.deepEqual(codes, [200, 200, 429, 429]);
  assert.equal(clientIp(req('203.0.113.9')), '198.51.100.7');
  process.env.FLY_APP_NAME = 'x';
  try { assert.equal(clientIp(req('203.0.113.9')), '203.0.113.9'); } finally { delete process.env.FLY_APP_NAME; }
});

test('/roblox-setup/__proto__ や constructor は 500 でなく 404', async () => {
  for (const n of ['__proto__', 'constructor', 'toString']) assert.equal((await fetch(`${base}/roblox-setup/${n}`)).status, 404, n);
  assert.equal((await fetch(`${base}/roblox-setup/abc`)).status, 200);
});

test('こわれた クッキー（%）で 管理・先生の 画面が 500 に ならない', async () => {
  const r = await fetch(`${base}/teacher/homework`, { headers: { cookie: 'uspeak_teacher=%E0%A4%A' } });
  assert.equal(r.status, 200);
});

// zip を 1 つ 作る（中身 1 つ・deflate）。
function zipOf(name, data) {
  const comp = zlib.deflateRawSync(data);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(0, 42);
  const head = Buffer.concat([local, nameBuf, comp]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + nameBuf.length, 12); eocd.writeUInt32LE(head.length, 16);
  return Buffer.concat([head, central, nameBuf, eocd]);
}

test('zip 爆弾：ひらいた 大きさに 上限が あり、小さな ファイルが 何 GB にも ふくらまない', () => {
  const bomb = zipOf('word/document.xml', Buffer.alloc(8 * 1024 * 1024)); // 8MB の 0 → 数 KB
  assert.ok(bomb.length < 64 * 1024);
  assert.throws(() => files.unzip(bomb, { maxEntry: 1024 * 1024 }), /大きすぎ/);
  // 上限の 中なら ふつうに 読める
  const ok = zipOf('word/document.xml', Buffer.from('<w:p><w:r><w:t>apple = りんご</w:t></w:r></w:p>'));
  assert.match(files.docxText(ok), /apple = りんご/);
  assert.ok(files.UNZIP_MAX_ENTRY <= 64 * 1024 * 1024 && files.UNZIP_MAX_TOTAL <= 256 * 1024 * 1024);
});

test('ReDoS：閉じない タグ・改行・「{」だらけの 文でも 読みとりが 止まらない（前は 何秒〜何分）', async () => {
  assert.ok(ms(() => files.parseMoodleXml('<quiz>' + '<question type="a"'.repeat(100000))) < 1500);
  assert.ok(ms(() => files.parseMoodleXml('<quiz><question type="a">' + '<answer '.repeat(100000) + '</question>')) < 1500);
  assert.ok(ms(() => files.hasGiftBraces('{'.repeat(300000))) < 500);
  assert.ok(ms(() => files.hasAikenAnswer('\n'.repeat(300000))) < 500);
  const t = Date.now();
  await extractHomework({ text: '\n'.repeat(200000) + '{'.repeat(200000) + '(  '.repeat(100000) }, { useAi: false });
  assert.ok(Date.now() - t < 3000, `${Date.now() - t}ms`);
  // 見わけは 前と 同じ
  assert.equal(files.hasGiftBraces('What is {=red ~blue}?'), true);
  assert.equal(files.hasGiftBraces('a {b} c'), false);
  assert.equal(files.hasAikenAnswer('Q\nA. x\nB. y\nANSWER: B'), true);
  const moodle = files.parseMoodleXml('<quiz><question type="multichoice"><questiontext><text>Pick red</text></questiontext><answer fraction="100"><text>red</text></answer><answer fraction="0"><text>blue</text></answer></question></quiz>');
  assert.deepEqual(moodle, [{ kind: 'mc', prompt: 'Pick red', answer: 'red', wrong: ['blue'] }]);
});

test('__proto__ の クラス・名前で Object.prototype が よごれない（幼児モード・ロードマップ・ABC）', async () => {
  const kids = await new KidsStore(null).init();
  assert.equal(await kids.setClass('__proto__', true), true);
  assert.equal(await kids.setPick('__proto__', true), true);
  await kids.setStudent('constructor', '__proto__', 'on');
  assert.equal({}.on, undefined);
  assert.equal({}.pick, undefined);
  assert.equal(kids.pickOf('6-1'), false);
  assert.equal(kids.classOf('__proto__').on, true);
  const rm = await new RoadmapStore(null).init();
  await rm.saveSettings('__proto__', { start: 'B' });
  assert.equal(rm.settingsFor('other'), null);
  assert.equal(rm.startFor('__proto__'), 'B');
  const abc = await new AbcStore(null).init();
  await abc.setSettings('__proto__', {});
  assert.equal(Object.getPrototypeOf(abc.settings), null);
  assert.equal({}.caseFirst, undefined);
});

test('CSV の 数式よけ：名簿と Roblox の 表（= + - @ ではじまる 文字に \' を つける）。名簿は 読みもどしても 同じ', () => {
  const rows = [{ class: '6-1', name: '=HYPERLINK("http://x")', teacher: false }, { class: '6-1', name: 'Sora' }];
  const csv = rosterToCsv(rows);
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`));
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv));
  assert.deepEqual(rosterFromText(csv).map((r) => r.name), ['=HYPERLINK("http://x")', 'Sora']);
  const rb = robloxPages.classCsv([{ username: 'u1', name: '@SUM(A1)', registered: true, metrics: [] }]);
  assert.ok(rb.includes(`"'@SUM(A1)"`));
});

test('Roblox の 保護者ページ：紐づけの 名前を エスケープする', () => {
  const html = robloxPages.parentHtml({ username: 'u1', child: { name: '<img src=x onerror=alert(1)>', class: 'a' }, metrics: [], counts: { all: 0 }, recent: [], lastSeen: 0 });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
});

// ---- BLOCKWILD の 口 ------------------------------------------------------------------------------
function bw(url, name) {
  const ws = new WebSocket(url);
  const c = { ws, msgs: [], status: 0 };
  c.ready = new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name })));
    ws.on('message', (d, bin) => { if (bin) return; const m = JSON.parse(d.toString()); if (m.t === 'welcome') resolve(m); else c.msgs.push(m); });
    ws.on('unexpected-response', (req, res) => { c.status = res.statusCode; reject(new Error(String(res.statusCode))); });
    ws.on('error', reject);
  });
  return c;
}
const sleep = (n) => new Promise((r) => setTimeout(r, n));

test('BLOCKWILD：クラスコードらしくない 道は ことわる・世界の 数に 上限（空の 世界から すてる）・チャットは クラスの チャットと 同じ しらべ', async () => {
  const srv = http.createServer();
  const dataDir = mkdtempSync(join(tmpdir(), 'hh-bw-'));
  const bwsrv = createBlockwildServer({ server: srv, dataDir, log: { info() {}, warn() {} }, spawnFor: async () => [128.5, 40, 128.5], maxWorlds: 2 });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = `ws://127.0.0.1:${srv.address().port}`;
  try {
    const bad = bw(`${b}/bw/${encodeURIComponent('../../etc')}/ws`, 'X');
    await assert.rejects(bad.ready); assert.equal(bad.status, 404);
    // 2 つ まで。3 つめは 空の 世界を すてて 入る
    const a1 = bw(`${b}/bw/w1/ws`, 'A'); await a1.ready;
    const a2 = bw(`${b}/bw/w2/ws`, 'B'); await a2.ready;
    const full = bw(`${b}/bw/w3/ws`, 'C');
    await assert.rejects(full.ready); assert.equal(full.status, 503);
    a2.ws.close(); await sleep(100);
    const a3 = bw(`${b}/bw/w3/ws`, 'C'); await a3.ready;
    assert.deepEqual([...bwsrv.worlds.keys()].sort(), ['w1', 'w3']);
    // チャット：電話番号は とどかない、ふつうの 文は とどく
    const a4 = bw(`${b}/bw/w1/ws`, 'D'); await a4.ready;
    a1.ws.send(JSON.stringify({ t: 'chat', text: 'call me 090-1234-5678' }));
    await sleep(100);
    a1.ws.send(JSON.stringify({ t: 'chat', text: 'hello' }));
    a1.ws.send(JSON.stringify({ t: 'chat', text: 'again' })); // 1.5 秒 たって いないので すてる
    await sleep(1600);
    a1.ws.send(JSON.stringify({ t: 'chat', text: 'nice house' }));
    await sleep(200);
    const chats = a4.msgs.filter((m) => m.t === 'chat').map((m) => m.text);
    assert.deepEqual(chats, ['hello', 'nice house']);
    assert.ok(a1.msgs.some((m) => m.t === 'sys'), 'the sender is told it was not sent');
    for (const c of [a1, a3, a4]) c.ws.close();
  } finally { bwsrv.close(); await new Promise((r) => srv.close(r)); }
});

test('TTS：置き場が 上限を こえたら 新しい 音は 作らない（もう ある 音は 返す）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hh-tts-'));
  let made = 0;
  const tts = createTts({ dir, maxCacheBytes: 1000, generate: async () => { made += 1; return Buffer.alloc(800, 1); }, log: { warn() {} } });
  assert.equal((await tts.get('hello', 'en')).status, 200);
  assert.equal((await tts.get('hello', 'en')).cached, true);
  writeFileSync(join(dir, 'filler.mp3'), Buffer.alloc(400));
  // まだ 数えて いた 合計に のって いない ファイルでも、作った ぶんで 800 < 1000 → 次の 1 つで こえる
  assert.equal((await tts.get('world', 'en')).status, 200);
  assert.equal((await tts.get('again', 'en')).status, 503);
  assert.equal((await tts.get('hello', 'en')).status, 200);
  assert.equal(made, 2);
});

test('署名つきの /report・/class・/export にも 1 IP 1 分 120 回の 守りが 効く（前は 口の あとに 置いて いて 効かなかった）', async () => {
  const url = base + reportPath(process.env.REPORT_SECRET, 'hh', 'Sora');
  let last = 0;
  for (let i = 0; i < 121; i += 1) last = (await fetch(url)).status;
  assert.equal(last, 429);
  // /class/<code> も 同じ 数え（同じ IP）なので もう 429。
  assert.equal((await fetch(`${base}/class/hh?t=x`)).status, 429);
});
