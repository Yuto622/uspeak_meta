// メインの島の 英検の つり場（5級・4級・3級・準2級・2級・準1級）— 級ごとの 問題を 出す。
//
// つり場そのものは つり島と 同じ 流れ（fw:cast → fw:ask → fw:answer → fw:reel → fw:catch、ClassRoom）。
// ちがうのは 問題だけ：
//   - 英検の 形 … 問題DB（/admin/qbank）の その級の よむ 問題（「web版に出す」が ○）。無い 級は eiken-bank.json（5・4・3級）。
//   - ことば …… その級の ことば（5〜3級＝つり島の いけ・かわ・うみ、準2・2級＝U-Speak島の つりの ことば）。
//   ことばの 問題は ロードマップの「覚えた 単語」を すすめ、英検の 形の 問題は 合格見込みの もとに なる（記録に grade と eiken が のる）。
// 釣れる 魚は つり島の ゾーンの 魚（5級＝いけ・4級＝かわ・3級より 上＝うみ）。
import { readFileSync } from 'node:fs';
import { buildMc } from '../../../client/dist/formats-core.js';
import { FW } from './fishworld.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

export const PIERS = [
  { id: 'pier_g5', grade: 'g5', qbank: '5級', zone: 1, en: 'Eiken Grade 5 Pier', ja: '英検5級の つり場', gradeJa: '英検5級', gradeEn: 'Eiken 5', stars: '★', color: '#3E9A5A' },
  { id: 'pier_g4', grade: 'g4', qbank: '4級', zone: 2, en: 'Eiken Grade 4 Pier', ja: '英検4級の つり場', gradeJa: '英検4級', gradeEn: 'Eiken 4', stars: '★★', color: '#2E6EA8' },
  { id: 'pier_g3', grade: 'g3', qbank: '3級', zone: 3, en: 'Eiken Grade 3 Pier', ja: '英検3級の つり場', gradeJa: '英検3級', gradeEn: 'Eiken 3', stars: '★★★', color: '#7A5CC8' },
  { id: 'pier_gp2', grade: 'gp2', qbank: '準2級', zone: 3, en: 'Eiken Grade Pre-2 Pier', ja: '英検準2級の つり場', gradeJa: '英検準2級', gradeEn: 'Eiken Pre-2', stars: '★★★★', color: '#E27A2D' },
  { id: 'pier_g2', grade: 'g2', qbank: '2級', zone: 3, en: 'Eiken Grade 2 Pier', ja: '英検2級の つり場', gradeJa: '英検2級', gradeEn: 'Eiken 2', stars: '★★★★', color: '#D0484A' },
  { id: 'pier_gp1', grade: 'gp1', qbank: '準1級以上', zone: 3, en: 'Eiken Grade Pre-1 Pier', ja: '英検準1級の つり場', gradeJa: '英検準1級', gradeEn: 'Eiken Pre-1', stars: '★★★★★', color: '#C69848' },
];
export const PIER_BY_ID = new Map(PIERS.map((p) => [p.id, p]));
// つり場の 名簿に のせる（部屋の fw:open / fw:cast / fw:sell が 知っている つり場に なる）。
for (const p of PIERS) FW.spotById.set(p.id, { id: p.id, kind: 'pier', zone: p.zone, name: p.ja, en: p.en, pier: true });
export const isPier = (id) => PIER_BY_ID.has(id);
export class PierError extends Error {}

// ---- ことば（意味つき）--------------------------------------------------------------------
const clean = (s) => String(s ?? '').trim();
function loadWords() {
  const fw = read('./fishworld-quiz.json').quiz;
  const words = { g5: fw[1] || [], g4: fw[2] || [], g3: fw[3] || [], gp2: [], g2: [], gp1: [] };
  try {
    const src = readFileSync(new URL('../../../client/dist/fishing-data.js', import.meta.url), 'utf8');
    const m = /vocabulary\s*=\s*(\{[\s\S]*?\});/.exec(src);
    const vocab = m ? Function(`"use strict";return (${m[1]});`)() : {};
    for (const [key, g] of [['準2', 'gp2'], ['2', 'g2']]) {
      const list = (vocab[key] || []).map((x) => (Array.isArray(x) ? { q: clean(x[0]), a: clean(x[1]) } : null)).filter((x) => x?.q && x.a);
      words[g] = list.map((w) => ({ q: w.q, a: w.a, o: [w.a, ...list.filter((o) => o.a !== w.a).map((o) => o.a)] }));
    }
  } catch { /* つりの ことばが 読めなくても 英検の 形の 問題は 出る */ }
  return words;
}
const WORDS = loadWords();

