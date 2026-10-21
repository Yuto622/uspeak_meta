// クラスの ランキング — いろいろな 指標で、クラスの 中の 順位を 出す（2026-10）。
//
// 中身は ゲームと 同じ 保存（store の プレイヤーの 行）から 毎回 計算する。別の 表は 持たない。
// 1 か所で 決めて、ゲームの ♛ ボタン・保護者の レポート（web・PDF）・先生の /class が 同じ 数字を 出す。
//
// 決まり：
// - 先生（role が teacher）は ならべない。
// - 0（まだ やっていない）の 子は その 指標には ならべない。「さいかい」を 名指ししない。
// - 同じ 数は 同じ 順位（1, 2, 2, 4）。同じ 数の 中は 名前順（ならびが ゆれない）。
// - 保護者に 出すのは その 子の 順位と 人数だけ（ほかの 子の 名前と 数は 出さない）。
import { totalXp } from './progression.js';
import { sanitizeSkills, SKILLS } from './skills.js';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const parse = (json, fallback) => { try { const v = typeof json === 'string' ? JSON.parse(json) : json; return v ?? fallback; } catch { return fallback; } };
const len = (json) => { const v = parse(json, []); return Array.isArray(v) ? v.length : 0; };

// 1 行が 1 つの ランキング。`better: 'low'` は 小さい ほうが 上（ラップの タイム）。
// `week: true` は 今週の ぶんだけ（week_key が いまの 週の 子だけ 数える）。
export const METRICS = [
  { key: 'week_xp', icon: '✧', ja: 'こんしゅうの XP', en: 'XP this week', unit: 'XP', unitEn: 'XP', week: true, of: (r) => num(r.week_xp) },
  // のびた XP：今週 − 先週（ふえた ぶんだけ）。はじめたばかりの 子も 1 位に なれる（ぜんぶの XP は 前から いる 子が 強い）。
  { key: 'growth', icon: '🚀', ja: 'のびた XP（せんしゅうより）', en: 'XP growth (vs last week)', unit: 'XP', unitEn: 'XP', week: true, of: (r, wk) => Math.max(0, num(r.week_xp) - num(histOf(r)[wk - 1])) },
  { key: 'total_xp', icon: '⭐', ja: 'ぜんぶの XP', en: 'Total XP', unit: 'XP', unitEn: 'XP', of: (r) => totalXp({ level: Math.max(1, num(r.level) || 1), xp: num(r.xp) }) },
  { key: 'level', icon: '🏅', ja: 'レベル', en: 'Level', unit: 'Lv', unitEn: 'Lv', of: (r) => (num(r.xp) > 0 || num(r.level) > 1 ? Math.max(1, Math.floor(num(r.level) || 1)) : 0) },
  { key: 'correct', icon: '✅', ja: 'せいかいした かず', en: 'Correct answers', unit: 'もん', unitEn: '', of: (r) => num(r.correct) },
  { key: 'accuracy', icon: '🎯', ja: 'せいかいりつ（20もん いじょう）', en: 'Accuracy (20+ answers)', unit: '%', unitEn: '%', of: (r) => (num(r.attempts) >= 20 ? Math.round((Math.min(num(r.correct), num(r.attempts)) / num(r.attempts)) * 100) : 0) },
  { key: 'study_min', icon: '⏱', ja: 'がくしゅう じかん', en: 'Study time', unit: 'ふん', unitEn: 'min', of: (r) => Math.round(num(r.study_ms) / 60000) },
  { key: 'study_days', icon: '📅', ja: 'がくしゅうした 日', en: 'Study days', unit: '日', unitEn: 'days', of: (r) => num(r.study_days) },
  { key: 'streak', icon: '🔥', ja: 'れんぞく ログイン', en: 'Login streak', unit: '日', unitEn: 'days', of: (r) => num(r.login_streak) },
  { key: 'coins', icon: '🪙', ja: 'もっている コイン', en: 'Coins', unit: 'コイン', unitEn: 'coins', of: (r) => num(r.coins) },
  { key: 'catches', icon: '🎣', ja: 'つった さかな', en: 'Fish caught', unit: 'ひき', unitEn: 'fish', of: (r) => num(r.catches) + num(parse(r.fishworld_json, {})?.caught) },
  { key: 'dex', icon: '📖', ja: 'さかな ずかん', en: 'Fish dex', unit: 'しゅるい', unitEn: 'kinds', of: (r) => len(r.dex_json) + (Array.isArray(parse(r.fishworld_json, {})?.dex) ? parse(r.fishworld_json, {}).dex.length : 0) },
  { key: 'phrases', icon: '💬', ja: 'えいごの フレーズ', en: 'Phrases', unit: 'かい', unitEn: 'times', of: (r) => num(r.chats) },
  { key: 'errands', icon: '🧺', ja: 'おつかい', en: 'Errands', unit: 'かい', unitEn: 'times', of: (r) => len(r.missions_json) },
  { key: 'tasks', icon: '📝', ja: 'すんだ タスク', en: 'Tasks done', unit: 'こ', unitEn: '', of: (r) => { const t = parse(r.tasks_json, {}); return Array.isArray(t?.done) ? t.done.length : 0; } },
  { key: 'land', icon: '🏝', ja: 'じぶんの しま', en: 'Own island', unit: 'だん', unitEn: 'tier', of: (r) => num(parse(r.land_json, {})?.tier) },
  { key: 'lap', icon: '🏁', ja: 'レースの ベストラップ', en: 'Best lap', unit: 'びょう', unitEn: 's', better: 'low', of: (r) => Math.round(num(r.lap_best) / 100) / 10 },
  // 4 技能 ＋ りかい：その 技能で せいかいした かず。
  ...SKILLS.map((s) => ({ key: `skill_${s.id}`, icon: { listen: '👂', speak: '🗣', read: '📘', write: '✏️', think: '💡' }[s.id] || '✦', ja: `${s.ja}（せいかい）`, en: `${s.en} (correct)`, unit: 'もん', unitEn: '', of: (r) => { const sk = sanitizeSkills(parse(r.skills_json, null)); return num(sk[s.id]?.c); } })),
];
export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

