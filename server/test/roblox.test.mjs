// Roblox 連携（docs/ROBLOX_SYNC.md）: 3つの口・指標・残高の約束を、本物のサーバーと本物の
// ソケットで測る。**鍵・冪等・負の残高・定義を1行足せば画面に出る**、を名指しで。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ADMIN_KEY = 'owner-password-123';
process.env.USPEAK_ROBLOX_KEY = 'roblox-test-key-0123456789abcdef-XYZ';
process.env.ROBLOX_RATE_PER_MIN = '60';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { FISH } = await import('../../client/dist/fishing-data.js');
const { summarize, periodRange, SEED_METRICS, metricToRow, validateMetric, CUSTOM } = await import('../src/game/roblox-metrics.js');
const { signRobloxReport, toMillis } = await import('../src/roblox/sync.js');
const { signClass } = await import('../src/game/report.js');
const { FileStore } = await import('../src/store/FileStore.js');
const { SheetsStore, SHEETS } = await import('../src/store/SheetsStore.js');

const KEY = process.env.USPEAK_ROBLOX_KEY;
let server; let http; let ws;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const post = (path, body, { key = KEY, raw = false } = {}) => fetch(`${http}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-uspeak-key': key } : {}) }, body: raw ? body : JSON.stringify(body),
});
const join = (name, classCode = '6-1') => new Client(ws).joinOrCreate('class', { classCode, name });
const ev = (id, type, username, data, extra = {}) => ({ id, type, username, ts: Date.now() - 60000, data, ...extra });

before(async () => {
  server = await startServer({ port: 0 });
  const addr = server.server.address();
  http = `http://127.0.0.1:${addr.port}`;
  ws = `ws://127.0.0.1:${addr.port}`;
});
after(async () => { await server.shutdown('test'); });

// ---- 指標（純粋な計算）----------------------------------------------------------------
test('週は日本時間の月曜〜日曜', () => {
  const wed = Date.parse('2026-10-07T03:00:00Z');            // 水曜 12:00 JST
  const w = periodRange('week', wed);
  assert.equal(new Date(w.since).toISOString(), '2026-10-04T15:00:00.000Z', '月曜 0:00 JST = 日曜 15:00 UTC');
  assert.equal(w.until - w.since, 7 * 86400000);
  const sunNight = Date.parse('2026-10-11T14:59:00Z');       // 日曜 23:59 JST — まだ同じ週
  assert.equal(periodRange('week', sunNight).since, w.since);
  const monMorning = Date.parse('2026-10-11T15:01:00Z');     // 月曜 0:01 JST — 次の週
  assert.equal(periodRange('week', monMorning).since, w.until);
  assert.deepEqual(periodRange('last', wed), { since: w.since - 7 * 86400000, until: w.since });
  assert.deepEqual(periodRange('all', wed), { since: 0, until: 0 });
});

