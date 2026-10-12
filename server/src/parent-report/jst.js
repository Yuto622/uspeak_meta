// 保護者レポートの 日付は ぜんぶ 日本時間（JST, UTC+9・夏時間なし）。サーバーは UTC で 動くので、
// getDay / getDate を そのまま 使うと 朝 9 時までの 記録が 前の 日に 入る。ここだけで 計算する。
//
// 週は 月曜 0:00 〜 日曜 23:59:59.999（JST）。月は 1 日 0:00 〜 末日 23:59:59.999。
export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;
const OFFSET = 9 * HOUR;

// JST の 年月日・曜日（0=日 … 6=土）・時分。
export function parts(ms) {
  const d = new Date(ms + OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}
// JST の その日の 0:00 を UTC の ms で。
export const jstMidnight = (y, m, d) => Date.UTC(y, m - 1, d) - OFFSET;
export const dayKey = (ms) => { const p = parts(ms); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
export const startOfDay = (ms) => { const p = parts(ms); return jstMidnight(p.y, p.m, p.d); };

// その 時刻を 含む 週（月曜はじまり）。
export function weekOf(ms) {
  const p = parts(ms);
  const back = (p.wd + 6) % 7;                 // 月曜から 何日 たったか
  const start = jstMidnight(p.y, p.m, p.d) - back * DAY;
  return { start, end: start + 7 * DAY - 1, key: weekKey(start) };
}
// 直前に 終わった 週（配信する 週）。
export const lastWeek = (now) => weekOf(weekOf(now).start - 1);
export const prevWeek = (week) => weekOf(week.start - 1);

// ISO 週番号（2026-W41）。月曜の 日付で 決める。
export function weekKey(mondayStartMs) {
  const p = parts(mondayStartMs);
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const thursday = new Date(date); thursday.setUTCDate(date.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = 1 + Math.floor((thursday - yearStart) / DAY / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
export const isoWeekNumber = (key) => Number(String(key).split('-W')[1]) || 0;

export function monthOf(ms) {
  const p = parts(ms);
  const start = jstMidnight(p.y, p.m, 1);
  const next = p.m === 12 ? jstMidnight(p.y + 1, 1, 1) : jstMidnight(p.y, p.m + 1, 1);
  return { start, end: next - 1, key: `${p.y}-${String(p.m).padStart(2, '0')}`, y: p.y, m: p.m, days: Math.round((next - start) / DAY) };
}
export const lastMonth = (now) => monthOf(monthOf(now).start - 1);

// 見出しの 文字。「10月4日〜10月10日」「10月1日〜10月31日」。
export const jaDay = (ms) => { const p = parts(ms); return `${p.m}月${p.d}日`; };
export const jaRange = (r) => `${jaDay(r.start)}〜${jaDay(r.end)}`;
export const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
