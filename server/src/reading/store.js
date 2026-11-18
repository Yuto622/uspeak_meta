// よみもの島の 記録の 置き場 — DATA_DIR/reading.json。{ students: { '<クラス>|<名前>': { books: {…}, day, dayCoins } } }
// きまり（✓・★・コイン）は game/reading.js、ここは 読んで 書くだけ。書きこみは write-json が 1 本ずつ 順番に する。
import fs from 'node:fs/promises';
import { writeJsonFile } from '../store/write-json.js';
import { blankProgress, sanitizeProgress, bookById, artPath, ART_VERSION } from '../game/reading.js';

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
  // 先生の 表・保護者レポート用の まとめ：✓ の 冊数・読んだ 語数・さいごに 読んだ 本・さいきんの ✓ の 本（新しい 順）。答えは 入らない。
  summaryOf(classCode, name) {
    const p = this.peek(classCode, name);
    const done = []; let lastAt = 0; let last = null;
    for (const [id, e] of Object.entries(p?.books || {})) {
      const b = bookById(id); if (!b) continue;
      if ((e.at || 0) >= lastAt && (e.listen || e.read || e.quiz !== null)) { lastAt = e.at || 0; last = { id, title: b.title, titleJa: b.titleJa, at: e.at || 0, done: !!e.done }; }
      if (e.done) done.push({ id, title: b.title, titleJa: b.titleJa, stage: b.stage, words: b.words, at: e.at || 0, cover: `${artPath(id)}/0.svg?v=${ART_VERSION}&still=1` });
    }
    done.sort((x, y) => y.at - x.at);
    return { books: done.length, words: done.reduce((n, b) => n + b.words, 0), last, list: done.slice(0, 8) };
  }
  async erase(classCode, name) { const k = key(classCode, name); if (!this.students[k]) return false; delete this.students[k]; await this.save(); return true; }

  async save() {
    if (!this.file) return;
    await writeJsonFile(this.file, JSON.stringify({ version: 1, updatedAt: Date.now(), students: this.students }));
  }
}
