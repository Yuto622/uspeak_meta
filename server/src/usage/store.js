// 使用履歴の 置き場 — DATA_DIR/usage.json（STORE_BACKEND=memory では ファイルなし）。
//   { version: 1, students: { '<クラス>|<名前>': { c, n, d: { 'YYYY-MM-DD': 箱 }, s: [ 1 回ずつの 入室 ] } } }
// 箱の 中身と きまりは usage.js。ここは「部屋の tick → 箱」と 読み書き・消す・古い 日を すてる だけ。
//
// 部屋（ClassRoom）から 呼ぶ 口：
//   join(sid, classCode, name, { device })   入った（回数・端末）
//   sample(sid, classCode, name, { active, space })  1 秒ごと（つながって いる 子）
//   count(sid, patch)                        答え・AI・チャット・買いもの・XP・コイン
//   end(sid)                                 出た（入室の 記録を とじる）
// 先生（role=teacher）は 部屋の ほうで 呼ばない。
import fs from 'node:fs/promises';
import { writeJsonFile } from '../store/write-json.js';
import { KEEP_DAYS, SESSION_CAP, PATH_CAP, blankDay, sampleDay, countDay, sanitizeDay, sanitizeSession, spaceKey, dayKey, addDays } from './usage.js';

export const usageKey = (classCode, name) => `${String(classCode ?? '').normalize('NFKC').toLowerCase().trim()}|${String(name ?? '').normalize('NFKC').trim()}`;
const SAVE_MS = 60_000;

export class UsageStore {
  constructor(file, { log = console, now = Date.now, keepDays = KEEP_DAYS } = {}) {
    this.file = file; this.log = log; this.now = now; this.keepDays = Math.min(KEEP_DAYS, keepDays > 0 ? keepDays : KEEP_DAYS);
    this.students = Object.create(null);
    this.open = new Map(); // sid -> { key, sess }
    this.dirty = false; this.timer = null; this.trimmedDay = '';
  }

