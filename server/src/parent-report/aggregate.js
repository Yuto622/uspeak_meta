// 保護者レポートの 数字。**ここが いちばん 大事**：保護者が 読んで 判断する 数なので、定義を 1 か所に 置く。
//
// 入力は roblox_events の 行（Roblox と Web の 両方。Web は ClassRoom.robloxEvent が source=web で 書く）。
// 出力は 画面に そのまま 並べる 値（文字は texts.json、組版は render-tex.js）。DB にも 画面にも 触らない＝テストしやすい。
//
// 決まり（README と レポートの「数字の見方」と 同じ）：
//  - 日付は ぜんぶ 日本時間。週は 月曜〜日曜。
//  - 英語をした日 ＝ その日に type=quiz が 1 件 以上。
//  - 覚えた単語 ＝ 2 日以上に 分けて 3 回 つづけて 正解（はじめての 回答だけ。retry・fast は 数えない）。
//    その後 まちがえたら 覚えた から はずれる（「次に覚える単語」に もどる）。
//  - 正解は はじめての 回答だけ（retry=true と fast=true を のぞく）。20 問 未満は 数字を 出さない。
//  - 載せない もの：順位・ほかの 子との 比較・あてずっぽう率・コイン・レベル。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseEvent, worldLabel } from '../game/roblox-metrics.js';
import { englishWord, boxFromEvents, nextWord } from '../game/review.js';
import { meaningOf } from './dictionary.js';
import { DAY, dayKey, parts, weekOf, monthOf, prevWeek, jaRange } from './jst.js';

export const MIN_SHOWN = 20;            // これ 未満の 力は「これから」
const LONG_GAP = 14 * DAY;              // 久しぶり

const here = path.dirname(fileURLToPath(import.meta.url));
let fishTotal = null;
export function dexTotal() {
  if (fishTotal !== null) return fishTotal;
  try { fishTotal = JSON.parse(readFileSync(path.join(here, '../../../client/dist/fishworld.json'), 'utf8')).fish.length || 70; } catch { fishTotal = 70; }
  return fishTotal;
}

// ---- 1 行を 計算しやすい 形に ------------------------------------------------------------
export function normalize(rows) {
  return (rows || []).map((r) => (r && r.data && r.ts !== undefined && !('data_json' in r) ? { ...r, ts: Number(r.ts) } : parseEvent(r)))
    .filter((e) => Number.isFinite(e.ts) && e.ts > 0)
    .sort((a, b) => a.ts - b.ts);
}
const isQuiz = (e) => e.type === 'quiz';
const isFirst = (e) => e.data.retry !== true;                 // はじめての 回答
const isClean = (e) => isFirst(e) && e.data.fast !== true;    // 正解率に 入れる 回答
const correctOf = (e) => (e.data.correct === true ? true : e.data.correct === false ? false : null);
const inRange = (e, r) => e.ts >= r.start && e.ts <= r.end;

// 問題の 形 → 4 つの 力。聞く＝listen、書く＝type・spell、それ以外（mc・match・fill・order・形なし）＝読む。
export function skillOfQuiz(e) {
  const f = String(e.data.format || e.data.kind || '').toLowerCase();
  if (f === 'listen' || f === 'listening' || e.data.skill === 'listen') return 'listen';
  if (f === 'type' || f === 'spell' || f === 'typing' || f === 'spelling') return 'write';
  return 'read';
}
// 級（「できるようになってきたこと」の 文を えらぶ ため）。小屋の レベルと つり島の ゾーンから。
export function gradeOf(e) {
  const l = String(e.data.level ?? '').toLowerCase();
  if (l === '3' || l === 'hard' || Number(e.data.zone) === 3) return '3級';
  if (l === '4' || l === 'medium' || Number(e.data.zone) === 2) return '4級';
  return '5級';
}

// ---- 覚えた単語（2 日ルール） ---------------------------------------------------------------
// 時刻の 順に 1 語ずつ 状態を 進め、「覚えた」「はずれた」の 出来事を 返す。
export function masteryTimeline(events) {
  const words = new Map();      // word -> { run: [ts], mastered }
  const changes = [];           // { word, ts, kind: 'learn' | 'lose' }
  for (const e of events) {
    if (!isQuiz(e) || !isClean(e)) continue;
    const w = englishWord(e.data.word);
    const ok = correctOf(e);
    if (!w || ok === null) continue;
    const s = words.get(w) || { run: [], mastered: false };
    if (ok) {
      s.run.push(e.ts);
      if (s.run.length > 3) s.run.shift();
      if (!s.mastered && s.run.length === 3 && new Set(s.run.map(dayKey)).size >= 2) {
        s.mastered = true;
        changes.push({ word: w, ts: e.ts, kind: 'learn' });
      }
    } else {
      s.run = [];
      if (s.mastered) { s.mastered = false; changes.push({ word: w, ts: e.ts, kind: 'lose' }); }
    }
    words.set(w, s);
  }
  return changes;
}
// その 時刻に 覚えている 単語の 集合。
export function masteredAt(changes, at) {
  const set = new Set();
  for (const c of changes) {
    if (c.ts > at) break;
    if (c.kind === 'learn') set.add(c.word); else set.delete(c.word);
  }
  return set;
}

