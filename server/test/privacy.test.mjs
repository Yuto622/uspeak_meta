// 個人情報の 守り — ログに 名前を 書かない・AI に わたす 前の そうじ・1 人ぶんの 削除・保持期間・総当たりの 守り。
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LOG_LEVEL = 'error';
process.env.LOG_SALT = 'test-salt';

const { who, ipTag } = await import('../src/log.js');
const { scrubContact, cleanSay } = await import('../src/game/say.js');
const { FileStore } = await import('../src/store/FileStore.js');
const { ReportStore } = await import('../src/parent-report/store.js');
const { eraseStudent, rateLimit } = await import('../src/privacy.js');

test('ログの 札：名前は 出ない・同じ 名前は 同じ 札・鍵なしでは 逆引き できない', () => {
  const a = who('ゆうと'), b = who('ゆうと'), c = who('はな');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^u:[\w-]{6}$/);
  assert.ok(!a.includes('ゆうと'));
  assert.equal(who(''), '(no name)');
  assert.match(ipTag('203.0.113.9'), /^ip:[\w-]{6}$/);
  assert.ok(!ipTag('203.0.113.9').includes('203'));
});

test('AI へ わたす 前に 電話番号・メール・URL・SNS の ID を 消す（名前は 学習なので 残す）', () => {
  const out = scrubContact('My name is Sora. call 090-1234-5678 or sora@example.com see https://x.y/z line id sora22');
  assert.ok(out.includes('My name is Sora'));
  assert.ok(!out.includes('090'));
  assert.ok(!out.includes('@'));
  assert.ok(!out.includes('https://'));
  assert.ok(!/line id/i.test(out));
  assert.equal(scrubContact('I like apples.'), 'I like apples.');
  // チャットは いままでどおり 止める（消すのでは なく 送らない）
  assert.equal(cleanSay('call 09012345678').reason, 'contact');
});

test('1 人ぶんの 削除：記録・学習ログ・コインログ・Roblox の 紐づけと できごと・ウォレットが その 子だけ 消える', async () => {
  const store = new FileStore(null); await store.init();
  store.savePlayer({ class: 'a', name: 'Hina', coins: 5 });
  store.savePlayer({ class: 'a', name: 'Ken', coins: 7 });
  store.appendLearning({ timestamp: '2026-10-01T00:00:00Z', class: 'a', name: 'Hina', question_id: 'q1' });
  store.appendLearning({ timestamp: '2026-10-01T00:00:00Z', class: 'a', name: 'Ken', question_id: 'q1' });
  store.appendCoin({ timestamp: '2026-10-01T00:00:00Z', class: 'a', name: 'Hina', delta: 1 });
  store.appendRobloxEvents([{ id: 'e1', username: 'hina_rbx', class_code: 'a', kind: 'quiz' }, { id: 'e2', username: 'ken_rbx', class_code: 'a', kind: 'quiz' }]);
  store.addWalletEntry({ id: 'w1', username: 'hina_rbx', delta: 3 });
  store.saveWalletSnapshot({ username: 'Hina_rbx', balance: 10 });
  await store.saveRobloxLinks([{ class: 'a', name: 'Hina', username: 'hina_rbx' }, { class: 'a', name: 'Ken', username: 'ken_rbx' }]);

  const n = await store.erasePlayer('a', 'Hina', { username: 'hina_rbx' });
  assert.deepEqual(n, { player: 1, learning: 1, coins: 1, roblox_links: 1, roblox_events: 1, wallet: 1 });
  assert.equal(await store.loadPlayer('a', 'Hina'), null);
  assert.equal((await store.loadPlayer('a', 'Ken')).coins, 7, 'the other child is untouched');
  assert.equal(store.data.learning.length, 1);
  assert.equal((await store.listRobloxEvents({})).length, 1);
  assert.equal(await store.getWalletSnapshot('hina_rbx'), null);
  assert.equal((await store.listRobloxLinks()).length, 1);
});

test('保護者レポート側も その 子だけ 消え、レポートの token が 返る（ファイルを 消す ため）', async () => {
  const reports = await new ReportStore(null).init();
  reports.tokenFor('a', 'Hina', 'ひな');
  reports.tokenFor('a', 'Ken', 'けん');
  reports.addLink({ classroomId: 'a', username: 'Hina', nickname: 'ひな', lineUserId: 'U-hina', consentVersion: 'v1' });
  reports.addLink({ classroomId: 'a', username: 'Ken', nickname: 'けん', lineUserId: 'U-ken', consentVersion: 'v1' });
  reports.data.reports.push({ id: 'r1', classroom_id: 'a', student_username: 'Hina', access_token: 'tok-hina', kind: 'weekly' });
  reports.data.reports.push({ id: 'r2', classroom_id: 'a', student_username: 'Ken', access_token: 'tok-ken', kind: 'weekly' });
  reports.addDelivery({ report_id: 'r1', line_user_id: 'U-hina', status: 'sent' });
  reports.addDelivery({ report_id: 'r2', line_user_id: 'U-ken', status: 'sent' });
  const r = reports.eraseStudent('a', 'Hina');
  assert.deepEqual(r.tokens, ['tok-hina']);
  assert.equal(r.parent_links, 1); assert.equal(r.link_tokens, 1); assert.equal(r.reports, 1); assert.equal(r.deliveries, 1);
  assert.equal(reports.links({ username: 'Hina' }).length, 0);
  assert.equal(reports.links({ username: 'Ken' }).length, 1);
  assert.equal(reports.deliveries().length, 1);

  // privacy.js が 両方を つなぐ
  const store = new FileStore(null); await store.init();
  store.savePlayer({ class: 'a', name: 'Ken' });
  let erasedFiles = [];
  const out = await eraseStudent({ store, parentReports: { service: { eraseStudent: async (c, u) => { const x = reports.eraseStudent(c, u); erasedFiles = x.tokens; return { reports: x.reports }; } } }, log: { info() {} } }, { classCode: 'a', name: 'Ken' });
  assert.equal(out.store.player, 1);
  assert.deepEqual(erasedFiles, ['tok-ken']);
  await assert.rejects(() => eraseStudent({ store }, { classCode: '', name: '' }));
});

