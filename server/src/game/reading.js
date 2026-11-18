// よみもの島（多読）— 本の 棚・1 冊の 流れ（きく → よむ → おんどく → クイズ）の きまり。
//
// ・本は server/src/game/reading-bank/*.json（1 冊 1 ファイル。本文・絵の 場面・ことば・クイズ）。**クイズの 正解は ここだけ**：
//   ページには 本文と 場面と ことばだけ 送る（publicBook）。クイズは 1 問ずつ 選択肢だけ 送り、答えた あとに 正解を 返す。
// ・本の レベルは ロードマップの 12 段階（A・B・C・1〜9）を そのまま 使う（島だけの レベルは 持たない）。
// ・絵は「場面」（背景 1 つ＋登場人物・小物）で 書く。**サーバーが 1 ページずつ SVG の 絵に かく**（reading-art/render.js・/reading-art/<本>/<ページ>.svg。
//   体の ある 人物・おくゆきの ある 背景。画像生成の API は 使わない＝お金は かからない）。絵の かき方を 変えたら ART_VERSION を 上げる。
// 中身は U-Speak Lab の オリジナル（CC BY 4.0）。市販の 絵本・ほかの サービスの 本は 入れない。
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGE_IDS, DEFAULT_STAGES } from './roadmap.js';

export const BANK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'reading-bank');
export const BACKGROUNDS = ['meadow', 'forest', 'sea', 'beach', 'sky', 'night', 'room', 'kitchen', 'school', 'city', 'snow', 'farm', 'space', 'cave', 'garden', 'mountain', 'river', 'desert', 'park', 'shop'];
export const ART_VERSION = 4;          // 絵の 版（URL の ?v=。上げると ブラウザーが 読みなおす）
export const artPath = (id) => `/reading-art/${id}`;
export const MOVES = ['none', 'bob', 'float', 'sway', 'hop', 'spin', 'drift', 'pulse'];
export const STEPS = ['listen', 'read', 'aloud', 'quiz'];
export const QUIZ_PASS = 0.8;          // クイズ 8 割で ごうかく（Learning A-Z の 公開の めやすと 同じ）
export const ALOUD_GOOD = 0.95;        // 音読の 正確さの めやす（ひょうじ だけ）
export const BOOK_COINS = 20;          // 1 冊 ✓ で（1 回だけ）
export const BOOK_XP = 12;
export const DAILY_COIN_CAP = 80;      // 1 日 4 冊ぶんまで
// 段階ごとの 本の かたち（ページ数・1 ページの 語数・クイズの 選択肢の 数）。作る 人と 検査が 同じ 表を 見る。
export const SHAPE = {
  A: { pages: [6, 8], words: [2, 6], choices: 3 }, B: { pages: [6, 8], words: [3, 8], choices: 3 }, C: { pages: [6, 10], words: [4, 10], choices: 3 },
  1: { pages: [8, 10], words: [5, 12], choices: 3 }, 2: { pages: [8, 10], words: [6, 14], choices: 3 },
  3: { pages: [8, 12], words: [8, 18], choices: 4 }, 4: { pages: [8, 12], words: [10, 22], choices: 4 },
  5: { pages: [10, 12], words: [12, 28], choices: 4 }, 6: { pages: [10, 14], words: [16, 34], choices: 4 },
  7: { pages: [10, 14], words: [22, 42], choices: 4 }, 8: { pages: [10, 14], words: [28, 52], choices: 4 }, 9: { pages: [10, 14], words: [36, 66], choices: 4 },
};
const GRADE_OF = Object.fromEntries(DEFAULT_STAGES.map((s) => [s.id, s.grade]));
export const gradeOfStage = (id) => GRADE_OF[id] || 'jr';