const isTeacher = (r) => String(r.role || '') === 'teacher';

// ---- 週ごとの XP（week_hist_json）-------------------------------------------------------------
const HIST_WEEKS = 12;
export function sanitizeWeekHist(raw) {
  const out = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) { const w = Math.floor(Number(k)); const x = Math.floor(Number(v)); if (w > 0 && x > 0) out[w] = Math.min(1e9, x); }
  return out;
}
// いまの 週を 書きこみ、古い 週を すてる（保存の たびに）。
export function noteWeek(hist, week) {
  const h = sanitizeWeekHist(hist);
  if (week?.key && week.xp > 0) h[week.key] = Math.floor(week.xp);
  const keep = Object.keys(h).map(Number).sort((a, b) => b - a).slice(0, HIST_WEEKS);
  return Object.fromEntries(keep.map((k) => [k, h[k]]));
}
export const histOf = (r) => sanitizeWeekHist(parse(r?.week_hist_json, {}));

// ---- 宇宙の 段階（今週の XP で きまる。**だれとも くらべない・さがらない**。週が かわると また ほしくずから）--------
export const TIERS = [
  { id: 'dust', icon: '✨', ja: 'ほしくず', en: 'Stardust', min: 0 },
  { id: 'moon', icon: '🌙', ja: 'つき', en: 'Moon', min: 30 },
  { id: 'planet', icon: '🪐', ja: 'わくせい', en: 'Planet', min: 80 },
  { id: 'star', icon: '⭐', ja: 'こうせい', en: 'Star', min: 160 },
  { id: 'nebula', icon: '🌌', ja: 'せいうん', en: 'Nebula', min: 300 },
  { id: 'galaxy', icon: '🌠', ja: 'ぎんが', en: 'Galaxy', min: 500 },
];
export function tierOf(xp) {
  let i = 0;
  TIERS.forEach((t, j) => { if (xp >= t.min) i = j; });
  const now = TIERS[i]; const next = TIERS[i + 1] || null;
  // 次の 段階までの すすみ（0〜1）。さいごの 段階は いっぱい。
  const p = next ? (xp - now.min) / (next.min - now.min) : 1;
  return { ...now, index: i, next, toNext: next ? next.min - xp : 0, progress: Math.max(0, Math.min(1, p)) };
}

// じぶんくらべ（ランキングの いちばん 上）：今週・先週・じこベスト（今週は のぞく）・段階。
export function selfView(week, hist, weekKey) {
  const h = sanitizeWeekHist(hist);
  const xp = week?.key === weekKey ? Math.max(0, Math.floor(week.xp || 0)) : 0;
  const lastWeek = h[weekKey - 1] || 0;
  const best = Math.max(0, ...Object.entries(h).filter(([k]) => Number(k) !== weekKey).map(([, v]) => v));
  return { weekXp: xp, lastWeek, best, tier: tierOf(xp), tiers: TIERS.map(({ id, icon, ja, en, min }) => ({ id, icon, ja, en, min })) };
}

// クラス みんなで ためる 目標（今週の XP の 合計）。1 人 GOAL_PER_KID ずつ（入って いる 子の 数）。
export const GOAL_PER_KID = 150;
export function classGoal(boards) {
  const rows = boards.find((b) => b.key === 'week_xp')?.rows || [];
  const total = rows.reduce((n, r) => n + r.value, 0);
  const kids = Math.max(1, rows.length);
  return { now: total, goal: kids * GOAL_PER_KID, kids: rows.length };
}

