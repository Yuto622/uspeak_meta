// 「ABC と おと」（幼児モードの カード）の きまり — もじの なまえ・かたち・おと → おとを つなげて よむ → つづる。
//
// ・中身（もじ・ことば・絵文字）は abc-data.json。**正解は ここだけ**：ページには 選択肢だけ 送り、答えた あとに 正解を 返す。
// ・2 つの 段階。ちいさい 子（kinder）は もじ 1 つずつ：① 見て きく ② みじかい うた ③ きいて 3 つの もじから えらぶ ④ おなじ おとで はじまる 絵を えらぶ。
//   小学生（elem）は ルール 1 つずつ：① 3 もじを つなげて よむ（c-a-t）② 2 もじの おと（sh・ch・th…）③ ながい ぼいん（a_e…）④ もじブロックを ならべて つづる。
// ・どこから はじめるかは 自動：ロードマップの 段階（学年の かわり）と、はじめの 数問（しって いる ところは とばす）。
// ・1 つの もじ／ルールは 正答率 8 割で つぎへ。まちがえた もじ・おとは「にがて」に ためて、まとめて ふくしゅう できる。
// ・声は 合成の 声なので、もじの「おと」だけを 単独では 言わせない（不正確）。かならず ことばに つなげる（"s, s, sun"）。
// 部屋（ClassRoom.onAbc）が ここを よび、記録は いつもの 道（appendLearning・roblox_events）に 書く。コインは 出さない。
import { letterSound, soundsOf } from '../../../client/dist/phonics.js';
import { readFileSync } from 'node:fs';

export const PASS = 0.8;
export const CASES = ['both', 'upper', 'lower'];
export const ACCENTS = ['us', 'uk'];
export const DEFAULT_SETTINGS = Object.freeze({ caseFirst: 'both', accent: 'us', order: null });
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');
const VOWELS = ['a', 'e', 'i', 'o', 'u'];
// はじめの おとが にて いて、きいて えらぶ ときに まぎらわしい もじ（まちがいの 選択肢に しない）。
const SIMILAR = { c: ['k', 'q', 's', 'x'], k: ['c', 'q', 'x'], q: ['k', 'c'], s: ['c', 'z', 'x'], z: ['s'], g: ['j'], j: ['g'], x: ['s', 'k', 'c'], f: ['v'], v: ['f', 'b'], b: ['v', 'p', 'd'], p: ['b'], d: ['b', 't'], t: ['d'], m: ['n'], n: ['m'], l: ['r'], r: ['l'], i: ['e'], e: ['i'], o: ['u'], u: ['o', 'a'], a: ['u'], w: ['y'], y: ['w'], h: [] };

// ---- 中身 ------------------------------------------------------------------------------------
const okWord = (x) => x && typeof x.w === 'string' && /^[a-z]{2,12}$/.test(x.w);
function cleanData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const letters = {};
  for (const l of ALPHA) {
    const src = raw.letters?.[l]; const words = (Array.isArray(src?.words) ? src.words : []).filter(okWord).map((x) => ({ w: x.w, e: String(x.e || ''), ...(x.end || src.end ? { end: true } : {}) })); // end＝その もじで「おわる」ことば（x）
    if (!words.length) return null; // 26 もじ ぜんぶに ことばが いる
    letters[l] = { say: String(src.say || ''), sound: String(src.sound || ''), soundJa: String(src.soundJa || ''), words };
  }
  const order = Array.isArray(raw.order) && raw.order.length === 26 && new Set(raw.order).size === 26 && raw.order.every((l) => letters[l]) ? raw.order.map(String) : [...ALPHA];
  const withParts = (list) => (Array.isArray(list) ? list : []).filter((x) => okWord(x) && Array.isArray(x.parts) && x.parts.length >= 2 && x.parts.join('') === x.w).map((x) => ({ w: x.w, e: String(x.e || ''), parts: x.parts.map(String) }));
  const group = (obj) => Object.fromEntries(Object.entries(obj && typeof obj === 'object' ? obj : {}).map(([k, v]) => [String(k).slice(0, 6), withParts(v)]).filter(([k, v]) => /^[a-z_]{2,6}$/.test(k) && v.length >= 3));
  return { order, letters, cvc: withParts(raw.cvc).filter((x) => x.parts.length === 3), digraphs: group(raw.digraphs), magicE: group(raw.magicE) };
}
let DATA; // undefined＝まだ 読んで いない・null＝ない／こわれて いる
export function loadData() {
  try { DATA = cleanData(JSON.parse(readFileSync(new URL('./abc-data.json', import.meta.url), 'utf8'))); } catch { DATA = null; }
  return DATA;
}
export const setData = (raw) => { DATA = cleanData(raw); UNITS = null; return DATA; }; // テスト用
export const data = () => (DATA === undefined ? loadData() : DATA);
export const ready = () => !!data();