export const wordsOf = (text) => String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
const isEmoji = (s) => typeof s === 'string' && s.length > 0 && s.length <= 16 && !/[A-Za-z<>&"]/.test(s) && (!/[0-9]/.test(s) || s.includes('\u20e3'));
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

function sceneProblem(sc, where) {
  if (!sc || typeof sc !== 'object') return `${where}: scene が ない`;
  if (!BACKGROUNDS.includes(sc.bg)) return `${where}: bg は ${BACKGROUNDS.join('/')} の どれか`;
  if (!Array.isArray(sc.items) || sc.items.length < 1 || sc.items.length > 7) return `${where}: items は 1〜7 こ`;
  for (const it of sc.items) {
    if (!isEmoji(it?.e)) return `${where}: e は 絵文字 1 つ`;
    if (!num(it.x, 0, 100) || !num(it.y, 0, 100)) return `${where}: x・y は 0〜100`;
    if (!num(it.s, 0.6, 6)) return `${where}: s は 0.6〜6`;
    if (it.a !== undefined && !MOVES.includes(it.a)) return `${where}: a は ${MOVES.join('/')}`;
  }
  return null;
}

// 1 冊が だめな 理由（なければ null）。
export function problemOf(book) {
  if (!book || typeof book !== 'object') return 'not an object';
  if (!/^rd-[A-Za-z0-9]+-[a-z0-9-]{1,24}$/.test(String(book.id || ''))) return 'id: rd-<段階>-<なまえ>';
  if (!STAGE_IDS.includes(String(book.stage))) return `stage は ${STAGE_IDS.join(' ')} の どれか`;
  const shape = SHAPE[book.stage];
  if (!book.title || !/^[\x20-\x7e’]{2,48}$/.test(book.title)) return 'title: 英語 2〜48 字';
  if (!book.titleJa || String(book.titleJa).length > 30) return 'titleJa: 日本語 30 字まで';
  const cover = sceneProblem(book.cover, 'cover'); if (cover) return cover;
  if (!Array.isArray(book.pages) || book.pages.length < shape.pages[0] || book.pages.length > shape.pages[1]) return `pages は ${shape.pages[0]}〜${shape.pages[1]} ページ（段階 ${book.stage}）`;
  for (const [i, p] of book.pages.entries()) {
    const n = wordsOf(p?.text).length;
    if (!p?.text || /[^\x20-\x7e’‘“”—…]/.test(p.text)) return `p${i + 1}: text は 英語だけ`;
    if (n < shape.words[0] || n > shape.words[1]) return `p${i + 1}: ${n} 語（段階 ${book.stage} は ${shape.words[0]}〜${shape.words[1]} 語）`;
    if (!p.ja || String(p.ja).length > 160) return `p${i + 1}: ja（日本語の いみ）が ない・長すぎ`;
    const sp = sceneProblem(p.scene, `p${i + 1}`); if (sp) return sp;
  }
  if (!Array.isArray(book.glossary) || book.glossary.length < 4 || book.glossary.length > 12) return 'glossary は 4〜12 語';
  const all = new Set(book.pages.flatMap((p) => wordsOf(p.text)));
  for (const g of book.glossary) {
    if (!g?.en || !g?.ja) return 'glossary: en と ja';
    if (!wordsOf(g.en).every((w) => all.has(w))) return `glossary: "${g.en}" が 本文に ない`;
  }
  if (!Array.isArray(book.quiz) || book.quiz.length !== 5) return 'quiz は 5 問';
  for (const [i, q] of book.quiz.entries()) {
    if (!q?.q || !Array.isArray(q.choices) || q.choices.length !== shape.choices) return `q${i + 1}: 選択肢は ${shape.choices} つ`;
    if (!q.choices.includes(q.answer)) return `q${i + 1}: answer が 選択肢に ない`;
    if (new Set(q.choices.map((c) => String(c).toLowerCase())).size !== q.choices.length) return `q${i + 1}: 同じ 選択肢`;
    if (!q.ja) return `q${i + 1}: ja（しつもんの 日本語）が ない`;
  }
  return null;
}

export function loadBooks(dir = BANK_DIR) {
  const books = new Map();
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); } catch { names = []; }
  for (const n of names) {
    let book; try { book = JSON.parse(readFileSync(path.join(dir, n), 'utf8')); } catch (err) { console.warn(`[reading] reading-bank/${n} skipped: ${err.message}`); continue; }
    const why = problemOf(book);
    // だめな 本は とばす（1 冊の まちがいで サーバーを 止めない）。検査は scripts/check-reading-bank.mjs と テスト。
    if (why || books.has(book.id)) { console.warn(`[reading] reading-bank/${n} skipped: ${why || 'duplicate id'}`); continue; }
    books.set(book.id, { ...book, stage: String(book.stage), words: book.pages.reduce((s, p) => s + wordsOf(p.text).length, 0) });
  }
  return books;
}
let BOOKS = loadBooks();
export const allBooks = () => BOOKS;
export function reloadBooks(dir) { BOOKS = loadBooks(dir); return BOOKS; }
export const bookById = (id) => BOOKS.get(String(id)) || null;