// ---- 毎週版 -------------------------------------------------------------------------------
export function weeklyData(rows, { week, nick = '', sender = '', teacher = null } = {}) {
  const events = normalize(rows);
  const quiz = events.filter(isQuiz);
  const inWeek = quiz.filter((e) => inRange(e, week));
  const prev = prevWeek(week);
  const prevAnswers = quiz.filter((e) => inRange(e, prev)).length;

  // 月〜日 の ○。
  const keys = Array.from({ length: 7 }, (_, i) => dayKey(week.start + i * DAY + 12 * 3600 * 1000));
  const active = new Set(inWeek.map((e) => dayKey(e.ts)));
  const days = keys.map((k) => active.has(k));
  const dayCount = days.filter(Boolean).length;
  let streak = 0; let run = 0;
  for (const on of days) { run = on ? run + 1 : 0; streak = Math.max(streak, run); }

  const answers = inWeek.length;
  const diff = answers - prevAnswers;

  // 今週 覚えた（週の 終わりに まだ 覚えている もの、新しい 順に 3 つ）。
  const changes = masteryTimeline(quiz.filter((e) => e.ts <= week.end));
  const held = masteredAt(changes, week.end);
  const learnedAll = [];
  for (const c of [...changes].reverse()) {
    if (c.kind !== 'learn' || c.ts < week.start || !held.has(c.word) || learnedAll.includes(c.word)) continue;
    learnedAll.push(c.word);
  }
  const learned = learnedAll.slice(0, 3).map((w) => ({ en: w, ja: meaningOf(w) }));

  // 次に覚える単語：苦手復習の 箱で 時期が いちばん 近い もの。無ければ さいきん まちがえた 単語。
  const box = boxFromEvents(events.filter((e) => e.ts <= week.end).map((e) => ({ type: e.type, ts: e.ts, data: e.data })));
  let next = nextWord(box);
  let nextFromMiss = false;
  if (!next) {
    const miss = [...quiz].reverse().find((e) => e.ts <= week.end && correctOf(e) === false && englishWord(e.data.word));
    if (miss) { next = englishWord(miss.data.word); nextFromMiss = true; }
  }

  // 状況（3 日 つづけて いない ときに 緑の 1 行で 出す）。強い ものから 1 つ。
  const before = quiz.filter((e) => e.ts < week.start);
  const lastBefore = before.length ? before[before.length - 1].ts : 0;
  const graduated = box.graduated.filter((g) => g.ts >= week.start && g.ts <= week.end).length;
  const gradesBefore = new Set(before.map(gradeOf));
  const newGrade = inWeek.map(gradeOf).find((g) => before.length && !gradesBefore.has(g)) || '';
  const formatsBefore = new Set(before.map((e) => String(e.data.format || '')));
  const newFormat = before.length > 0 && inWeek.some((e) => e.data.format && !formatsBefore.has(String(e.data.format)));
  const speakNow = events.filter((e) => e.type === 'speak' && inRange(e, week)).length;
  const speakPrev = events.filter((e) => e.type === 'speak' && inRange(e, prev)).length;
  let situation = '';
  if (dayCount > 0) {
    if (lastBefore && week.start - lastBefore >= LONG_GAP) situation = 'comeback';
    else if (graduated > 0) situation = 'conquered';
    else if (newGrade) situation = 'newLevel';
    else if (newFormat) situation = 'newFormat';
    else if (speakNow > speakPrev && speakNow >= 3) situation = 'moreSpeaking';
    else if (dayCount >= 4 || diff > 0) situation = 'great';
    else situation = 'few';
  }

  return {
    kind: 'weekly', periodKey: week.key, range: jaRange(week), nick, sender, teacher,
    days, dayCount, streak, answers, prevAnswers, diff,
    learned, next: next ? { en: next, ja: meaningOf(next), fromMiss: nextFromMiss } : null,
    situation, situationArgs: { n: graduated, level: newGrade },
    zero: dayCount === 0,
  };
}

// ---- 月次版 -------------------------------------------------------------------------------
function skillTable(quiz, events, r) {
  const out = {};
  for (const id of ['listen', 'read', 'write']) {
    const list = quiz.filter((e) => inRange(e, r) && skillOfQuiz(e) === id);
    const first = list.filter(isFirst);
    const clean = list.filter(isClean).filter((e) => correctOf(e) !== null);
    const correct = clean.filter((e) => correctOf(e) === true).length;
    out[id] = { n: first.length, den: clean.length, correct, enough: clean.length >= MIN_SHOWN };
  }
  out.speak = { n: events.filter((e) => e.type === 'speak' && inRange(e, r)).length };
  return out;
}

