// ロードマップ：12 段階・進む 条件（単語 8 割＋クイズ 20 問・8 割）・英検の 合格見込み・保存・Roblox の API・レポート。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  STAGE_IDS, stagesFor, roadmapOf, passChance, chanceFromCounts, planFor, gradeOfEvent, setQbankWords, parentLines, EIKEN, STAGE_COINS,
} from '../src/game/roadmap.js';
import { RoadmapStore } from '../src/roadmap/store.js';
import { createRoadmapService } from '../src/roadmap/service.js';
import { mountRoadmapApi } from '../src/roadmap/api.js';
import { roadmapText } from '../src/parent-report/line.js';
import { weeklyTex } from '../src/parent-report/render-tex.js';
import { weeklyData } from '../src/parent-report/aggregate.js';
import { weekOf } from '../src/parent-report/jst.js';

const DAY = 86400e3;
const T0 = Date.UTC(2026, 9, 5, 3);
let seq = 0;
const quiz = (ts, data, world = 'hut', username = 'kai') => ({ id: `e${seq += 1}`, ts, type: 'quiz', world, username, data });
// 単語を 2 日に 分けて 3 回 正解
const learn = (words, at = T0) => [0, 1, 2].flatMap((d) => words.map((w) => quiz(at + d * DAY, { word: w, correct: true, level: 'SuperEasy' })));
const jrQuiz = (n, okEvery, at) => Array.from({ length: n }, (_, i) => quiz(at + i * 1000, { word: 'zz', correct: i % okEvery !== 0, level: 'SuperEasy' }));

test('12 段階：A・B・C（英検Jr.）・1〜9（5級〜準1級）。単語は ゲームで 出る ことばで、段階を またいで かさならない', () => {
  const st = stagesFor();
  assert.deepEqual(st.map((s) => s.id), STAGE_IDS);
  assert.deepEqual([...new Set(st.map((s) => s.grade))], ['jr', 'g5', 'g4', 'g3', 'gp2', 'g2', 'gp1']);
  for (const s of st.slice(0, 11)) assert.ok(s.words.length >= 15, `${s.id} has words`);
  const all = st.flatMap((s) => s.words);
  assert.equal(all.length, new Set(all).size, 'no word in two stages');
  // 問題DB の 1 語の 答えが 7〜9 に 足される
  setQbankWords([{ grade: '準1級以上', answer: 'ubiquitous' }, { grade: '準1級以上', answer: 'a phrase answer' }, { grade: '2級', answer: 'sustainable' }]);
  assert.ok(stagesFor()[11].words.includes('ubiquitous'));
  assert.ok(!stagesFor()[11].words.includes('a phrase answer'));
  setQbankWords([]);
  // 教室の 設定：名前と 単語を かえられる
  const custom = stagesFor({ stages: { A: { ja: 'どうぶつ', words: ['Lion', 'tiger', 'tiger'] } } });
  assert.equal(custom[0].ja, 'どうぶつ');
  assert.deepEqual(custom[0].words, ['lion', 'tiger']);
});

test('1 問の 級：英検の島・つり島の ゾーン・英単語ハウス・単語・レベル', () => {
  assert.equal(gradeOfEvent({ world: 'eiken', data: { grade: 'g4' } }), 'g4');
  assert.equal(gradeOfEvent({ world: 'x', data: { grade: '準2級' } }), 'gp2');
  assert.equal(gradeOfEvent({ world: 'fishworld', data: { zone: 3 } }), 'g3');
  assert.equal(gradeOfEvent({ world: 'hut', data: { level: 'SuperEasy' } }), 'jr');
  assert.equal(gradeOfEvent({ world: 'hut', data: { level: 'Medium' } }), 'g4');
  assert.equal(gradeOfEvent({ world: 'roblox', data: { word: 'Apple' } }, new Map([['apple', 'g5']])), 'g5');
  assert.equal(gradeOfEvent({ world: 'roblox', data: {} }), '');
});

