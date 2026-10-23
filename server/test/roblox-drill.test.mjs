// Roblox の 英検ドリル ワールド：DB の 行 → 7 形式・token で 判定・やりなおしは コインなし・1 日の 上限・記録。
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
const { drillItem, createDrill, signToken, readToken, COIN_RIGHT, DAILY_COINS } = await import('../src/roblox/drill.js');
const { cleanItem } = await import('../src/qbank/store.js');
const { makeRng, checkFormat } = await import('../../client/dist/formats-core.js');

const row = (o) => cleanItem({ grade: '5級', skill: 'reading', on: true, roblox: true, ...o });
const WORDS = [['走る', 'run'], ['友だち', 'friend'], ['犬', 'dog'], ['ねこ', 'cat'], ['本', 'book'], ['りんご', 'apple'], ['水', 'water'], ['学校', 'school']];
const ROWS = [
  ...WORDS.map(([ja, en], i) => row({ id: `W${i}`, format: '単語の意味（日→英 4択）', question: `「${ja}」を英語で?`, answer: en,
    choice_1: en, choice_2: WORDS[(i + 1) % 8][1], choice_3: WORDS[(i + 2) % 8][1], choice_4: WORDS[(i + 3) % 8][1] })),
  row({ id: 'J1', format: '単語の意味（英→日 3択）', question: '「Water」の いみは？', choice_1: 'ひ', choice_2: 'みず', choice_3: 'つち', answer: 'みず' }),
  row({ id: 'F1', format: '短文の語句空所補充', question: 'I ( ) a student.', choice_1: 'is', choice_2: 'are', choice_3: 'be', choice_4: 'am', answer: 'am' }),
  row({ id: 'F2', format: '短文の語句空所補充（絵つき）', question: '🍎 This is an ( ).（これは りんご です。）', choice_1: 'pen', choice_2: 'cat', choice_3: 'apple', choice_4: 'egg', answer: 'apple' }),
  row({ id: 'O1', format: '和文英訳（ならべかえ）', question: 'わたしは 犬が すきです。', answer: 'I like dogs.' }),
  row({ id: 'O2', format: '日本文付き短文の語句整序', question: 'わたしは毎朝、牛乳をのみます。\n① every  ② drink  ③ milk  ④ morning', choice_1: '①-④', choice_2: '③-②', choice_3: '④-③', choice_4: '③-④', answer: '③-④',
    explanation: 'ただしい文は「I drink milk every morning.」です。' }),
  row({ id: 'M1', format: '会話の応答文選択', question: '★ Hello!（こんにちは！）', choice_1: 'Thank you!', choice_2: 'Goodbye!', choice_3: 'Hello!', choice_4: 'Sorry!', answer: 'Hello!' }),
  row({ id: 'L1', skill: 'listening', format: '聞いて 英単語を えらぶ', passage: 'run', question: '音声を聞いて、読まれた 単語を えらびなさい。', choice_1: 'come', choice_2: 'study', choice_3: 'run', choice_4: 'take', answer: 'run', explanation: 'run＝走る' }),
  row({ id: 'X1', skill: 'listening', format: '会話の内容一致選択', passage: '★: Where is my cap?\n☆: On the sofa.', question: 'Where is the cap?', choice_1: 'On the sofa.', choice_2: 'On the bed.', answer: 'On the sofa.' }),
  row({ id: 'S1', skill: 'speaking', format: '二次試験（面接）', question: 'How are you?', answer: 'I am fine.' }),
];

test('DB の 行を 7 形式の 1 問に なおす（出せない 行は null）', () => {
  const by = Object.fromEntries(ROWS.map((r) => [r.id, drillItem(r)]));
  assert.deepEqual([by.W0.en, by.W0.ja], ['run', '走る']);
  assert.deepEqual([by.J1.en, by.J1.ja], ['water', 'みず']);
  assert.deepEqual([by.F1.kind, by.F1.sentence, by.F1.blank], ['fill', 'I am a student.', 'am']);
  assert.deepEqual([by.F2.kind, by.F2.ja], ['fill', 'これは りんご です。']);
  assert.deepEqual([by.O1.kind, by.O1.sentence], ['order', 'I like dogs.']);
  assert.deepEqual([by.O2.kind, by.O2.sentence], ['order', 'I drink milk every morning.']);
  assert.equal(by.M1.kind, 'mc'); assert.match(by.M1.prompt, /Hello/);
  assert.deepEqual([by.L1.kind, by.L1.ja], ['listen', '走る']);
  assert.equal(by.X1, null, '本文を 読む 聞く 問題は 出さない');
  assert.equal(by.S1, null, '面接は 出さない');
});

