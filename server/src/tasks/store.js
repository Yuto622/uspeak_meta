// タスクの 表（はじめの100・島ごとの タスク・5年の ロードマップ・まいにち/まいしゅう）。
// 中身は 運営者が /admin/tasks で 入れかえ・書きかえ する。記録は DATA_DIR/tasks.json（Fly の ボリューム）。
// ファイルが 無い ときは 同じ フォルダの seed.json（設計シートと 同じ 中身）から 始める。
// 書くのは tmp に 書いてから rename（とちゅうで 落ちても 壊れない）。file が 無ければ メモリだけ（テスト）。
import { writeJsonFile } from '../store/write-json.js';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MAX_ROWS = 3000;
export const MAX_CELL = 500;

// 列の 定義。key は 保存の 名前、label は 画面の 見出し、type は text / int / bool / tiers（"1,3,5" の 数の ならび）。
export const TABLES = {
  onboarding: {
    label: 'はじめの100', prefix: 'S',
    columns: [
      { key: 'on', label: '採用', type: 'bool' }, { key: 'id', label: 'ID', type: 'text' },
      { key: 'chapter', label: '章', type: 'text' }, { key: 'ja', label: '画面に出す文（日本語）', type: 'text' },
      { key: 'en', label: '画面に出す文（英語）', type: 'text' }, { key: 'done', label: '完了の条件（案）', type: 'text' },
      { key: 'check', label: '完了の しらべかた（サーバー）', type: 'text' },
      { key: 'where', label: '行き先・ボタン', type: 'text' }, { key: 'coins', label: 'コイン（案）', type: 'int' },
      { key: 'xp', label: 'XP（案）', type: 'int' }, { key: 'learn', label: '学ぶこと', type: 'text' },
      { key: 'why', label: 'ねらい', type: 'text' }, { key: 'memo', label: 'メモ', type: 'text' },
    ],
  },
  ladders: {
    label: '島ごとのタスク', prefix: 'L',
    columns: [
      { key: 'on', label: '採用', type: 'bool' }, { key: 'id', label: 'ID', type: 'text' },
      { key: 'island', label: '島', type: 'text' }, { key: 'kind', label: '分類', type: 'text' },
      { key: 'ja', label: '画面の文（日本語・{n} に 数が 入る）', type: 'text' }, { key: 'en', label: '画面の文（英語）', type: 'text' },
      { key: 'tiers', label: '段（{n} に 入る 数）', type: 'tiers' }, { key: 'coins', label: '1段ごとの コイン（案）', type: 'int' },
      { key: 'learn', label: '学ぶこと', type: 'text' }, { key: 'when', label: 'いつ ごろ', type: 'text' },
      { key: 'memo', label: 'メモ', type: 'text' },
    ],
  },
  roadmap: {
    label: '5年のロードマップ', prefix: 'R',
    columns: [
      { key: 'on', label: '採用', type: 'bool' }, { key: 'id', label: 'ID', type: 'text' },
      { key: 'year', label: '年', type: 'text' }, { key: 'month', label: '月', type: 'text' },
      { key: 'ja', label: 'イベント（画面の文）', type: 'text' }, { key: 'en', label: 'イベント（英語）', type: 'text' },
      { key: 'task', label: '月の 大きな タスク', type: 'text' }, { key: 'eiken', label: '英検の めやす（覚えた ことばの 合計）', type: 'text' },
      { key: 'island', label: '島', type: 'text' }, { key: 'season', label: 'シーズン（学期）', type: 'text' },
      { key: 'memo', label: 'メモ', type: 'text' },
    ],
  },
  rules: {
    label: '見せかたの ルール', prefix: 'V',
    columns: [
      { key: 'on', label: '採用', type: 'bool' }, { key: 'id', label: 'ID', type: 'text' },
      { key: 'key', label: 'キー', type: 'text' }, { key: 'rule', label: 'ルール', type: 'text' },
      { key: 'value', label: '値', type: 'text' }, { key: 'how', label: '画面での 見せかた', type: 'text' },
      { key: 'why', label: '理由', type: 'text' }, { key: 'source', label: '出典', type: 'text' },
    ],
  },
  daily: {
    label: 'まいにち・まいしゅう', prefix: 'D',
    columns: [
      { key: 'on', label: '採用', type: 'bool' }, { key: 'id', label: 'ID', type: 'text' },
      { key: 'repeat', label: 'くり返し', type: 'text' }, { key: 'ja', label: '画面の文（日本語）', type: 'text' },
      { key: 'en', label: '画面の文（英語）', type: 'text' }, { key: 'done', label: '完了の条件（案）', type: 'text' },
      { key: 'island', label: '島', type: 'text' }, { key: 'coins', label: 'コイン（案）', type: 'int' },
      { key: 'memo', label: 'メモ', type: 'text' },
    ],
  },
};

const TRUE_WORDS = new Set(['true', '1', 'yes', 'y', '○', '◯', '✓', '✔', 'はい', 'on']);
const clip = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, MAX_CELL);