test('進む 条件：単語の 8 割を 覚えた（2 日 以上・3 回 つづけて）＋ その 段階で クイズ 20 問・正解率 8 割', () => {
  const A = stagesFor()[0].words;
  const need = Math.ceil(A.length * 0.8);
  // 同じ 日に 3 回 では 覚えた に ならない
  const sameDay = [0, 1, 2].flatMap((i) => A.map((w) => quiz(T0 + i * 1000, { word: w, correct: true, level: 'SuperEasy' })));
  let v = roadmapOf(sameDay, { now: T0 + 3 * DAY });
  assert.equal(v.words.known, 0, 'three times on one day is not learned');
  // 8 割 ちょうど 覚えて、クイズ 19 問 → まだ
  const rows = [...learn(A.slice(0, need)), ...jrQuiz(19, 99, T0 + 3 * DAY)];
  v = roadmapOf(rows, { now: T0 + 4 * DAY });
  assert.equal(v.words.left, 0);
  assert.equal(v.quiz.n, 19 + need * 3, 'the word answers count as quizzes of the stage too');
  // クイズは「この 段階に 入ってから」だけ
  v = roadmapOf(rows, { state: { stage: 'A', since: T0 + 3 * DAY }, now: T0 + 4 * DAY });
  assert.equal(v.quiz.n, 19);
  assert.equal(v.quiz.left, 1);
  assert.equal(v.ready, false);
  const plus = [...rows, ...jrQuiz(1, 99, T0 + 3 * DAY + 60000)];
  v = roadmapOf(plus, { state: { stage: 'A', since: T0 + 3 * DAY }, now: T0 + 4 * DAY });
  assert.equal(v.quiz.n, 20);
  assert.equal(v.ready, true);
  // 正解率が 8 割に とどかない：あと 何問 つづけて 正解すれば よいか
  const low = [...learn(A.slice(0, need)), ...jrQuiz(20, 2, T0 + 3 * DAY)]; // 50%
  v = roadmapOf(low, { state: { stage: 'A', since: T0 + 3 * DAY }, now: T0 + 4 * DAY });
  assert.equal(v.ready, false);
  assert.equal(v.quiz.acc, 50);
  assert.equal(v.quiz.streakNeed, 17, 'さいきんの 30 問で 見るので、前の まちがいは まどから おちる（前は 30 問 つづけて だった）');
  // とちゅうの スタンプと「できる ように なる こと」
  assert.deepEqual(v.checkpoints.map((c) => c.reached), [true, true, true]);
  assert.match(v.stage.cando.ja, /名前が 言える/);
  // はじめに まちがえても、さいきんの 30 問が 8 割なら すすめる
  const back = [...low, ...jrQuiz(30, 30, T0 + 3.5 * DAY)];
  const vb = roadmapOf(back, { state: { stage: 'A', since: T0 + 3 * DAY }, now: T0 + 4 * DAY });
  assert.equal(vb.quiz.acc, 97, '29 / 30');
  assert.equal(vb.ready, true);
  // まちがえた 単語は 覚えた から はずれる
  const lost = [...rows, quiz(T0 + 5 * DAY, { word: A[0], correct: false, level: 'SuperEasy' })];
  assert.equal(roadmapOf(lost, { now: T0 + 6 * DAY }).words.known, need - 1);
  // 4 つの 力：形式の 対応は 保護者レポートと 同じ（listen＝きく、type・spell＝かく）
  const sk = roadmapOf([quiz(T0, { word: 'zz', correct: true, level: 'SuperEasy', format: 'listen' }), quiz(T0, { word: 'zz', correct: true, level: 'SuperEasy', format: 'spell' })], { now: T0 + DAY }).skills;
  assert.equal(sk.find((s) => s.key === 'listen').n, 1);
  assert.equal(sk.find((s) => s.key === 'write').n, 1);
});

