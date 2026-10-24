// 問題データベース（/admin/qbank）：入れる・オンオフ・書きかえ、英検の島への まぜこみ、Roblox の 取り口。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.ADMIN_KEY = 'qbank-admin-key-123';
process.env.TEACHER_KEY = 'qbank-teacher-key-456';
process.env.USPEAK_ROBLOX_KEY = 'r'.repeat(40);

const { QBankStore, cleanItem, rowsFromDelimited, itemsToCsv } = await import('../src/qbank/store.js');
const { BANK, setExtraQuestions } = await import('../src/game/eiken.js');
const { startServer } = await import('../src/index.js');

const item = (id, over = {}) => ({ id, grade: '5級', skill: 'reading', format: '短文の語句空所補充', question: `I ( ) a cat. ${id}`, choice_1: 'have', choice_2: 'has', choice_3: 'having', choice_4: 'had', answer: 'have', ...over });

test('こわれた 行は 入らない（答えが 選択肢に ない・同じ 選択肢・級が ない）', () => {
  assert.ok(cleanItem(item('a')));
  assert.equal(cleanItem(item('b', { answer: 'go' })), null);
  assert.equal(cleanItem(item('c', { choice_2: 'have' })), null);
  assert.equal(cleanItem(item('d', { grade: '9級' })), null);
  // xlsx の 見出し（日本語）でも 読める
  assert.ok(cleanItem({ ID: 'e', 級: '3級', 技能: 'リスニング', 問題: 'Q?', 正解: 'A', 本文・スクリプト: '★: hi' }));
  // 列が ない → オン、列が あって 空 → オフ
  const f = cleanItem({ ID: 'f', 級: '5級', 技能: 'reading', 問題: 'Q', 正解: 'A', 'web版に出す': '', 'Robloxに出す': '○' });
  assert.equal(f.on, true); assert.equal(f.web, false); assert.equal(f.roblox, true);
});

test('入れかえ・上書き・オンオフ・書きかえ。CSV で 出して 読みもどせる', async () => {
  const q = await new QBankStore(null).init();
  let seen = 0; q.onChange(() => { seen += 1; });
  assert.equal((await q.import([item('a'), item('b'), item('b'), item('x', { answer: 'nope' })])).count, 2);
  assert.equal((await q.import([item('b', { question: 'new b' }), item('c')], { mode: 'merge' })).count, 3);
  assert.equal(q.items.find((it) => it.id === 'b').question, 'new b');
  await q.setFlags(['a'], { roblox: false });
  await q.setFlags(['c'], { on: false });
  assert.deepEqual(q.live('web').map((it) => it.id), ['a', 'b']);
  assert.deepEqual(q.live('roblox').map((it) => it.id), ['b']);
  assert.equal((await q.update('a', { answer: 'zzz' })).ok, false, '正解が 選択肢に ない 書きかえは ことわる');
  assert.ok((await q.update('a', { explanation: 'have を つかう' })).ok);
  assert.ok(seen >= 5);
  const back = rowsFromDelimited(itemsToCsv(q.items));
  assert.equal(back.length, 3);
  assert.equal(cleanItem(back[0]).explanation, 'have を つかう');
});

test('web版に出す 問題が 英検の島（5級の 読む）に まざり、外すと もどる', () => {
  const before = BANK.g5.reading.length;
  const it = cleanItem(item('mix1', { question: 'Unique ( ) question for mixing.' }));
  const added = setExtraQuestions([it, cleanItem(item('mix2', { grade: '準2級' }))]);
  assert.equal(added['g5.reading'], 1);
  assert.equal(BANK.g5.reading.length, before + 1);
  const mixed = BANK.g5.reading.at(-1);
  assert.equal(mixed.choices[mixed.answer], 'have', '正解は 0 番（出すときに まぜる）');
  setExtraQuestions([]);
  assert.equal(BANK.g5.reading.length, before);
});

test('話す：DB の「日本語 → 英語で 言う」行は その級の 話すの館に まざり、面接の 行は まざらない', () => {
  const before = BANK.g1.speaking.length;
  const say = cleanItem({ id: 'sp1', grade: '1級', skill: 'speaking', question: 'その 計画には 長所も 短所も あります。', answer: 'The plan has both advantages and disadvantages.' });
  const iv = cleanItem({ id: 'sp2', grade: '1級', skill: 'speaking', passage: 'A card', question: 'No.1 Why?', answer: 'Because it is fun.' });
  const added = setExtraQuestions([say, iv]);
  assert.equal(added['g1.speaking'], 1);
  assert.deepEqual(BANK.g1.speaking.at(-1), { ja: say.question, en: say.answer });
  setExtraQuestions([]);
  assert.equal(BANK.g1.speaking.length, before);
});

