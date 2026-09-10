// 入場ゲート — who is allowed into a class.
//
// Ported from Roblox's AccessGate, whose whole design is one sentence: never lock out a
// child who belongs here, and never let in someone who does not. It got there by not
// trusting any single source — a fresh read of the register, then the last good copy of
// it, then evidence the child has been here before.
//
// The same three tiers are here:
//
//   1. The register, read from the store and cached for a few minutes.
//   2. The last register that was read successfully, kept in memory and on disk, so a
//      Sheets outage in the middle of a lesson changes nothing for the children.
//   3. A record of this child in this class, written by an earlier lesson. Somebody
//      admitted them once; a spreadsheet being down is not a reason to turn them away.
//
// A teacher holding the key is authorised by that key and never consults the register.
// And with no register at all (ACCESS_MODE=open, which is the default) the gate is a
// door held open — schools that do not need this should not have to configure it.
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const OPEN = 'open';
export const ROSTER = 'roster';

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export function createGate({ store, mode = OPEN, ttlMs = 5 * 60 * 1000, snapshotPath = '', log = console, now = Date.now }) {
  // classCode -> { names:Set, at, source }
  const cache = new Map();
  let snapshotLoaded = false;

  async function loadSnapshot() {
    if (snapshotLoaded || !snapshotPath) return;
    snapshotLoaded = true;
    try {
      const parsed = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
      for (const [cls, names] of Object.entries(parsed?.classes || {})) {
        if (cache.has(cls)) continue;
        cache.set(cls, { names: new Set((names || []).map(fold)), at: 0, source: 'snapshot' });
      }
      log.info?.(`[gate] restored a register snapshot for ${cache.size} class(es)`);
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn?.('[gate] snapshot unreadable:', err.message);
    }
  }

  async function saveSnapshot() {
    if (!snapshotPath) return;
    const classes = {};
    for (const [cls, entry] of cache) if (entry.at) classes[cls] = [...entry.names];
    try {
      await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
      await fs.writeFile(snapshotPath, JSON.stringify({ savedAt: new Date(now()).toISOString(), classes }, null, 2));
    } catch (err) {
      log.warn?.('[gate] snapshot could not be written:', err.message);
    }
  }

  // Tier 1, falling back to tier 2. Never throws: a gate that throws is a locked door.
  async function register(classCode) {
    await loadSnapshot();
    const entry = cache.get(classCode);
    if (entry && entry.at && now() - entry.at < ttlMs) return entry;
    if (!store?.listRoster) return entry || null;
    try {
      const rows = await store.listRoster(classCode);
      if (rows === null || rows === undefined) return entry || null;   // no register kept at all
      const fresh = { names: new Set(rows.map((r) => fold(r.name))), at: now(), source: 'register' };
      cache.set(classCode, fresh);
      await saveSnapshot();
      return fresh;
    } catch (err) {
      log.warn?.(`[gate] register read failed for ${classCode}:`, err.message);
      return entry || null;      // tier 2: whatever was last read successfully
    }
  }

  return {
    get mode() { return mode; },
    // Used by tests and by a teacher's "reload the register" command.
    forget(classCode) { if (classCode) cache.delete(classCode); else cache.clear(); },
    async allow({ classCode, name, role, store: storeOverride }) {
      if (mode !== ROSTER) return { ok: true, reason: 'open' };
      if (role === 'teacher') return { ok: true, reason: 'teacher key' };
      const entry = await register(classCode);
      if (entry && entry.names.has(fold(name))) return { ok: true, reason: entry.source };
      // Tier 3: this child has been in this class before, so somebody admitted them once.
      const src = storeOverride || store;
      if (src?.loadPlayer) {
        try {
          const record = await src.loadPlayer(classCode, name);
          if (record) return { ok: true, reason: 'returning' };
        } catch (err) {
          log.warn?.('[gate] record check failed:', err.message);
        }
      }
      // A register exists and this name is not on it, or there is no register and no
      // record: either way this is not somebody we can vouch for.
      return { ok: false, reason: entry ? 'not on the register' : 'no register' };
    },
  };
}