// ---- 1 人ぶんの 記録（保存は reading/store.js）----
export function blankProgress() { return { books: {}, day: '', dayCoins: 0 }; }
export function sanitizeProgress(raw) {
  const p = blankProgress();
  if (!raw || typeof raw !== 'object') return p;
  for (const [id, b] of Object.entries(raw.books || {})) {
    if (!b || typeof b !== 'object') continue;
    p.books[id] = {
      listen: !!b.listen, read: !!b.read,
      aloud: b.aloud && typeof b.aloud === 'object' ? { acc: Math.max(0, Math.min(1, Number(b.aloud.acc) || 0)), wpm: Math.max(0, Math.min(400, Math.round(Number(b.aloud.wpm) || 0))) } : null,
      quiz: Number.isFinite(Number(b.quiz)) ? Math.max(0, Math.min(5, Math.round(Number(b.quiz)))) : null,
      done: !!b.done, paid: !!b.paid, at: Number(b.at) || 0, times: Math.max(0, Math.round(Number(b.times) || 0)),
    };
  }
  p.day = String(raw.day || ''); p.dayCoins = Math.max(0, Math.round(Number(raw.dayCoins) || 0));
  return p;
}
const entry = (p, id) => (p.books[id] ||= { listen: false, read: false, aloud: null, quiz: null, done: false, paid: false, at: 0, times: 0 });
export const starsOf = (b) => (b ? (b.listen ? 1 : 0) + (b.read ? 1 : 0) + (b.aloud ? 1 : 0) + (b.quiz !== null && b.quiz / 5 >= QUIZ_PASS ? 1 : 0) : 0);
// ✓ ＝ きく・よむ・クイズ 8 割。音読は ★ だけ（マイクの ない 端末でも ✓ に なれる）。
const isDone = (b) => !!(b.listen && b.read && b.quiz !== null && b.quiz / 5 >= QUIZ_PASS);

// 棚：いまの 段階の 本＋ 1 つ 下（かんたん）＋ 1 つ 上（ちょうせん・かぎなし で 見える）。
export function shelfFor(stageId, progress) {
  const i = Math.max(0, STAGE_IDS.indexOf(String(stageId)));
  const rows = [];
  const push = (idx, band) => {
    const id = STAGE_IDS[idx]; if (id === undefined) return;
    const st = DEFAULT_STAGES[idx];
    const books = [...BOOKS.values()].filter((b) => b.stage === id).map((b) => {
      const e = progress.books[b.id];
      return { id: b.id, title: b.title, titleJa: b.titleJa, words: b.words, pages: b.pages.length, cover: b.cover, art: artPath(b.id), artV: ART_VERSION, stars: starsOf(e), done: !!e?.done, quiz: e?.quiz ?? null };
    });
    if (books.length) rows.push({ stage: id, band, en: st.en, ja: st.ja, books });
  };
  push(i, 'now'); push(i - 1, 'easy'); push(i + 1, 'next');
  const mine = Object.entries(progress.books).filter(([, b]) => b.done);
  return {
    stage: STAGE_IDS[i], rows,
    totals: { done: mine.length, words: mine.reduce((s, [id]) => s + (BOOKS.get(id)?.words || 0), 0), stars: Object.values(progress.books).reduce((s, b) => s + starsOf(b), 0),
      stageDone: [...BOOKS.values()].filter((b) => b.stage === STAGE_IDS[i] && progress.books[b.id]?.done).length, stageAll: [...BOOKS.values()].filter((b) => b.stage === STAGE_IDS[i]).length },
  };
}

// ページに 送る 本（クイズは 入れない）。
export function publicBook(book, progress) {
  const e = progress.books[book.id] || null;
  return { id: book.id, stage: book.stage, title: book.title, titleJa: book.titleJa, words: book.words, cover: book.cover, art: artPath(book.id), artV: ART_VERSION,
    pages: book.pages.map((p) => ({ text: p.text, ja: p.ja, scene: p.scene })), glossary: book.glossary.map((g) => ({ en: g.en, ja: g.ja })),
    steps: { listen: !!e?.listen, read: !!e?.read, aloud: e?.aloud || null, quiz: e?.quiz ?? null }, done: !!e?.done, stars: starsOf(e), quizCount: book.quiz.length };
}

