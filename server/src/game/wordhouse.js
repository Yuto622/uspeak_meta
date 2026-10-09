// 英単語ハウス（メインの島）— Roblox の WordHouse の 3 軒。SUPER EASY / EASY（看板で切り替え）・MEDIUM・HARD。
//
// 1 回 10 問。形式はレベルごとの重みで抽選（Roblox と同じ表）：
//   SUPER EASY  mc, mc, match, listen
//   EASY/MEDIUM mc, mc, fill, order, match, listen
//   HARD        mc, fill, order, match, listen, type
// ルールも Roblox と同じ：まちがえたら正解を見せて、同じ問題をもう一度（選択肢は並べ替え）。
// 2 回目の正解は コイン半分・XP なし。2 回目も外したら次へ。全問 1 回で正解なら ボーナス。✕ でやめられる。
//
// **問題（答えつき）はサーバーにだけある。** Roblox の hut_quiz.json はまだ来ていないので、いまは仮の組み合わせ：
//   えらぶ（mc）       … word-quiz.json（Roblox WordHouseQuiz v4.7）。SUPER EASY は 5 級の単語の「What is …?」
//   せんつなぎ・きいて・タイピング … fishworld-quiz.json の単語（5 級 / 4 級 / 3 級）
//   あなうめ・ならべかえ … eiken-bank.json の「かく」「はなす」の文（g5 / g4 / g3）
// hut_quiz.json が来たら BANK を作り直す関数（loadBanks）だけを差し替える。判定と記録はそのまま。
import { readFileSync } from 'node:fs';
import {
  pickFormat, buildFor, buildMc, buildOrder, buildFill, publicFormat, checkFormat, revealFormat, diffFormat, shuffle,
} from '../../../client/dist/formats-core.js';

export const LEVELS = {
  SuperEasy: { house: 'hut_easy', weights: ['mc', 'mc', 'match', 'listen'], zone: '1', bank: null, grade: 'g5', en: 'SUPER EASY', ja: 'スーパーイージー' },
  Easy: { house: 'hut_easy', weights: ['mc', 'mc', 'fill', 'order', 'match', 'listen'], zone: '1', bank: 'easy', grade: 'g5', en: 'EASY', ja: 'イージー' },
  Medium: { house: 'hut_medium', weights: ['mc', 'mc', 'fill', 'order', 'match', 'listen'], zone: '2', bank: 'medium', grade: 'g4', en: 'MEDIUM', ja: 'ミディアム' },
  Hard: { house: 'hut_hard', weights: ['mc', 'fill', 'order', 'match', 'listen', 'type'], zone: '3', bank: 'hard', grade: 'g3', en: 'HARD', ja: 'ハード' },
};
export const HOUSES = { hut_easy: ['SuperEasy', 'Easy'], hut_medium: ['Medium'], hut_hard: ['Hard'] };
export const SET_SIZE = 10;
export const COIN = 4;          // 1 回目で正解
export const COIN_RETRY = 2;    // 2 回目で正解（半分）
export const XP = 5;            // 1 回目で正解だけ
export const PERFECT_BONUS = 20;
export const DAILY_COIN_CAP = 200;
export const FAST_MS = 4000;

export class WordHouseError extends Error {}