  async init({ autosave = true } = {}) {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        for (const [k, v] of Object.entries(raw?.students || {})) {
          if (!v || typeof v !== 'object' || !k.includes('|')) continue;
          const d = Object.create(null);
          for (const [day, b] of Object.entries(v.d || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(day)) d[day] = sanitizeDay(b);
          this.students[k] = { c: String(v.c ?? k.split('|')[0]).slice(0, 40), n: String(v.n ?? k.slice(k.indexOf('|') + 1)).slice(0, 40), d, s: (Array.isArray(v.s) ? v.s : []).map(sanitizeSession).filter(Boolean).slice(-SESSION_CAP) };
        }
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn?.('[usage] could not read', this.file, err.message); }
    }
    this.trim();
    if (autosave && this.file) { this.timer = setInterval(() => { this.trim(); this.save().catch((err) => this.log.warn?.('[usage] save failed:', err.message)); }, SAVE_MS); this.timer.unref?.(); }
    return this;
  }

  entry(classCode, name) {
    const k = usageKey(classCode, name);
    return (this.students[k] ||= { c: String(classCode ?? '').slice(0, 40), n: String(name ?? '').slice(0, 40), d: Object.create(null), s: [] });
  }
  dayOf(st, now) { const k = dayKey(now); return (st.d[k] ||= blankDay()); }
  peek(classCode, name) { return this.students[usageKey(classCode, name)] || null; }
  list() { return Object.entries(this.students).map(([key, v]) => ({ key, ...v })); }

  // ---- 部屋から ---------------------------------------------------------------------------
  join(sid, classCode, name, { device = 'pc', now = this.now() } = {}) {
    this.end(sid, now);
    const st = this.entry(classCode, name);
    const day = this.dayOf(st, now);
    day.lg += 1; day.dv[device] = (day.dv[device] || 0) + 1;
    if (!day.f || now < day.f) day.f = now;
    if (now > day.l) day.l = now;
    const sess = { a: now, b: now, on: 0, act: 0, dv: device, p: [], more: 0 };
    st.s.push(sess);
    if (st.s.length > SESSION_CAP) st.s.splice(0, st.s.length - SESSION_CAP);
    this.open.set(sid, { key: usageKey(classCode, name), sess });
    this.dirty = true;
    return sess;
  }

  sample(sid, classCode, name, { active = false, space = '', sec = 1, now = this.now() } = {}) {
    let o = this.open.get(sid);
    // join を 通らずに 来た（再起動の あとの つなぎなおし など）：入室を ひらく が 回数には 数えない。
    if (!o || o.key !== usageKey(classCode, name)) {
      const st = this.entry(classCode, name);
      const sess = { a: now, b: now, on: 0, act: 0, dv: 'pc', p: [], more: 0 };
      st.s.push(sess); if (st.s.length > SESSION_CAP) st.s.splice(0, st.s.length - SESSION_CAP);
      o = { key: usageKey(classCode, name), sess }; this.open.set(sid, o);
    }
    const st = this.students[o.key] || this.entry(classCode, name);
    sampleDay(this.dayOf(st, now), { sec, active, space, now });
    const s = o.sess; s.b = now; s.on += sec; if (active) s.act += sec;
    const k = spaceKey(space);
    if (s.p[s.p.length - 1] !== k) { if (s.p.length < PATH_CAP) s.p.push(k); else s.more += 1; }
    this.dirty = true;
  }

  count(sid, patch = {}, now = this.now()) {
    const o = this.open.get(sid); if (!o) return false;
    const st = this.students[o.key]; if (!st) return false;
    countDay(this.dayOf(st, now), patch, now);
    this.dirty = true;
    return true;
  }

  end(sid, now = this.now()) {
    const o = this.open.get(sid); if (!o) return;
    this.open.delete(sid);
    if (now > o.sess.b && now - o.sess.b < 5000) o.sess.b = now;
    // 何も なかった 入室（0 秒）は のこさない
    const st = this.students[o.key];
    if (st && o.sess.on === 0) { const i = st.s.indexOf(o.sess); if (i >= 0) st.s.splice(i, 1); }
    this.dirty = true;
  }
  endAll(now = this.now()) { for (const sid of [...this.open.keys()]) this.end(sid, now); }

  // ---- 個人情報 -----------------------------------------------------------------------------
  // 1 人ぶん 消す（privacy.js の eraseStudent）。ひらいて いる 入室も わすれる。
  async erase(classCode, name) {
    const k = usageKey(classCode, name);
    for (const [sid, o] of this.open) if (o.key === k) this.open.delete(sid);
    if (!this.students[k]) return 0;
    delete this.students[k];
    this.dirty = true;
    await this.save();
    return 1;
  }

  // 保持期間：日の 箱と 入室の 記録を 日付で すてる。**どんな 設定でも 400 日を こえて 持たない。**
  trim({ maxAgeMs = 0, now = this.now() } = {}) {
    const days = Math.min(this.keepDays, maxAgeMs > 0 ? Math.ceil(maxAgeMs / 86400000) : this.keepDays);
    const cutoffDay = addDays(dayKey(now), -(days - 1));
    const cutoffMs = now - days * 86400000;
    const n = { days: 0, sessions: 0, students: 0 };
    for (const [k, st] of Object.entries(this.students)) {
      for (const day of Object.keys(st.d)) if (day < cutoffDay) { delete st.d[day]; n.days += 1; }
      const before = st.s.length; st.s = st.s.filter((s) => s.b >= cutoffMs); n.sessions += before - st.s.length;
      if (!Object.keys(st.d).length && !st.s.length && ![...this.open.values()].some((o) => o.key === k)) { delete this.students[k]; n.students += 1; }
    }
    if (n.days || n.sessions || n.students) this.dirty = true;
    this.trimmedDay = dayKey(now);
    return n;
  }
  async prune({ maxAgeMs = 0, now = this.now() } = {}) { const n = this.trim({ maxAgeMs, now }); await this.save(); return n; }

  async save() {
    if (!this.dirty) return;
    this.dirty = false;
    if (!this.file) return;
    await writeJsonFile(this.file, JSON.stringify({ version: 1, updatedAt: this.now(), students: this.students }));
  }
  async close() { clearInterval(this.timer); this.timer = null; this.endAll(); await this.save(); }
}
