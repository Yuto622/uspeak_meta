// 問題データベース（英検形式）— /admin/qbank で 入れかえ・オンオフ・書きかえ を する。
//
// 中身は DATA_DIR/qbank.json（リポジトリには 置かない：答えつきの 問題を 公開しない）。
// 1 行 ＝ 1 問。`web` が ○ の 問題は 英検の島（eiken.js）の 出題に まざり、`roblox` が ○ の 問題は
// GET /api/roblox/questions で Roblox が 取りにくる。`on` を 外すと どちらにも 出ない。
import { writeJsonFile } from '../store/write-json.js';
import fs from 'node:fs/promises';
import path from 'node:path';

export const GRADES = ['5級', '4級', '3級', '準2級', '2級', '準1級', '準1級以上', '1級', 'ジュニア'];
export const SKILLS = ['reading', 'listening', 'writing', 'speaking'];
// 列（xlsx の 見出しと 同じ 名前でも 受けとる）。
export const COLUMNS = [
  ['id', 'ID'], ['grade', '級'], ['skill', '技能'], ['format', '形式'], ['passage', '本文・スクリプト'], ['question', '問題'],
  ['choice_1', '選択肢1'], ['choice_2', '選択肢2'], ['choice_3', '選択肢3'], ['choice_4', '選択肢4'],
  ['answer', '正解'], ['answer_no', '正解番号'], ['explanation', '解説'], ['model_answer', '模範解答'],
  ['source', '出典'], ['tags', 'タグ'], ['on', '配信'], ['web', 'web版に出す'], ['roblox', 'Robloxに出す'],
];
const SKILL_JA = { リーディング: 'reading', リスニング: 'listening', ライティング: 'writing', スピーキング: 'speaking' };
export const MAX_ITEMS = 60000;
const MAX_TEXT = 4000;

const str = (v, max = MAX_TEXT) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const YES = new Set(['1', 'true', 'yes', 'on', '○', '◯', 'o', 'y', 'はい', '出す']);
// 列が ない ときだけ 既定値（オン）。列が あって 空なら オフ（スプレッドシートの 空欄 ＝ 出さない）。
const flag = (v, dflt) => (v === undefined || v === null ? dflt : typeof v === 'boolean' ? v : YES.has(String(v).trim().toLowerCase()));

// 1 行を きれいに する。使えない 行は null（理由は 呼ぶ がわで 数える）。
export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const get = (key, ja) => raw[key] ?? raw[ja];
  const item = {};
  for (const [key, ja] of COLUMNS) item[key] = get(key, ja);
  const out = {
    id: str(item.id, 40), grade: str(item.grade, 10), skill: SKILL_JA[str(item.skill)] || str(item.skill).toLowerCase(),
    format: str(item.format, 60), passage: str(item.passage), question: str(item.question, 1000),
    choices: [item.choice_1, item.choice_2, item.choice_3, item.choice_4].map((c) => str(c, 300)).filter(Boolean),
    answer: str(item.answer, 1000), explanation: str(item.explanation, 600), model_answer: str(item.model_answer),
    source: str(item.source, 120), tags: str(item.tags, 300),
    on: flag(item.on, true), web: flag(item.web, true), roblox: flag(item.roblox, true),
  };
  if (!out.id || !GRADES.includes(out.grade) || !SKILLS.includes(out.skill) || !out.question || !out.answer) return null;
  // 選択式は 答えが 選択肢の 中に あり、同じ 選択肢が 2 つ ないこと（あると 正しい 答えが まちがいに なる）。
  if (out.choices.length) {
    if (out.choices.length < 2 || !out.choices.includes(out.answer)) return null;
    if (new Set(out.choices.map((c) => c.toLowerCase())).size !== out.choices.length) return null;
  }
  return out;
}

export function cleanItems(list) {
  const items = []; const seen = new Set(); let skipped = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const it = cleanItem(raw);
    if (!it || seen.has(it.id)) { skipped += 1; continue; }
    seen.add(it.id); items.push(it);
    if (items.length >= MAX_ITEMS) break;
  }
  return { items, skipped };
}

// CSV / TSV（Google スプレッドシートや Excel から 書き出した もの）→ 行。1 行目は 見出し。
export function rowsFromDelimited(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? src.length : src.indexOf('\n'));
  const sep = firstLine.includes('\t') ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

export function itemsToCsv(items) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [COLUMNS.map(([, ja]) => ja).join(',')];
  for (const it of items) {
    const v = { ...it, choice_1: it.choices[0], choice_2: it.choices[1], choice_3: it.choices[2], choice_4: it.choices[3],
      answer_no: it.choices.length ? it.choices.indexOf(it.answer) + 1 : '', on: it.on ? '○' : '', web: it.web ? '○' : '', roblox: it.roblox ? '○' : '' };
    lines.push(COLUMNS.map(([k]) => esc(v[k])).join(','));
  }
  return '﻿' + lines.join('\n');
}

