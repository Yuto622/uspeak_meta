// Google Sheets persistence.
//
// Design notes (the Sheets API is slow and rate limited: ~60 write requests/min/user):
//  * The room keeps the authoritative state in memory; this store is write-behind.
//  * Writes are queued and flushed every STORE_FLUSH_MS using at most four requests
//    per flush (batchUpdate + append for player rows, one append per log sheet).
//  * The players tab is cached in memory and refreshed lazily, so joins are fast.
//  * Failures keep the queue and retry on the next flush; nothing is lost while the
//    process is alive. The queue is capped so a long outage cannot exhaust memory.
import {
  PLAYER_COLUMNS, LEARNING_COLUMNS, COIN_COLUMNS, ROSTER_COLUMNS, playerKey, recordToRow, rowToRecord,
  ROBLOX_EVENT_COLUMNS, WALLET_ENTRY_COLUMNS, WALLET_SNAPSHOT_COLUMNS, METRIC_COLUMNS, ROBLOX_LINK_COLUMNS,
} from './records.js';
import { parseRosterRows, rowsForClass } from './roster-sheet.js';
import { SheetTable, SheetList } from './sheet-table.js';
import { eventMatches, sameUser } from './FileStore.js';

export const SHEETS = {
  players: 'players', learning: 'learning_log', coins: 'coin_log', roster: 'roster',
  // Roblox 連携（docs/ROBLOX_SYNC.md）
  events: 'roblox_events', entries: 'wallet_entries', snapshots: 'wallet_snapshots', metrics: 'metric_definitions', links: 'roblox_links',
};
const MAX_PENDING_ROWS = 20000;
const CACHE_TTL_MS = 30000;

const columnLetter = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
const lastCol = columnLetter(PLAYER_COLUMNS.length);

export class SheetsStore {
  // api: { getSheetTitles, addSheet, getValues, update, batchUpdate, append } (see createSheetsApi).
  constructor(api, { log = console, now = Date.now } = {}) {
    this.api = api;
    this.log = log;
    this.now = now;
    this.name = 'google-sheets';
    this.cache = new Map(); // key -> { rowIndex (1-based, 0 = unsaved), record }
    this.cacheLoadedAt = 0;
    this.pendingPlayers = new Map(); // key -> record
    this.pendingLearning = [];
    this.pendingCoins = [];
    this.flushing = null;
    this.stats = { flushes: 0, failures: 0, rowsWritten: 0 };
    // Roblox 連携のタブ。学習の記録は追記だけ、コインの行は配達済みの印を書き戻す、
    // 残高は名前につき1行。定義と紐づけは管理ページが丸ごと保存する小さな表。
    this.events = new SheetTable(api, { name: SHEETS.events, columns: ROBLOX_EVENT_COLUMNS, keyOf: (r) => r.id, numeric: ['ts'], log });
    this.entries = new SheetTable(api, { name: SHEETS.entries, columns: WALLET_ENTRY_COLUMNS, keyOf: (r) => r.id, numeric: ['amount'], log });
    this.snapshots = new SheetTable(api, { name: SHEETS.snapshots, columns: WALLET_SNAPSHOT_COLUMNS, keyOf: (r) => String(r.username).toLowerCase(), numeric: ['balance'], log });
    this.metrics = new SheetList(api, { name: SHEETS.metrics, columns: METRIC_COLUMNS, log, now });
    this.links = new SheetList(api, { name: SHEETS.links, columns: ROBLOX_LINK_COLUMNS, log, now });
  }

  async init() {
    const titles = await this.api.getSheetTitles();
    for (const [name, columns] of [[SHEETS.players, PLAYER_COLUMNS], [SHEETS.learning, LEARNING_COLUMNS], [SHEETS.coins, COIN_COLUMNS], [SHEETS.roster, ROSTER_COLUMNS]]) {
      if (!titles.includes(name)) {
        await this.api.addSheet(name);
        await this.api.update(`${name}!A1`, [columns]);
      } else {
        const header = (await this.api.getValues(`${name}!1:1`))[0] || [];
        if (!header.length) {
          await this.api.update(`${name}!A1`, [columns]);
        } else if (header.length < columns.length && columns.slice(0, header.length).every((c, i) => c === header[i])) {
          // Columns are only ever appended, so a short header means this sheet predates
          // some fields. Extend it rather than leaving the new values unlabelled.
          await this.api.update(`${name}!A1`, [columns]);
          this.log.info?.(`[sheets] ${name}: header extended to ${columns.length} columns`);
        } else if (header.length !== columns.length || !columns.every((c, i) => c === header[i])) {
          this.log.warn?.(`[sheets] ${name}: header does not match the expected columns; leaving it alone. expected=${columns.join(',')} found=${header.join(',')}`);
        }
      }
    }
    await this.refreshCache();
    for (const t of [this.events, this.entries, this.snapshots, this.metrics, this.links]) await t.init();
  }