// ---- ことばを しぼって 使う（Roblox 版）--------------------------------------------------------
// Roblox には 上げない 絵・まだ 審査を 通って いない 絵の ことばを、問題づくりから 外す。Web は いつも ぜんぶ 使う。
// fn の あいだだけ 中身を さしかえる（同期の 処理だけ。await を はさまない こと）。もじ・ルールの ならび（id）は かえない：
// 外すと 足りなく なる グループ（もじ＝1 つ・ルール＝3 つ 未満）は、その グループだけ もとの ことばを のこす。
const filteredCache = new WeakMap(); // exclude(Set) → { base, sig, data, units }
export function wordsLeft(exclude) {
  const base = data(); if (!base) return null;
  const ok = (x) => !exclude.has(x.w);
  const keep = (list, min) => { const f = list.filter(ok); return f.length >= min ? f : list; };
  const letters = Object.fromEntries(Object.entries(base.letters).map(([l, v]) => [l, { ...v, words: keep(v.words, 1) }]));
  const cvc = VOWELS.flatMap((v) => keep(base.cvc.filter((x) => x.parts[1] === v), 3)).concat(base.cvc.filter((x) => !VOWELS.includes(x.parts[1])).filter(ok));
  const group = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, keep(v, 3)]));
  return { order: base.order, letters, cvc, digraphs: group(base.digraphs), magicE: group(base.magicE) };
}
export function withWords(exclude, fn) {
  if (!(exclude instanceof Set) || !exclude.size || !ready()) return fn();
  const base = DATA; const sig = [...exclude].sort().join(',');
  let f = filteredCache.get(exclude);
  if (!f || f.base !== base || f.sig !== sig) { f = { base, sig, data: wordsLeft(exclude), units: null }; filteredCache.set(exclude, f); }
  const keepUnits = UNITS;
  DATA = f.data; UNITS = f.units;
  try { return fn(); } finally { f.units = UNITS; DATA = base; UNITS = keepUnits; }
}
// ぜんぶの ことば（かさなりなし）。
export function allWords() {
  const d = data(); if (!d) return [];
  return [...new Set([...Object.values(d.letters).flatMap((l) => l.words), ...d.cvc, ...Object.values(d.digraphs).flat(), ...Object.values(d.magicE).flat()].map((x) => x.w))];
}

// 小学生の 段階の ならび（ルール）。さいごの「つづる」は ルールの 数には 入れない。
let UNITS = null;
export function units() {
  if (UNITS) return UNITS;
  const d = data(); if (!d) return [];
  const out = [];
  for (const v of VOWELS) { const words = d.cvc.filter((x) => x.parts[1] === v); if (words.length >= 3) out.push({ id: `cvc-${v}`, type: 'cvc', label: v, words }); }
  for (const [k, words] of Object.entries(d.digraphs)) out.push({ id: k, type: 'digraph', label: k, words });
  for (const [k, words] of Object.entries(d.magicE)) out.push({ id: k, type: 'magic', label: k, words });
  const spellWords = [...d.cvc, ...Object.values(d.digraphs).flat()];
  if (spellWords.length >= 3) out.push({ id: 'spell', type: 'spell', label: 'abc', words: spellWords });
  UNITS = out;
  return out;
}
export const ruleUnits = () => units().filter((u) => u.type !== 'spell');

// ---- 設定（運営だけが かえる）----------------------------------------------------------------
export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const order = Array.isArray(s.order) ? s.order.map((l) => String(l).toLowerCase()) : null;
  return {
    caseFirst: CASES.includes(s.caseFirst) ? s.caseFirst : 'both',
    accent: ACCENTS.includes(s.accent) ? s.accent : 'us',
    order: order && order.length === 26 && new Set(order).size === 26 && order.every((l) => ALPHA.includes(l)) ? order : null,
  };
}
export const orderOf = (settings) => settings?.order || data()?.order || [...ALPHA];

