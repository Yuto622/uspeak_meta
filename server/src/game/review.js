// 苦手単語の自動復習（Roblox 版 USpeakReviewServer と 同じ ルール）。
//
// **箱は 1 つ。** 苦手の 状態は roblox_events の quiz（Roblox と Web の 両方。Web は ClassRoom.robloxEvent が
// source=web で 書く）を 古い 順に たたんで 毎回 計算する。だから Roblox で まちがえた 単語も、Web で まちがえた
// 単語も 同じ 箱に 入り、べつの 表を 同期する 必要が ない（記録は 消さないので、計算し直せば いつでも 同じ 箱）。
//
// ルール（参考：Roblox 版）
//   対象は 英単語の 答えだけ（^[A-Za-z][A-Za-z -']*$、30 文字まで）。小文字に そろえる。
//   まちがえた → stage 0、1 日後に 復習。
//   復習の 時期を 過ぎてから 正解、または 復習（level=Review）で 正解 → stage +1。
//     stage 1 は 3 日後、stage 2 は 7 日後、stage 3 で 卒業（箱から 消える）。
//   まちがえた 直後の やり直し（時期前）で 正解しても 進まない。
//   1 人の 箱は 60 語まで（多いときは まちがえた 回数の 多い 順に 残す）。
// 出題：最大 5 問。時期を 過ぎた 単語を 古い 順に。先生が 出したときは 時期前の 単語も まちがいの 多い 順に 足す。
//   形式は「🔊 を 聞いて 英単語を 4 つから えらぶ」。まちがいの 3 つは 最近 出会った 単語 → 箱の 単語 → 予備の 5 級単語。

export const DAY = 86400 * 1000;
export const NEXT = { 1: 3 * DAY, 2: 7 * DAY };
export const MAX_BOX = 60;
export const MAX_SEEN = 60;
export const PER_QUIZ = 5;
export const COIN = 3;
export const FALLBACK = ['apple', 'dog', 'cat', 'book', 'pen', 'milk', 'water', 'school', 'teacher', 'friend', 'red', 'blue', 'green', 'happy',
  'big', 'small', 'run', 'eat', 'sleep', 'morning', 'night', 'sun', 'moon', 'fish', 'bird', 'house', 'car', 'bus', 'tree', 'flower',
  'rain', 'snow', 'family', 'mother', 'father', 'sister', 'brother', 'library', 'river', 'breakfast', 'kitchen', 'window', 'chair'];

