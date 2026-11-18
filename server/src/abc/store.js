// 「ABC と おと」の 置き場 — DATA_DIR/abc.json。{ students: { '<クラス>|<名前>': 記録 }, settings: { '<クラス>': { caseFirst, accent, order } } }
// きまりは game/abc.js、ここは 読んで 書くだけ。設定（大文字・小文字の どちらから／アメリカ式・イギリス式／おとの 順番）は 運営だけが かえる。
import fs from 'node:fs/promises';
import { writeJsonFile } from '../store/write-json.js';
import { blankProgress, sanitizeProgress, sanitizeSettings, DEFAULT_SETTINGS } from '../game/abc.js';

const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase().trim();
const key = (classCode, name) => `${fold(classCode)}|${String(name ?? '').normalize('NFKC').trim()}`;
const MAX_CLASSES = 500;

export class AbcStore {
  constructor(file, { log = console } = {}) { this.file = file; this.log = log; this.students = {}; this.settings = {}; }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        for (const [k, v] of Object.entries(raw.students || {})) this.students[k] = sanitizeProgress(v);
        for (const [k, v] of Object.entries(raw.settings || {}).slice(0, MAX_CLASSES)) if (fold(k)) this.settings[fold(k)] = sanitizeSettings(v);
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn?.('[abc] could not read', this.file, err.message); }
    }
    return this;
  }

  of(classCode, name) { return (this.students[key(classCode, name)] ||= blankProgress()); }
  peek(classCode, name) { return this.students[key(classCode, name)] || null; }
  async erase(classCode, name) { const k = key(classCode, name); if (!this.students[k]) return false; delete this.students[k]; await this.save(); return true; }

  // その クラスの 設定（なければ 初期値：大文字と 小文字を いっしょに・アメリカ式・データの 順番）。
  settingsOf(classCode) { return this.settings[fold(classCode)] || { ...DEFAULT_SETTINGS }; }
  listSettings() { return Object.entries(this.settings).map(([code, s]) => ({ code, ...s })).sort((a, b) => a.code.localeCompare(b.code)); }
  async setSettings(classCode, raw) {
    const code = fold(classCode);
    if (!code || code.length > 40) return null;
    if (!this.settings[code] && Object.keys(this.settings).length >= MAX_CLASSES) return null;
    this.settings[code] = sanitizeSettings(raw);
    await this.save();
    return this.settings[code];
  }
  async clearSettings(classCode) { const code = fold(classCode); if (!this.settings[code]) return false; delete this.settings[code]; await this.save(); return true; }

  async save() {
    if (!this.file) return;
    await writeJsonFile(this.file, JSON.stringify({ version: 1, updatedAt: Date.now(), students: this.students, settings: this.settings }));
  }
}