test('英検の 合格見込み：協会の 問題数と 合格の 正答率から。データが 少ない ときは 出さない・正解率が 上がれば 上がる', () => {
  assert.deepEqual(EIKEN.g5.items, { reading: 25, listening: 25 });
  assert.equal(EIKEN.gp1.cut, 0.7);
  const c = (r, l, n = 40) => chanceFromCounts('g5', { reading: { c: Math.round(r * n), w: n - Math.round(r * n) }, listening: { c: Math.round(l * n), w: n - Math.round(l * n) } });
  assert.ok(c(0.9, 0.9) > 0.95, `90% → ${c(0.9, 0.9)}`);
  assert.ok(c(0.6, 0.6) > 0.3 && c(0.6, 0.6) < 0.7, `60% (the cut) → about half: ${c(0.6, 0.6)}`);
  assert.ok(c(0.4, 0.4) < 0.05);
  assert.ok(c(0.7, 0.7) > c(0.65, 0.65));
  assert.ok(c(0.9, 0.3) < c(0.6, 0.6) + 0.15, 'a weak listening is not hidden by strong reading');
  // 準1級は 7 割が 目安なので 同じ 70% でも 低い
  const n = { reading: { c: 28, w: 12 }, listening: { c: 28, w: 12 } };
  assert.ok(chanceFromCounts('gp1', n) < chanceFromCounts('g2', n));
  // 1 技能 10 問 未満は「まだ」
  const few = Array.from({ length: 9 }, (_, i) => quiz(T0 + i, { correct: true, grade: 'g5', skill: 'reading', format: 'mc', eiken: true }, 'eiken'));
  const p = passChance('g5', few);
  assert.equal(p.chance, null);
  assert.deepEqual(p.lacking.map((l) => l.skill), ['reading', 'listening']);
  // 英検の 形が 足りれば 英検の 形だけで（basis）、作文は 入れない
  const form = [...Array.from({ length: 12 }, (_, i) => quiz(T0 + i, { correct: i % 4 !== 0, grade: 'g5', skill: 'reading', format: 'mc', eiken: true }, 'eiken')),
    ...Array.from({ length: 12 }, (_, i) => quiz(T0 + i, { correct: i % 4 !== 0, grade: 'g5', skill: 'listening', format: 'listen', eiken: true }, 'eiken')),
    ...Array.from({ length: 30 }, (_, i) => quiz(T0 + i, { correct: false, grade: 'g5', skill: 'writing', format: 'order', eiken: true }, 'eiken'))];
  const q = passChance('g5', form);
  assert.equal(q.basis, 'eiken');
  assert.equal(q.skills.reading.n, 12);
  assert.ok(q.chance > 50, `writing does not drag it: ${q.chance}`);
  // あと どれだけ：いまの 正解率で 足りれば「あと ◯ 問」、足りなければ「正解率を ◯% に」
  assert.equal(planFor('g5', { reading: { c: 90, w: 10 }, listening: { c: 90, w: 10 } }).kind, 'keep');
  assert.equal(planFor('g5', { reading: { c: 7, w: 3 }, listening: { c: 7, w: 3 } }).kind, 'more');
  const raise = planFor('g5', { reading: { c: 10, w: 10 }, listening: { c: 5, w: 15 } });
  assert.equal(raise.kind, 'raise');
  assert.equal(raise.skill, 'listening');
  assert.ok(raise.acc > raise.now);
});

test('保存：はじめの 段階は 教室ごと・自動で 上がると コインは 1 段階 1 回・先生が かえても コインなし・消せる', async () => {
  let now = T0;
  const s = await new RoadmapStore(null, { now: () => now }).init();
  assert.equal(s.startFor('c1'), 'A');
  await s.saveSettings('c1', { start: '3', stages: { 3: { ja: 'よんきゅう', words: 'Cat, dog\nbird' } } });
  assert.equal(s.startFor('c1'), '3');
  assert.deepEqual(s.settingsFor('c1').stages['3'].words, ['cat', 'dog', 'bird']);
  assert.equal(s.startFor('c2'), 'A', 'other classes keep the default');
  let r = await s.setStage('c1', 'kai', '4', { by: 'auto' });
  assert.equal(r.pay, true);
  r = await s.setStage('c1', 'kai', '3', { by: 'teacher' });
  assert.equal(r.pay, false);
  now += 1000;
  r = await s.setStage('c1', 'kai', '4', { by: 'auto' });
  assert.equal(r.pay, false, 'the same stage pays once');
  assert.equal(s.stateOf('c1', 'kai').history.length, 3);
  assert.equal((await s.setStage('c1', 'kai', 'Z')).ok, false);
  assert.equal(s.classOfName('kai'), 'c1');
  assert.equal(await s.eraseStudent('c1', 'kai'), 1);
  assert.equal(s.stateOf('c1', 'kai'), null);
});

