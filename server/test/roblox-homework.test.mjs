// Roblox の 宿題プレース（src/roblox/homework.js）：Web の 宿題を Roblox で とく。置き場は 1 つ・鍵が いる・
// 紐づけで だれの 宿題か わかる・○×と すすみぐあいは Web と 同じ・おわったら 1 回だけ ごほうび・記録が 保護者レポートに のる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.USPEAK_ROBLOX_KEY = 'roblox-test-key-0123456789abcdef-XYZ';
process.env.ROBLOX_RATE_PER_MIN = '600';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { HW_DONE_COINS } = await import('../src/roblox/homework.js');

const KEY = process.env.USPEAK_ROBLOX_KEY;
let server; let http; let aid;
const post = (path, body, key = KEY) => fetch(`${http}/api/roblox${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-uspeak-key': key } : {}) }, body: JSON.stringify(body),
});
const json = async (path, body, key) => { const r = await post(path, body, key); return { status: r.status, ...(await r.json()) }; };

before(async () => {
  server = await startServer({ port: 0 });
  http = `http://127.0.0.1:${server.server.address().port}`;
  const made = await server.homework.create({ title: 'Unit 3', classes: ['6-1'], due: '2099-12-31', items: [
    { id: 'q1', kind: 'mc', en: 'apple', ja: 'りんご', wrong: ['いぬ', 'ねこ'] },
    { id: 'q2', kind: 'spell', en: 'dog', ja: 'いぬ' },
    { id: 'q3', kind: 'order', sentence: 'I like dogs.', ja: 'わたしは 犬が すきです。' },
    { id: 'q4', kind: 'fill', sentence: 'I play soccer.', blank: 'play', wrong: ['run', 'eat'] },
  ] });
  assert.ok(made.ok, made.error);
  aid = made.assignment.id;
  const other = await server.homework.create({ title: 'ほかの クラス', classes: ['5-2'], items: [
    { kind: 'mc', en: 'cat', ja: 'ねこ', wrong: ['いぬ', 'とり'] }, { kind: 'mc', en: 'bird', ja: 'とり', wrong: ['いぬ', 'ねこ'] }] });
  const pub = await server.homework.publish(other.assignment.id, true);
  assert.ok(pub.ok, JSON.stringify(pub));
  // 紐づけ：Roblox の rbx_hana は 6-1 の「はな」
  await server.store.saveRobloxLinks([{ username: 'rbx_hana', class: '6-1', name: 'はな' }]);
  await server.roblox.refreshLinks();
});
after(async () => { await server.shutdown('test'); });

test('鍵が ないと 入れない', async () => {
  assert.equal((await post('/homework/list', { username: 'rbx_hana' }, 'nope')).status, 401);
});

test('くばる 前の 宿題は 出ない。くばると 紐づけの クラスの 子に だけ 出る', async () => {
  let r = await json('/homework/list', { username: 'rbx_hana' });
  assert.deepEqual([r.ok, r.child, r.items.length], [true, { classCode: '6-1', name: 'はな' }, 0]);
  await server.homework.publish(aid, true);
  r = await json('/homework/list', { username: 'rbx_hana' });
  assert.deepEqual(r.items.map((x) => [x.title, x.total, x.answered]), [['Unit 3', 4, 0]]);
  // どの クラスか わからない 子は 空（classCode を 送れば その クラス）
  r = await json('/homework/list', { username: 'stranger' });
  assert.deepEqual([r.child, r.items.length], [null, 0]);
  r = await json('/homework/list', { username: 'stranger', classCode: '5-2' });
  assert.deepEqual([r.child.classCode, r.items.map((x) => x.title)], ['5-2', ['ほかの クラス']]);
});

test('問題の もとは 答えつきで Roblox の サーバーに だけ わたす（ほかの クラスの 宿題は 取れない）', async () => {
  const r = await json('/homework/items', { username: 'rbx_hana', aid });
  assert.equal(r.assignment.total, 4);
  assert.deepEqual(r.items.map((x) => x.kind), ['mc', 'spell', 'order', 'fill']);
  assert.equal(r.items[3].blank, 'play');
  const other = server.homework.forClass('5-2')[0];
  assert.equal((await post('/homework/items', { username: 'rbx_hana', aid: other.id })).status, 404);
});

test('○×は Web の 宿題と 同じ 置き場に のこり、ぜんぶ おわると 1 回だけ ごほうび', async () => {
  let r = await json('/homework/answer', { username: 'rbx_hana', userId: '1', aid, itemId: 'q1', ok: true, attempt: 1, kind: 'mc', ms: 3000 });
  assert.deepEqual([r.answered, r.total, r.finished, r.coins], [1, 4, false, 0]);
  // 2 回目で 正解 ＝ ×（Web と 同じ）
  r = await json('/homework/answer', { username: 'rbx_hana', aid, itemId: 'q2', ok: true, attempt: 2, kind: 'spell' });
  assert.equal(server.homework.progressOf('6-1', 'はな', aid).answers.q2.ok, false);
  await json('/homework/answer', { username: 'rbx_hana', aid, itemId: 'q3', ok: true, attempt: 1, kind: 'order' });
  r = await json('/homework/answer', { username: 'rbx_hana', aid, itemId: 'q4', ok: false, attempt: 2, kind: 'fill' });
  assert.deepEqual([r.answered, r.finished, r.coins, r.summary.done, r.summary.correct], [4, true, HW_DONE_COINS, true, 2]);
  // Web の 宿題島が 見る 置き場と 同じ（Web の 名前「はな」で 見える）
  const list = server.homework.listFor('6-1', 'はな');
  assert.deepEqual([list[0].done, list[0].answered], [true, 4]);
  // ごほうびは コインの 行（Roblox と Web で 同じ 残高）。2 回目は はらわない
  const entries = await server.store.listWalletEntries({ username: 'rbx_hana', undelivered: true });
  assert.deepEqual(entries.filter((e) => e.reason === `homework:${aid}`).map((e) => Number(e.amount)), [HW_DONE_COINS]);
  r = await json('/homework/answer', { username: 'rbx_hana', aid, itemId: 'q2', ok: true, attempt: 1, kind: 'spell' });
  assert.equal(r.coins, 0);
  assert.equal(server.homework.progressOf('6-1', 'はな', aid).answers.q2.ok, true, 'やりなおして ○ に なる');
});

test('記録は world=homework の quiz として 保護者レポートの 箱に 入る', async () => {
  const events = await server.store.listRobloxEvents({ username: 'rbx_hana' });
  const hw = events.filter((e) => e.world === 'homework');
  assert.ok(hw.length >= 5);
  const d = JSON.parse(hw[0].data_json);
  assert.deepEqual([d.level, d.homework, d.source], ['Homework', aid, 'roblox']);
});

test('ない 宿題・ない 問題は 404', async () => {
  assert.equal((await post('/homework/answer', { username: 'rbx_hana', aid: 'nope', itemId: 'q1', ok: true })).status, 404);
  assert.equal((await post('/homework/answer', { username: 'rbx_hana', aid, itemId: 'zz', ok: true })).status, 404);
});
