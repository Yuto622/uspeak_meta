// 幼児モードの 置き場 — DATA_DIR/kids-mode.json。{ classes: { '<クラス>': { on, students: { '<名前>': 'on' | 'off' } } } }
// クラスごとの 既定（オン／オフ）と、子どもごとの 上書き（オン・オフ・クラスと おなじ）。画面の 出し分けだけに 使う
// （判定・コイン・記録は ふつうの モードと 同じ）。かえると version が 上がり、部屋が 入ったままの 子に とどける。
import fs from 'node:fs/promises';
import { writeJsonFile } from '../store/write-json.js';

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase();
export const KIDS_MODES = ['inherit', 'on', 'off'];
const MAX_CLASSES = 500;
const MAX_STUDENTS = 400;

export class KidsStore {
  constructor(file, { log = console } = {}) { this.file = file; this.log = log; this.classes = {}; this.version = 0; }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        for (const [code, v] of Object.entries(raw.classes || {}).slice(0, MAX_CLASSES)) {
          const students = {};
          for (const [n, m] of Object.entries(v?.students || {}).slice(0, MAX_STUDENTS)) if (m === 'on' || m === 'off') students[fold(n)] = m;
          if (fold(code)) this.classes[fold(code)] = { on: v?.on === true, students };
        }
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn?.('[kids] could not read', this.file, err.message); }
    }
    return this;
  }

  // その クラスの 設定（なければ 既定：オフ・上書き なし）。
  classOf(classCode) { const c = this.classes[fold(classCode)]; return { on: !!c?.on, students: { ...(c?.students || {}) } }; }
  modeOf(classCode, name) { return this.classes[fold(classCode)]?.students?.[fold(name)] || 'inherit'; }
  // この 子は 幼児モードか。上書きが あれば それ、なければ クラスの 既定。
  isKids(classCode, name) {
    const c = this.classes[fold(classCode)];
    if (!c) return false;
    const m = c.students?.[fold(name)];
    return m === 'on' ? true : m === 'off' ? false : !!c.on;
  }

  async setClass(classCode, on) {
    const code = fold(classCode);
    if (!code) return false;
    if (!this.classes[code] && Object.keys(this.classes).length >= MAX_CLASSES) return false;
    (this.classes[code] ||= { on: false, students: {} }).on = on === true;
    await this.save();
    return true;
  }
  async setStudent(classCode, name, mode) {
    const code = fold(classCode); const n = fold(name);
    if (!code || !n || !KIDS_MODES.includes(mode)) return false;
    const c = (this.classes[code] ||= { on: false, students: {} });
    if (mode === 'inherit') delete c.students[n];
    else { if (!c.students[n] && Object.keys(c.students).length >= MAX_STUDENTS) return false; c.students[n] = mode; }
    await this.save();
    return true;
  }

  async save() {
    this.version += 1;
    if (!this.file) return;
    await writeJsonFile(this.file, JSON.stringify({ version: 1, updatedAt: Date.now(), classes: this.classes }));
  }
}
