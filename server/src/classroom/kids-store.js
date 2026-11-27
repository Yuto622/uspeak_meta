// 幼児モードの 置き場 — DATA_DIR/kids-mode.json。{ classes: { '<クラス>': { on, pick?, students: { '<名前>': 'on' | 'off' } } } }
// pick：なまえを えらんで 入る（classroom/join.js）の クラスごとの スイッチ。
// rooms：教室（/admin/classrooms の 1 行＝いくつかの クラス）まとめての QR の スイッチ。{ rooms: { '<教室の id>': true } }
// クラスごとの 既定（オン／オフ）と、子どもごとの 上書き（オン・オフ・クラスと おなじ）。画面の 出し分けだけに 使う
// （判定・コイン・記録は ふつうの モードと 同じ）。かえると version が 上がり、部屋が 入ったままの 子に とどける。
import fs from 'node:fs/promises';
import { writeJsonFile } from '../store/write-json.js';

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase();
export const KIDS_MODES = ['inherit', 'on', 'off'];
const MAX_CLASSES = 500;
const MAX_STUDENTS = 400;

export class KidsStore {
  // 表は 親の ない オブジェクト（クラスや 名前が「__proto__」「constructor」でも Object.prototype を さわらない）。
  constructor(file, { log = console } = {}) { this.file = file; this.log = log; this.classes = Object.create(null); this.rooms = Object.create(null); this.version = 0; }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        for (const [code, v] of Object.entries(raw.classes || {}).slice(0, MAX_CLASSES)) {
          const students = Object.create(null);
          for (const [n, m] of Object.entries(v?.students || {}).slice(0, MAX_STUDENTS)) if (m === 'on' || m === 'off') students[fold(n)] = m;
          if (fold(code)) this.classes[fold(code)] = { on: v?.on === true, students, ...(v?.pick === true ? { pick: true } : {}) };
        }
        for (const [id, v] of Object.entries(raw.rooms || {}).slice(0, MAX_CLASSES)) if (v === true && String(id).length <= 64) this.rooms[String(id)] = true;
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
    (this.classes[code] ||= { on: false, students: Object.create(null) }).on = on === true;
    await this.save();
    return true;
  }
  // なまえを えらんで 入る（classroom/join.js）。はじめは オフ：子どもの なまえを 一覧で 見せるかは 教室が きめる。
  pickOf(classCode) { return this.classes[fold(classCode)]?.pick === true; }
  async setPick(classCode, on) {
    const code = fold(classCode);
    if (!code) return false;
    if (!this.classes[code] && Object.keys(this.classes).length >= MAX_CLASSES) return false;
    const c = (this.classes[code] ||= { on: false, students: Object.create(null) });
    if (on === true) c.pick = true; else delete c.pick;
    await this.save();
    return true;
  }
  // 教室 まとめての QR（いくつかの クラスを 1 つの QR に）。これも はじめは オフ。
  roomPickOf(roomId) { return this.rooms[String(roomId ?? '')] === true; }
  async setRoomPick(roomId, on) {
    const id = String(roomId ?? '').slice(0, 64);
    if (!id) return false;
    if (on === true) this.rooms[id] = true; else delete this.rooms[id];
    await this.save();
    return true;
  }
  async setStudent(classCode, name, mode) {
    const code = fold(classCode); const n = fold(name);
    if (!code || !n || !KIDS_MODES.includes(mode)) return false;
    const c = (this.classes[code] ||= { on: false, students: Object.create(null) });
    if (mode === 'inherit') delete c.students[n];
    else { if (!c.students[n] && Object.keys(c.students).length >= MAX_STUDENTS) return false; c.students[n] = mode; }
    await this.save();
    return true;
  }

  async save() {
    this.version += 1;
    if (!this.file) return;
    await writeJsonFile(this.file, JSON.stringify({ version: 1, updatedAt: Date.now(), classes: this.classes, rooms: this.rooms }));
  }
}