// records（プレイヤーの 行）→ 指標ごとの ならび。weekKey は いまの 週（week_xp を 数える 週）。
export function rankings(records, { weekKey = null, metrics = METRICS } = {}) {
  const kids = new Map();
  for (const r of records || []) {
    if (!r || !r.name || isTeacher(r)) continue;
    kids.set(r.name, r);   // 同じ 名前は あとの 行が 勝つ（ライブの 行を あとに 渡す）
  }
  return metrics.map((m) => {
    const rows = [];
    for (const r of kids.values()) {
      if (m.week && weekKey !== null && num(r.week_key) !== num(weekKey)) continue;
      const value = m.of(r, num(weekKey));
      if (!(value > 0)) continue;
      rows.push({ name: r.name, value });
    }
    rows.sort((a, b) => (m.better === 'low' ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
    let rank = 0;
    rows.forEach((row, i) => { if (i === 0 || row.value !== rows[i - 1].value) rank = i + 1; row.rank = rank; });
    return { key: m.key, icon: m.icon, ja: m.ja, en: m.en, unit: m.unit, unitEn: m.unitEn, better: m.better || 'high', rows };
  });
}

// ゲームに 送る 形：指標ごとに 上 top 人と、じぶんの 行（top に いなくても）。
// near：じぶんの まわり（上 2 人・じぶん・下 1 人）。**ほかの 子の 数は 送らない**（名前と 順位だけ）。
// gap：すぐ 上の 子まで あと いくつ（同じ 数なら 1）。1 位なら 0。
export function boardPayload(boards, name, { top = 10 } = {}) {
  return boards.map((b) => {
    const me = b.rows.find((r) => r.name === name) || null;
    let near = []; let gap = 0; let ahead = '';
    if (me) {
      const i = b.rows.indexOf(me);
      near = b.rows.slice(Math.max(0, i - 2), i + 2).map((r) => (r === me ? { ...r, me: true } : { name: r.name, rank: r.rank }));
      const up = [...b.rows.slice(0, i)].reverse().find((r) => r.rank < me.rank);
      if (up) { gap = b.better === 'low' ? Math.max(0.1, Math.round((me.value - up.value) * 10) / 10) : Math.max(1, up.value - me.value + (up.value === me.value ? 1 : 0)); ahead = up.name; }
    }
    return { key: b.key, icon: b.icon, ja: b.ja, en: b.en, unit: b.unit, unitEn: b.unitEn, better: b.better, of: b.rows.length, top: b.rows.slice(0, top), me, near, gap, ahead };
  });
}

// 保護者に 出す 形：その 子の 順位と 人数だけ。やって いない 指標は 出さない。上位から ならべる。
export function standingOf(boards, name) {
  const out = [];
  for (const b of boards) {
    const me = b.rows.find((r) => r.name === name);
    if (!me) continue;
    out.push({ key: b.key, icon: b.icon, ja: b.ja, en: b.en, unit: b.unit, unitEn: b.unitEn, value: me.value, rank: me.rank, of: b.rows.length });
  }
  return out.sort((a, b) => a.rank / a.of - b.rank / b.of || a.rank - b.rank);
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 先生の /class に 出す 表：指標ごとに 上の 3 人（先生は クラスの 子の 名前を 見て よい）。
export function classRankingHtml(boards, { top = 3 } = {}) {
  const live = boards.filter((b) => b.rows.length);
  if (!live.length) return '';
  const medal = ['🥇', '🥈', '🥉'];
  return `<section style="margin:16px 0;padding:14px 16px;border-radius:14px;background:#fffaf0;border:1px solid #e6dcc0">
 <b>🏆 クラスの ランキング</b> <small style="color:#7b8a7f">（ゲームの ♛ と 同じ 数字。こんしゅうの XP は 月曜に リセット）</small>
 <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px">
 ${live.map((b) => `<div style="background:#fff;border-radius:12px;padding:10px 12px"><div style="font-weight:700;font-size:13px;margin-bottom:4px">${esc(b.icon)} ${esc(b.ja)} <small style="color:#7b8a7f;font-weight:400">${b.rows.length}人</small></div>
  <ol style="margin:0;padding:0;list-style:none;font-size:13px">${b.rows.slice(0, top).map((r) => `<li>${medal[r.rank - 1] || `${r.rank}.`} ${esc(r.name)} <span style="color:#7b8a7f">${esc(r.value)} ${esc(b.unit)}</span></li>`).join('')}</ol></div>`).join('')}
 </div></section>`;
}
