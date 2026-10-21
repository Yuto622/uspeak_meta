// ロードマップ（A・B・C・1〜9 の 12 段階）— 段階の 決まり・単語・英検の 合格見込み・おすすめの 場所。
//
// **ここは 計算だけ**（保存は roadmap/store.js、画面は client/dist/roadmap.js）。入力は roblox_events の 行
// （Roblox と Web の 両方。保護者レポートと 同じ 箱）なので、どちらで といても 同じ 段階に なる。
//
// 次の 段階に 進む 条件（2 つとも）：
//   1. その 段階の 単語の 8 割を「覚えた」（2 日以上に 分けて 3 回 つづけて 正解。保護者レポートと 同じ 定義）
//   2. その 段階に 入ってから、その 段階の 級の クイズを 20 問 以上・正解率 8 割（はじめての 答えだけ）
//   8 割は 英検Jr. の「正答率 80% 以上で 次の グレードへ」と 同じ 目安。
//
// **単語は ゲームで 実際に 出る ことばから 作る。** 出ない 単語を 条件に すると いつまでも 進めない。
//   A・B・C … ことばの ジムの 絵の ことば（英単語ハウス SUPER EASY で 出る）
//   1〜6 …… つり島（いけ＝5級・かわ＝4級・うみ＝3級）と U-Speak島の つりの ことば
//   7〜9 …… U-Speak島の つり（準2級・2級）と 問題DB（/admin/qbank）の 1 語の 答え
// 教室ごとに /admin/roadmap で 名前・中身・単語を かえられる（ここは 既定）。
//
// 英検の 合格見込み（`passChance`）は 協会の 公開情報で 組む：
//   - 一次試験の CSE スコアは 技能ごとに 同じ 満点（5級 425×2、4級 500×2、3級 550×3、準2級 600×3、2級 650×3、準1級 750×3）。
//     合格基準スコアは 5級 419/850・4級 622/1000・3級 1103/1650・準2級 1322/1800・2級 1520/1950・準1級 1792/2250。
//   - 協会の 説明（2016 年度 第 1 回）：2 級 以下は 各技能 6 割 程度、準1級・1級は 7 割 程度の 正答率の 受験者の 多くが 合格。
//   - 問題数（一次・2024 年度 以降）：5級 R25・L25、4級 R35・L30、3級 R30・L30、準2級 R29・L30、2級 R31・L30、準1級 R31・L29。
//   その子の その級の 正解・不正解から 正解率を ベータ分布で 見つもり、本番の 問題数で「技能の 平均が 合格の 正答率に とどく」
//   確率を 出す。**練習問題からの 見込みで あって 合格の 約束では ない**（作文と 二次の 面接は 入らない）。
import { readFileSync } from 'node:fs';
import { englishWord } from './review.js';
import { masteryTimeline, masteredAt, normalize, skillOfQuiz } from '../parent-report/aggregate.js';
import { dayKey, weekOf } from '../parent-report/jst.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