test('指標の式：問題数・正答率・あてずっぽう率・覚えた単語・苦手な単語・連続日数', () => {
  const now = Date.parse('2026-10-07T03:00:00Z');
  const h = 3600000; const d = 86400000;
  const q = (id, word, correct, extra = {}, ago = h) => ({ id, ts: now - ago, type: 'quiz', username: 'a', data: { level: '5', word, correct, ...extra } });
  const rows = [
    q('1', 'apple', true), q('2', 'apple', true), q('3', 'apple', true),           // 覚えた
    q('4', 'dog', false, { fast: true }), q('5', 'dog', false), q('6', 'dog', true, { retry: true }),
    q('7', 'cat', true, {}, d + h), q('8', 'cat', false, {}, d + h),               // きのう
    { id: '9', ts: now - h, type: 'fast-type', username: 'a', data: {} },
    { id: '10', ts: now - h, type: 'session', username: 'a', world: 'main', data: { seconds: 900, coinsEarned: 30 } },
    { id: '11', ts: now - 9 * d, type: 'session', username: 'a', world: 'quiz', data: { seconds: 300, coinsEarned: 5 } },   // 先週
    { id: '12', ts: now - h, type: 'mystery', username: 'a', data: { anything: 1 } },  // 知らない type も壊さない
  ];
  const s = summarize(SEED_METRICS, rows, { now, wallet: { balance: 123 } });
  const v = (k) => s.metrics.find((m) => m.key === k).values;
  assert.equal(v('questions').week, 7, 'retry は数えない');
  assert.equal(v('accuracy').week, Math.round((4 / 7) * 1000) / 10);
  // (fast かつ 不正解 1 ＋ fast-type 1) ÷ (問題 7 ＋ fast-type 1)
  assert.equal(v('guess_rate').week, 25);
  assert.equal(v('study_seconds').week, 900);
  assert.equal(v('study_seconds').last, 300);
  assert.equal(v('study_seconds').all, 1200);
  assert.equal(v('active_days').week, 2);
  assert.equal(v('streak_days').all, 2, 'きょうと きのう');
  assert.equal(v('streak_days').week, undefined, '期間を持たない指標は累計だけ');
  assert.equal(v('words_mastered').all, 1, 'apple だけ（直近3問が正解）');
  assert.deepEqual(v('weak_words').all.map((w) => w.word), ['dog', 'cat'], '間違えた回数の多い順。apple は出ない');
  assert.equal(v('best_streak').week, 3);
  assert.equal(v('coins_earned').all, 35);
  assert.equal(v('balance').all, 123);
  assert.deepEqual(v('by_level').all.map((r) => [r.label, r.value]), [['5級', 57.1]]);
  assert.deepEqual(v('by_world').all.map((r) => [r.key, r.value]), [['main', 900], ['quiz', 300]]);
  assert.equal(s.counts.all, 12);
});

test('定義を1行足すだけで、新しい指標が出る（retry 回数）', () => {
  const now = Date.now();
  const rows = [
    { id: '1', ts: now - 1000, type: 'quiz', username: 'a', data: { word: 'a', correct: true } },
    { id: '2', ts: now - 1000, type: 'quiz', username: 'a', data: { word: 'a', correct: true, retry: true } },
    { id: '3', ts: now - 1000, type: 'quiz', username: 'a', data: { word: 'a', correct: false, retry: 'true' } },
  ];
  const retries = metricToRow({ key: 'retries', label_ja: 'retry 回数', label_en: 'Retries', kind: 'count', event_type: 'quiz', expr: { where: { retry: true } }, order: 15, unit: 'count' });
  assert.equal(validateMetric(retries), '');
  const s = summarize([...SEED_METRICS, retries], rows, { now });
  assert.equal(s.metrics.find((m) => m.key === 'retries').values.week, 2);
  assert.equal(s.metrics.find((m) => m.key === 'questions').values.week, 1);
  // 止めるべき定義は止める。
  assert.match(validateMetric(metricToRow({ key: 'Bad Key', kind: 'count' })), /key/);
  assert.match(validateMetric({ ...retries, expr_json: '{not json' }), /JSON/);
  assert.match(validateMetric(metricToRow({ key: 'x', kind: 'custom', expr: { fn: 'nope' } })), /custom/);
  assert.ok(Object.keys(CUSTOM).length >= 7);
});

test('時刻は 秒でも ミリ秒でも ISO でも', () => {
  assert.equal(toMillis(1760000000), 1760000000000);
  assert.equal(toMillis(1760000000000), 1760000000000);
  assert.equal(toMillis('2026-10-07T03:00:00Z'), Date.parse('2026-10-07T03:00:00Z'));
  assert.equal(toMillis('nonsense', 7), 7);
});