// ---- 子どもの 記録 ----------------------------------------------------------------------------
export const blankProgress = () => ({ track: '', placed: false, letters: {}, rules: {}, weak: {}, finished: false, rounds: 0, at: 0 });
export function sanitizeProgress(raw) {
  const p = blankProgress(); const r = raw && typeof raw === 'object' ? raw : {};
  p.track = r.track === 'kinder' || r.track === 'elem' ? r.track : '';
  p.placed = r.placed === true; p.finished = r.finished === true;
  p.rounds = Math.max(0, Math.floor(Number(r.rounds) || 0)); p.at = Number(r.at) || 0;
  for (const l of ALPHA) if (r.letters?.[l]?.done === true) p.letters[l] = { done: true, ...(r.letters[l].placed ? { placed: true } : {}) };
  for (const [k, v] of Object.entries(r.rules || {})) if (/^[a-z_-]{2,8}$/.test(k) && v?.done === true) p.rules[k] = { done: true, ...(v.placed ? { placed: true } : {}) };
  for (const [k, v] of Object.entries(r.weak || {}).slice(0, 80)) if (/^[LR]:[a-z_-]{1,8}$/.test(k) && Number(v) > 0) p.weak[k] = Math.min(5, Math.floor(Number(v)));
  return p;
}
export const lettersDone = (p) => ALPHA.filter((l) => p.letters[l]?.done).length;
export const rulesDone = (p) => ruleUnits().filter((u) => p.rules[u.id]?.done).length;
const weakKeys = (p) => Object.entries(p.weak).filter(([k]) => (k[0] === 'L' ? ALPHA.includes(k.slice(2)) : units().some((u) => u.id === k.slice(2)))).sort((a, b) => b[1] - a[1]).map(([k]) => k);

// つぎに やる こと。
export function nextOf(p, settings) {
  if (!ready()) return { type: 'none' };
  if (!p.placed) return { type: 'place' };
  if (p.track !== 'elem') {
    const l = orderOf(settings).find((x) => !p.letters[x]?.done);
    if (l) return { type: 'letter', letter: l };
  }
  const u = units().find((x) => !p.rules[x.id]?.done);
  return u ? { type: 'unit', unit: u.id, kind: u.type, label: u.label } : { type: 'done' };
}

// ページに 送る ようす（正解に かかわる ものは 入れない）。
export function publicState(p, settings) {
  const s = sanitizeSettings(settings); const order = orderOf(s); const next = nextOf(p, s);
  const track = p.placed ? (next.type === 'letter' ? 'kinder' : 'elem') : '';
  return {
    ready: ready(), placed: p.placed, track, caseFirst: s.caseFirst, accent: s.accent,
    letters: order.map((l) => ({ l, done: !!p.letters[l]?.done })), lettersDone: lettersDone(p), lettersTotal: 26,
    rules: ruleUnits().map((u) => ({ id: u.id, label: u.label, type: u.type, done: !!p.rules[u.id]?.done })), rulesDone: rulesDone(p), rulesTotal: ruleUnits().length,
    next, weak: weakKeys(p).length, finished: next.type === 'done', rounds: p.rounds,
  };
}

// ---- 問題を 作る ------------------------------------------------------------------------------
const shuffled = (a, rng) => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = (a, rng) => a[Math.floor(rng() * a.length)];
// n こ えらぶ（たりなければ くりかえす）。
function take(list, n, rng) { const out = []; let bag = []; while (out.length < n && list.length) { if (!bag.length) bag = shuffled(list, rng); out.push(bag.pop()); } return out; }
const wordOf = (l, rng, not = '') => { const ws = data().letters[l].words; const pool = ws.filter((x) => x.w !== not); return pick(pool.length ? pool : ws, rng); };
// まぎらわしく ない もじを 2 つ。
function otherLetters(l, rng, n = 2) {
  const bad = new Set([l, ...(SIMILAR[l] || [])]);
  return take(ALPHA.filter((x) => !bad.has(x)), n, rng);
}

