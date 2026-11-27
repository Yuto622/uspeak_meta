// きょうの 上限（入りなおしても もどらない ぶん）。
//
// The caps that live in `priv.caps` are written to the player's record, so leaving and
// rejoining does not start the day over. A few budgets were only ever kept on the seat
// (`priv`): the AI turns of a day, and — until 2026-11 — nothing at all for the word
// answers, the word huts, the kart gates, the gym and the review. A child (or a page
// in a loop) could leave and come back, or just keep answering, and the day never ran
// out.
//
// This is the smallest thing that closes that without a new column in the store: one
// table for the whole process, keyed by class and name, that outlives the seat and the
// room. A server restart clears it (a deploy is rare and happens outside lessons); the
// day turns at the same moment as every other cap (`dayIndex`, noon JST).
import { dayIndex } from './daily.js';

const MAX_ENTRIES = 50_000;

export function createDayBudget({ now = Date.now } = {}) {
  const table = new Map(); // `${classCode}|${name}` -> { day, used: { kind: n } }
  const keyOf = (classCode, name) => `${String(classCode)}|${String(name)}`;
  function entry(classCode, name) {
    const today = dayIndex(now());
    const key = keyOf(classCode, name);
    let e = table.get(key);
    if (!e || e.day !== today) {
      if (!e && table.size >= MAX_ENTRIES) {
        for (const [k, v] of table) if (v.day !== today) table.delete(k);
        if (table.size >= MAX_ENTRIES) table.clear();
      }
      e = { day: today, used: {} };
      table.set(key, e);
    }
    return e;
  }
  return {
    used(classCode, name, kind) { return entry(classCode, name).used[kind] || 0; },
    left(classCode, name, kind, cap) { return Math.max(0, cap - (entry(classCode, name).used[kind] || 0)); },
    add(classCode, name, kind, n = 1) {
      const e = entry(classCode, name);
      const by = Number.isFinite(n) && n > 0 ? n : 0;
      e.used[kind] = (e.used[kind] || 0) + by;
      return e.used[kind];
    },
    // Takes up to `amount` out of what is left today and returns what was taken.
    take(classCode, name, kind, amount, cap) {
      const e = entry(classCode, name);
      const want = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
      const got = Math.max(0, Math.min(want, cap - (e.used[kind] || 0)));
      if (got > 0) e.used[kind] = (e.used[kind] || 0) + got;
      return got;
    },
    clear() { table.clear(); },
    get size() { return table.size; },
  };
}

// One for the whole process, so a room that closes and opens again keeps counting.
export const DAY_BUDGET = createDayBudget();