// ---- 保存 ------------------------------------------------------------------------------
test('FileStore: 同じ id は1度だけ、未配達→配達、残高は新しいほうが勝つ', async () => {
  const store = new FileStore(null, { log: { warn() {} } });
  await store.init();
  const r1 = store.appendRobloxEvents([{ id: 'e1', ts: 1, type: 'quiz', username: 'u', data_json: '{}' }, { id: 'e2', ts: 2, type: 'quiz', username: 'u', data_json: '{}' }]);
  assert.deepEqual(r1, { accepted: 2, duplicates: 0 });
  const r2 = store.appendRobloxEvents([{ id: 'e1', ts: 1, type: 'quiz', username: 'u', data_json: '{}' }, { id: 'e3', ts: 3, type: 'x', username: 'v', data_json: '{}' }]);
  assert.deepEqual(r2, { accepted: 1, duplicates: 1 });
  assert.equal((await store.listRobloxEvents({ username: 'u' })).length, 2);
  assert.equal((await store.listRobloxEvents({ since: 2 })).length, 2);
  store.addWalletEntry({ id: 'w1', username: 'u', amount: 10, reason: 'award:x', created_at: 't' });
  store.addWalletEntry({ id: 'w2', username: 'u', amount: -4, reason: 'spend:y', created_at: 't' });
  assert.equal((await store.listWalletEntries({ username: 'u', undelivered: true })).length, 2);
  assert.equal(await store.ackWalletEntries(['w1', 'nope'], 'now'), 1);
  assert.equal(await store.ackWalletEntries(['w1'], 'now'), 0, '2度目は何もしない');
  assert.deepEqual((await store.listWalletEntries({ username: 'u', undelivered: true })).map((e) => e.id), ['w2']);
  store.saveWalletSnapshot({ username: 'u', balance: 50, at: 'a' });
  store.saveWalletSnapshot({ username: 'u', balance: 60, at: 'b' });
  assert.equal((await store.getWalletSnapshot('u')).balance, 60);
  assert.equal(await store.getWalletSnapshot('nobody'), null);
  await store.saveMetrics(SEED_METRICS);
  assert.equal((await store.listMetrics()).length, SEED_METRICS.length);
  await store.saveRobloxLinks([{ username: 'rbx_taro', class: '6-1', name: 'たろう', note: '' }]);
  assert.equal((await store.listRobloxLinks())[0].username, 'rbx_taro');
});

test('SheetsStore: 5つのタブが作られ、記録は追記、配達の印は同じ行に書き戻す', async () => {
  const sheets = new Map(); const calls = [];
  const rowsOf = (n) => { if (!sheets.has(n)) sheets.set(n, []); return sheets.get(n); };
  const api = {
    async getSheetTitles() { return [...sheets.keys()]; },
    async addSheet(t) { rowsOf(t); },
    async getValues(range) { const [n, a1] = range.split('!'); const rows = rowsOf(n); if (a1 === '1:1') return rows.slice(0, 1); if (a1.startsWith('A2')) return rows.slice(1); return rows; },
    async update(range, values) { calls.push(`update:${range}`); const [n, a1] = range.split('!'); const row = Number(/\d+/.exec(a1)[0]); const rows = rowsOf(n); values.forEach((v, i) => { rows[row - 1 + i] = v; }); },
    async batchUpdate(data) { for (const d of data) { const [n, a1] = d.range.split('!'); rowsOf(n)[Number(/\d+/.exec(a1)[0]) - 1] = d.values[0]; } calls.push(`batch:${data.length}`); },
    async append(range, values) { const n = range.split('!')[0]; const rows = rowsOf(n); const first = rows.length + 1; rows.push(...values); calls.push(`append:${n}:${values.length}`); return `${n}!A${first}:J${first + values.length - 1}`; },
  };
  const store = new SheetsStore(api, { log: { warn() {}, info() {} } });
  await store.init();
  for (const t of [SHEETS.events, SHEETS.entries, SHEETS.snapshots, SHEETS.metrics, SHEETS.links]) assert.ok(sheets.has(t), t);
  assert.deepEqual(store.appendRobloxEvents([{ id: 'e1', ts: 1, type: 'quiz', username: 'u', data_json: '{"a":1}' }]), { accepted: 1, duplicates: 0 });
  assert.deepEqual(store.appendRobloxEvents([{ id: 'e1', ts: 1, type: 'quiz', username: 'u', data_json: '{}' }]), { accepted: 0, duplicates: 1 });
  store.addWalletEntry({ id: 'w1', username: 'u', amount: 10, reason: 'award:x', created_at: 't' });
  store.saveWalletSnapshot({ username: 'u', balance: 5, at: 'a' });
  await store.flush();
  assert.equal(rowsOf(SHEETS.events).length, 2, 'header + 1');
  assert.equal(rowsOf(SHEETS.entries)[1][5], '', 'delivered_at は空');
  assert.equal(await store.ackWalletEntries(['w1'], 'now'), 1);
  store.saveWalletSnapshot({ username: 'u', balance: 9, at: 'b' });
  await store.flush();
  assert.equal(rowsOf(SHEETS.entries).length, 2, '配達の印は追記ではなく同じ行');
  assert.equal(rowsOf(SHEETS.entries)[1][5], 'now');
  assert.equal(rowsOf(SHEETS.snapshots).length, 2, '残高も名前につき1行');
  assert.equal(rowsOf(SHEETS.snapshots)[1][1], 9);
  // 読み直しても同じ（再起動）。
  const again = new SheetsStore(api, { log: { warn() {}, info() {} } });
  await again.init();
  assert.equal((await again.getWalletSnapshot('u')).balance, 9);
  assert.equal((await again.listWalletEntries({ username: 'u', undelivered: true })).length, 0);
  assert.equal((await again.listRobloxEvents({ username: 'u' }))[0].id, 'e1');
  await again.saveMetrics(SEED_METRICS);
  assert.equal((await again.listMetrics()).length, SEED_METRICS.length);
});