test('出題は 答えの ない 形と token。token で 判定し、記録と コインは サーバーが 決める', () => {
  const events = [];
  const drill = createDrill({ secret: 'k', items: () => ROWS, store: { appendRobloxEvents: (r) => events.push(...r) }, rng: makeRng(7) });
  const list = drill.pick({ grade: '5級', n: 20 });
  assert.ok(list.length >= 10);
  const kinds = new Set(list.map((q) => q.kind));
  for (const k of ['order', 'fill']) assert.ok(kinds.has(k), `${k} が 出る`);
  for (const q of list) {
    const p = readToken('k', q.token);
    assert.ok(p.fmt.kind === q.kind);
    assert.equal(JSON.stringify(q.public).includes('"answer"'), false, '答えは public に 入らない');
  }
  // 正解を 作って 判定する
  const q = list.find((x) => x.kind === 'order');
  const ans = readToken('k', q.token).fmt.sentence;
  const r = drill.check({ token: q.token, answer: ans, username: 'kai', classCode: 'C1', ms: 4000 });
  assert.deepEqual([r.ok, r.correct, r.coins], [true, true, COIN_RIGHT]);
  assert.equal(events.length, 1);
  assert.equal(JSON.parse(events[0].data_json).format, 'order');
  // まちがい → やりなおしの 形。2 回目は 正解でも コインなし・答えを 見せる
  const q2 = list.find((x) => x.kind === 'fill');
  const w = drill.check({ token: q2.token, answer: 'zzz', username: 'kai' });
  assert.equal(w.correct, false); assert.equal(w.retry.attempt, 2); assert.equal(w.reveal, undefined);
  const fmt2 = readToken('k', q2.token).fmt;
  const w2 = drill.check({ token: q2.token, answer: fmt2.answer, attempt: 2, username: 'kai' });
  assert.deepEqual([w2.correct, w2.coins], [true, 0]); assert.ok(w2.reveal);
  assert.ok(checkFormat(fmt2, fmt2.answer));
  // 同じ 記録は id が 同じ（Roblox が 送りなおしても 二重に ならない）
  assert.equal(new Set(events.map((e) => e.id)).size, events.length);
});

test('にせの token・期限切れは ことわる。1 日の コインは 上限まで', () => {
  const t = signToken('k', { fmt: { kind: 'type', word: 'cat', ja: 'ねこ', length: 3 }, exp: Date.now() + 1000 });
  assert.ok(readToken('k', t));
  assert.equal(readToken('other', t), null);
  assert.equal(readToken('k', t.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), null);
  assert.equal(readToken('k', t, Date.now() + 5000), null);
  const drill = createDrill({ secret: 'k', items: () => [] });
  let total = 0;
  for (let i = 0; i < 40; i += 1) total += drill.check({ token: t, answer: 'cat', username: 'kai' }).coins;
  assert.equal(total, DAILY_COINS);
});

test('web か Roblox か：列（source）が なくても data.source と place_id で わかる。レポートの 内わけと LINE の 1 行', async () => {
  const { sourceOf } = await import('../src/game/roblox-metrics.js');
  const { bySource } = await import('../src/parent-report/aggregate.js');
  const { sourceText } = await import('../src/parent-report/line.js');
  assert.equal(sourceOf({ source: 'roblox' }), 'roblox');
  assert.equal(sourceOf({ data_json: '{}', place_id: 'web' }), 'web');
  assert.equal(sourceOf({}, { source: 'web' }), 'web');
  assert.equal(sourceOf({ place_id: '123' }), 'roblox');
  const rows = [{ source: 'web', data: {} }, { data: { source: 'web' } }, { place_id: '9', data: {} }, { source: 'roblox', data: { drill: true } }];
  assert.deepEqual(bySource(rows), { web: 2, roblox: 2 });
  assert.equal(sourceText({ web: 2, roblox: 2 }), '🎮 といた 場所：web 2問・Roblox 2問');
  assert.equal(sourceText({ web: 0, roblox: 0 }), '');
});
