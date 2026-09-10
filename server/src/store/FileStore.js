// JSON-file persistence for local development and tests (pass filePath=null for memory only).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { playerKey } from './records.js';

const MAX_LOG_ROWS = 50000;

export class FileStore {
  constructor(filePath, { log = console } = {}) {
    this.filePath = filePath;
    this.log = log;
    this.data = { players: {}, learning: [], coins: [] };
    this.dirty = false;
    this.name = filePath ? `file:${filePath}` : 'memory';
  }

  async init() {
    if (!this.filePath) return;
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') this.data = { players: {}, learning: [], coins: [], ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') this.log.warn('[store:file] could not read store file, starting empty:', err.message);
    }
  }

  async loadPlayer(classCode, name) {
    const record = this.data.players[playerKey(classCode, name)];
    return record ? { ...record } : null;
  }

  // The class register, kept beside the store as its own file so a teacher can edit it
  // with a text editor and nothing else has to be running. Re-read when it changes on
  // disk, so a name added mid-lesson takes effect without a restart.
  //
  // Shape: {"classes": {"6-1": ["Aki", "Ben"]}} or a flat [{class, name}] list.
  async listRoster(classCode) {
    if (!this.filePath) return this.memoryRoster?.filter((r) => r.class === classCode) ?? null;
    const file = path.join(path.dirname(this.filePath), 'roster.json');
    let stat;
    try { stat = await fs.stat(file); } catch { return null; }
    if (!this.rosterAt || this.rosterAt !== stat.mtimeMs) {
      try {
        const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
        const rows = [];
        if (Array.isArray(parsed)) {
          for (const r of parsed) if (r?.class && r?.name) rows.push({ class: String(r.class), name: String(r.name), note: String(r.note ?? '') });
        } else if (parsed && typeof parsed.classes === 'object') {
          for (const [cls, names] of Object.entries(parsed.classes)) {
            for (const name of Array.isArray(names) ? names : []) rows.push({ class: String(cls), name: String(name), note: '' });
          }
        }
        this.roster = rows;
        this.rosterAt = stat.mtimeMs;
      } catch (err) {
        this.log.warn('[store:file] roster.json could not be read:', err.message);
        return this.roster ? this.roster.filter((r) => r.class === classCode) : null;
      }
    }
    return this.roster.filter((r) => r.class === classCode);
  }

  // Every record for one class, which is what the weekly board ranks.
  listClass(classCode) {
    return Object.values(this.data.players).filter((r) => r && r.class === classCode).map((r) => ({ ...r }));
  }

  savePlayer(record) {
    this.data.players[playerKey(record.class, record.name)] = { ...record };
    this.dirty = true;
  }

  appendLearning(row) {
    this.data.learning.push(row);
    if (this.data.learning.length > MAX_LOG_ROWS) this.data.learning.splice(0, this.data.learning.length - MAX_LOG_ROWS);
    this.dirty = true;
  }

  appendCoin(row) {
    this.data.coins.push(row);
    if (this.data.coins.length > MAX_LOG_ROWS) this.data.coins.splice(0, this.data.coins.length - MAX_LOG_ROWS);
    this.dirty = true;
  }

  async flush() {
    if (!this.dirty || !this.filePath) { this.dirty = false; return; }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data));
    await fs.rename(tmp, this.filePath);
    this.dirty = false;
  }

  async close() { await this.flush(); }
}