// ---- HTTP: 3つの口 ----------------------------------------------------------------------
test('鍵がなければ 401、鍵が違っても 401、壊れた JSON は 400', async () => {
  assert.equal((await post('/api/roblox/events', { events: [] }, { key: '' })).status, 401);
  assert.equal((await post('/api/roblox/events', { events: [] }, { key: 'wrong' })).status, 401);
  assert.equal((await post('/api/roblox/wallet/pending', { users: [] }, { key: '' })).status, 401);
  assert.equal((await post('/api/roblox/events', '{not json', { raw: true })).status, 400);
  assert.equal((await post('/api/roblox/events', { events: 'x' })).status, 400);
  assert.equal((await post('/api/roblox/events', { events: Array.from({ length: 301 }, (_, i) => ev(`big${i}`, 'quiz', 'u', {})) })).status, 400);
  const fat = await post('/api/roblox/events', { events: [ev('fat', 'quiz', 'u', { blob: 'x'.repeat(33 * 1024) })] });
  assert.equal(fat.status, 400);
  assert.match((await fat.json()).error, /32768/);
});

test('記録は id で冪等：accepted 1 / duplicates 1。知らない type もそのまま貯まる', async () => {
  const r1 = await post('/api/roblox/events', { batchId: 'b1', placeId: '139338411931177', world: 'main', events: [ev('idem-1', 'quiz', 'rbx_hana', { level: '5', word: 'apple', correct: true }, { classCode: '6-1' })] });
  assert.equal(r1.status, 200);
  assert.deepEqual(await r1.json(), { ok: true, accepted: 1, duplicates: 0 });
  const r2 = await post('/api/roblox/events', { batchId: 'b2', events: [
    ev('idem-1', 'quiz', 'rbx_hana', { level: '5', word: 'apple', correct: true }, { classCode: '6-1' }),
    ev('idem-2', 'treasure_opened', 'rbx_hana', { chest: 'gold', nested: { deep: [1, 2, 3] } }, { classCode: '6-1', ts: Math.floor(Date.now() / 1000) - 30 }),
  ] });
  assert.deepEqual(await r2.json(), { ok: true, accepted: 1, duplicates: 1 });
  const stored = await server.store.listRobloxEvents({ username: 'rbx_hana' });
  assert.equal(stored.length, 2);
  const odd = stored.find((e) => e.id === 'idem-2');
  assert.equal(odd.type, 'treasure_opened');
  assert.deepEqual(JSON.parse(odd.data_json), { chest: 'gold', nested: { deep: [1, 2, 3] } });
  assert.ok(Math.abs(odd.ts - (Date.now() - 30000)) < 5000, '秒で来た時刻はミリ秒に');
  assert.equal(odd.world, '', 'batch の world は event に無ければ空のまま（b2 には world が無い）');
  assert.equal(stored.find((e) => e.id === 'idem-1').world, 'main');
});