// 問題文の（日本語の いみ）・先頭の No.1・記号を のぞいて くらべる（seed の 二重チェック）。
const seedKey = (s) => String(s || '').split('（')[0].replace(/^\s*No\.\s*\d+\s*/i, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export class QBankStore {
  constructor(file, { log = console, now = Date.now } = {}) {
    this.file = file; this.log = log; this.now = now; this.items = []; this.updatedAt = 0; this.seeded = []; this.listeners = new Set();
  }

  async init() {
    if (this.file) {
      try {
        const saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
        this.items = cleanItems(saved.items).items;
        this.updatedAt = saved.updatedAt || 0;
        this.seeded = Array.isArray(saved.seeded) ? saved.seeded.map(String) : [];
      } catch (err) {
        if (err.code !== 'ENOENT') this.log.warn?.(`[qbank] ${this.file} could not be read (${err.message}); starting empty`);
      }
    }
    this.emit();
    return this;
  }

  onChange(fn) { this.listeners.add(fn); fn(this); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) { try { fn(this); } catch (err) { this.log.warn?.('[qbank] listener failed:', err.message); } } }

  // 出す 先ごとに：配信が ○ で、その 先が ○ の 問題。
  live(target) { return this.items.filter((it) => it.on && it[target]); }

  stats() {
    const by = {};
    for (const it of this.items) {
      const g = (by[it.grade] ||= { total: 0, on: 0, web: 0, roblox: 0 });
      g.total += 1; if (it.on) g.on += 1; if (it.on && it.web) g.web += 1; if (it.on && it.roblox) g.roblox += 1;
    }
    return { total: this.items.length, grades: by };
  }

  // まるごと 入れかえ（mode: 'replace'）か、同じ ID は 上書き・新しい ID は 足す（mode: 'merge'）。
  async import(list, { mode = 'replace' } = {}) {
    const { items, skipped } = cleanItems(list);
    if (!items.length) return { ok: false, error: '読みこめる 問題が ありません（ID・級・技能・問題・正解の 列を たしかめてください）', skipped };
    if (mode === 'merge') {
      const byId = new Map(this.items.map((it) => [it.id, it]));
      for (const it of items) byId.set(it.id, it);
      this.items = [...byId.values()].slice(0, MAX_ITEMS);
    } else this.items = items;
    await this.touch();
    return { ok: true, count: this.items.length, imported: items.length, skipped };
  }

  // 何問かの オンオフを まとめて かえる（fields は on / web / roblox だけ）。
  async setFlags(ids, fields) {
    const want = new Set(Array.isArray(ids) ? ids.map(String) : []);
    const keys = ['on', 'web', 'roblox'].filter((k) => typeof fields?.[k] === 'boolean');
    if (!want.size || !keys.length) return { ok: false, error: 'nothing to change' };
    let changed = 0;
    for (const it of this.items) if (want.has(it.id)) { for (const k of keys) it[k] = fields[k]; changed += 1; }
    await this.touch();
    return { ok: true, changed };
  }

  // 1 問を 書きかえる（ID は かえない）。
  async update(id, patch) {
    const i = this.items.findIndex((it) => it.id === String(id));
    if (i < 0) return { ok: false, error: 'not found' };
    const cur = this.items[i];
    const merged = cleanItem({ ...cur, choice_1: cur.choices[0], choice_2: cur.choices[1], choice_3: cur.choices[2], choice_4: cur.choices[3], ...patch, id: cur.id });
    if (!merged) return { ok: false, error: '形が ただしく ありません（正解が 選択肢に ない など）' };
    this.items[i] = merged;
    await this.touch();
    return { ok: true, item: merged };
  }

  // リポジトリの 問題（面接・話すの館）を 1 回だけ 足す。tag ごとに 1 回：admin で 消した 行は もどって こない。
  // もう ある 問題（同じ ID か、同じ 級・問題・正解）は とばすので、前に CSV で 入れた 行と 二重に ならない。
  async seed(tag, rows) {
    if (this.seeded.includes(tag)) return { ok: true, added: 0, already: true };
    const key = (it) => `${it.grade}|${seedKey(it.question)}|${seedKey(it.answer)}`;
    const ids = new Set(this.items.map((it) => it.id)); const keys = new Set(this.items.map(key));
    const add = cleanItems(rows).items.filter((it) => !ids.has(it.id) && !keys.has(key(it)));
    this.items = [...this.items, ...add].slice(0, MAX_ITEMS);
    this.seeded.push(tag);
    await this.touch();
    return { ok: true, added: add.length };
  }

  async touch() { this.updatedAt = this.now(); await this.flush(); this.emit(); }

  async flush() {
    if (!this.file) return;
    const body = JSON.stringify({ version: 1, updatedAt: this.updatedAt, seeded: this.seeded, items: this.items });
    await writeJsonFile(this.file, body);
  }
}