function fakeEvents(rows) {
  return { listRobloxEvents: async ({ username = '', classCode = '' } = {}) => rows.filter((r) => (!username || r.username.toLowerCase() === username.toLowerCase()) && (!classCode || r.class_code === classCode)) };
}

test('窓口：条件を みたすと 1 段階 上がる（ups）・Roblox の API は 合言葉つきで 同じ 計算', async () => {
  const A = stagesFor()[0].words;
  const rows = [...learn(A), ...jrQuiz(20, 99, T0 + 3 * DAY)].map((r) => ({ ...r, username: 'Kai', class_code: 'c1' }));
  const roadmap = await new RoadmapStore(null, { now: () => T0 + 4 * DAY }).init();
  const service = createRoadmapService({ store: fakeEvents(rows), roadmap, now: () => T0 + 4 * DAY });
  const v = await service.view('c1', 'Kai');
  assert.deepEqual(v.ups, [{ from: 'A', to: 'B', coins: STAGE_COINS }]);
  assert.equal(v.stage.id, 'B');
  assert.equal(v.quiz.n, 0, 'the quizzes start again in the new stage');
  assert.equal((await service.view('c1', 'Kai')).ups.length, 0);
  const list = await service.classList('c1', ['Kai', 'Mio']);
  assert.deepEqual(list.map((r) => r.stage.id), ['B', 'A']);
  assert.ok(list[0].weekDays >= 0);

  // API
  const added = [];
  const roblox = { childFor: (u) => (u === 'Kai' ? { class: '*', name: 'Kai' } : null), walletAdd: (...a) => added.push(a), pushBalance: async () => {} };
  const app = express();
  mountRoadmapApi(app, { service, roadmap, roblox, key: 'k'.repeat(32), log: { info() {}, warn() {} } });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/roadmap/Kai`)).status, 401);
    const j = await (await fetch(`${base}/api/roadmap/Kai`, { headers: { 'x-uspeak-key': 'k'.repeat(32) } })).json();
    assert.equal(j.ok, true);
    assert.equal(j.stage.id, 'B');
    assert.equal(j.classCode, 'c1', 'a Roblox child with no class is found by the saved name');
    assert.ok(Array.isArray(j.eiken) && Array.isArray(j.places.list));
    assert.equal(added.length, 0, 'no second payment');
  } finally { srv.close(); }
});

test('保護者レポート：今の 段階・次まで・英検の 見込み（LINE の 吹き出し・画像の 1 行・PDF の 2 まいめ）', () => {
  const A = stagesFor()[0].words;
  const rows = learn(A.slice(0, 10));
  const v = roadmapOf(rows, { now: T0 + 3 * DAY });
  const L = parentLines(v);
  assert.match(L.stageLine, /A「はじめの ことば」/);
  assert.match(L.nextLine, /単語 あと \d+ こ/);
  const text = roadmapText(v);
  assert.ok(text.startsWith('🗺') && text.includes('合格を 約束する ものでは ありません'));
  const d = weeklyData(rows, { week: weekOf(T0 + DAY), nick: 'かい', sender: '教室' });
  const src = weeklyTex({ ...d, roadmap: v });
  assert.ok(src.includes('ロードマップ') && src.includes('\\newpage') && src.includes('かいさんの ロードマップ'));
});