test('pending → ack：未配達の増減が届き、印が付くまで何度でも返り、負の残高は 400', async () => {
  // Web でコインが動く（本物の部屋で、本物の applyOp → coinRow から）。
  const room = await join('rbx_ken');
  const welcome = await nextMessage(room, 'welcome');
  assert.equal(welcome.wallet.roblox, false, 'Roblox にまだ入っていない子は Web の残高のまま');
  const before = welcome.wallet.coins;
  await sleep(100);
  // 入室のログインボーナスも「コインが動いた」なので、ここで1行ある。
  const atJoin = (await server.store.listWalletEntries({ username: 'rbx_ken', undelivered: true })).length;
  room.send('economy', { type: 'sell', id: 'nothing' });   // 失敗する op は行を書かない
  await nextMessage(room, 'wallet');
  assert.equal((await server.store.listWalletEntries({ username: 'rbx_ken', undelivered: true })).length, atJoin);
  // はじめての さかな → 図鑑のボーナス（コインが ふえる）。
  room.send('answer', { q: `fish:${FISH[0].id}`, c: FISH[0].id });
  const res = await nextMessage(room, 'answer:result');
  assert.equal(res.correct, true);
  assert.ok(res.wallet.coins > before);
  const entries = await server.store.listWalletEntries({ username: 'rbx_ken', undelivered: true });
  assert.ok(entries.length >= 1, 'award の行が wallet_entries に');
  const delta = entries.reduce((s, e) => s + e.amount, 0);
  assert.ok(delta > 0);

  // 負の残高は拒む。
  assert.equal((await post('/api/roblox/wallet/pending', { users: [{ username: 'rbx_ken', balance: -1 }] })).status, 400);
  assert.equal((await post('/api/roblox/wallet/ack', { username: 'rbx_ken', ids: [], balance: -5 })).status, 400);
  assert.equal((await post('/api/roblox/wallet/pending', { users: Array.from({ length: 51 }, (_, i) => ({ username: `u${i}`, balance: 0 })) })).status, 400);

  // Roblox が残高 200 を預けて、未配達を受け取る。
  const p1 = await post('/api/roblox/wallet/pending', { users: [{ username: 'rbx_ken', userId: '12345', balance: 200 }] });
  assert.equal(p1.status, 200);
  const j1 = await p1.json();
  assert.equal(j1.users[0].total, delta);
  assert.deepEqual(j1.users[0].entries.map((e) => e.id).sort(), entries.map((e) => e.id).sort());
  // オンラインの子には、計算し直した残高（200 ＋ 未配達）が届く。
  const pushed = await nextMessage(room, 'wallet');
  assert.equal(pushed.op, 'roblox');
  assert.equal(pushed.wallet.coins, 200 + delta);
  assert.equal(pushed.wallet.roblox, true);
  // 印を付けるまで、同じ行がもう一度返る。
  const p2 = await (await post('/api/roblox/wallet/pending', { users: [{ username: 'rbx_ken', balance: 200 }] })).json();
  assert.equal(p2.users[0].entries.length, entries.length);
  // ack：適用後の残高と一緒に。
  const a = await post('/api/roblox/wallet/ack', { acks: [{ username: 'rbx_ken', ids: entries.map((e) => e.id), balance: 200 + delta }] });
  assert.deepEqual(await a.json(), { ok: true, acked: entries.length });
  const p3 = await (await post('/api/roblox/wallet/pending', { users: [{ username: 'rbx_ken', balance: 200 + delta }] })).json();
  assert.equal(p3.users[0].entries.length, 0, '配達済みはもう返らない');
  assert.equal(p3.users[0].balance, 200 + delta);
  // 入り直しても、残高は Roblox の値 ＋ 未配達。
  await room.leave(true);
  const again = await join('rbx_ken');
  const w2 = await nextMessage(again, 'welcome');
  assert.equal(w2.wallet.coins, 200 + delta);
  assert.equal(w2.wallet.roblox, true);
  assert.ok(before !== undefined);
  await again.leave(true);
});

test('1分の上限を超えると 429', async () => {
  let last = 200;
  for (let i = 0; i < 70 && last !== 429; i += 1) last = (await post('/api/roblox/events', { events: [] })).status;
  assert.equal(last, 429);
  // 上限の窓は鍵ごと。別の試験が続けて走れるよう、ここで窓を空ける。
  await sleep(50);
});

