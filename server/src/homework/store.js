// 宿題の 置き場 — DATA_DIR/homework.json（答えつきの 問題なので リポジトリにも client/dist にも 置かない）。
//
// { assignments: [{ id, title, classes: [クラス], due: 'YYYY-MM-DD', status: 'draft' | 'published', items: [...], createdAt, publishedAt, via }],
//   progress: { '<クラス>|<名前>|<宿題の id>': { answers: { <問題の id>: { ok, tries, at } }, startedAt, doneAt, paid } } }
// **draft は 子どもに 出ない。** 先生が admin で たしかめて「くばる」を 押すと published に なる。
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkItems } from './items.js';

const MAX_ASSIGNMENTS = 500;
const str = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const classKey = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// 日本の 日づけ（締め切りは 日本の その日の おわりまで）
export const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export class HomeworkStore {
  constructor(file, { log = console, now = Date.now } = {}) {
    this.file = file; this.log = log; this.now = now;
    this.assignments = []; this.progress = {}; this.updatedAt = 0; this.seq = 0;
  }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        this.assignments = Array.isArray(raw.assignments) ? raw.assignments : [];
        this.progress = raw.progress && typeof raw.progress === 'object' ? raw.progress : {};
        this.updatedAt = Number(raw.updatedAt) || 0;
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn('[homework] could not read', this.file, err.message); }
    }
    return this;
  }

  async flush() {
    this.updatedAt = this.now();
    if (!this.file) return;
    const body = JSON.stringify({ updatedAt: this.updatedAt, assignments: this.assignments, progress: this.progress });
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, this.file);
  }

  get(id) { return this.assignments.find((a) => a.id === id) || null; }

  clean(input, prev = null) {
    const classes = (Array.isArray(input.classes) ? input.classes : String(input.classes ?? '').split(/[,、\s]+/)).map(classKey).filter(Boolean);
    const { items, problems } = checkItems(input.items ?? prev?.items ?? []);
    return {
      title: str(input.title ?? prev?.title, 60) || 'しゅくだい',
      classes: [...new Set(classes)].slice(0, 40),
      due: DAY.test(String(input.due ?? '')) ? String(input.due) : (input.due === '' ? '' : prev?.due || ''),
      note: str(input.note ?? prev?.note, 200),
      items, problems,
    };
  }

  async create(input) {
    if (this.assignments.length >= MAX_ASSIGNMENTS) return { ok: false, error: `宿題は ${MAX_ASSIGNMENTS} こまでです（古い ものを 消して ください）` };
    const c = this.clean(input);
    const at = this.now();
    const a = { id: `hw${at.toString(36)}${(this.seq += 1).toString(36)}`, ...c, problems: undefined, status: 'draft', createdAt: at, publishedAt: 0, via: str(input.via, 10) };
    delete a.problems;
    this.assignments.unshift(a);
    await this.flush();
    return { ok: true, assignment: a, problems: c.problems };
  }

  async update(id, input) {
    const a = this.get(id);
    if (!a) return { ok: false, error: 'その 宿題は ありません' };
    const c = this.clean(input, a);
    if (a.status === 'published' && c.problems.length) return { ok: false, error: 'くばって いる 宿題に 出せない 問題が あります', problems: c.problems };
    Object.assign(a, { title: c.title, classes: c.classes, due: c.due, note: c.note, items: c.items });
    await this.flush();
    return { ok: true, assignment: a, problems: c.problems };
  }

  // くばる／とめる。くばる 前に もう一度 たしかめる（出せない 問題が 1 つでも あれば くばらない）。
  async publish(id, on) {
    const a = this.get(id);
    if (!a) return { ok: false, error: 'その 宿題は ありません' };
    if (on) {
      const { problems, items } = checkItems(a.items);
      if (!items.length) return { ok: false, error: '問題が ありません' };
      if (problems.length) return { ok: false, error: '出せない 問題が あります。なおすか 消して ください', problems };
      a.status = 'published'; a.publishedAt = a.publishedAt || this.now();
    } else a.status = 'draft';
    await this.flush();
    return { ok: true, assignment: a };
  }

  async remove(id) {
    const before = this.assignments.length;
    this.assignments = this.assignments.filter((a) => a.id !== id);
    for (const k of Object.keys(this.progress)) if (k.endsWith(`|${id}`)) delete this.progress[k];
    await this.flush();
    return { ok: before !== this.assignments.length };
  }

  // そのクラスに くばって ある 宿題（新しい 順）。classes が からなら どのクラスにも。
  forClass(classCode) {
    const c = classKey(classCode);
    return this.assignments.filter((a) => a.status === 'published' && (!a.classes.length || a.classes.includes(c)));
  }

  key(classCode, name, id) { return `${classKey(classCode)}|${str(name, 40)}|${id}`; }
  progressOf(classCode, name, id) { return this.progress[this.key(classCode, name, id)] || null; }

  // 1 問 ぶんの 結果を のこす。はじめて ぜんぶ おわったら done（ごほうびを 1 回 だけ にする 印も ここ）。
  async record(classCode, name, id, itemId, ok) {
    const a = this.get(id);
    if (!a) return null;
    const k = this.key(classCode, name, id);
    const p = this.progress[k] || (this.progress[k] = { answers: {}, startedAt: this.now(), doneAt: 0, paid: false });
    const prev = p.answers[itemId];
    p.answers[itemId] = { ok: !!ok || !!prev?.ok, tries: (prev?.tries || 0) + 1, at: this.now() };
    let finished = false;
    if (!p.doneAt && a.items.every((it) => p.answers[it.id])) { p.doneAt = this.now(); finished = true; }
    await this.flush();
    return { progress: p, finished };
  }
  async markPaid(classCode, name, id) {
    const p = this.progressOf(classCode, name, id);
    if (!p || p.paid) return false;
    p.paid = true; await this.flush(); return true;
  }

  // 子どもの 画面・保護者レポートに 出す まとめ（答えは ふくめない）。
  summaryOf(a, p, now = this.now()) {
    const total = a.items.length;
    const answered = p ? a.items.filter((it) => p.answers[it.id]).length : 0;
    const correct = p ? a.items.filter((it) => p.answers[it.id]?.ok).length : 0;
    const overdue = !!a.due && !p?.doneAt && jstDay(now) > a.due;
    return {
      id: a.id, title: a.title, due: a.due, note: a.note, total, answered, correct,
      done: !!p?.doneAt, doneAt: p?.doneAt || 0, startedAt: p?.startedAt || 0, overdue,
      score: total ? Math.round((correct / total) * 100) : 0,
      kinds: [...new Set(a.items.map((it) => it.kind))],
    };
  }
  listFor(classCode, name, now = this.now()) {
    return this.forClass(classCode).map((a) => this.summaryOf(a, this.progressOf(classCode, name, a.id), now));
  }

  // 先生の 画面：その 宿題を やった 子の 一覧。
  classProgress(id) {
    const a = this.get(id);
    if (!a) return [];
    const rows = [];
    for (const [k, p] of Object.entries(this.progress)) {
      const [cls, name, aid] = k.split('|');
      if (aid !== id) continue;
      rows.push({ classCode: cls, name, ...this.summaryOf(a, p) });
    }
    return rows.sort((x, y) => (x.classCode + x.name).localeCompare(y.classCode + y.name, 'ja'));
  }

  // 1 人ぶんの 削除（privacy.js の eraseStudent から）。
  async eraseStudent(classCode, name) {
    const head = `${classKey(classCode)}|${str(name, 40)}|`;
    let n = 0;
    for (const k of Object.keys(this.progress)) if (k.startsWith(head)) { delete this.progress[k]; n += 1; }
    if (n) await this.flush();
    return n;
  }
}
