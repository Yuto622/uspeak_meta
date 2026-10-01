// 入場の切り替えと名簿の出し入れ — the one object the admin page and the rooms share.
//
// The gate (gate.js) decides who comes in; this is where it is told two things:
//   mode()    'roster' or 'open'. ACCESS_MODE in the environment, when set, is the law.
//             When it is not set, the switch on the admin page decides, kept in
//             data/roster-settings.json so it survives a restart. Default: open.
//   version   bumped by every save from the admin page, so a gate holding a cached
//             register reads again at once instead of at the end of its ttl.
// And it is where the admin page reads and replaces the register, through the store,
// whatever the store is (roster.json beside the file store, the roster tab of the
// Sheets store). When the register is a Google Sheet of its own (ROSTER_SHEET_ID) the
// page shows it read-only: the sheet is the thing to edit.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');

export function createAccess({ store, roster = store, dataDir = '', envMode = 'open', envModeSet = false, log = console }) {
  const settingsFile = dataDir ? path.join(dataDir, 'roster-settings.json') : null;
  let enforce = false;
  let bumps = 0;

  async function load() {
    if (!settingsFile) return;
    try {
      const parsed = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
      enforce = !!parsed?.enforce;
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn?.('[access] roster-settings.json unreadable:', err.message);
    }
  }

  async function save() {
    if (!settingsFile) return;
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    const tmp = `${settingsFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ enforce, updatedAt: new Date().toISOString() }, null, 2));
    await fs.rename(tmp, settingsFile);
  }

  const external = roster !== store;
  return {
    async init() { await load(); },
    // Where the register comes from: 'google-sheet' for a sheet of its own, else the store.
    get source() { return external ? roster.name : store.name; },
    // The admin page may edit the register only when it lives in the store.
    get editable() { return !external && typeof store.saveRoster === 'function'; },
    get envModeSet() { return envModeSet; },
    get enforce() { return enforce; },
    mode() {
      if (envModeSet) return envMode;
      return enforce ? 'roster' : 'open';
    },
    get version() { return bumps + (roster?.rosterVersion ?? 0) + (store?.rosterVersion ?? 0); },
    async setEnforced(value) {
      enforce = !!value;
      bumps += 1;
      await save();
      log.info?.(`[access] register ${enforce ? 'ON: only names on the register get in' : 'OFF: anyone with the class code gets in'}`);
    },
    // Every row of the register, [{ class, name, note }], class '*' for every class.
    async rows() {
      if (typeof roster.listAllRoster === 'function') return (await roster.listAllRoster()) ?? [];
      if (typeof roster.listAll === 'function') return roster.listAll();
      return [];
    },
    // Replace the register. Rows are cleaned here: no name, no row; the same name twice
    // in the same class is one row; a blank class is every class.
    async replace(rows) {
      if (!this.editable) throw new Error('the register is not editable here');
      const seen = new Set();
      const clean = [];
      for (const r of Array.isArray(rows) ? rows : []) {
        const name = String(r?.name ?? '').normalize('NFKC').trim();
        if (!name) continue;
        const cls = String(r?.class ?? '').trim();
        const key = `${fold(cls || '*')}|${fold(name)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        clean.push({ class: cls && cls !== '*' ? cls : '*', name, note: String(r?.note ?? '').trim() });
      }
      await store.saveRoster(clean);
      bumps += 1;
      log.info?.(`[access] register saved: ${clean.length} row(s)`);
      return clean;
    },
  };
}