function qShow(l) { const w = data().letters[l].words[0]; return { kind: 'show', teach: true, key: `L:${l}`, pub: { letter: l, word: w.w, end: !!w.end, sound: letterSound(l) } }; }
function qChant(l) {
  const ws = data().letters[l].words.slice(0, 3);
  // うた：1 もじずつ「もじの なまえ、もじの なまえ、ことば」。おとは ことばで きかせる（合成の 声は おとだけを 正しく 言えない）。
  return { kind: 'chant', teach: true, key: `L:${l}`, pub: { letter: l, sound: letterSound(l), lines: ws.map((x) => ({ text: `${l.toUpperCase()}, ${l}, ${x.w}`, word: x.w, end: !!x.end, name: l.toUpperCase(), sound: letterSound(l) })) } };
}
function qName(l, rng) { return { kind: 'name', key: `L:${l}`, format: 'listen', answer: l, pub: { say: l.toUpperCase(), choices: shuffled([l, ...otherLetters(l, rng)], rng) } }; }
function qSound(l, rng, not = '') {
  const w = wordOf(l, rng, not);
  return { kind: 'sound', key: `L:${l}`, format: 'listen', answer: l, used: w.w, pub: { say: w.w, end: !!w.end, choices: shuffled([l, ...otherLetters(l, rng)], rng) } };
}
function qPicture(l, rng, not = '') {
  const w = wordOf(l, rng, not);
  // まちがいの 絵：その もじで はじまらない・おわらない ことば。x の ことば（box・fox・six＝おわりの おと）しか ない ときも、
  // b の 問題に box を 出さない（「b で はじまる 絵」なのに まちがいに されて いた。2026-11）。
  const clear = (x) => x.w[0] !== l && !x.w.endsWith(l);
  const others = otherLetters(l, rng).map((o) => {
    const own = data().letters[o].words;
    const ws = own.filter((x) => !x.end && clear(x));
    const loose = ws.length ? ws : own.filter(clear);
    const pool = loose.length ? loose : Object.values(data().letters).flatMap((v) => v.words).filter((x) => !x.end && clear(x) && x.w !== w.w);
    return pick(pool, rng).w;
  });
  return { kind: 'picture', key: `L:${l}`, format: 'mc', answer: w.w, used: w.w, pub: { letter: l, end: !!w.end, choices: shuffled([w.w, ...others], rng) } };
}
function qBlend(unit, w, rng) {
  const pool = (unit.type === 'cvc' ? data().cvc : unit.words).filter((x) => x.w !== w.w);
  const others = take(pool.length >= 2 ? pool : data().cvc.filter((x) => x.w !== w.w), 2, rng).map((x) => x.w);
  return { kind: 'blend', key: `R:${unit.id}`, format: 'mc', answer: w.w, word: w.w, pub: { parts: w.parts, sounds: soundsOf(w.w, w.parts), choices: shuffled([...new Set([w.w, ...others])], rng) } };
}
function qRule(unit) { const w = unit.words[0]; return { kind: 'rule', teach: true, key: `R:${unit.id}`, pub: { rule: unit.label, type: unit.type, word: w.w, parts: w.parts, sounds: soundsOf(w.w, w.parts) } }; }
function qRuleChant(unit) { return { kind: 'chant', teach: true, key: `R:${unit.id}`, pub: { rule: unit.label, type: unit.type, lines: unit.words.slice(0, 3).map((x) => ({ text: x.w, word: x.w, sounds: soundsOf(x.w, x.parts), parts: x.parts })) } }; }
function qPair(unit, w, rng) {
  const labels = Object.keys(data().digraphs).filter((k) => k !== unit.id && !w.w.includes(k));
  return { kind: 'pair', key: `R:${unit.id}`, format: 'listen', answer: unit.id, word: w.w, pub: { say: w.w, word: w.w, choices: shuffled([unit.id, ...take(labels, 2, rng)], rng) } };
}
function qWord(unit, w, rng) {
  // きいた ことばを 3 つの つづりから えらぶ：ただしい もの・さいごの e が ない もの・ぼいんが ちがう もの。
  const noE = w.w.replace(/e$/, ''); const v = unit.label[0]; const other = pick(VOWELS.filter((x) => x !== v), rng);
  const swapped = w.w.replace(new RegExp(`${v}(?=[a-z]e$)`), other);
  const choices = [...new Set([w.w, noE, swapped === w.w ? `${noE}a` : swapped])];
  return { kind: 'word', key: `R:${unit.id}`, format: 'listen', answer: w.w, word: w.w, pub: { say: w.w, word: w.w, choices: shuffled(choices, rng) } };
}
function qSpell(unit, w, rng) {
  const ss = soundsOf(w.w, w.parts);
  let order = w.parts.map((t, i) => ({ id: `b${i}`, t, s: ss[i] }));
  for (let i = 0; i < 6; i += 1) { order = shuffled(order, rng); if (order.map((b) => b.t).join('|') !== w.parts.join('|')) break; }
  return { kind: 'spell', key: `R:${unit.id}`, format: 'spell', answer: w.parts.join(''), word: w.w, parts: w.parts, blocks: order, pub: { say: w.w, word: w.w, blocks: order.map((b) => ({ id: b.id, t: b.t, s: b.s })) } };
}
// にがての 1 問（もじ → きいて えらぶ か 絵、ルール → その ルールの 問題）。
function qFor(key, rng) {
  const id = key.slice(2);
  if (key[0] === 'L') return rng() < 0.5 ? qSound(id, rng) : qPicture(id, rng);
  const u = units().find((x) => x.id === id); if (!u) return null;
  const w = pick(u.words, rng);
  if (u.type === 'spell') return qSpell(u, w, rng);
  if (u.type === 'digraph') return rng() < 0.5 ? qPair(u, w, rng) : qBlend(u, w, rng);
  if (u.type === 'magic') return rng() < 0.5 ? qWord(u, w, rng) : qBlend(u, w, rng);
  return qBlend(u, w, rng);
}