export const STAGE_IDS = ['A', 'B', 'C', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
export const WORD_RATE = 0.8;      // 単語の 8 割
export const QUIZ_MIN = 20;        // クイズ 20 問 以上
export const QUIZ_RATE = 0.8;      // 正解率 8 割
export const STAGE_COINS = 100;    // 段階が 上がった ときの コイン（1 段階 1 回だけ）
export const MIN_SKILL = 10;       // 合格見込みを 出す まえに 1 技能 これだけ ほしい
export const TARGET_CHANCE = 0.8;  // 「あと これだけ」の めやす（見込み 80%）

// 英検の 級（`jr` は 英検Jr.＝合否なし）。
export const EIKEN = {
  jr: { ja: '英検Jr.', en: 'Eiken Jr.', school: '小学生の はじめ', vocab: 0, items: null },
  g5: { ja: '5級', en: 'Grade 5', school: '中学初級程度', vocab: 600, items: { reading: 25, listening: 25 }, cut: 0.6, cse: [419, 850] },
  g4: { ja: '4級', en: 'Grade 4', school: '中学中級程度', vocab: 1300, items: { reading: 35, listening: 30 }, cut: 0.6, cse: [622, 1000] },
  g3: { ja: '3級', en: 'Grade 3', school: '中学卒業程度', vocab: 2100, items: { reading: 30, listening: 30 }, cut: 0.6, cse: [1103, 1650], writing: true },
  gp2: { ja: '準2級', en: 'Grade Pre-2', school: '高校中級程度', vocab: 3600, items: { reading: 29, listening: 30 }, cut: 0.6, cse: [1322, 1800], writing: true },
  g2: { ja: '2級', en: 'Grade 2', school: '高校卒業程度', vocab: 5100, items: { reading: 31, listening: 30 }, cut: 0.6, cse: [1520, 1950], writing: true },
  gp1: { ja: '準1級', en: 'Grade Pre-1', school: '大学中級程度', vocab: 7500, items: { reading: 31, listening: 29 }, cut: 0.7, cse: [1792, 2250], writing: true },
};
export const GRADE_ORDER = ['jr', 'g5', 'g4', 'g3', 'gp2', 'g2', 'gp1'];

// 既定の 12 段階。`jrLevel` は 英検Jr. の どの グレード くらいか（A・B・C だけ）。
export const DEFAULT_STAGES = [
  { id: 'A', grade: 'jr', en: 'Hello Words', ja: 'はじめの ことば', note: '英検Jr. BRONZE くらい。どうぶつ・たべものの ことばを 絵で。', jr: 'BRONZE' },
  { id: 'B', grade: 'jr', en: 'Everyday Words', ja: 'まいにちの ことば', note: '英検Jr. SILVER くらい。がっこう・しぜんの ことば。', jr: 'SILVER' },
  { id: 'C', grade: 'jr', en: 'Ready for Grade 5', ja: '5級への じゅんび', note: '英検Jr. GOLD くらい。のりもの・くらしの ことば。', jr: 'GOLD' },
  { id: '1', grade: 'g5', en: 'Grade 5 · Step 1', ja: '5級 ステップ1', note: '英検5級（中学初級程度）の まえ半分。' },
  { id: '2', grade: 'g5', en: 'Grade 5 · Step 2', ja: '5級 ステップ2', note: '英検5級の あと半分。ここを こえたら 5級の 目安。' },
  { id: '3', grade: 'g4', en: 'Grade 4 · Step 1', ja: '4級 ステップ1', note: '英検4級（中学中級程度）の まえ半分。' },
  { id: '4', grade: 'g4', en: 'Grade 4 · Step 2', ja: '4級 ステップ2', note: '英検4級の あと半分。' },
  { id: '5', grade: 'g3', en: 'Grade 3 · Step 1', ja: '3級 ステップ1', note: '英検3級（中学卒業程度）の まえ半分。' },
  { id: '6', grade: 'g3', en: 'Grade 3 · Step 2', ja: '3級 ステップ2', note: '英検3級の あと半分。作文と 面接も はじまる。' },
  { id: '7', grade: 'gp2', en: 'Grade Pre-2', ja: '準2級', note: '英検準2級（高校中級程度）。' },
  { id: '8', grade: 'g2', en: 'Grade 2', ja: '2級', note: '英検2級（高校卒業程度）。' },
  { id: '9', grade: 'gp1', en: 'Grade Pre-1', ja: '準1級', note: '英検準1級（大学中級程度）。' },
];

// ---- 既定の 単語（ゲームで 出る ことば）-----------------------------------------------------
const clean = (list) => [...new Set(list.map(englishWord).filter(Boolean))];
const halves = (list) => { const n = Math.ceil(list.length / 2); return [list.slice(0, n), list.slice(n)]; };
let baseWords = null;
let qbankWords = { gp2: [], g2: [], gp1: [] };
const QBANK_CAP = 80; // 問題DB からは 1 段階 80 語まで（ぜんぶ 入れると 8 割に とどかない）

function loadBase() {
  if (baseWords) return baseWords;
  const gym = read('./gym-words.json').words.filter((w) => w.emoji && /^[a-z][a-z ]*$/i.test(w.en));
  const group = (...g) => clean(gym.filter((w) => g.includes(w.group)).map((w) => w.en));
  const fw = read('./fishworld-quiz.json').quiz;
  let fish = {};
  try {
    // U-Speak島の つりの ことば（5・4・3・準2・2級 × 20）。同期で 読むため JSON の かわりに 文字から ひろう。
    const src = readFileSync(new URL('../../../client/dist/fishing-data.js', import.meta.url), 'utf8');
    const m = /vocabulary\s*=\s*(\{[\s\S]*?\});/.exec(src);
    if (m) fish = Function(`"use strict";return (${m[1]});`)();
  } catch { fish = {}; }
  const fishOf = (g) => clean((fish[g] || []).map((x) => (Array.isArray(x) ? x[0] : x?.word || '')));
  const [z1a, z1b] = halves(clean(fw[1].map((q) => q.q)));
  const [z2a, z2b] = halves(clean(fw[2].map((q) => q.q)));
  const [z3a, z3b] = halves(clean(fw[3].map((q) => q.q)));
  const [f5a, f5b] = halves(fishOf('5')); const [f4a, f4b] = halves(fishOf('4')); const [f3a, f3b] = halves(fishOf('3'));
  const lists = {
    A: group('animals', 'food'), B: group('school', 'nature'), C: group('vehicles', 'life'),
    1: [...z1a, ...f5a], 2: [...z1b, ...f5b], 3: [...z2a, ...f4a], 4: [...z2b, ...f4b], 5: [...z3a, ...f3a], 6: [...z3b, ...f3b],
    7: fishOf('準2'), 8: fishOf('2'), 9: [],
  };
  // 同じ 語は いちばん 下の 段階だけに（2 か所に あると 数えかたが あいまいに なる）。
  const seen = new Set();
  for (const id of STAGE_IDS) lists[id] = clean(lists[id]).filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
  baseWords = lists;
  return lists;
}

// 問題DB（qbank）の 準2級・2級・準1級以上 の 1 語の 答え。index.js が 変わる たびに 入れる。
const QBANK_GRADE = { '準2級': 'gp2', '2級': 'g2', '準1級以上': 'gp1' };
export function setQbankWords(items = []) {
  const out = { gp2: [], g2: [], gp1: [] };
  for (const it of items) {
    const g = QBANK_GRADE[it?.grade];
    if (!g) continue;
    const w = englishWord(String(it.answer || ''));
    if (w && /^[a-z][a-z'-]{2,}$/.test(w) && !out[g].includes(w)) out[g].push(w);
  }
  qbankWords = out;
  return { gp2: out.gp2.length, g2: out.g2.length, gp1: out.gp1.length };
}

export function defaultWords(id) {
  const base = loadBase()[id] || [];
  const extra = id === '7' ? qbankWords.gp2 : id === '8' ? qbankWords.g2 : id === '9' ? qbankWords.gp1 : [];
  return [...base, ...extra.filter((w) => !base.includes(w)).slice(0, QBANK_CAP)];
}

// 教室の 設定（/admin/roadmap）を 既定に かさねる。words が 空なら 既定の 単語。
export function stagesFor(settings = null) {
  const over = settings?.stages || {};
  return DEFAULT_STAGES.map((d) => {
    const o = over[d.id] || {};
    const words = Array.isArray(o.words) && o.words.length ? clean(o.words) : defaultWords(d.id);
    return { ...d, en: o.en || d.en, ja: o.ja || d.ja, note: o.note ?? d.note, words, custom: !!(o.words && o.words.length) };
  });
}
export const startOf = (settings) => (STAGE_IDS.includes(settings?.start) ? settings.start : 'A');

// ---- 1 問の 級 ----------------------------------------------------------------------------
const GRADE_ALIAS = {
  g5: 'g5', 5: 'g5', '5級': 'g5', g4: 'g4', 4: 'g4', '4級': 'g4', g3: 'g3', 3: 'g3', '3級': 'g3',
  gp2: 'gp2', p2: 'gp2', '準2': 'gp2', '準2級': 'gp2', 'pre-2': 'gp2', g2: 'g2', 2: 'g2', '2級': 'g2',
  gp1: 'gp1', p1: 'gp1', '準1': 'gp1', '準1級': 'gp1', '準1級以上': 'gp1', 'pre-1': 'gp1', jr: 'jr', junior: 'jr', 'ジュニア': 'jr',
};
const HUT = { supereasy: 'jr', easy: 'g5', medium: 'g4', hard: 'g3' };
export function gradeOfEvent(e, wordGrade = new Map()) {
  const d = e.data || {};
  const g = GRADE_ALIAS[String(d.grade ?? '').toLowerCase()] || GRADE_ALIAS[String(d.grade ?? '')];
  if (g) return g;
  if (e.world === 'fishworld' && [1, 2, 3].includes(Number(d.zone))) return ['g5', 'g4', 'g3'][Number(d.zone) - 1];
  if (e.world === 'hut' && HUT[String(d.level || '').toLowerCase()]) return HUT[String(d.level).toLowerCase()];
  const w = englishWord(d.word);
  if (w && wordGrade.has(w)) return wordGrade.get(w);
  const l = String(d.level ?? '').toLowerCase();
  if (l === 'hard' || l === '3') return 'g3';
  if (l === 'medium' || l === '4') return 'g4';
  if (l === 'easy' || l === '5') return 'g5';
  return '';
}
// 英検の 技能（合格見込み用）。聞く＝listen、それ以外は 読む（作文は ここでは はからない）。
const eikenSkill = (e) => (skillOfQuiz(e) === 'listen' ? 'listening' : 'reading');
const isQuiz = (e) => e.type === 'quiz';
const isClean = (e) => e.data.retry !== true && e.data.fast !== true;
const okOf = (e) => (e.data.correct === true ? true : e.data.correct === false ? false : null);
// 英検の 形の 問題（英検の島・問題DB）。これが 少ない あいだは 単語クイズも 足して 見つもる。
const isEikenForm = (e) => e.world === 'eiken' || e.data.eiken === true || !!e.data.qbank;

// ---- 1 人ぶんの ロードマップ ---------------------------------------------------------------
// state = { stage, since }（保存。無ければ 教室の はじめの 段階）。
export function roadmapOf(rows, { settings = null, state = null, now = Date.now() } = {}) {
  const stages = stagesFor(settings);
  const events = normalize(rows).filter((e) => e.ts <= now);
  const quiz = events.filter(isQuiz);
  const wordGrade = new Map();
  const wordStage = new Map();
  for (const s of stages) for (const w of s.words) { if (!wordGrade.has(w)) { wordGrade.set(w, s.grade); wordStage.set(w, s.id); } }
  const stageId = STAGE_IDS.includes(state?.stage) ? state.stage : startOf(settings);
  const since = Number(state?.since) || 0;
  const idx = STAGE_IDS.indexOf(stageId);
  const stage = stages[idx];
  const mastered = masteredAt(masteryTimeline(quiz), now);

  // 単語：その 段階の 単語の 8 割
  const words = stage.words;
  const known = words.filter((w) => mastered.has(w));
  const needWords = Math.ceil(words.length * WORD_RATE);
  // クイズ：この 段階に 入ってから、この 段階の 級の はじめての 答え
  const graded = quiz.filter((e) => isClean(e) && okOf(e) !== null).map((e) => ({ e, g: gradeOfEvent(e, wordGrade) }));
  const mine = graded.filter((x) => x.g === stage.grade && x.e.ts >= since);
  const qn = mine.length; const qc = mine.filter((x) => okOf(x.e)).length;
  const acc = qn ? qc / qn : 0;
  const quizLeft = Math.max(0, QUIZ_MIN - qn);
  // 正解率が 8 割に とどかない ときは「あと ◯ 問 つづけて 正解」で とどく 数（20 問を こえても）。
  let streakNeed = 0;
  if (qn >= QUIZ_MIN && acc < QUIZ_RATE) streakNeed = Math.ceil((QUIZ_RATE * qn - qc) / (1 - QUIZ_RATE) - 1e-9);
  const wordsLeft = Math.max(0, needWords - known.length);
  const ready = wordsLeft === 0 && quizLeft === 0 && acc >= QUIZ_RATE;
  const last = idx === STAGE_IDS.length - 1;

  // 4 つの 力（保護者レポートと 同じ 対応：聞く＝listen、書く＝type・spell、それ以外＝読む。話す＝声に 出した 回数）
  const bar = { read: { n: 0, ok: 0 }, listen: { n: 0, ok: 0 }, write: { n: 0, ok: 0 }, speak: { n: 0 } };
  for (const x of graded) if (x.g === stage.grade) { const s = skillOfQuiz(x.e); bar[s].n += 1; if (okOf(x.e)) bar[s].ok += 1; }
  bar.speak.n = events.filter((e) => e.type === 'speak').length;
  const skills = ['read', 'listen', 'speak', 'write'].map((k) => {
    const b = bar[k];
    const value = k === 'speak' ? Math.min(1, b.n / 10) : (b.n ? Math.min(1, b.n / QUIZ_MIN) * Math.min(1, (b.ok / b.n) / QUIZ_RATE) : 0);
    return { key: k, n: b.n, ok: b.ok ?? null, acc: k === 'speak' || !b.n ? null : Math.round((b.ok / b.n) * 100), value: Math.round(value * 100) };
  });

  // 英検の 見込み：いまの 段階の 級（英検Jr. の 段階は 5級）と、その 1 つ 上。
  const target = stage.grade === 'jr' ? 'g5' : stage.grade;
  const chances = [target, GRADE_ORDER[GRADE_ORDER.indexOf(target) + 1]].filter((g) => g && EIKEN[g]?.items)
    .map((g) => passChance(g, graded.filter((x) => x.g === g).map((x) => x.e)));

  // 今週 学習した 日（月〜日）
  const wk = weekOf(now);
  const weekDays = new Set(quiz.filter((e) => e.ts >= wk.start && e.ts <= wk.end).map((e) => dayKey(e.ts))).size;

  return {
    stage: { id: stage.id, en: stage.en, ja: stage.ja, note: stage.note, grade: stage.grade, gradeJa: EIKEN[stage.grade].ja, jr: stage.jr || '' },
    index: idx, since, last,
    stages: stages.map((s, i) => ({ id: s.id, en: s.en, ja: s.ja, grade: s.grade, gradeJa: EIKEN[s.grade].ja, words: s.words.length, done: i < idx, here: i === idx })),
    words: { total: words.length, known: known.length, need: needWords, left: wordsLeft, next: words.filter((w) => !mastered.has(w)).slice(0, 6) },
    quiz: { n: qn, correct: qc, acc: qn ? Math.round(acc * 100) : null, min: QUIZ_MIN, rate: Math.round(QUIZ_RATE * 100), left: quizLeft, streakNeed },
    ready: ready && !last,
    skills,
    eiken: chances,
    places: placesFor(stage.grade, { skills, chances, wordsLeft, quizLeft }),
    weekDays,
    mastered: mastered.size,
  };
}

// ---- 英検の 合格見込み ---------------------------------------------------------------------
const erf = (x) => { // Abramowitz–Stegun 7.1.26
  const s = Math.sign(x); const a = Math.abs(x); const t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
};
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const lgamma = (z) => { // Lanczos
  const g = 7; const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};
const GRID = 41;
function betaGrid(a, b) {
  const pts = []; let sum = 0;
  const lb = lgamma(a) + lgamma(b) - lgamma(a + b);
  for (let i = 0; i < GRID; i += 1) {
    const p = (i + 0.5) / GRID;
    const w = Math.exp((a - 1) * Math.log(p) + (b - 1) * Math.log(1 - p) - lb);
    pts.push([p, w]); sum += w;
  }
  return pts.map(([p, w]) => [p, w / sum]);
}
// 読む・聞くの 正解・不正解（{reading:{c,w}, listening:{c,w}}）→ 本番で 平均正答率が cut に とどく 確率。
export function chanceFromCounts(grade, counts) {
  const G = EIKEN[grade];
  const skills = Object.keys(G.items);
  const grids = skills.map((s) => betaGrid(1 + (counts[s]?.c || 0), 1 + (counts[s]?.w || 0)));
  const N = skills.map((s) => G.items[s]);
  let P = 0;
  const walk = (k, wsum, means, vars) => {
    if (k === skills.length) {
      const m = means / skills.length; const sd = Math.sqrt(vars) / skills.length;
      P += wsum * (sd > 0 ? 1 - phi((G.cut - m) / sd) : (m >= G.cut ? 1 : 0));
      return;
    }
    for (const [p, w] of grids[k]) walk(k + 1, wsum * w, means + p, vars + (p * (1 - p)) / N[k]);
  };
  walk(0, 1, 0, 0);
  return Math.max(0, Math.min(1, P));
}
export function passChance(grade, events) {
  const G = EIKEN[grade];
  const skills = Object.keys(G.items);
  // 作文（英検の島の かくの館＝ならべかえ）は 一次の よむ・きくに 入れない。
  events = events.filter((e) => e.data.skill !== 'writing');
  const form = events.filter(isEikenForm);
  // 英検の 形の 問題が 1 技能 10 問 以上 あれば それだけで。なければ 単語クイズも 足す（たしかさは さがる）。
  const enough = (list) => skills.every((s) => list.filter((e) => eikenSkill(e) === s).length >= MIN_SKILL);
  const basis = enough(form) ? 'eiken' : 'all';
  const use = (basis === 'eiken' ? form : events).slice(-200);
  const counts = Object.fromEntries(skills.map((s) => {
    const l = use.filter((e) => eikenSkill(e) === s);
    const c = l.filter((e) => okOf(e)).length;
    return [s, { c, w: l.length - c, n: l.length }];
  }));
  const out = { grade, ja: G.ja, en: G.en, school: G.school, cut: Math.round(G.cut * 100), cse: G.cse, writing: !!G.writing, basis,
    skills: Object.fromEntries(skills.map((s) => [s, { n: counts[s].n, acc: counts[s].n ? Math.round((counts[s].c / counts[s].n) * 100) : null }])) };
  const lacking = skills.filter((s) => counts[s].n < MIN_SKILL).map((s) => ({ skill: s, more: MIN_SKILL - counts[s].n }));
  if (lacking.length) return { ...out, chance: null, lacking };
  const chance = chanceFromCounts(grade, counts);
  const plan = planFor(grade, counts, chance);
  return { ...out, chance: Math.round(chance * 100), lacking: [], plan };
}
// 「あと これだけ」：見込みが 80% に とどく いちばん 近い 道。
//  ① いまの 正解率の まま 問題を ふやせば とどく → あと ◯ 問ずつ
//  ② いまの 正解率では とどかない → 正解率を ◯% まで 上げて 40 問ずつ
export function planFor(grade, counts, chance = chanceFromCounts(grade, counts)) {
  if (chance >= TARGET_CHANCE) return { kind: 'keep' };
  const skills = Object.keys(EIKEN[grade].items);
  const rate = (s) => (counts[s].c + 1) / (counts[s].c + counts[s].w + 2);
  for (let m = 10; m <= 300; m += 10) {
    const next = Object.fromEntries(skills.map((s) => [s, { c: counts[s].c + rate(s) * m, w: counts[s].w + (1 - rate(s)) * m }]));
    if (chanceFromCounts(grade, next) >= TARGET_CHANCE) return { kind: 'more', perSkill: m };
  }
  // いちばん 弱い 技能を 上げる。
  const weak = skills.reduce((a, b) => (rate(a) <= rate(b) ? a : b));
  for (let acc = Math.ceil(rate(weak) * 100) + 1; acc <= 100; acc += 1) {
    const next = Object.fromEntries(skills.map((s) => {
      const a = s === weak ? acc / 100 : Math.max(rate(s), acc / 100 - 0.05);
      return [s, { c: counts[s].c + a * 40, w: counts[s].w + (1 - a) * 40 }];
    }));
    if (chanceFromCounts(grade, next) >= TARGET_CHANCE) return { kind: 'raise', skill: weak, acc, now: Math.round(rate(weak) * 100), perSkill: 40 };
  }
  return { kind: 'raise', skill: weak, acc: 100, now: Math.round(rate(weak) * 100), perSkill: 40 };
}

// ---- おすすめの 場所 -----------------------------------------------------------------------
// island は rpg-data.js の HUBS の id、spot は その島の 場所。画面の「いく」は ここへ 飛ぶ。
const P = (island, spot, emoji, en, ja, does) => ({ island, spot, emoji, en, ja, does });
const EIKEN_HALLS = (g, isl) => ({
  reading: P(isl, 'reading', '📖', `Eiken ${g} · Reading Hall`, `英検${g}級の島 よむの館`, 'reading'),
  listening: P(isl, 'listening', '🎧', `Eiken ${g} · Listening Hall`, `英検${g}級の島 きくの館`, 'listening'),
  writing: P(isl, 'writing', '✏️', `Eiken ${g} · Writing Hall`, `英検${g}級の島 かくの館`, 'writing'),
  speaking: P(isl, 'speaking', '🎤', `Eiken ${g} · Speaking Hall`, `英検${g}級の島 はなすの館`, 'speaking'),
  interview: P(isl, 'interview', '🧑‍🏫', `Eiken ${g} · Interview Room`, `英検${g}級の島 めんせつの間`, 'speaking'),
});
const PLACES = {
  jr: {
    words: [P('main', 'hut_easy', '🏠', 'Word House · SUPER EASY', '英単語ハウス（SUPER EASY）', 'words'), P('school', 'gym', '🏋️', 'Word Gym', 'ことばの ジム', 'words')],
    read: [P('main', 'hut_easy', '🏠', 'Word House · SUPER EASY', '英単語ハウス（SUPER EASY）', 'reading')],
    listen: [P('main', 'hut_easy', '🏠', 'Word House · SUPER EASY', '英単語ハウス（SUPER EASY）', 'listening')],
    speak: [P('school', 'gym', '🏋️', 'Word Gym (speak)', 'ことばの ジム（はなす）', 'speaking')],
    write: [P('main', 'hut_easy', '🏠', 'Word House', '英単語ハウス', 'writing')],
  },
  g5: (() => { const h = EIKEN_HALLS('5', 'eiken5'); const pond = P('fishworld', 'pond', '🎣', 'Fishing Island · Pond (Grade 5)', 'つり島 ★いけ（5級）', 'words'); const hut = P('main', 'hut_easy', '🏠', 'Word House · EASY', '英単語ハウス（EASY・5級）', 'words');
    return { words: [pond, hut], read: [h.reading, hut], listen: [h.listening, pond], speak: [h.speaking], write: [h.writing, hut] }; })(),
  g4: (() => { const h = EIKEN_HALLS('4', 'eiken4'); const river = P('fishworld', 'river', '🎣', 'Fishing Island · River (Grade 4)', 'つり島 ★★かわ（4級）', 'words'); const hut = P('main', 'hut_medium', '🏠', 'Word House · MEDIUM', '英単語ハウス（MEDIUM・4級）', 'words');
    return { words: [river, hut], read: [h.reading, hut], listen: [h.listening, river], speak: [h.speaking], write: [h.writing, hut] }; })(),
  g3: (() => { const h = EIKEN_HALLS('3', 'eiken3'); const sea = P('fishworld', 'sea', '🎣', 'Fishing Island · Sea (Grade 3)', 'つり島 ★★★うみ（3級）', 'words'); const hut = P('main', 'hut_hard', '🏠', 'Word House · HARD', '英単語ハウス（HARD・3級）', 'words');
    return { words: [sea, hut], read: [h.reading, hut], listen: [h.listening, sea], speak: [h.speaking, h.interview], write: [h.writing, hut] }; })(),
};
const HIGH = (gja) => {
  const pier = P('willow', 'sea', '🎣', 'U-Speak Island · Starlight Sea', 'U-Speak島 星海の桟橋（準2・2級の ことば）', 'words');
  const hw = P('homework', 'desk', '📚', 'Homework Island', 'しゅくだい島', 'reading');
  const conv = P('conv', '', '💬', 'Conversation Island', '英会話島', 'speaking');
  return { words: [pier, hw], read: [hw], listen: [pier], speak: [conv], write: [hw], note: `${gja}は Roblox の 問題DBの 問題でも 練習できます` };
};
PLACES.gp2 = HIGH('準2級'); PLACES.g2 = HIGH('2級'); PLACES.gp1 = HIGH('準1級');
const REVIEW = P('', 'review', '🔁', 'Weak-word Review', '苦手単語の 復習（マイページ）', 'words');

export function placesFor(grade, { skills = [], chances = [], wordsLeft = 0, quizLeft = 0 } = {}) {
  const T = PLACES[grade] || PLACES.g5;
  const out = [];
  const add = (p, why) => { if (p && !out.some((x) => x.island === p.island && x.spot === p.spot)) out.push({ ...p, why }); };
  if (wordsLeft) for (const p of T.words) add(p, { kind: 'words', n: wordsLeft });
  // いちばん 弱い 力から（数が 少ない か 正解率が ひくい）
  const weak = skills.filter((s) => s.key !== 'speak').sort((a, b) => a.value - b.value);
  for (const s of weak) for (const p of T[s.key] || []) add(p, { kind: s.key, n: Math.max(quizLeft, s.n < QUIZ_MIN ? QUIZ_MIN - s.n : 10) });
  const ch = chances[0];
  if (ch?.plan?.kind === 'raise') for (const p of T[ch.plan.skill === 'listening' ? 'listen' : 'read'] || []) add(p, { kind: 'eiken', skill: ch.plan.skill, acc: ch.plan.acc, n: ch.plan.perSkill });
  if (ch?.lacking?.length) for (const l of ch.lacking) for (const p of T[l.skill === 'listening' ? 'listen' : 'read'] || []) add(p, { kind: 'eiken', skill: l.skill, n: l.more });
  for (const p of T.speak || []) add(p, { kind: 'speak', n: 5 });
  if (wordsLeft) add(REVIEW, { kind: 'words', n: wordsLeft });
  return { list: out.slice(0, 5), note: T.note || '' };
}

// 進めるか（保存の 前に よぶ）。段階が 上がるなら つぎの id。
export function nextStageId(id) { const i = STAGE_IDS.indexOf(id); return i >= 0 && i < STAGE_IDS.length - 1 ? STAGE_IDS[i + 1] : ''; }

// ---- 保護者むけの ことば（web レポート・PDF・LINE で 同じ 文）-----------------------------
const SKILL_JA = { reading: 'よむ', listening: 'きく', read: 'よむ', listen: 'きく', write: 'かく', speak: 'はなす', words: '単語' };
export function chanceText(c) {
  if (!c) return '';
  if (c.chance === null) return `英検${c.ja}：まだ 見こみを 出せません（${c.lacking.map((l) => `${SKILL_JA[l.skill]}の 問題を あと ${l.more} 問`).join('・')}）`;
  let next = '';
  if (c.plan?.kind === 'more') next = `。いまの 正解率の まま よむ・きくを あと ${c.plan.perSkill} 問ずつ とくと 80% に とどく 見こみ`;
  else if (c.plan?.kind === 'raise') next = `。${SKILL_JA[c.plan.skill]}の 正解率を ${c.plan.now}% → ${c.plan.acc}% に 上げて ${c.plan.perSkill} 問 とくと 80% に とどく 見こみ`;
  return `英検${c.ja}（一次）の 合格見込み 約${c.chance}%${next}`;
}
export function parentLines(v) {
  if (!v?.stage) return null;
  const s = v.stage;
  const stageLine = `いまの 段階：${s.id}「${s.ja}」（${s.gradeJa}${s.jr ? ` ${s.jr}` : ''}）${v.index + 1} / ${STAGE_IDS.length}`;
  const parts = [];
  if (v.words.left) parts.push(`単語 あと ${v.words.left} こ`);
  if (v.quiz.left) parts.push(`クイズ あと ${v.quiz.left} 問`);
  else if (v.quiz.acc !== null && v.quiz.acc < v.quiz.rate) parts.push(`クイズの 正解率 ${v.quiz.acc}% → ${v.quiz.rate}%（あと ${v.quiz.streakNeed} 問 つづけて 正解）`);
  const nextLine = v.last ? 'さいごの 段階です' : parts.length ? `次の 段階まで：${parts.join('・')}` : '次の 段階に 進めます（つぎに ゲームを ひらいた とき）';
  const eiken = v.eiken.map(chanceText).filter(Boolean);
  const places = (v.places?.list || []).slice(0, 3).map((p) => `${p.ja}${p.why?.n ? `（${p.why.kind === 'words' ? `単語 ${p.why.n} こ` : `${p.why.n} 問`}）` : ''}`);
  return { stageLine, nextLine, eiken, places, note: '英検の 見込みは 島の 練習問題（英検の 形）の 正解・不正解と、協会の 公開している 一次試験の 問題数・合格の 目安（2級 以下 各技能 6 割 程度・準1級 7 割 程度）から 計算した ものです。作文・面接は ふくまず、合格を 約束する ものでは ありません。' };
}