// 1 行を 列の 定義どおりに そろえる。知らない 列は 捨てる。
export function cleanRow(table, raw) {
  const out = {};
  for (const c of TABLES[table].columns) {
    const v = raw?.[c.key];
    if (c.type === 'bool') out[c.key] = typeof v === 'boolean' ? v : TRUE_WORDS.has(String(v ?? '').trim().toLowerCase());
    else if (c.type === 'int') { const n = Number(String(v ?? '').replace(/[,\s]/g, '')); out[c.key] = Number.isFinite(n) ? Math.max(-1e9, Math.min(1e9, Math.round(n))) : 0; }
    else if (c.type === 'tiers') out[c.key] = clip(v).split(/[,、\s]+/).map((s) => s.replace(/^'/, '')).filter((s) => /^\d+$/.test(s)).join(',');
    else out[c.key] = clip(v);
  }
  return out;
}

// 表 まるごとを 確かめる。ID が 空なら つける。ID の 重なりは エラー。
export function validateTable(table, rows) {
  if (!TABLES[table]) return { error: `表が ありません: ${table}` };
  if (!Array.isArray(rows)) return { error: 'rows が ありません' };
  if (rows.length > MAX_ROWS) return { error: `${MAX_ROWS} 行より 多いです` };
  const clean = rows.map((r) => cleanRow(table, r));
  const used = new Set(clean.map((r) => r.id).filter(Boolean));
  const { prefix } = TABLES[table];
  let n = 1;
  for (const r of clean) {
    if (r.id) continue;
    while (used.has(`${prefix}${String(n).padStart(3, '0')}`)) n += 1;
    r.id = `${prefix}${String(n).padStart(3, '0')}`; used.add(r.id);
  }
  const seen = new Set();
  for (const r of clean) {
    if (seen.has(r.id)) return { error: `ID が 2回 あります: ${r.id}` };
    seen.add(r.id);
  }
  return { rows: clean };
}

export function loadSeed() {
  const seed = JSON.parse(readFileSync(path.join(here, 'seed.json'), 'utf8'));
  const tables = {};
  for (const t of Object.keys(TABLES)) tables[t] = validateTable(t, seed.tables?.[t] || []).rows || [];
  return tables;
}

export class TaskStore {
  constructor(file, { log = console, now = Date.now } = {}) { this.file = file; this.log = log; this.now = now; this.tables = null; this.updatedAt = 0; }

  async init() {
    if (this.file) {
      try {
        const saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
        this.tables = {};
        for (const t of Object.keys(TABLES)) this.tables[t] = validateTable(t, saved.tables?.[t] || []).rows || [];
        // 版 1 の ファイルには「完了の しらべかた」の 列が 無い。おなじ ID の 行は seed から 入れる（入れかえた 順番と 文は そのまま）。
        if ((saved.version || 1) < 2) {
          const seed = new Map(loadSeed().onboarding.map((r) => [r.id, r.check]));
          for (const r of this.tables.onboarding) if (!r.check && seed.get(r.id)) r.check = seed.get(r.id);
        }
        this.updatedAt = saved.updatedAt || 0;
        return this;
      } catch (err) {
        if (err.code !== 'ENOENT') this.log.warn?.(`[tasks] ${this.file} could not be read (${err.message}); starting from the seed`);
      }
    }
    this.tables = loadSeed();
    return this;
  }

  table(name) { return this.tables[name] || []; }

  // ゲームが 読む 形：採用の 行だけ。
  adopted() {
    const out = {};
    for (const t of Object.keys(TABLES)) out[t] = this.table(t).filter((r) => r.on);
    return out;
  }

  async save(name, rows) {
    const v = validateTable(name, rows);
    if (v.error) return { ok: false, error: v.error };
    this.tables[name] = v.rows;
    this.updatedAt = this.now();
    await this.flush();
    return { ok: true, rows: v.rows };
  }

  async reset(name) {
    this.tables[name] = loadSeed()[name];
    this.updatedAt = this.now();
    await this.flush();
    return { ok: true, rows: this.tables[name] };
  }

  async flush() {
    if (!this.file) return;
    const body = JSON.stringify({ version: 2, updatedAt: this.updatedAt, tables: this.tables });
    await writeJsonFile(this.file, body);
  }
}

// TSV（Google スプレッドシートから コピーした もの）→ 行。1 行目が 見出しなら 列の 名前で あわせる。
export function rowsFromTsv(table, text) {
  const cols = TABLES[table].columns;
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const cells = lines.map((l) => l.split('\t'));
  const head = cells[0].map((h) => h.trim());
  const byLabel = cols.map((c) => head.findIndex((h) => h === c.label || h === c.key));
  const hasHead = byLabel.filter((i) => i >= 0).length >= 3;
  const body = hasHead ? cells.slice(1) : cells;
  return body.map((r) => Object.fromEntries(cols.map((c, i) => [c.key, hasHead ? (byLabel[i] >= 0 ? r[byLabel[i]] : '') : r[i]])));
}

export function rowsToTsv(table, rows) {
  const cols = TABLES[table].columns;
  const cell = (v) => String(v ?? '').replace(/[\t\n]/g, ' ');
  return [cols.map((c) => c.label).join('\t'), ...rows.map((r) => cols.map((c) => cell(c.type === 'bool' ? (r[c.key] ? 'TRUE' : 'FALSE') : r[c.key])).join('\t'))].join('\n');
}
