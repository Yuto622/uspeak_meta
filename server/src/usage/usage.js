// 使用履歴（/admin/usage）の 小さな 道具 — 日ごとの 箱・端末の 種類・場所の 名前・集計・CSV。
//
// **生の 秒ごとの 行は 持たない。** 部屋の tick（1 秒）ごとに「その 子の きょうの 箱」へ 1 秒 足すだけ。
// 箱（day）の 中身（すべて 足し算だけで 決まる 数）：
//   on  … つながって いた 秒          act … 何か して いた 秒（tickStudy と 同じ きまり：2 分 以内に 動いたか 答えた）
//   sp  … 場所ごとの 秒 { 'willow': 120, 'in:main:books': 30 }（1 日 SPACE_CAP 種類まで、あふれは 'other'）
//   h   … 日本時間の 時ごとの 秒 { '9': 1200 }（あいた 時は 持たない）
//   lg  … 入った 回数        dv … 入った 端末 { pc, tablet, phone }
//   f / l … その 日 はじめて・さいごに 見た 時刻（ms）
//   r / w … 正解・不正解の 数     md … あそびの 形ごとの [正解, 不正解]
//   ai  … AI の 回数    ch … チャット（定型文も）    buy … 買いもの（コインが へった 回数）
//   xp / coin … その 日 もらった XP・コイン
// **チャットの 文・AI との 会話の 中身は ここに 入れない**（数だけ）。
import { dayKey } from '../game/months.js';

export const KEEP_DAYS = 400;              // これより 古い 日は 毎日 すてる（RETENTION_DAYS が 長くても）
export const SPACE_CAP = 24;
export const MODE_CAP = 40;
export const SESSION_CAP = 200;            // 1 人 さいきんの 200 回ぶん
export const PATH_CAP = 12;
export const DEVICES = ['pc', 'tablet', 'phone'];
const JST = 9 * 3600 * 1000;
const DAY_MS = 86400000;
// 答えでは ない 行（会話・チャットの 記録）。正解・不正解には 数えない（あそびの 形の 数には 入る）。
const NOT_ANSWERS = new Set(['chat', 'conv-free']);

