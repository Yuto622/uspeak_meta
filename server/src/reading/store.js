// よみもの島の 記録の 置き場 — DATA_DIR/reading.json。{ students: { '<クラス>|<名前>': { books: {…}, day, dayCoins } } }
// きまり（✓・★・コイン）は game/reading.js、ここは 読んで 書くだけ。書きこみは write-json が 1 本ずつ 順番に する。
import fs from 'node:fs/promises';
import { writeJsonFile } from '../store/write-json.js';
import { blankProgress, sanitizeProgress } from '../game/reading.js';

const key = (classCode, name) => `${String(classCode ?? '').normalize('NFKC').toLowerCase().trim()}|${String(name ?? '').normalize('NFKC').trim()}`;

export class ReadingStore {
  constructor(file, { log = console } = {}) { this.file = file; this.log = log; this.students = {}; }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        for (const [k, v] of Object.entries(raw.students || {})) this.students[k] = sanitizeProgress(v);
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn?.('[reading] could not read', this.file, err.message); }
    }
    return this;
  }

  // その 子の 記録（なければ 作る）。返した ものを 書きかえて save() する。
  of(classCode, name) { return (this.students[key(classCode, name)] ||= blankProgress()); }
  peek(classCode, name) { return this.students[key(classCode, name)] || null; }
  // クラスの 子ども（先生の 表・レポート用）。
  listClass(classCode) {
    const head = `${key(classCode, '')}`;
    return Object.entries(this.students).filter(([k]) => k.startsWith(head)).map(([k, v]) => ({ name: k.slice(head.length), progress: v }));
  }
  async erase(classCode, name) { const k = key(classCode, name); if (!this.students[k]) return false; delete this.students[k]; await this.save(); return true; }

  async save() {
    if (!this.file) return;
    await writeJsonFile(this.file, JSON.stringify({ version: 1, updatedAt: Date.now(), students: this.students }));
  }
}