// ---- 画面 ---------------------------------------------------------------------------
test('/report/:username は署名つき。実データで累計・今週/先週・あてずっぽう率・級・単語・ワールドが出る', async () => {
  const now = Date.now();
  const mk = (i, data, type = 'quiz', extra = {}) => ({ id: `rep-${i}`, ts: now - 3600000 - i * 1000, type, username: 'rbx_hana', classCode: '6-1', data, ...extra });
  const events = [
    mk(1, { level: '5', word: 'apple', correct: true }), mk(2, { level: '5', word: 'apple', correct: true }), mk(3, { level: '5', word: 'apple', correct: true }),
    mk(4, { level: '4', word: 'river', correct: false, fast: true }), mk(5, { level: '4', word: 'river', correct: false }),
    mk(6, { seconds: 1200, coinsEarned: 40 }, 'session', { world: 'main' }), mk(7, { seconds: 300, coinsEarned: 5 }, 'session', { world: 'quiz' }),
  ];
  // レート制限の窓が空くのを待つ（上の試験が使い切っている）。
  for (let i = 0; i < 100; i += 1) { const r = await post('/api/roblox/events', { events }); if (r.status !== 429) { assert.equal(r.status, 200); break; } await sleep(700); }
  const bad = await fetch(`${http}/report/rbx_hana?t=nope`);
  assert.equal(bad.status, 404);
  const token = signRobloxReport(process.env.REPORT_SECRET, 'rbx_hana');
  const page = await fetch(`${http}/report/rbx_hana?t=${token}`);
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const needle of ['累計', '今週と先週', 'あてずっぽう率', '問題の読み上げが終わる前に答えて間違えた割合', '級ごとの正答率', '間違えやすい単語', 'ワールド別の時間', 'river', '5級', '4級', 'main', 'noindex']) {
    assert.ok(html.includes(needle), `page has ${needle}`);
  }
  assert.ok(!/>apple</.test(html), '覚えた単語は苦手には出ない');
  const json = await (await fetch(`${http}/report/rbx_hana?t=${token}&format=json`)).json();
  assert.equal(json.metrics.find((m) => m.key === 'questions').values.all, 6, 'idem-1 の1問 ＋ 5問');
  assert.equal(json.metrics.find((m) => m.key === 'guess_rate').values.all, Math.round((1 / 6) * 1000) / 10);
  assert.equal(json.metrics.find((m) => m.key === 'words_mastered').values.all, 1);
});

test('/class/:classCode に Roblox の表が出て、CSV も同じ署名で取れる。未登録の印と気になる印', async () => {
  const token = signClass(process.env.REPORT_SECRET, '6-1');
  const html = await (await fetch(`${http}/class/6-1?t=${token}`)).text();
  assert.ok(html.includes('Roblox の学習'), 'the section');
  for (const col of ['今週の学習時間', '問題数', '正答率', 'あてずっぽう率', '最後に来た日', '連続日数']) assert.ok(html.includes(col), col);
  assert.ok(html.includes('rbx_hana'));
  assert.ok(html.includes('未登録'), 'rbx_hana は名簿にも紐づけにも無い');
  assert.ok(html.includes('rbx_ken'), 'Web の記録がある子は Roblox の記録が無くても出る');
  assert.ok(html.includes('roblox.csv'), 'CSV のリンク');
  const csv = await fetch(`${http}/class/6-1/roblox.csv?t=${token}`);
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.match(text.split('\n')[0], /^username,name,registered,study_minutes_week,questions_week,accuracy_week,guess_rate_week,last_seen,streak_days,flags/);
  assert.ok(text.includes('rbx_hana'));
  assert.equal((await fetch(`${http}/class/6-1/roblox.csv?t=nope`)).status, 404);
  const json = await (await fetch(`${http}/class/6-1?t=${token}&format=json`)).json();
  const hana = json.roblox.find((r) => r.username === 'rbx_hana');
  assert.equal(hana.registered, false);
  assert.equal(hana.reportToken, undefined, 'json には署名を出さない');
});