// はじめの 数問（どこから はじめるか）。hi＝ロードマップの 段階が 高い（もじは しって いる と みて、つなげて よむ 問題から）。
const quarters = (order) => [order.slice(0, 6), order.slice(6, 13), order.slice(13, 19), order.slice(19)];
function placeLetters(order, rng) { return quarters(order).map((q, i) => { const l = pick(q, rng); return { ...(i % 2 ? qPicture(l, rng) : qSound(l, rng)), phase: 'L', quarter: i }; }); }
function placeWords(rng) { const u = units().find((x) => x.type === 'cvc'); if (!u) return []; return take(data().cvc, 3, rng).map((w) => ({ ...qBlend({ ...u, id: `cvc-${w.parts[1]}` }, w, rng), phase: 'W' })); }

// 1 回ぶん（session）を はじめる。opts: { review, hi, rng }。できなければ null。
export function startRound(progress, settings, { review = false, hi = false, rng = Math.random } = {}) {
  if (!ready()) return null;
  const s = sanitizeSettings(settings); const order = orderOf(s);
  const mk = (mode, items, extra = {}) => ({ mode, items, at: 0, right: 0, judged: 0, log: [], order, hi, ...extra });
  if (review) {
    const keys = weakKeys(progress).slice(0, 8);
    if (!keys.length) return null;
    return mk('review', keys.map((k) => qFor(k, rng)).filter(Boolean));
  }
  const next = nextOf(progress, s);
  if (next.type === 'place') { const words = hi ? placeWords(rng) : []; return mk('place', words.length ? words : placeLetters(order, rng)); }
  if (next.type === 'letter') {
    const l = next.letter; const s1 = qSound(l, rng); const p1 = qPicture(l, rng, s1.used);
    return mk('letter', [qShow(l), qChant(l), qName(l, rng), s1, p1, qSound(l, rng, s1.used), qPicture(l, rng, p1.used)], { letter: l });
  }
  if (next.type === 'unit') {
    const u = units().find((x) => x.id === next.unit); const ws = take(u.words, 5, rng);
    let items;
    if (u.type === 'cvc') items = [qRule(u), ...ws.map((w) => qBlend(u, w, rng))];
    else if (u.type === 'digraph') items = [qRule(u), qRuleChant(u), ...ws.slice(0, 3).map((w) => qPair(u, w, rng)), ...ws.slice(3).map((w) => qBlend(u, w, rng))];
    else if (u.type === 'magic') items = [qRule(u), qRuleChant(u), ...ws.slice(0, 3).map((w) => qWord(u, w, rng)), ...ws.slice(3).map((w) => qBlend(u, w, rng))];
    else items = ws.map((w) => qSpell(u, w, rng));
    return mk('unit', items, { unit: u.id });
  }
  return null;
}

// いまの 1 問（ページに 送る 形）。
export function question(session) {
  const it = session?.items[session.at];
  if (!it) return null;
  const judgedAll = session.items.filter((x) => !x.teach).length;
  return { n: session.at + 1, of: session.items.length, judged: judgedAll, mode: session.mode, kind: it.kind, teach: !!it.teach, ...it.pub };
}