  async refreshCache() {
    const rows = await this.api.getValues(`${SHEETS.players}!A2:${lastCol}`);
    const fresh = new Map();
    rows.forEach((row, i) => {
      if (!row || !row[0]) return;
      const record = rowToRecord(row, PLAYER_COLUMNS);
      fresh.set(playerKey(record.class, record.name), { rowIndex: i + 2, record });
    });
    // Keep entries that only exist locally (not yet appended).
    for (const [key, entry] of this.cache) if (!fresh.has(key) && entry.rowIndex === 0) fresh.set(key, entry);
    this.cache = fresh;
    this.cacheLoadedAt = this.now();
  }

  async loadPlayer(classCode, name) {
    const key = playerKey(classCode, name);
    if (this.pendingPlayers.has(key)) return { ...this.pendingPlayers.get(key) };
    if (this.now() - this.cacheLoadedAt > CACHE_TTL_MS) {
      try { await this.refreshCache(); } catch (err) { this.log.warn('[store:sheets] cache refresh failed:', err.message); }
    }
    const entry = this.cache.get(key);
    return entry ? { ...entry.record } : null;
  }

  // The class register, read straight from its tab. The gate caches it, so this is a
  // few reads an hour rather than one per child arriving.
  async listRoster(classCode) {
    return rowsForClass(await this.listAllRoster(), classCode);
  }

  async listAllRoster() {
    return parseRosterRows(await this.api.getValues(`${SHEETS.roster}!A1:D`));
  }

  // Replace the roster tab (the admin page's save): header, the rows, and blanks over
  // whatever longer list was there before.
  async saveRoster(rows) {
    const before = (await this.api.getValues(`${SHEETS.roster}!A1:D`)).length;
    const values = [ROSTER_COLUMNS, ...rows.filter((r) => r && r.name).map((r) => [r.class && r.class !== '*' ? String(r.class) : '', String(r.name), String(r.note ?? ''), r.teacher ? 'TRUE' : 'FALSE'])];
    while (values.length < before) values.push(['', '', '', '']);
    await this.api.update(`${SHEETS.roster}!A1`, values);
    this.rosterVersion = (this.rosterVersion || 0) + 1;
  }

  // Every cached record for one class, which is what the weekly board ranks. Reads the
  // cache rather than the sheet: the board is refreshed on a timer, not per request.
  listClass(classCode) {
    const out = [];
    for (const { record } of this.cache.values()) if (record && record.class === classCode) out.push({ ...record });
    return out;
  }

  savePlayer(record) {
    const key = playerKey(record.class, record.name);
    const copy = { ...record };
    this.pendingPlayers.set(key, copy);
    const entry = this.cache.get(key);
    if (entry) entry.record = copy; else this.cache.set(key, { rowIndex: 0, record: copy });
  }

  appendLearning(row) { this.queueRow(this.pendingLearning, row); }
  appendCoin(row) { this.queueRow(this.pendingCoins, row); }

  queueRow(list, row) {
    list.push(row);
    if (list.length > MAX_PENDING_ROWS) {
      list.splice(0, list.length - MAX_PENDING_ROWS);
      this.log.warn('[store:sheets] pending log queue capped; oldest rows dropped');
    }
  }

  get pendingCount() {
    return this.pendingPlayers.size + this.pendingLearning.length + this.pendingCoins.length
      + this.events.pendingCount + this.entries.pendingCount + this.snapshots.pendingCount;
  }

