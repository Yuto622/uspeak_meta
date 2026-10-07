// A keyed tab in the Google Sheet, cached in memory and written behind (the same shape as
// the `players` tab in SheetsStore, kept separate so the Roblox tabs can share it).
//
//  * `load()` reads the whole tab once; `put()` updates the cache and queues the row.
//  * `flush()` writes queued rows in at most two requests (batchUpdate for rows the sheet
//    already has, one append for new ones). Failures keep the queue for the next flush.
//  * A tab of append-only rows (events) simply never sees a `put` for a known key.
import { recordToRow, rowToRecord } from './records.js';

const columnLetter = (n) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export async function ensureHeader(api, name, columns, log = console) {
  const titles = await api.getSheetTitles();
  if (!titles.includes(name)) {
    await api.addSheet(name);
    await api.update(`${name}!A1`, [columns]);
    return true;
  }
  const header = (await api.getValues(`${name}!1:1`))[0] || [];
  if (!header.length) { await api.update(`${name}!A1`, [columns]); return true; }
  if (header.length < columns.length && columns.slice(0, header.length).every((c, i) => c === header[i])) {
    await api.update(`${name}!A1`, [columns]);
    log.info?.(`[sheets] ${name}: header extended to ${columns.length} columns`);
  } else if (header.length !== columns.length || !columns.every((c, i) => c === header[i])) {
    log.warn?.(`[sheets] ${name}: header does not match the expected columns; leaving it alone. expected=${columns.join(',')} found=${header.join(',')}`);
  }
  return false;
}

export class SheetTable {
  constructor(api, { name, columns, keyOf, numeric = [], log = console }) {
    this.api = api;
    this.name = name;
    this.columns = columns;
    this.keyOf = keyOf;
    this.numeric = numeric;
    this.log = log;
    this.lastCol = columnLetter(columns.length);
    this.cache = new Map(); // key -> { rowIndex (1-based, 0 = not yet on the sheet), record }
    this.pending = new Map(); // key -> record
    this.stats = { failures: 0, rowsWritten: 0 };
  }

  async init() {
    await ensureHeader(this.api, this.name, this.columns, this.log);
    await this.load();
  }

  async load() {
    const rows = await this.api.getValues(`${this.name}!A2:${this.lastCol}`);
    const fresh = new Map();
    rows.forEach((row, i) => {
      if (!row || !row[0]) return;
      const record = this.parse(row);
      fresh.set(this.keyOf(record), { rowIndex: i + 2, record });
    });
    for (const [key, entry] of this.cache) if (!fresh.has(key) && entry.rowIndex === 0) fresh.set(key, entry);
    this.cache = fresh;
  }

  parse(row) {
    const record = rowToRecordPlain(row, this.columns);
    for (const key of this.numeric) { const n = Number(record[key]); record[key] = Number.isFinite(n) ? n : 0; }
    return record;
  }

  has(key) { return this.cache.has(key); }
  get(key) { const e = this.cache.get(key); return e ? { ...e.record } : null; }
  all() { return [...this.cache.values()].map((e) => ({ ...e.record })); }
  get size() { return this.cache.size; }

  put(record) {
    const key = this.keyOf(record);
    const copy = { ...record };
    this.pending.set(key, copy);
    const entry = this.cache.get(key);
    if (entry) entry.record = copy; else this.cache.set(key, { rowIndex: 0, record: copy });
  }

  get pendingCount() { return this.pending.size; }

  async flush() {
    if (!this.pending.size) return;
    const items = [...this.pending.entries()];
    this.pending.clear();
    const updates = [];
    const appends = [];
    for (const [key, record] of items) {
      const entry = this.cache.get(key);
      if (entry && entry.rowIndex > 0) updates.push({ range: `${this.name}!A${entry.rowIndex}:${this.lastCol}${entry.rowIndex}`, values: [recordToRow(record, this.columns)] });
      else appends.push({ key, record });
    }
    try {
      if (updates.length) { await this.api.batchUpdate(updates); this.stats.rowsWritten += updates.length; }
      if (appends.length) {
        const updatedRange = await this.api.append(`${this.name}!A:${this.lastCol}`, appends.map((a) => recordToRow(a.record, this.columns)));
        const m = /![A-Z]+(\d+)/.exec(updatedRange || '');
        const first = m ? Number(m[1]) : 0;
        appends.forEach((a, i) => {
          const entry = this.cache.get(a.key) || { rowIndex: 0, record: a.record };
          if (first) entry.rowIndex = first + i;
          this.cache.set(a.key, entry);
        });
        this.stats.rowsWritten += appends.length;
      }
    } catch (err) {
      this.stats.failures += 1;
      this.log.warn(`[store:sheets] ${this.name} flush failed, will retry:`, err.message);
      for (const [key, record] of items) if (!this.pending.has(key)) this.pending.set(key, record);
    }
  }
}

// rowToRecord in records.js also coerces the player columns; the Roblox tabs keep strings.
function rowToRecordPlain(row, columns) {
  const record = {};
  columns.forEach((c, i) => { record[c] = row[i] ?? ''; });
  return record;
}

// A small tab that is read whole and written whole (metric definitions, the Roblox links):
// the admin page saves the list, the way the roster tab is saved.
export class SheetList {
  constructor(api, { name, columns, log = console, now = Date.now, ttlMs = 30000 }) {
    this.api = api; this.name = name; this.columns = columns; this.log = log; this.now = now; this.ttlMs = ttlMs;
    this.lastCol = columnLetter(columns.length);
    this.rows = null; this.loadedAt = 0;
  }

  async init() { await ensureHeader(this.api, this.name, this.columns, this.log); }

  async list() {
    if (this.rows && this.now() - this.loadedAt < this.ttlMs) return this.rows.map((r) => ({ ...r }));
    const values = await this.api.getValues(`${this.name}!A2:${this.lastCol}`);
    this.rows = values.filter((row) => row && row[0]).map((row) => rowToRecordPlain(row, this.columns));
    this.loadedAt = this.now();
    return this.rows.map((r) => ({ ...r }));
  }

  async save(rows) {
    const before = (await this.api.getValues(`${this.name}!A1:${this.lastCol}`)).length;
    const values = [this.columns, ...rows.map((r) => recordToRow(r, this.columns).map((v) => String(v)))];
    while (values.length < before) values.push(this.columns.map(() => ''));
    await this.api.update(`${this.name}!A1`, values);
    this.rows = rows.map((r) => ({ ...r }));
    this.loadedAt = this.now();
  }
}
