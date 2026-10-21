// ロードマップの 置き場 — DATA_DIR/roadmap.json。
//
// { classes: { '<クラス>' | '*': { start: 'A', stages: { '<段階>': { en, ja, note, words: [...] } } } },
//   students: { '<クラス>|<名前>': { stage, since, paid: ['B', …], history: [{ from, to, at, by }] } } }
// '*' は クラスの 設定が ない ときの 既定（教室ぜんぶ）。段階の 計算は game/roadmap.js、ここは 書いて 読むだけ。
import fs from 'node:fs/promises';
import path from 'node:path';
import { STAGE_IDS, DEFAULT_STAGES } from '../game/roadmap.js';

const str = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const classKey = (s) => {
  const c = String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9_*-]/g, '').slice(0, 24);
  return c || '*';
};
const WORD = /^[a-z][a-z' -]{0,29}$/;
const MAX_WORDS = 400;
const MAX_HISTORY = 40;

export class RoadmapStore {
  constructor(file, { log = console, now = Date.now } = {}) {
    this.file = file; this.log = log; this.now = now;
    this.classes = {}; this.students = {}; this.updatedAt = 0;
  }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        this.classes = raw.classes && typeof raw.classes === 'object' ? raw.classes : {};
        this.students = raw.students && typeof raw.students === 'object' ? raw.students : {};
        this.updatedAt = Number(raw.updatedAt) || 0;
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn('[roadmap] could not read', this.file, err.message); }
    }
    return this;
  }

  async flush() {
    this.updatedAt = this.now();
    if (!this.file) return;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ updatedAt: this.updatedAt, classes: this.classes, students: this.students }));
    await fs.rename(tmp, this.file);
  }

  // その クラスの 設定（無ければ '*'、それも 無ければ null＝既定）。
  settingsFor(classCode) { return this.classes[classKey(classCode)] || this.classes['*'] || null; }

  // /admin/roadmap から。わからない 段階・英語で ない 単語は 捨てる。
  async saveSettings(classCode, input = {}) {
    const key = classKey(classCode);
    const stages = {};
    for (const id of STAGE_IDS) {
      const o = input.stages?.[id];
      if (!o || typeof o !== 'object') continue;
      const d = DEFAULT_STAGES.find((s) => s.id === id);
      const words = (Array.isArray(o.words) ? o.words : String(o.words || '').split(/[\n,、]+/))
        .map((w) => str(w, 30).toLowerCase()).filter((w) => WORD.test(w));
      const row = {};
      if (str(o.en, 40) && str(o.en, 40) !== d.en) row.en = str(o.en, 40);
      if (str(o.ja, 40) && str(o.ja, 40) !== d.ja) row.ja = str(o.ja, 40);
      if (o.note !== undefined && str(o.note, 160) !== d.note) row.note = str(o.note, 160);
      if (words.length) row.words = [...new Set(words)].slice(0, MAX_WORDS);
      if (Object.keys(row).length) stages[id] = row;
    }
    this.classes[key] = { start: STAGE_IDS.includes(input.start) ? input.start : 'A', stages };
    await this.flush();
    return { ok: true, classCode: key, settings: this.classes[key] };
  }
  async removeSettings(classCode) { delete this.classes[classKey(classCode)]; await this.flush(); return { ok: true }; }

  key(classCode, name) { return `${classKey(classCode)}|${str(name, 40)}`; }
  stateOf(classCode, name) { return this.students[this.key(classCode, name)] || null; }

  // 段階を かえる。by = 'auto'（条件を みたした）か 'teacher'。コインは 1 段階 1 回だけ（paid）。
  async setStage(classCode, name, stage, { by = 'teacher' } = {}) {
    if (!STAGE_IDS.includes(stage)) return { ok: false, error: 'unknown stage' };
    const k = this.key(classCode, name);
    const prev = this.students[k];
    const from = prev?.stage || this.startFor(classCode);
    const s = prev || { stage: from, since: 0, paid: [], history: [] };
    if (s.stage === stage && prev) return { ok: true, state: s, changed: false };
    s.stage = stage; s.since = this.now();
    s.history = [...(s.history || []), { from, to: stage, at: this.now(), by }].slice(-MAX_HISTORY);
    let pay = false;
    if (by === 'auto' && !(s.paid || []).includes(stage)) { s.paid = [...(s.paid || []), stage]; pay = true; }
    this.students[k] = s;
    await this.flush();
    return { ok: true, state: s, changed: true, pay };
  }
  // Roblox の 子で クラスが わからない（紐づけの クラスが '*'）とき：その 名前で 保存の ある クラス。
  classOfName(name) {
    const n = `|${str(name, 40)}`;
    const k = Object.keys(this.students).find((x) => x.endsWith(n));
    return k ? k.slice(0, -n.length) : '';
  }
  startFor(classCode) { const st = this.settingsFor(classCode)?.start; return STAGE_IDS.includes(st) ? st : 'A'; }

  async eraseStudent(classCode, name) {
    const k = this.key(classCode, name);
    if (!this.students[k]) return 0;
    delete this.students[k]; await this.flush(); return 1;
  }
}