// ---- 英検の 形（問題DB と eiken-bank）------------------------------------------------------
const BANK = (() => {
  const b = read('./eiken-bank.json').grades;
  const out = {};
  for (const g of ['g5', 'g4', 'g3']) {
    out[g] = (b[g]?.reading || []).map((it, i) => ({ id: `bank:${g}:${i}`, passage: clean(it.text), question: clean(it.q), answer: clean(it.choices[0]), choices: it.choices.map(clean) }));
  }
  return out;
})();
let extra = {};
const SHORT = (it) => it.question.length <= 220 && (it.passage || '').length <= 420;
// index.js が 問題DB の「web版に出す」問題を 入れる（変わる たびに）。
export function setPierQuestions(items = []) {
  const out = {};
  for (const p of PIERS) out[p.grade] = [];
  for (const it of items) {
    const p = PIERS.find((x) => x.qbank === it?.grade);
    if (!p || it.skill !== 'reading' || !Array.isArray(it.choices) || it.choices.length < 2 || !it.choices.includes(it.answer)) continue;
    const q = { id: `qb:${it.id}`, qbank: it.id, passage: clean(it.passage), question: clean(it.question), answer: clean(it.answer), choices: it.choices.map(clean) };
    if (SHORT(q)) out[p.grade].push(q);
  }
  extra = out;
  return Object.fromEntries(Object.entries(out).map(([g, l]) => [g, l.length]));
}
const formPool = (grade) => (extra[grade]?.length ? extra[grade] : BANK[grade] || []);

// どちらの 問題が 出せるか（画面の「じゅんび ちゅう」と テスト用）。
export function pierStock(id) {
  const p = PIER_BY_ID.get(id);
  if (!p) return { words: 0, eiken: 0 };
  return { words: WORDS[p.grade].length, eiken: formPool(p.grade).length, fromQbank: !!extra[p.grade]?.length };
}

let seq = 0;
const ENGLISH_WORD = /^[A-Za-z][A-Za-z'-]*$/;
// 1 問。ことばと 英検の 形を はんぶんずつ（片方しか なければ そちら）。答えは ここに のこる（fishworld の answer と 同じ 形）。
export function preparePier(id, { rng = Math.random, now = Date.now() } = {}) {
  const p = PIER_BY_ID.get(id);
  if (!p) throw new PierError('no such pier');
  const words = WORDS[p.grade]; const forms = formPool(p.grade);
  if (!words.length && !forms.length) throw new PierError('no questions');
  const useForm = forms.length && (!words.length || rng() < 0.5);
  const base = { id: `ep${now.toString(36)}${(seq += 1).toString(36)}`, zone: p.zone, pier: p.id, grade: p.grade, attempt: 1, askedAt: now, kind: 'mc' };
  if (useForm) {
    const it = forms[Math.floor(rng() * forms.length)];
    const prompt = it.passage ? `${it.passage}\n\n${it.question}` : it.question;
    const fmt = buildMc({ q: '', a: it.answer, o: it.choices, prompt }, rng);
    return { ...base, eiken: true, qbank: it.qbank || '', word: ENGLISH_WORD.test(it.answer) ? it.answer : '', ja: '', fmt };
  }
  const w = words[Math.floor(rng() * words.length)];
  const others = [...new Set(w.o.filter((x) => x !== w.a))].sort(() => rng() - 0.5).slice(0, 3);
  const fmt = buildMc({ q: w.q, a: w.a, o: [w.a, ...others] }, rng);
  return { ...base, eiken: false, word: w.q, ja: w.a, fmt };
}

// 画面の 頭（つり島の ゾーンの かわり）。
export function pierInfo(id) {
  const p = PIER_BY_ID.get(id);
  return p ? { pier: p.id, zone: p.zone, key: p.id, stars: p.stars, en: p.en, ja: p.ja, grade: p.gradeJa, gradeEn: p.gradeEn, color: p.color } : null;
}