export function monthlyData(rows, { month, nick = '', sender = '', teacher = null } = {}) {
  const events = normalize(rows);
  const quiz = events.filter(isQuiz);
  const prev = monthOf(month.start - 1);

  // 始めた頃と今（覚えた単語の 累計）。
  const changes = masteryTimeline(quiz.filter((e) => e.ts <= month.end));
  const now = masteredAt(changes, month.end).size;
  const firstQuiz = quiz[0];
  const firstMonth = firstQuiz ? monthOf(firstQuiz.ts) : month;
  const sameMonth = firstMonth.key === month.key;
  const then = sameMonth ? 0 : masteredAt(changes, firstMonth.end).size;
  const monthsBetween = (month.y - firstMonth.y) * 12 + (month.m - firstMonth.m);

  // カレンダー（1 日の 曜日から 並べる。日曜はじまり）。
  const firstWeekday = parts(month.start).wd;
  const active = new Set(quiz.filter((e) => inRange(e, month)).map((e) => dayKey(e.ts)));
  const calendar = Array.from({ length: month.days }, (_, i) => active.has(dayKey(month.start + i * DAY + 12 * 3600 * 1000)));
  const dayCount = calendar.filter(Boolean).length;

  const skills = skillTable(quiz, events, month);
  const before = skillTable(quiz, events, prev);

  // できるようになってきたこと：いちばん 増えた 力（先月より）。級は 今月 いちばん 多く 解いた 級。
  const gain = (id) => (skills[id].n || 0) - (before[id].n || 0);
  const tried = ['listen', 'read', 'write', 'speak'].filter((id) => skills[id].n > 0);
  // 少なすぎる 力で「増えてきました」と 書かない（10 問・回 以上）。
  const best = tried.filter((id) => skills[id].n >= 10).sort((a, b) => gain(b) - gain(a) || skills[b].n - skills[a].n)[0] || '';
  const grades = {};
  for (const e of quiz.filter((x) => inRange(x, month))) grades[gradeOf(e)] = (grades[gradeOf(e)] || 0) + 1;
  const grade = Object.entries(grades).sort((a, b) => b[1] - a[1])[0]?.[0] || '5級';

  // ゲームの 中の できごと：今月 つかまえた 魚の 種類と 図鑑。魚が 無ければ いちばん 遊んだ 場所。
  const catches = events.filter((e) => e.type === 'catch' && e.data.fish);
  const fishNow = new Set(catches.filter((e) => inRange(e, month)).map((e) => String(e.data.fish)));
  const dex = new Set(catches.filter((e) => e.ts <= month.end).map((e) => String(e.data.fish)));
  let game = null;
  if (fishNow.size) game = { kind: 'fish', n: fishNow.size, dex: dex.size, total: Math.max(dexTotal(), dex.size) };
  else {
    const byWorld = {};
    for (const e of quiz.filter((x) => inRange(x, month))) byWorld[e.world || 'other'] = (byWorld[e.world || 'other'] || 0) + 1;
    const top = Object.entries(byWorld).sort((a, b) => b[1] - a[1])[0];
    if (top) game = { kind: 'place', place: worldLabel(top[0]), n: top[1] };
  }

  // 来月の 一歩：20 問に いちばん 近い 力（あと 何問）。全部 そろって いれば 次の 級 か つづける。
  const short = ['write', 'listen', 'read'].filter((id) => skills[id].den > 0 && !skills[id].enough)
    .sort((a, b) => (MIN_SHOWN - skills[a].den) - (MIN_SHOWN - skills[b].den))[0];
  let nextStep;
  if (short) nextStep = { key: short, n: MIN_SHOWN - skills[short].den };
  else if (skills.speak.n === 0 && dayCount > 0) nextStep = { key: 'speak' };
  else if (grade !== '3級' && dayCount >= 8) nextStep = { key: 'nextLevel', level: grade === '5級' ? '4級' : '3級' };
  else nextStep = { key: 'keep' };

  return {
    kind: 'monthly', periodKey: month.key, range: jaRange(month), month: month.m, nick, sender, teacher,
    learned: { then, now, sameMonth, firstLabel: `${firstMonth.m}月`, nowLabel: `${month.m}月`, months: Math.max(1, monthsBetween) },
    calendar, firstWeekday, dayCount, skills, best, grade, game, nextStep,
    zero: dayCount === 0,
  };
}

// 週・月の 範囲（配信する 回）を 外から 作る ための 再輸出。
export { weekOf, monthOf };