test('管理ページ：指標に「retry 回数」を1行足すと、保護者ページと先生ページの両方に出る。紐づけで未登録が消える', async () => {
  const login = await fetch(`${http}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${process.env.ADMIN_KEY}`, redirect: 'manual' });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const H = { cookie, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json' };
  const state = await (await fetch(`${http}/admin/api/roblox`, { headers: H })).json();
  assert.equal(state.ok, true);
  assert.equal(state.enabled, true);
  assert.equal(state.metrics.length, SEED_METRICS.length, 'seeded');
  assert.ok(state.usernames.some((u) => u.username === 'rbx_hana'));
  assert.match(state.reports.rbx_hana, /^\/report\/rbx_hana\?t=/);
  // 壊れた定義は 400。
  const badSave = await fetch(`${http}/admin/api/roblox/metrics`, { method: 'PUT', headers: H, body: JSON.stringify({ rows: [...state.metrics, { key: 'retries', kind: 'count', expr_json: '{oops' }] }) });
  assert.equal(badSave.status, 400);
  // 1行足す。
  const rows = [...state.metrics, { key: 'retries', label_ja: 'retry 回数', label_en: 'Retries', kind: 'count', event_type: 'quiz', expr_json: '{"where":{"retry":true}}', unit: 'count', order: '15', enabled: '1' }];
  const saved = await (await fetch(`${http}/admin/api/roblox/metrics`, { method: 'PUT', headers: H, body: JSON.stringify({ rows }) })).json();
  assert.equal(saved.ok, true);
  assert.equal(saved.count, SEED_METRICS.length + 1);
  const token = signRobloxReport(process.env.REPORT_SECRET, 'rbx_hana');
  const parent = await (await fetch(`${http}/report/rbx_hana?t=${token}`)).text();
  assert.ok(parent.includes('retry 回数'), 'parent page shows the new metric');
  const classToken = signClass(process.env.REPORT_SECRET, '6-1');
  const teacher = await (await fetch(`${http}/class/6-1?t=${classToken}`)).text();
  assert.ok(teacher.includes('retry 回数'), 'teacher page shows the new column');
  const csv = await (await fetch(`${http}/class/6-1/roblox.csv?t=${classToken}`)).text();
  assert.ok(csv.split('\n')[0].includes('retries_week'));
  // 紐づけ：rbx_hana ⇔ 6-1 の「はな」。
  const linked = await (await fetch(`${http}/admin/api/roblox/links`, { method: 'PUT', headers: H, body: JSON.stringify({ rows: [{ username: 'rbx_hana', class: '6-1', name: 'はな' }, { username: '', name: 'x' }] }) })).json();
  assert.equal(linked.count, 1);
  const teacher2 = await (await fetch(`${http}/class/6-1?t=${classToken}`)).text();
  assert.ok(teacher2.includes('はな'));
  const json = await (await fetch(`${http}/class/6-1?t=${classToken}&format=json`)).json();
  assert.equal(json.roblox.find((r) => r.username === 'rbx_hana').registered, true);
  // 紐づけた子の Web のコインは rbx_hana の財布に書かれる。
  const room = await join('はな');
  await nextMessage(room, 'welcome');
  await sleep(50);
  const beforeN = (await server.store.listWalletEntries({ username: 'rbx_hana' })).length;
  room.send('answer', { q: `fish:${FISH[1].id}`, c: FISH[1].id });
  await nextMessage(room, 'answer:result');
  assert.equal((await server.store.listWalletEntries({ username: 'rbx_hana' })).length, beforeN + 1);
  // 先生コンソールのリンク一覧にも Roblox のページが並ぶ。
  const teacherRoom = await new Client(ws).joinOrCreate('class', { classCode: '6-1', name: 'せんせい', teacherKey: process.env.TEACHER_KEY });
  await nextMessage(teacherRoom, 'welcome');
  teacherRoom.send('teacher', { cmd: 'reports' });
  const ack = await nextMessage(teacherRoom, 'teacher:ack');
  const hana = ack.links.find((l) => l.name === 'はな');
  assert.match(hana.roblox, /\/report\/rbx_hana\?t=/);
  await room.leave(true);
  await teacherRoom.leave(true);
});
