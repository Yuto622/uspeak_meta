// ロードマップの 窓口 — 記録（roblox_events。Roblox と Web の 両方）を 読んで 計算し、条件を みたして いれば 段階を 上げる。
// 部屋（ClassRoom の rm:*）・Roblox の API（GET /api/roadmap/:username）・先生の /class・保護者レポートが ここを 通る。
// **段階を 上げるのは ここだけ**（ページも Roblox も「上がった」とは 言えない）。コインは よんだ がわが 払う（1 段階 1 回）。
import { roadmapOf, nextStageId, STAGE_COINS } from '../game/roadmap.js';

export function createRoadmapService({ store, roadmap, roblox = null, log = console, now = Date.now }) {
  const usernameOf = (classCode, name) => (roblox?.usernameFor ? roblox.usernameFor(classCode, name) : name);
  const rowsOf = async (username) => (await store.listRobloxEvents?.({ username })) ?? [];

  function compute(classCode, name, rows, at = now()) {
    return roadmapOf(rows, { settings: roadmap.settingsFor(classCode), state: roadmap.stateOf(classCode, name) || { stage: roadmap.startFor(classCode), since: 0 }, now: at });
  }

  // 1 人ぶん。advance=true なら 条件を みたした ときに 1 段階 上げる（上がった ことは ups に）。
  async function view(classCode, name, { username = '', advance = true, rows = null } = {}) {
    const u = username || usernameOf(classCode, name);
    const list = rows || await rowsOf(u);
    let v = compute(classCode, name, list);
    const ups = [];
    if (advance && v.ready) {
      const to = nextStageId(v.stage.id);
      const r = await roadmap.setStage(classCode, name, to, { by: 'auto' });
      if (r.changed) {
        ups.push({ from: v.stage.id, to, coins: r.pay ? STAGE_COINS : 0 });
        log.info?.(`[roadmap] ${classCode} ${name.slice(0, 2)}… ${v.stage.id} → ${to}`);
        v = compute(classCode, name, list);
      }
    }
    return { ...v, username: u, ups };
  }

  // 先生の /class：クラス全員（Web の 名簿＋Roblox の 子）。1 回で クラスの 記録を 読む。
  async function classList(classCode, names) {
    const all = (await store.listRobloxEvents?.({ classCode })) ?? [];
    const byUser = new Map();
    for (const e of all) { const k = String(e.username || '').toLowerCase(); if (!byUser.has(k)) byUser.set(k, []); byUser.get(k).push(e); }
    const out = [];
    for (const name of names) {
      const u = usernameOf(classCode, name);
      const rows = byUser.get(String(u).toLowerCase()) || await rowsOf(u);
      const v = await view(classCode, name, { username: u, rows, advance: false });
      out.push({ name, username: u, stage: v.stage, index: v.index, words: v.words, quiz: v.quiz, ready: v.ready, weekDays: v.weekDays, eiken: v.eiken[0] || null });
    }
    return out;
  }

  return { view, classList, usernameOf, setStage: (c, n, s) => roadmap.setStage(c, n, s, { by: 'teacher' }) };
}