test('面接・話すの館の 問題は 既存の DB に 1 回だけ 足され、もう ある 行（No.1 の ない 古い 形も）は とばす', async () => {
  const { speakingRows, SEED_TAG } = await import('../src/qbank/seed-speaking.js');
  const rows = speakingRows();
  assert.ok(rows.some((r) => r.grade === '1級') && rows.some((r) => r.grade === '準1級以上'), '準1級・1級も 入る');
  const q = await new QBankStore(null).init();
  const card = rows.find((r) => r.id.startsWith('IV-'));
  const old = { id: 'OLD-1', grade: card.grade, skill: 'speaking', format: '面接（カード音読・質問）', passage: 'x', question: card.question.replace(/^No\.\d+ /, ''), answer: card.answer };
  await q.import([old]);
  const first = await q.seed(SEED_TAG, rows);
  assert.equal(first.added, rows.length - 1, '同じ 問題は 二重に しない');
  assert.equal((await q.seed(SEED_TAG, rows)).added, 0, '2 回目は 何も しない（admin で 消した 行は もどらない）');
  assert.ok(q.items.filter((it) => /^(IV|SP)-/.test(it.id)).every((it) => it.web && !it.roblox), 'web版に ある 問題として 入り、Roblox には 出さない');
});

let server; let base;
before(async () => { server = await startServer({ port: 0 }); base = `http://127.0.0.1:${server.server.address().port}`; });
after(async () => { setExtraQuestions([]); await server.shutdown('test'); });

test('admin で 入れた 問題を Roblox が 取れる（鍵が ないと 401）', async () => {
  const login = await fetch(`${base}/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${process.env.ADMIN_KEY}` });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie, 'ログインできる');
  const H = { cookie, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/admin/api/qbank`)).status, 401);
  const imp = await (await fetch(`${base}/admin/api/qbank/import`, { method: 'POST', headers: H, body: JSON.stringify({ items: [item('r1'), item('r2', { grade: '3級' })] }) })).json();
  assert.equal(imp.count, 2);
  await fetch(`${base}/admin/api/qbank/flags`, { method: 'POST', headers: H, body: JSON.stringify({ ids: ['r2'], set: { roblox: false } }) });
  const list = await (await fetch(`${base}/admin/api/qbank?grade=5級`, { headers: { cookie } })).json();
  assert.equal(list.hits, 1);
  assert.equal((await fetch(`${base}/api/roblox/questions`)).status, 401);
  const rb = await (await fetch(`${base}/api/roblox/questions`, { headers: { 'x-uspeak-key': process.env.USPEAK_ROBLOX_KEY } })).json();
  assert.deepEqual(rb.items.map((it) => it.id), ['r1']);
  assert.equal(rb.items[0].answer, 'have');
  const csv = await (await fetch(`${base}/admin/api/qbank.csv`, { headers: { cookie } })).text();
  assert.ok(csv.includes('r2'));
});

test('本物の 絵が ない 絵の 問題は 1 回だけ 配信を 止める（消さない）', async () => {
  const { QBankStore } = await import('../src/qbank/store.js');
  const { NO_PICTURE_TAG, isPictureRow } = await import('../src/qbank/seed-speaking.js');
  const q = await new QBankStore(null).init();
  q.items = [
    { id: 'A', grade: '3級', skill: 'speaking', format: '二次試験（面接）', tags: 'イラストの質問', passage: 'x\n【イラスト】公園', choices: [], on: true, web: true, roblox: false },
    { id: 'B', grade: '5級', skill: 'listening', format: 'イラストの内容一致選択', tags: '', passage: '[絵: 犬]', choices: [], on: true, web: true, roblox: true },
    { id: 'C', grade: '5級', skill: 'reading', format: '短文の語句空所補充', tags: '', passage: '', choices: [], on: true, web: true, roblox: true },
  ];
  const r = await q.disableOnce(NO_PICTURE_TAG, isPictureRow);
  assert.equal(r.changed, 2);
  assert.deepEqual(q.items.map((it) => it.on), [false, false, true]);
  q.items[0].on = true;
  assert.equal((await q.disableOnce(NO_PICTURE_TAG, isPictureRow)).already, true, 'admin で もどした 行は そのまま');
  assert.equal(q.items[0].on, true);
});
