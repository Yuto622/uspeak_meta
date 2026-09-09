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