  // ---- Roblox 連携（FileStore と同じ口）---------------------------------------------
  appendRobloxEvents(rows) {
    let accepted = 0; let duplicates = 0;
    for (const row of rows) {
      if (!row?.id || this.events.has(row.id)) { duplicates += 1; continue; }
      this.events.put(row);
      accepted += 1;
    }
    return { accepted, duplicates };
  }

  async listRobloxEvents(filter = {}) {
    return this.events.all().filter((e) => eventMatches(e, filter));
  }

  addWalletEntry(entry) { this.entries.put({ ...entry, delivered_at: entry.delivered_at || '' }); }

  async listWalletEntries({ username = '', undelivered = false } = {}) {
    return this.entries.all().filter((e) => (!username || sameUser(e.username, username)) && (!undelivered || !e.delivered_at));
  }

  async ackWalletEntries(ids, deliveredAt) {
    let n = 0;
    for (const id of ids) {
      const e = this.entries.get(id);
      if (!e || e.delivered_at) continue;
      this.entries.put({ ...e, delivered_at: deliveredAt });
      n += 1;
    }
    return n;
  }

  saveWalletSnapshot(snapshot) { this.snapshots.put(snapshot); }
  async getWalletSnapshot(username) { return this.snapshots.get(String(username).toLowerCase()); }
  async listMetrics() { return this.metrics.list(); }
  async saveMetrics(rows) { return this.metrics.save(rows); }
  async listRobloxLinks() { return this.links.list(); }
  async saveRobloxLinks(rows) { return this.links.save(rows); }

  async flush() {
    if (this.flushing) return this.flushing;
    if (!this.pendingCount) return;
    this.flushing = this.flushNow().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  async flushNow() {
    this.stats.flushes++;
    // 1. Player rows: updates for known rows, appends for new ones.
    const players = [...this.pendingPlayers.entries()];
    this.pendingPlayers.clear();
    const updates = [];
    const appends = [];
    for (const [key, record] of players) {
      const entry = this.cache.get(key);
      if (entry && entry.rowIndex > 0) updates.push({ range: `${SHEETS.players}!A${entry.rowIndex}:${lastCol}${entry.rowIndex}`, values: [recordToRow(record, PLAYER_COLUMNS)] });
      else appends.push({ key, record });
    }
    try {
      if (updates.length) { await this.api.batchUpdate(updates); this.stats.rowsWritten += updates.length; }
      if (appends.length) {
        const updatedRange = await this.api.append(`${SHEETS.players}!A:${lastCol}`, appends.map((a) => recordToRow(a.record, PLAYER_COLUMNS)));
        const first = parseFirstRow(updatedRange);
        appends.forEach((a, i) => {
          const entry = this.cache.get(a.key) || { rowIndex: 0, record: a.record };
          if (first) entry.rowIndex = first + i;
          this.cache.set(a.key, entry);
        });
        this.stats.rowsWritten += appends.length;
      }
    } catch (err) {
      this.stats.failures++;
      this.log.warn('[store:sheets] player flush failed, will retry:', err.message);
      for (const [key, record] of players) if (!this.pendingPlayers.has(key)) this.pendingPlayers.set(key, record);
    }
    // 2. Logs.
    for (const [list, sheet] of [[this.pendingLearning, SHEETS.learning], [this.pendingCoins, SHEETS.coins]]) {
      if (!list.length) continue;
      const rows = list.splice(0, list.length);
      try {
        await this.api.append(`${sheet}!A:${columnLetter(rows[0].length)}`, rows);
        this.stats.rowsWritten += rows.length;
      } catch (err) {
        this.stats.failures++;
        this.log.warn(`[store:sheets] ${sheet} flush failed, will retry:`, err.message);
        list.unshift(...rows);
      }
    }
    // 3. Roblox 連携のタブ。
    for (const t of [this.events, this.entries, this.snapshots]) {
      const before = t.stats.failures;
      await t.flush();
      this.stats.rowsWritten += 0; // counted on the table itself
      if (t.stats.failures > before) this.stats.failures++;
    }
  }

  async close() {
    try { await this.flush(); } catch (err) { this.log.warn('[store:sheets] final flush failed:', err.message); }
  }
}

function parseFirstRow(updatedRange) {
  // e.g. "players!A12:P13" -> 12
  const m = /![A-Z]+(\d+)/.exec(updatedRange || '');
  return m ? Number(m[1]) : 0;
}