test('保持期間：古い 学習ログ・コインログ・配った ウォレットの 行は 消え、新しい 行と 記録は 残る', async () => {
  const store = new FileStore(null); await store.init();
  const NOW = Date.parse('2026-10-19T00:00:00Z');
  const DAY = 86400000;
  store.savePlayer({ class: 'a', name: 'Hina', coins: 5 });
  store.appendLearning({ timestamp: new Date(NOW - 500 * DAY).toISOString(), class: 'a', name: 'Hina' });
  store.appendLearning({ timestamp: new Date(NOW - 10 * DAY).toISOString(), class: 'a', name: 'Hina' });
  store.appendCoin({ timestamp: new Date(NOW - 401 * DAY).toISOString(), class: 'a', name: 'Hina' });
  store.addWalletEntry({ id: 'w-old', username: 'x', delta: 1, delivered_at: new Date(NOW - 500 * DAY).toISOString() });
  store.addWalletEntry({ id: 'w-undelivered', username: 'x', delta: 1 });
  const n = await store.prune({ maxAgeMs: 400 * DAY, now: NOW });
  assert.deepEqual(n, { learning: 1, coins: 1, wallet: 1 });
  assert.equal(store.data.learning.length, 1);
  assert.equal(store.data.wallet_entries.length, 1, 'undelivered coins are never dropped');
  assert.equal((await store.loadPlayer('a', 'Hina')).coins, 5, 'the record itself stays');
  assert.deepEqual(await store.prune({ maxAgeMs: 0 }), { learning: 0, coins: 0, wallet: 0 }, 'RETENTION_DAYS=0 is off');
});

test('保持期間（保護者）：ブロックから 30 日・切れた QR から 30 日・400 日 より 前の 送信の 記録は 消える', async () => {
  const reports = await new ReportStore(null).init();
  const NOW = Date.parse('2026-10-19T00:00:00Z');
  const DAY = 86400000;
  reports.addLink({ classroomId: 'a', username: 'Hina', nickname: 'ひな', lineUserId: 'U1', consentVersion: 'v1' });
  reports.setLinkStatus({ lineUserId: 'U1' }, 'blocked');
  reports.data.parent_links[0].updated_at = new Date(NOW - 31 * DAY).toISOString();
  reports.addLink({ classroomId: 'a', username: 'Ken', nickname: 'けん', lineUserId: 'U2', consentVersion: 'v1' });
  reports.setLinkStatus({ lineUserId: 'U2' }, 'blocked');
  reports.data.parent_links[1].updated_at = new Date(NOW - 2 * DAY).toISOString();
  reports.tokenFor('a', 'Hina', 'ひな', { now: NOW - 400 * DAY, ttlDays: 365 }); // 切れて 35 日
  reports.tokenFor('a', 'Ken', 'けん', { now: NOW, ttlDays: 365 });
  reports.addDelivery({ report_id: 'r', line_user_id: 'U1', status: 'sent' }); reports.data.deliveries[0].sent_at = new Date(NOW - 401 * DAY).toISOString();
  reports.addDelivery({ report_id: 'r', line_user_id: 'U2', status: 'sent' });
  reports.purge(NOW, { keepDeliveriesMs: 400 * DAY });
  assert.deepEqual(reports.data.parent_links.map((l) => l.line_user_id), ['U2']);
  assert.equal(reports.data.link_tokens.length, 1);
  assert.equal(reports.data.deliveries.length, 1);
});

test('総当たりの 守り：同じ IP から 上限を こえると 429、別の IP は 通る', () => {
  let t = 1_000_000;
  const mw = rateLimit({ windowMs: 60_000, max: 3, now: () => t });
  const call = (ip) => new Promise((resolve) => {
    const res = { code: 200, set() {}, status(c) { this.code = c; return this; }, type() { return this; }, send() { resolve(this.code); } };
    mw({ ip, get: () => '' }, res, () => resolve(200));
  });
  return (async () => {
    assert.equal(await call('1.1.1.1'), 200); assert.equal(await call('1.1.1.1'), 200); assert.equal(await call('1.1.1.1'), 200);
    assert.equal(await call('1.1.1.1'), 429);
    assert.equal(await call('2.2.2.2'), 200);
    t += 61_000;
    assert.equal(await call('1.1.1.1'), 200, 'the window has passed');
  })();
});