// こたえる。msg: { choice } ／ { order:[ブロックの id] } ／ おしえる 画面は { seen:true }。返す：{ teach, correct, answer, over, item }。
export function answer(session, msg, { rng = Math.random } = {}) {
  const it = session?.items[session.at];
  if (!it) return null;
  let correct = null; let given = '';
  if (!it.teach) {
    if (it.kind === 'spell') {
      const ids = Array.isArray(msg?.order) ? msg.order.map(String).slice(0, 12) : [];
      const byId = new Map(it.blocks.map((b) => [b.id, b.t]));
      given = new Set(ids).size === ids.length ? ids.map((id) => byId.get(id) ?? '?').join('') : '';
      correct = ids.length === it.blocks.length && given === it.answer;
    } else { given = String(msg?.choice ?? '').slice(0, 20); correct = given === it.answer; }
    session.judged += 1; if (correct) session.right += 1;
    session.log.push({ key: it.key, kind: it.kind, correct, phase: it.phase, quarter: it.quarter });
  }
  session.at += 1;
  // はじめの 数問：もじが ぜんぶ できたら つなげて よむ 問題へ、つなげて よめなければ もじへ（まだ して いない ほうを 足す）。
  if (session.mode === 'place' && session.at >= session.items.length) {
    const done = new Set(session.log.map((x) => x.phase));
    const L = session.log.filter((x) => x.phase === 'L'); const W = session.log.filter((x) => x.phase === 'W');
    if (done.has('L') && !done.has('W') && L.every((x) => x.correct)) session.items.push(...placeWords(rng));
    else if (done.has('W') && !done.has('L') && W.filter((x) => x.correct).length <= 1) session.items.push(...placeLetters(session.order, rng));
  }
  return { teach: !!it.teach, correct, given, answer: it.teach ? undefined : it.answer, parts: it.kind === 'spell' ? it.parts : undefined, over: session.at >= session.items.length, item: it };
}

// 1 回ぶんが おわった：記録を すすめる。返す：{ right, of, passed, mode, advanced, placed }。
export function finish(progress, session, { now = Date.now() } = {}) {
  const of = session.judged; const right = session.right; const passed = of > 0 && right / of >= PASS;
  const out = { mode: session.mode, right, of, passed, advanced: null };
  progress.rounds += 1; progress.at = now;
  // にがて：まちがえた もじ・ルールを ためる。ふくしゅうで できたら へらす。
  for (const x of session.log) {
    if (!x.correct) progress.weak[x.key] = Math.min(5, (progress.weak[x.key] || 0) + 1);
    else if (session.mode === 'review' && progress.weak[x.key]) { progress.weak[x.key] -= 1; if (progress.weak[x.key] <= 0) delete progress.weak[x.key]; }
  }
  if (session.mode === 'place') {
    const L = session.log.filter((x) => x.phase === 'L'); const W = session.log.filter((x) => x.phase === 'W');
    let known = 0; // はじめから つづけて できた 4 分の 1 の 数
    if (L.length) { const byQ = [0, 1, 2, 3].map((q) => L.find((x) => x.quarter === q)?.correct === true); while (known < 4 && byQ[known]) known += 1; } else known = 4;
    const qs = quarters(session.order);
    for (let i = 0; i < known; i += 1) for (const l of qs[i]) progress.letters[l] = { done: true, placed: true };
    const all = known === 4;
    if (all && W.length && W.every((x) => x.correct)) for (const u of units().filter((x) => x.type === 'cvc')) progress.rules[u.id] = { done: true, placed: true };
    progress.placed = true; progress.track = all ? 'elem' : 'kinder';
    out.placed = { track: progress.track, letters: lettersDone(progress), rules: rulesDone(progress) };
    out.passed = true;
  } else if (session.mode === 'letter' && passed) {
    progress.letters[session.letter] = { done: true }; delete progress.weak[`L:${session.letter}`];
    out.advanced = { letter: session.letter };
    if (lettersDone(progress) === 26) { progress.track = 'elem'; out.advanced.stage = 'elem'; }
  } else if (session.mode === 'unit' && passed) {
    progress.rules[session.unit] = { done: true }; delete progress.weak[`R:${session.unit}`];
    out.advanced = { unit: session.unit };
    if (units().every((u) => progress.rules[u.id]?.done)) { progress.finished = true; out.advanced.finished = true; }
  }
  return out;
}

// レポートに のせる 数（おぼえた もじ ○/26・よめる ルール ○こ）。
export const reportNumbers = (p) => ({ letters: lettersDone(p), lettersTotal: 26, rules: rulesDone(p), rulesTotal: ruleUnits().length });