export const jstHour = (ms) => new Date(Number(ms) + JST).getUTCHours();
export const jstWeekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay(); // 0=日
export { dayKey };
// 'YYYY-MM-DD' を n 日 ずらす（日本時間の 日付の まま）。
export function addDays(day, n) {
  const t = Date.parse(`${day}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}
export function dayRange(toDay, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addDays(toDay, -i));
  return out;
}
// 日本時間の 月曜はじまりの 週の 月曜日。
export function weekStart(day) { const wd = jstWeekday(day); return addDays(day, -((wd + 6) % 7)); }

// 端末の ざっくりした 種類。ページが 送って くる ヒント（'pc'・'tablet'・'phone'）が あれば それ、なければ User-Agent。
// iPadOS の Safari は「Macintosh」と 名のるので、ヒントが ない ときは pc に 数えて しまう（わかって いる 限界）。
export function deviceOf(ua = '', hint = '') {
  const h = String(hint || '').toLowerCase();
  if (DEVICES.includes(h)) return h;
  const s = String(ua || '');
  if (/iPad|Tablet|PlayBook|Silk|Kindle|SM-T|Nexus (7|9|10)/i.test(s)) return 'tablet';
  if (/Android/i.test(s) && !/Mobile/i.test(s)) return 'tablet';
  if (/iPhone|iPod|Android.*Mobile|Mobile Safari|Windows Phone|IEMobile|Opera Mini/i.test(s)) return 'phone';
  return 'pc';
}

// 場所の 名前を 箱の 鍵に：じぶんの 家（'in:home.<id>'）は 1 つに まとめる（id は 人ごと）、空は 'main'（そと）。
export function spaceKey(space) {
  const s = String(space || '').replace(/[^A-Za-z0-9_.:\-]/g, '').slice(0, 48);
  if (!s) return 'main';
  if (s.startsWith('in:home')) return 'in:home';
  return s.split('.')[0].slice(0, 32) || 'main';
}

export const blankDay = () => ({ on: 0, act: 0, sp: {}, h: {}, lg: 0, dv: {}, f: 0, l: 0, r: 0, w: 0, md: {}, ai: 0, ch: 0, buy: 0, xp: 0, coin: 0 });

// 1 回の tick（sec 秒）を 箱に。
export function sampleDay(day, { sec = 1, active = false, space = '', now = Date.now() } = {}) {
  day.on += sec;
  if (active) day.act += sec;
  let k = spaceKey(space);
  if (!(k in day.sp) && Object.keys(day.sp).length >= SPACE_CAP) k = 'other';
  day.sp[k] = (day.sp[k] || 0) + sec;
  const h = String(jstHour(now));
  day.h[h] = (day.h[h] || 0) + sec;
  if (!day.f || now < day.f) day.f = now;
  if (now > day.l) day.l = now;
  return day;
}

// 数を 足す（答え・AI・チャット・買いもの・XP・コイン）。
export function countDay(day, patch = {}, now = Date.now()) {
  const n = (v) => { const x = Math.floor(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };
  if (patch.mode !== undefined) {
    const mode = String(patch.mode || '').replace(/[^\w:-]/g, '').slice(0, 24) || 'other';
    if (!NOT_ANSWERS.has(mode) && patch.correct !== undefined) { if (patch.correct) day.r += 1; else day.w += 1; }
    let m = mode;
    if (!(m in day.md) && Object.keys(day.md).length >= MODE_CAP) m = 'other';
    const cell = (day.md[m] ||= [0, 0]);
    if (patch.correct) cell[0] += 1; else cell[1] += 1;
  }
  day.ai += n(patch.ai); day.ch += n(patch.ch); day.buy += n(patch.buy); day.xp += n(patch.xp); day.coin += n(patch.coin);
  if (now > day.l) day.l = now;
  if (!day.f || now < day.f) day.f = now;
  return day;
}

// 保存から 読む 箱。数で ない ものは 0、変な 鍵は すてる（手で さわった ファイルでも 落ちない）。
export function sanitizeDay(raw) {
  const d = blankDay();
  if (!raw || typeof raw !== 'object') return d;
  const n = (v) => { const x = Math.floor(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };
  for (const k of ['on', 'act', 'lg', 'f', 'l', 'r', 'w', 'ai', 'ch', 'buy', 'xp', 'coin']) d[k] = n(raw[k]);
  d.act = Math.min(d.act, d.on);
  const map = (src, keyOk, cap) => { const o = {}; for (const [k, v] of Object.entries(src && typeof src === 'object' ? src : {}).slice(0, cap)) if (keyOk(k)) o[k] = n(v); return o; };
  d.sp = map(raw.sp, (k) => /^[A-Za-z0-9_.:\-]{1,32}$/.test(k), SPACE_CAP + 1);
  d.h = map(raw.h, (k) => /^(\d|1\d|2[0-3])$/.test(k), 24);
  d.dv = map(raw.dv, (k) => DEVICES.includes(k), 3);
  for (const [k, v] of Object.entries(raw.md && typeof raw.md === 'object' ? raw.md : {}).slice(0, MODE_CAP + 1)) {
    if (/^[\w:-]{1,24}$/.test(k) && Array.isArray(v)) d.md[k] = [n(v[0]), n(v[1])];
  }
  return d;
}

export function sanitizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const n = (v) => { const x = Math.floor(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };
  const a = n(raw.a); if (!a) return null;
  return { a, b: Math.max(a, n(raw.b)), on: n(raw.on), act: Math.min(n(raw.act), n(raw.on)), dv: DEVICES.includes(raw.dv) ? raw.dv : 'pc',
    p: (Array.isArray(raw.p) ? raw.p : []).map((s) => spaceKey(s)).slice(0, PATH_CAP), more: n(raw.more) };
}

// ---- 集計（画面の JSON）-------------------------------------------------------------------
const sum = (list, f) => list.reduce((s, x) => s + (f(x) || 0), 0);
const min = (sec) => Math.round((sec || 0) / 60);
const daysIn = (st, from, to) => Object.entries(st.d || {}).filter(([k]) => k >= from && k <= to);

// 運営の 画面の 期間（7・30・90・365 日）。きょう（日本時間）まで。
export const RANGES = [7, 30, 90, 365];

// 概要：日ごとの 人数（DAU）・つながった 分・何か した 分・曜日×時の 分・端末・場所・あそびの 数。
export function overview(students, { days = 90, now = Date.now() } = {}) {
  const to = dayKey(now); const range = dayRange(to, days); const from = range[0];
  const perDay = Object.fromEntries(range.map((d) => [d, { day: d, users: 0, on: 0, act: 0, logins: 0 }]));
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dv = { pc: 0, tablet: 0, phone: 0 }; const sp = {}; const acts = { r: 0, w: 0, ai: 0, ch: 0, buy: 0, xp: 0, coin: 0 };
  const md = {};
  const users = new Set();
  for (const st of students) {
    for (const [k, d] of daysIn(st, from, to)) {
      const p = perDay[k]; if (!p) continue;
      if (d.on > 0 || d.lg > 0) { p.users += 1; users.add(st.key); }
      p.on += d.on; p.act += d.act; p.logins += d.lg;
      const wd = jstWeekday(k);
      for (const [h, s] of Object.entries(d.h)) heat[wd][Number(h)] += s;
      for (const [x, n] of Object.entries(d.dv)) dv[x] = (dv[x] || 0) + n;
      for (const [x, s] of Object.entries(d.sp)) sp[x] = (sp[x] || 0) + s;
      for (const x of Object.keys(acts)) acts[x] += d[x] || 0;
      for (const [m, [r, w]] of Object.entries(d.md)) { const c = (md[m] ||= [0, 0]); c[0] += r; c[1] += w; }
    }
  }
  const series = range.map((d) => ({ day: d, users: perDay[d].users, onMin: min(perDay[d].on), actMin: min(perDay[d].act), logins: perDay[d].logins }));
  const totalOn = sum(series, (s) => s.onMin); const totalAct = sum(series, (s) => s.actMin);
  const activeDays = sum(series, (s) => s.users);
  return {
    from, to, days,
    kpi: { users: users.size, onMin: totalOn, actMin: totalAct, logins: sum(series, (s) => s.logins),
      avgActPerUserDay: activeDays ? Math.round(totalAct / activeDays) : 0, answers: acts.r + acts.w,
      accuracy: acts.r + acts.w ? Math.round((acts.r / (acts.r + acts.w)) * 100) : null },
    series,
    heat: heat.map((row) => row.map(min)),
    devices: DEVICES.map((k) => ({ key: k, logins: dv[k] || 0 })),
    spaces: Object.entries(sp).map(([key, s]) => ({ key, min: min(s) })).sort((a, b) => b.min - a.min).slice(0, 15),
    activities: acts,
    modes: Object.entries(md).map(([mode, [r, w]]) => ({ mode, r, w, n: r + w })).sort((a, b) => b.n - a.n).slice(0, 20),
  };
}

// 1 人ぶんの 期間の まとめ（クラスの 表の 1 行）。
export function studentRow(st, record, { days = 30, now = Date.now() } = {}) {
  const to = dayKey(now); const range = dayRange(to, days); const from = range[0];
  const wk = weekStart(to); const mo = `${to.slice(0, 7)}-01`;
  const all = st?.d || {};
  let on = 0; let act = 0; let activeDays = 0; let r = 0; let w = 0; let weekOn = 0; let monthOn = 0; let weekAct = 0; let monthAct = 0; let last = 0;
  for (const [k, d] of Object.entries(all)) {
    if (d.l > last) last = d.l;
    if (k >= wk && k <= to) { weekOn += d.on; weekAct += d.act; }
    if (k >= mo && k <= to) { monthOn += d.on; monthAct += d.act; }
    if (k < from || k > to) continue;
    on += d.on; act += d.act; r += d.r; w += d.w;
    if (d.on > 0 || d.lg > 0) activeDays += 1;
  }
  const recLast = Date.parse(record?.last_seen || '') || 0;
  // 使用履歴が まだ ない 子（この 機能より 前の 記録だけ）は、月ごとの 記録（months_json）から 回答の 数を 出す（≈）。
  let approx = false;
  if (!st && record) {
    const months = parseMonths(record.months_json);
    for (const [k, m] of Object.entries(months)) if (k >= from.slice(0, 7) && k <= to.slice(0, 7)) { r += m.correct || 0; w += Math.max(0, (m.answers || 0) - (m.correct || 0)); activeDays += (m.days || []).filter((x) => x >= from && x <= to).length; }
    approx = r + w > 0 || activeDays > 0;
  }
  return {
    class: st?.c ?? record?.class ?? '', name: st?.n ?? record?.name ?? '',
    lastSeen: Math.max(last, recLast) || 0,
    weekMin: min(weekOn), monthMin: min(monthOn), weekActMin: min(weekAct), monthActMin: min(monthAct),
    onMin: min(on), actMin: min(act), activeDays, answers: r + w, accuracy: r + w ? Math.round((r / (r + w)) * 100) : null,
    streak: Number(record?.login_streak) || 0, level: Number(record?.level) || 0,
    spark: range.length > 90 ? weekly(range, all) : range.map((k) => min(all[k]?.act || 0)),
    approx,
  };
}
// 365 日は 週ごとに たたむ（表の 小さな 線が 読める 点の 数に）。
function weekly(range, all) {
  const out = []; let cur = 0; let n = 0;
  for (const k of range) { cur += all[k]?.act || 0; n += 1; if (n === 7) { out.push(min(cur)); cur = 0; n = 0; } }
  if (n) out.push(min(cur));
  return out;
}

export function parseMonths(raw) {
  let src = raw;
  if (typeof src === 'string') { try { src = JSON.parse(src || '{}'); } catch { return {}; } }
  return src && typeof src === 'object' && !Array.isArray(src) ? src : {};
}

// 1 人の くわしい 画面。
export function studentDetail(st, record, { days = 90, now = Date.now() } = {}) {
  const to = dayKey(now); const range = dayRange(to, days); const from = range[0];
  const all = st?.d || {};
  // カレンダー（365 日）：使用履歴の 分。それより 前（この 機能の 前）は months_json の「答えた 日」だけ わかる（legacy）。
  const months = parseMonths(record?.months_json);
  const legacy = new Set(Object.values(months).flatMap((m) => (Array.isArray(m?.days) ? m.days : [])));
  const calendar = dayRange(to, 365).map((k) => ({ day: k, actMin: min(all[k]?.act || 0), onMin: min(all[k]?.on || 0), studied: legacy.has(k) || (all[k]?.r || 0) + (all[k]?.w || 0) > 0 }));
  const daily = range.map((k) => { const d = all[k]; return { day: k, onMin: min(d?.on), actMin: min(d?.act), r: d?.r || 0, w: d?.w || 0, xp: d?.xp || 0, coin: d?.coin || 0, ai: d?.ai || 0, ch: d?.ch || 0, buy: d?.buy || 0, logins: d?.lg || 0 }; });
  const sp = {}; const md = {}; const hours = Array(24).fill(0); const dv = {};
  for (const [k, d] of daysIn(st || {}, from, to)) {
    for (const [x, s] of Object.entries(d.sp)) sp[x] = (sp[x] || 0) + s;
    for (const [m, [r, w]] of Object.entries(d.md)) { const c = (md[m] ||= [0, 0]); c[0] += r; c[1] += w; }
    for (const [h, s] of Object.entries(d.h)) hours[Number(h)] += s;
    for (const [x, n] of Object.entries(d.dv)) dv[x] = (dv[x] || 0) + n;
    void k;
  }
  const fromMs = Date.parse(`${from}T00:00:00Z`) - JST;
  const sessions = (st?.s || []).filter((s) => s.b >= fromMs).slice(-60).reverse()
    .map((s) => ({ start: s.a, end: s.b, onMin: min(s.on), actMin: min(s.act), device: s.dv, path: s.p, more: s.more || 0 }));
  const monthsList = Object.entries(months).filter(([k]) => /^\d{4}-\d{2}$/.test(k)).sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, m]) => ({ month: k, min: min(m.seconds), answers: m.answers || 0, correct: m.correct || 0, xp: m.xp || 0, coins: m.coins || 0, days: (m.days || []).length }));
  return {
    from, to, days,
    totals: { onMin: sum(daily, (d) => d.onMin), actMin: sum(daily, (d) => d.actMin), activeDays: daily.filter((d) => d.onMin > 0 || d.logins > 0).length,
      answers: sum(daily, (d) => d.r + d.w), right: sum(daily, (d) => d.r), logins: sum(daily, (d) => d.logins), ai: sum(daily, (d) => d.ai), chats: sum(daily, (d) => d.ch), buys: sum(daily, (d) => d.buy) },
    calendar, daily,
    spaces: Object.entries(sp).map(([key, s]) => ({ key, min: min(s) })).sort((a, b) => b.min - a.min),
    modes: Object.entries(md).map(([mode, [r, w]]) => ({ mode, r, w, n: r + w })).sort((a, b) => b.n - a.n),
    hours: hours.map(min), devices: DEVICES.map((k) => ({ key: k, logins: dv[k] || 0 })),
    sessions, months: monthsList, tracking: !!st, trackingSince: st ? Object.keys(all).sort()[0] || '' : '',
  };
}

// ---- CSV（Excel の 式に ならない ように：= + - @ で はじまる 文字は ' を つける）-----------------
export function csvCell(v) {
  let t = String(v ?? '');
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) || t !== String(v ?? '') ? `"${t.replace(/"/g, '""')}"` : t;
}
export const toCsv = (header, rows) => `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
export const isoJst = (ms) => (ms ? new Date(Number(ms) + JST).toISOString().replace('T', ' ').slice(0, 16) : '');