const read = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), 'utf8'));
const alpha = (w) => String(w).replace(/[^A-Za-z'-]/g, '');

export function loadBanks() {
  const words = read('fishworld-quiz.json').quiz;
  const mc = read('word-quiz.json').banks;
  const eiken = read('eiken-bank.json').grades;
  const banks = {};
  for (const [level, def] of Object.entries(LEVELS)) {
    const pool = (words[def.zone] || []).filter((q) => q.q && q.a && Array.isArray(q.o));
    const sentences = [...(eiken[def.grade]?.writing || []), ...(eiken[def.grade]?.speaking || [])]
      .filter((s) => s.en && s.ja && s.en.split(/\s+/).length >= 3 && s.en.split(/\s+/).length <= 9);
    const choice = def.bank ? (mc[def.bank] || []).filter((q) => q.q && Array.isArray(q.choices) && q.choices[q.answer] !== undefined) : [];
    if (pool.length < 8 || sentences.length < 6) throw new Error(`wordhouse: level ${level} has too few questions`);
    banks[level] = { pool, sentences, choice };
  }
  return banks;
}
export const BANK = loadBanks();

// あなうめの穴：文のいちばん長い単語。まぎらわしい3つは、同じレベルの ほかの文の 長さの近い単語。
function fillFor(s, sentences, rng) {
  const list = s.en.split(/\s+/).map(alpha).filter((w) => w.length >= 3);
  const blank = list.sort((a, b) => b.length - a.length)[0] || alpha(s.en.split(/\s+/)[0]);
  const others = [];
  for (const o of shuffle(sentences, rng)) {
    if (o === s) continue;
    for (const w of o.en.split(/\s+/).map(alpha)) {
      if (others.length >= 3) break;
      if (w.length >= 3 && Math.abs(w.length - blank.length) <= 3 && w.toLowerCase() !== blank.toLowerCase() && !others.some((x) => x.toLowerCase() === w.toLowerCase())) others.push(w);
    }
    if (others.length >= 3) break;
  }
  return buildFill(s.en, blank, s.ja, others, rng);
}

function itemFor(level, kind, used, rng) {
  const b = BANK[level];
  const fresh = (list, key) => {
    const left = list.filter((x) => !used.has(key(x)));
    const pick = (left.length ? left : list)[Math.floor(rng() * (left.length ? left : list).length)];
    used.add(key(pick));
    return pick;
  };
  if (kind === 'fill' || kind === 'order') {
    const s = fresh(b.sentences, (x) => `s:${x.en}`);
    const fmt = kind === 'fill' ? fillFor(s, b.sentences, rng) : buildOrder(s.en, s.ja, rng);
    return { kind, word: s.en, fmt };
  }
  if (kind === 'mc' && b.choice.length) {
    const c = fresh(b.choice, (x) => `c:${x.q}`);
    const answer = c.choices[c.answer];
    const fmt = buildMc({ q: '', a: answer, o: c.choices, prompt: c.q }, rng);
    return { kind, word: c.q, fmt };
  }
  const q = fresh(b.pool, (x) => `w:${x.q}`);
  const k = pickFormat([kind], q, rng);           // type に向かない単語は mc に落ちる
  return { kind: k, word: q.q, fmt: k === 'mc' ? buildMc(q, rng) : buildFor(k, q, b.pool, rng) };
}

let seq = 0;
export function startSet(house, level, { rng = Math.random, now = Date.now() } = {}) {
  if (!HOUSES[house]) throw new WordHouseError('no such house');
  const lv = HOUSES[house].includes(level) ? level : HOUSES[house][HOUSES[house].length - 1];
  const used = new Set();
  const items = [];
  for (let i = 0; i < SET_SIZE; i += 1) {
    const kind = LEVELS[lv].weights[Math.floor(rng() * LEVELS[lv].weights.length)];
    items.push({ ...itemFor(lv, kind, used, rng), id: `wh${now.toString(36)}${(seq += 1).toString(36)}`, attempt: 1 });
  }
  return { house, level: lv, items, i: 0, firstTry: 0, correct: 0, coins: 0, xp: 0, askedAt: now, startedAt: now };
}

export const levelInfo = (level) => ({ level, en: LEVELS[level].en, ja: LEVELS[level].ja });

export function askPayload(set) {
  const it = set.items[set.i];
  return { qid: it.id, house: set.house, ...levelInfo(set.level), i: set.i, n: set.items.length, attempt: it.attempt, format: publicFormat(it.fmt, { attempt: it.attempt }) };
}

// 2 回目に出すときは 選択肢を並べ替える（Roblox と同じ：同じ場所を押すだけで正解にならない）。
function reshuffle(fmt, rng) {
  const f = fmt;
  if (Array.isArray(f.choices)) f.choices = shuffle(f.choices, rng);
  if (Array.isArray(f.right)) f.right = shuffle(f.right, rng);
  if (Array.isArray(f.cards)) f.cards = shuffle(f.cards, rng);
  if (Array.isArray(f.words)) f.words = shuffle(f.words, rng);
  return f;
}

// 判定。返すもの：{ correct, retry（もう一度）, reveal, diff, coins, xp, next（つぎの問題）, done（おわり）}。
// コインの払い出しと上限は部屋が決める（ここは「いくら払うべきか」だけ）。
export function answer(set, qid, given, { rng = Math.random, now = Date.now() } = {}) {
  const it = set.items[set.i];
  if (!it || it.id !== qid) throw new WordHouseError('no question');
  const correct = checkFormat(it.fmt, given);
  const out = { qid, kind: it.kind, word: it.word, attempt: it.attempt, correct, fast: now - set.askedAt < FAST_MS };
  if (!correct && it.attempt === 1) {
    it.attempt = 2;
    reshuffle(it.fmt, rng);
    set.askedAt = now;
    return { ...out, retry: true, coins: 0, xp: 0, reveal: revealFormat(it.fmt), diff: diffFormat(it.fmt, given), format: publicFormat(it.fmt, { attempt: 2 }) };
  }
  out.retry = false;
  out.coins = correct ? (it.attempt === 1 ? COIN : COIN_RETRY) : 0;
  out.xp = correct && it.attempt === 1 ? XP : 0;
  if (!correct) { out.reveal = revealFormat(it.fmt); out.diff = diffFormat(it.fmt, given); }
  if (correct) set.correct += 1;
  if (correct && it.attempt === 1) set.firstTry += 1;
  set.i += 1;
  set.askedAt = now;
  if (set.i >= set.items.length) {
    out.done = { correct: set.correct, firstTry: set.firstTry, n: set.items.length, bonus: set.firstTry === set.items.length ? PERFECT_BONUS : 0, ...levelInfo(set.level), house: set.house };
  }
  return out;
}
