// TOEIC・TOEFL・IELTS の 問題（src/game/exam-bank/<試験>/*.json）を 問題データベース（/admin/qbank）の 行に する。
// 中身は U-Speak Lab の オリジナル（CC BY 4.0）。公式の 問題・市販の 問題集の 文は 入れていない。形（パート・問題数・時間）は
// 各試験の 公式の 説明に あわせた（docs/exam-formats.md）。語いは TOEIC＝TSL（TOEIC Service List）・TOEFL/IELTS＝NAWL
// （New Academic Word List、どちらも Browne & Culligan・CC BY-SA 4.0）を めやすに した。
// 起動の とき QBankStore.seed() で 1 回だけ 足す（SEED_TAG を かえると もう 1 回）。英検の島・Roblox には 出さない（web・roblox は ×）。
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanItem } from './store.js';

export const EXAMS_SEED_TAG = 'exams-2026-11';
export const EXAM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../game/exam-bank');
export const EXAMS = { toeic: 'TOEIC', toefl: 'TOEFL', ielts: 'IELTS' };
const LICENSE = 'U-Speak Lab オリジナル（CC BY 4.0）';
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// 1 ファイルの 行（[{ id, skill, format, level, band, passage, question, choices, answer, explanation, model_answer, tags }]）→ 問題DB の 行。
export function toRow(exam, raw) {
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  return {
    id: raw.id, grade: EXAMS[exam], skill: raw.skill, format: raw.format,
    passage: raw.passage || '', question: raw.question, answer: raw.answer,
    choice_1: choices[0], choice_2: choices[1], choice_3: choices[2], choice_4: choices[3],
    explanation: raw.explanation || '', model_answer: raw.model_answer || '',
    tags: [raw.level && `CEFR:${raw.level}`, raw.band, raw.tags].filter(Boolean).join(' '),
    source: `${LICENSE}・${EXAMS[exam]} 形式の 練習問題（公式問題では ない）`,
    on: true, web: false, roblox: false,
  };
}

// 行が だめな 理由（なければ null）。cleanItem より きびしい（試験ごとの 決まり）。
export function problemOf(exam, raw) {
  if (!raw || typeof raw !== 'object') return 'not an object';
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{3,39}$/.test(String(raw.id || ''))) return 'id: 英数字と - で 4〜40 字';
  if (!String(raw.id).toUpperCase().startsWith(EXAMS[exam])) return `id は ${EXAMS[exam]}- で はじめる`;
  if (!LEVELS.includes(raw.level)) return 'level: A1〜C2';
  if (!raw.format) return 'format が ない';
  const ch = Array.isArray(raw.choices) ? raw.choices : [];
  if (ch.length > 4) return 'choices は 4 つまで';
  if (ch.length && ch.length < 2) return 'choices は 2 つ以上';
  if (ch.length && !ch.includes(raw.answer)) return 'answer が choices に ない';
  if (ch.length && new Set(ch.map((c) => String(c).toLowerCase())).size !== ch.length) return '同じ 選択肢が ある';
  if ((raw.skill === 'writing' || raw.skill === 'speaking') && !ch.length && !raw.model_answer) return 'writing / speaking の 自由回答は model_answer が いる';
  if (String(raw.passage || '').length > 8000) return 'passage が 8000 字 より 長い';
  if (!cleanItem(toRow(exam, raw))) return '問題DB の 形に ならない（skill・question・answer を たしかめる）';
  return null;
}

export function examFiles(dir = EXAM_DIR) {
  const out = [];
  for (const exam of Object.keys(EXAMS)) {
    let names = [];
    try { names = readdirSync(path.join(dir, exam)).filter((n) => n.endsWith('.json')).sort(); } catch { names = []; }
    for (const n of names) out.push({ exam, file: path.join(dir, exam, n) });
  }
  return out;
}

export function examRows(dir = EXAM_DIR) {
  return examBatches(dir).flatMap((b) => b.rows);
}

// ファイルごとの 行と seed の 印（exam-bank:<試験>/<ファイル名>）。ファイルを 足すと つぎの 起動で その ファイルだけ 入る。
// 1 回 入れた ファイルは もう 入れない（admin で 消した 行は もどらない）。
export function examBatches(dir = EXAM_DIR) {
  return examFiles(dir).map(({ exam, file }) => {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return { tag: `${EXAMS_SEED_TAG}:${exam}/${path.basename(file)}`, rows: list.filter((raw) => !problemOf(exam, raw)).map((raw) => toRow(exam, raw)) };
  });
}
