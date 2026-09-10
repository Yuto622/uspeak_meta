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
  PLAYER_COLUMNS, LEARNING_COLUMNS, COIN_COLUMNS, playerKey, recordToRow, rowToRecord,
} from './records.js';

export const SHEETS = { players: 'players', learning: 'learning_log', coins: 'coin_log' };
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
  }

  async init() {
    const titles = await this.api.getSheetTitles();
    for (const [name, columns] of [[SHEETS.players, PLAYER_COLUMNS], [SHEETS.learning, LEARNING_COLUMNS], [SHEETS.coins, COIN_COLUMNS]]) {
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

  get pendingCount() { return this.pendingPlayers.size + this.pendingLearning.length + this.pendingCoins.length; }

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