const WORD = /^[A-Za-z][A-Za-z \-']*$/;
export function englishWord(w) {
  if (typeof w !== 'string') return '';
  const t = w.trim();
  if (!t || t.length > 30 || !WORD.test(t)) return '';
  return t.toLowerCase();
}

export const blankBox = () => ({ box: {}, seen: [], graduated: [] });

function trim(box) {
  const words = Object.keys(box);
  if (words.length <= MAX_BOX) return;
  words.sort((a, b) => (box[b].n || 0) - (box[a].n || 0));
  for (const w of words.slice(MAX_BOX)) delete box[w];
}

// 1 つの quiz の 記録を 箱に 入れる。{ word, correct, level, ts }
export function applyQuiz(state, { word, correct, level = '', ts }) {
  const w = englishWord(word);
  if (!w || !Number.isFinite(ts)) return state;
  if (!state.seen.includes(w)) { state.seen.push(w); if (state.seen.length > MAX_SEEN) state.seen.shift(); }
  const b = state.box[w];
  if (correct === false) {
    state.box[w] = { s: 0, d: ts + DAY, n: (b?.n || 0) + 1 };
    trim(state.box);
  } else if (correct === true && b && (b.d <= ts || level === 'Review')) {
    b.s += 1;
    if (b.s >= 3) { delete state.box[w]; state.graduated.push({ word: w, ts }); }
    else b.d = ts + NEXT[b.s];
  }
  return state;
}

// roblox_events の 行（data_json つき）から 箱を つくる。
export function boxFromEvents(events) {
  const state = blankBox();
  const quiz = (events || []).filter((e) => e && e.type === 'quiz').map((e) => {
    let data = {};
    try { data = typeof e.data_json === 'string' ? JSON.parse(e.data_json) : (e.data || {}); } catch { data = {}; }
    return { ts: Number(e.ts), data };
  }).filter((e) => Number.isFinite(e.ts)).sort((a, b) => a.ts - b.ts);
  for (const e of quiz) applyQuiz(state, { word: e.data.word, correct: e.data.correct === true ? true : e.data.correct === false ? false : null, level: e.data.level, ts: e.ts });
  return state;
}

export const dueWords = (state, now) => Object.entries(state.box).filter(([, b]) => b.d <= now).sort((a, b) => a[1].d - b[1].d).map(([w]) => w);
export const dueCount = (state, now) => dueWords(state, now).length;

export function pickWords(state, now, { teacher = false } = {}) {
  const out = dueWords(state, now).slice(0, PER_QUIZ);
  if (teacher && out.length < PER_QUIZ) {
    const rest = Object.entries(state.box).filter(([w, b]) => b.d > now && !out.includes(w)).sort((a, b) => (b[1].n || 0) - (a[1].n || 0)).map(([w]) => w);
    for (const w of rest) { if (out.length >= PER_QUIZ) break; out.push(w); }
  }
  return out;
}

export function optionsFor(state, word, rand = Math.random) {
  const used = new Set([word]);
  const pools = [[...state.seen].reverse(), Object.keys(state.box), FALLBACK];
  const picked = [word];
  for (const pool of pools) {
    const cands = pool.filter((w) => !used.has(w));
    while (picked.length < 4 && cands.length) {
      const i = Math.floor(rand() * cands.length);
      const w = cands.splice(i, 1)[0];
      used.add(w); picked.push(w);
    }
    if (picked.length >= 4) break;
  }
  for (let i = picked.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }
  return picked;
}

// 1 回ぶんの 復習。答えは ここ（サーバー）に だけ ある。ページに 送るのは publicSet()。
export function makeSet(state, now, { teacher = false, rand = Math.random, classRun = 0 } = {}) {
  const words = pickWords(state, now, { teacher });
  if (!words.length) return null;
  return { items: words.map((w) => ({ word: w, options: optionsFor(state, w, rand), done: false })), correct: 0, mode: teacher ? 'teacher' : 'self', classRun, at: now };
}
// 🔊 で 読み上げる ために `say` だけは 送る（ブラウザーの 声で 読むので、どの 単語かは ページに 要る。つり島の listen と 同じ）。
// どれが 正解かの 判定は サーバーだけ。
export const publicSet = (set) => ({ mode: set.mode, items: set.items.map((it) => ({ say: it.word, options: it.options })) });

export class ReviewError extends Error {}
export function answer(set, i, choice) {
  const item = set?.items?.[i];
  if (!item) throw new ReviewError('no such question');
  if (item.done) throw new ReviewError('already answered');
  item.done = true;
  const ok = String(choice ?? '').trim().toLowerCase() === item.word;
  if (ok) set.correct += 1;
  return { ok, word: item.word, done: set.items.every((x) => x.done), correct: set.correct, total: set.items.length };
}

// 保護者レポート：つぎに おぼえる 単語（時期が 近い 順に 1 つ）と、復習で 卒業した 単語。
export function nextWord(state) {
  const all = Object.entries(state.box).sort((a, b) => a[1].d - b[1].d);
  return all.length ? all[0][0] : '';
}
export const graduatedWords = (state, { since = 0 } = {}) => [...new Set(state.graduated.filter((g) => g.ts >= since).map((g) => g.word))];

// 日本時間の 日付（1 日 1 回の カード）。
export const jstDay = (now) => new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