export function markStep(progress, book, step, now = Date.now()) {
  if (step !== 'listen' && step !== 'read') return null;
  const e = entry(progress, book.id); e[step] = true; e.at = now;
  return e;
}

// 音読：聞きとった 文字と 本文を くらべる（順番どおりに 見つかった 語の わりあい）。判定は ここ（ページは 文字を 送るだけ）。
export function judgeAloud(book, heardPages, seconds) {
  let total = 0; let hit = 0; const perPage = [];
  for (const [i, p] of book.pages.entries()) {
    const want = wordsOf(p.text); const got = wordsOf(Array.isArray(heardPages) ? heardPages[i] : '');
    const ok = want.map(() => false); let from = 0;
    for (const [k, w] of want.entries()) {
      const at = got.indexOf(w, from);
      if (at >= 0 && at - from <= 4) { ok[k] = true; from = at + 1; }
    }
    total += want.length; hit += ok.filter(Boolean).length; perPage.push(ok);
  }
  const acc = total ? hit / total : 0;
  const sec = Math.max(1, Math.min(3600, Number(seconds) || 0));
  return { acc: Math.round(acc * 1000) / 1000, wpm: Math.round((hit / sec) * 60), hit, total, perPage };
}
export function recordAloud(progress, book, result, now = Date.now()) {
  const e = entry(progress, book.id);
  // いちばん よかった 回を のこす（やりなおして 下がっても へらない）。
  if (!e.aloud || result.acc >= e.aloud.acc) e.aloud = { acc: result.acc, wpm: result.wpm };
  e.at = now;
  return e;
}

// クイズ：1 冊 5 問。ならびと 選択肢の 順は 毎回 まぜる。
export function startQuiz(book, rng = Math.random) {
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  return { book: book.id, at: 0, right: 0, items: book.quiz.map((q) => ({ q: q.q, ja: q.ja, choices: shuffle(q.choices), answer: q.answer })), log: [] };
}
export function quizQuestion(session) {
  const it = session.items[session.at];
  return it ? { n: session.at + 1, of: session.items.length, q: it.q, ja: it.ja, choices: it.choices } : null;
}
export function answerQuiz(session, choice) {
  const it = session.items[session.at];
  if (!it) return null;
  const correct = String(choice) === it.answer;
  if (correct) session.right += 1;
  session.log.push({ q: it.q, correct, answer: it.answer });
  session.at += 1;
  return { correct, answer: it.answer, n: session.at, of: session.items.length, over: session.at >= session.items.length, right: session.right };
}
// クイズが おわった とき：点を のこし、✓ に なったら（はじめての ときだけ）コイン。
export function finishQuiz(progress, book, session, { day = '', now = Date.now() } = {}) {
  const e = entry(progress, book.id);
  const wasDone = e.done;
  if (e.quiz === null || session.right > e.quiz) e.quiz = session.right;
  e.at = now; e.times += 1;
  e.done = isDone(e);
  let coins = 0; let capped = false;
  if (e.done && !e.paid) {
    if (progress.day !== day) { progress.day = day; progress.dayCoins = 0; }
    if (progress.dayCoins + BOOK_COINS <= DAILY_COIN_CAP) { coins = BOOK_COINS; progress.dayCoins += BOOK_COINS; e.paid = true; } else capped = true;
  }
  return { score: session.right, of: session.items.length, passed: session.right / session.items.length >= QUIZ_PASS, done: e.done, firstDone: e.done && !wasDone, coins, capped, stars: starsOf(e), needs: { listen: !e.listen, read: !e.read } };
}
// きく・よむ を あとから すませて ✓ に なった とき（クイズは もう 受かって いる）。
export function settle(progress, book, { day = '' } = {}) {
  const e = entry(progress, book.id);
  const wasDone = e.done; e.done = isDone(e);
  let coins = 0;
  if (e.done && !e.paid) {
    if (progress.day !== day) { progress.day = day; progress.dayCoins = 0; }
    if (progress.dayCoins + BOOK_COINS <= DAILY_COIN_CAP) { coins = BOOK_COINS; progress.dayCoins += BOOK_COINS; e.paid = true; }
  }
  return { done: e.done, firstDone: e.done && !wasDone, coins, stars: starsOf(e) };
}
