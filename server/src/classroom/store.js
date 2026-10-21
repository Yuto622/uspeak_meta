// 教室の パスワード — DATA_DIR/classrooms.json。
//
// { rooms: [{ id, name, classes: ['6-1', …], key, setAt, createdAt }] }
// 英会話教室の 先生が /teacher/homework に パスワード 1 つで 入る。**パスワードで 教室（＝クラスコード）が きまる**ので、
// 先生は クラスコードを 入れなくて いい。表は /admin/classrooms（運営だけ）で 書く。
//
// パスワードは そのまま のこさない：key = HMAC-SHA256(秘密, パスワード)。秘密は REPORT_SECRET（サーバーだけ）。
// 同じ パスワードは 2 つの 教室に つけられない（パスワードで 教室を さがすので）。
import { writeJsonFile } from '../store/write-json.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

const str = (v, max = 60) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const classKey = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
export const MIN_PASSWORD = 8;
// まちがえやすい 文字（0 O 1 l I）を ぬいた 12 文字。
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makePassword(n = 12) {
  const b = randomBytes(n);
  return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join('');
}

export class ClassroomStore {
  constructor(file, { secret, log = console, now = Date.now } = {}) {
    if (!secret) throw new Error('ClassroomStore needs a secret');
    this.file = file; this.secret = secret; this.log = log; this.now = now;
    this.rooms = [];
  }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        this.rooms = Array.isArray(raw.rooms) ? raw.rooms : [];
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn('[classrooms] could not read', this.file, err.message); }
    }
    return this;
  }

  async flush() {
    if (!this.file) return;
    await writeJsonFile(this.file, JSON.stringify({ rooms: this.rooms }));
  }

  keyOf(password) { return createHmac('sha256', this.secret).update(`classroom|${String(password)}`).digest('hex'); }

  // 画面に 出す 形（パスワードの key は 出さない）。
  view(r) { return { id: r.id, name: r.name, classes: r.classes, hasPassword: !!r.key, setAt: r.setAt || 0 }; }
  list() { return this.rooms.map((r) => this.view(r)); }
  get(id) { return this.rooms.find((r) => r.id === id) || null; }

  // 表を まるごと 保存する（/admin/classrooms）。password が 空なら 前の まま。
  // rows: [{ id?, name, classes: '6-1, 6-2' | [...], password? }]
  async saveAll(rows = []) {
    const out = []; const problems = []; const keys = new Map(); const classes = new Map();
    for (const [i, row] of (Array.isArray(rows) ? rows : []).slice(0, 500).entries()) {
      const prev = row?.id ? this.get(String(row.id)) : null;
      const name = str(row?.name);
      const cls = [...new Set((Array.isArray(row?.classes) ? row.classes : String(row?.classes ?? '').split(/[,、\s]+/)).map(classKey).filter(Boolean))].slice(0, 20);
      const pw = String(row?.password ?? '').trim();
      if (!name && !cls.length && !pw) continue; // からの 行
      if (!name) { problems.push({ index: i, reason: '教室の 名前を 入れて ください' }); continue; }
      if (!cls.length) { problems.push({ index: i, reason: 'クラスコードを 入れて ください' }); continue; }
      if (pw && pw.length < MIN_PASSWORD) { problems.push({ index: i, reason: `パスワードは ${MIN_PASSWORD} 文字 以上に して ください` }); continue; }
      if (pw && /\s/.test(pw)) { problems.push({ index: i, reason: 'パスワードに 空白は 入れられません' }); continue; }
      const key = pw ? this.keyOf(pw) : prev?.key || '';
      if (!key) { problems.push({ index: i, reason: 'パスワードを 入れて ください（「作る」で 作れます）' }); continue; }
      if (keys.has(key)) { problems.push({ index: i, reason: `パスワードが「${keys.get(key)}」と 同じです（教室ごとに ちがう パスワードに して ください）` }); continue; }
      const clash = cls.find((c) => classes.has(c));
      if (clash) { problems.push({ index: i, reason: `クラス「${clash}」は「${classes.get(clash)}」にも あります（1 つの クラスは 1 つの 教室だけ）` }); continue; }
      keys.set(key, name); cls.forEach((c) => classes.set(c, name));
      out.push({ id: prev?.id || randomUUID(), name, classes: cls, key, setAt: pw ? this.now() : prev?.setAt || this.now(), createdAt: prev?.createdAt || this.now() });
    }
    if (problems.length) return { ok: false, error: 'なおす ところが あります', problems };
    this.rooms = out;
    await this.flush();
    return { ok: true, rooms: this.list() };
  }

  // パスワードで 教室を さがす（ログイン）。
  byPassword(password) {
    const pw = String(password ?? '').trim();
    if (!pw) return null;
    const key = this.keyOf(pw);
    return this.rooms.find((r) => r.key && r.key === key) || null;
  }
}
