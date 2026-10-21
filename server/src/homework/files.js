// 宿題の ファイルを 読む — どの 形式でも 1 つの 入口（admin の「ファイルを えらぶ／写真を とる」）。
//
// 2 つに 分ける（Quizizz・Kahoot・Blooket・Quizlet・Moodle と 同じ 考え）：
//   * 形の きまった もの（表・問題の 書式）…… AI を 通さず その まま 読む。答えが 1 字も かわらない。
//       CSV / TSV / Excel(.xlsx) / OpenDocument 表(.ods)
//       ・Kahoot の テンプレート（Question / Answer 1-4 / Correct answer）・Blooket の CSV（Question Text / Answer 1-4 / Correct Answer(s)）
//       ・Quizlet の 書き出し（ことば ⇥ 意味、または , / -）・この アプリの 問題データベースの 列（問題・選択肢1-4・正解）
//       ・英語と 日本語の 2 列（見出しなし でも よい）
//     Moodle の GIFT・Aiken・Moodle XML、JSON（[{en, ja, …}]）
//   * 形の きまって いない もの …… 文に して（写真・PDF は そのまま）AI に わたす。
//       写真（JPEG / PNG / WebP。iPhone の HEIC は ブラウザが JPEG に なおして 送る）・PDF（文字が あれば pdftotext でも 読む）
//       Word(.docx)・PowerPoint(.pptx)・OpenDocument 文書(.odt)・テキスト(.txt / .md / .html)
// 古い .doc / .xls / .ppt は 中身が 別の しくみなので 読めない（Word・Excel で 新しい 形に 保存しなおして もらう）。
import zlib from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const cut = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const JA = /[぀-ヿ㐀-鿿]/;

// ---- zip（xlsx / docx / pptx / odt / ods は zip の 中の XML）--------------------------------------
export function unzip(buf) {
  const files = new Map();
  // 中央ディレクトリの おわり（EOCD）を うしろから さがす
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip ではありません');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28); const extraLen = buf.readUInt16LE(p + 30); const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (size > 30_000_000) continue;
    try { files.set(name, method === 8 ? zlib.inflateRawSync(raw) : method === 0 ? raw : null); } catch { /* こわれた 1 つは とばす */ }
  }
  return files;
}

const xmlText = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

// 段落ごとに 1 行の 文に する（docx の <w:p>、pptx の <a:p>、odt の <text:p>）
function paragraphs(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}[ >][\\s\\S]*?</${tag}>`, 'g');
  for (const m of String(xml).match(re) || []) {
    const t = cut(xmlText(m.replace(/<w:tab\/>|<a:tab\/>|<text:tab\/>/g, '\t').replace(/<w:br\/>|<a:br\/>|<text:line-break\/>/g, '\n')));
    if (t) out.push(t);
  }
  return out.join('\n');
}

export function docxText(buf) {
  const z = unzip(buf);
  const doc = z.get('word/document.xml');
  if (!doc) throw new Error('Word の 中身が 見つかりません');
  return paragraphs(doc.toString('utf8'), 'w:p');
}
export function pptxText(buf) {
  const z = unzip(buf);
  const slides = [...z.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/g).pop()) - Number(b.match(/\d+/g).pop()));
  return slides.map((k) => paragraphs(z.get(k).toString('utf8'), 'a:p')).filter(Boolean).join('\n');
}
export function odtText(buf) {
  const c = unzip(buf).get('content.xml');
  if (!c) throw new Error('文書の 中身が 見つかりません');
  return paragraphs(c.toString('utf8'), 'text:(?:p|h)');
}

// Excel(.xlsx) の いちばん はじめの シート → 行の 配列
export function xlsxRows(buf) {
  const z = unzip(buf);
  const shared = [];
  const ss = z.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) shared.push(xmlText((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join('')));
  const sheetName = [...z.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheetName) throw new Error('シートが 見つかりません');
  const xml = z.get(sheetName).toString('utf8');
  const rows = [];
  for (const r of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
    const row = [];
    for (const c of r.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (c.match(/ r="([A-Z]+)\d+"/) || [])[1] || '';
      const col = ref ? [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : row.length;
      const type = (c.match(/ t="([^"]+)"/) || [])[1] || '';
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const inline = (c.match(/<is>([\s\S]*?)<\/is>/) || [])[1];
      row[col] = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? xmlText(inline || '') : xmlText(v ?? '');
    }
    rows.push(Array.from(row, (x) => cut(x ?? '')));
  }
  return rows.filter((r) => r.some(Boolean));
}
// OpenDocument 表(.ods)
export function odsRows(buf) {
  const c = unzip(buf).get('content.xml')?.toString('utf8') || '';
  const table = (c.match(/<table:table [\s\S]*?<\/table:table>/) || [''])[0];
  const rows = [];
  for (const r of table.match(/<table:table-row[\s\S]*?<\/table:table-row>/g) || []) {
    const row = [];
    for (const cell of r.match(/<table:table-cell[\s\S]*?(?:\/>|<\/table:table-cell>)/g) || []) {
      const rep = Math.min(50, Number((cell.match(/table:number-columns-repeated="(\d+)"/) || [])[1] || 1));
      const t = cut(xmlText((cell.match(/<text:p>[\s\S]*?<\/text:p>/g) || []).join(' ')));
      for (let i = 0; i < rep; i += 1) row.push(t);
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some(Boolean));
}

// CSV / TSV（"…" の 中の , と 改行も 読む）
export function delimitedRows(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.slice(0, Math.max(0, src.indexOf('\n')) || src.length);
  const sep = first.includes('\t') ? '\t' : first.includes(',') ? ',' : first.includes(';') ? ';' : '\t';
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (q) { if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cut(cell)); cell = ''; }
    else if (ch === '\n') { row.push(cut(cell)); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cut(cell)); rows.push(row); }
  return rows.filter((r) => r.some(Boolean));
}

// ---- 表 → 問題 -------------------------------------------------------------------------------------
const H = (h) => cut(h).toLowerCase();
const find = (head, ...tests) => head.findIndex((h) => tests.some((t) => (t instanceof RegExp ? t.test(h) : h === t)));
const looksLikeHeader = (row) => row.some((c) => /^(question|answer|term|definition|english|japanese|word|meaning|sentence|英語|日本語|単語|意味|問題|選択肢|正解|答え|英文|訳|形式)/i.test(cut(c)));

export function rowsToItems(rows) {
  if (!rows.length) return { items: [], format: 'empty' };
  // Kahoot は 上に 説明の 行が ある ので、見出しの 行を さがす
  let at = rows.findIndex((r) => looksLikeHeader(r));
  if (at < 0 || at > 8) at = -1;
  const head = at >= 0 ? rows[at].map(H) : [];
  const body = at >= 0 ? rows.slice(at + 1) : rows;
  const items = [];
  // 選択式（Kahoot / Blooket / 問題データベース）
  const qCol = find(head, /^question( text)?\b/, /^問題/);
  const ansCols = head.map((h, i) => (/^(answer|選択肢)\s*\d/.test(h) ? i : -1)).filter((i) => i >= 0);
  const correctCol = find(head, /^correct/, /^正解番号/, /^正解$/, /^答え$/);
  if (qCol >= 0 && ansCols.length >= 2 && correctCol >= 0) {
    for (const r of body) {
      const prompt = cut(r[qCol]);
      const choices = ansCols.map((i) => cut(r[i])).filter(Boolean);
      const mark = cut(r[correctCol]);
      if (!prompt || choices.length < 2 || !mark) continue;
      // 「1」「1,3」（番号）か、正解の 文そのもの
      const nums = mark.split(/[,、\s]+/).map(Number).filter((n) => n >= 1 && n <= ansCols.length);
      const answer = nums.length ? cut(r[ansCols[nums[0] - 1]]) : (choices.find((c) => c.toLowerCase() === mark.toLowerCase()) || '');
      if (!answer) continue;
      items.push({ kind: 'mc', prompt, answer, wrong: choices.filter((c) => c !== answer) });
    }
    return { items, format: head.some((h) => /max \d+ characters/.test(h)) ? 'kahoot' : head.some((h) => /question text/.test(h)) ? 'blooket' : 'choices' };
  }
  // ことば・文の 表（列の 名前で）
  if (head.length) {
    const en = find(head, /^(english|英語|word|term|単語|ことば|front)/);
    const ja = find(head, /^(japanese|日本語|meaning|definition|意味|訳|back)/);
    const sent = find(head, /^(sentence|英文|文|example)/);
    const blank = find(head, /^(blank|あな|穴|空欄)/);
    const kind = find(head, /^(kind|type|形式)$/);
    const wrong = find(head, /^(wrong|distractors?|まちがい|誤答)/);
    for (const r of body) {
      const it = { en: cut(r[en]), ja: cut(r[ja]), sentence: cut(r[sent]), blank: cut(r[blank]), kind: cut(r[kind]).toLowerCase(), wrong: cut(r[wrong]) };
      if (it.en || it.sentence) items.push(it);
    }
    if (items.length) return { items, format: 'columns' };
  }
  // 見出しの ない 2 列（Quizlet の ことば ⇥ 意味）
  for (const r of body) {
    const cells = r.filter(Boolean);
    if (cells.length < 2) continue;
    let [a, b] = cells;
    if (JA.test(a) && !JA.test(b)) [a, b] = [b, a];
    if (!/[A-Za-z]/.test(a)) continue;
    items.push(a.split(' ').length >= 3 ? { kind: 'order', sentence: a, ja: b } : { en: a, ja: b });
  }
  return { items, format: 'pairs' };
}

// ---- 問題の 書式（Moodle）-----------------------------------------------------------------------------
// Aiken：問題 ／ A. … ／ B. … ／ ANSWER: B
export function parseAiken(text) {
  const items = [];
  const blocks = String(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').map(cut).filter(Boolean);
    const ansLine = lines.find((l) => /^ANSWER\s*:/i.test(l));
    if (!ansLine) continue;
    const opts = lines.filter((l) => /^[A-H][.)]\s+/.test(l));
    const prompt = lines.filter((l) => !/^[A-H][.)]\s+/.test(l) && !/^ANSWER\s*:/i.test(l)).join(' ');
    const letter = ansLine.replace(/^ANSWER\s*:\s*/i, '').trim().toUpperCase()[0];
    const choice = opts.find((o) => o[0].toUpperCase() === letter);
    if (!prompt || !choice || opts.length < 2) continue;
    const strip = (o) => o.replace(/^[A-H][.)]\s+/, '');
    items.push({ kind: 'mc', prompt, answer: strip(choice), wrong: opts.filter((o) => o !== choice).map(strip) });
  }
  return items;
}
// GIFT：::名前:: 問題 {=正解 ~まちがい} ／ {=ことば}（ひとつ 書く）／ {=a -> b =c -> d}（せんつなぎ）／ {T} {F}
export function parseGift(text) {
  const items = [];
  const src = String(text).replace(/\r\n?/g, '\n').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  for (const block of src.split(/\n\s*\n/)) {
    const m = block.match(/^\s*(?:::[^:]*::)?([\s\S]*?)\{([\s\S]*?)\}([\s\S]*)$/);
    if (!m) continue;
    const prompt = cut(`${m[1]} ___ ${m[3]}`.replace(/\s___\s*$/, '')).replace(/\[[a-z]+\]/gi, '');
    const body = m[2].replace(/#[^=~}]*/g, '');
    if (/->/.test(body)) {
      for (const pair of body.split('=').map(cut).filter(Boolean)) {
        const [a, b] = pair.split('->').map(cut);
        if (a && b) items.push(JA.test(a) && !JA.test(b) ? { en: b, ja: a } : { en: a, ja: b });
      }
      continue;
    }
    const right = (body.match(/=\s*([^=~]+)/g) || []).map((x) => cut(x.slice(1)).replace(/^%\d+%/, ''));
    const wrong = (body.match(/~\s*([^=~]+)/g) || []).map((x) => cut(x.slice(1)).replace(/^%-?\d+%/, ''));
    if (!right.length) continue;
    if (wrong.length) items.push({ kind: 'mc', prompt: prompt.replace(/\s*___\s*$/, ''), answer: right[0], wrong });
    else if (/^[A-Za-z'-]+$/.test(right[0])) {
      // 文の 中の あなうめ（___）なら fill、ちがえば タイピング
      if (m[3].trim()) items.push({ kind: 'fill', sentence: cut(`${m[1]} ${right[0]} ${m[3]}`), blank: right[0] });
      else items.push({ kind: 'type', en: right[0], ja: cut(m[1]) });
    }
  }
  return items;
}
// Moodle XML（multichoice / shortanswer / matching / truefalse）
export function parseMoodleXml(xml) {
  const items = [];
  const text = (s) => cut(xmlText((String(s).match(/<text>([\s\S]*?)<\/text>/) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, ''));
  for (const q of String(xml).match(/<question type="[^"]+"[\s\S]*?<\/question>/g) || []) {
    const type = q.match(/type="([^"]+)"/)[1];
    const prompt = text((q.match(/<questiontext[\s\S]*?<\/questiontext>/) || [''])[0]);
    const answers = (q.match(/<answer [\s\S]*?<\/answer>/g) || []).map((a) => ({ ok: Number((a.match(/fraction="([\d.-]+)"/) || [])[1] || 0) > 0, t: text(a) }));
    if (type === 'multichoice' || type === 'truefalse') {
      const right = answers.find((a) => a.ok);
      if (prompt && right && answers.length >= 2) items.push({ kind: 'mc', prompt, answer: right.t, wrong: answers.filter((a) => a !== right).map((a) => a.t) });
    } else if (type === 'shortanswer') {
      const right = answers.find((a) => a.ok);
      if (right && /^[A-Za-z'-]+$/.test(right.t)) items.push({ kind: 'type', en: right.t, ja: prompt });
    } else if (type === 'matching') {
      for (const sq of q.match(/<subquestion[\s\S]*?<\/subquestion>/g) || []) {
        const a = text(sq); const b = text((sq.match(/<answer>[\s\S]*?<\/answer>/) || [''])[0]);
        if (a && b) items.push(JA.test(a) && !JA.test(b) ? { en: b, ja: a } : { en: a, ja: b });
      }
    }
  }
  return items;
}

// ---- PDF の 文字（文字の 層が ある PDF だけ。写真だけの PDF は AI が 読む）-----------------------------
let pdftotext = null;
async function hasPdftotext() {
  if (pdftotext === null) pdftotext = await run('pdftotext', ['-v']).then(() => true, (e) => e.code !== 'ENOENT');
  return pdftotext;
}
export async function pdfText(buf) {
  if (!await hasPdftotext()) return '';
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hw-'));
  try {
    const file = path.join(dir, 'in.pdf');
    await fs.writeFile(file, buf);
    const { stdout } = await run('pdftotext', ['-layout', '-enc', 'UTF-8', '-l', '20', file, '-'], { maxBuffer: 8 * 1024 * 1024, timeout: 20000 });
    return String(stdout || '').trim();
  } catch { return ''; } finally { fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// ---- 1 つの ファイルを 読む -------------------------------------------------------------------------
// かえす もの：{ items }（そのまま 使える 問題）か { text }（AI か きまりで 読む 文）か { image }・{ pdf }（AI に わたす）
export async function readFile({ name = '', type = '', data = '' }) {
  const ext = (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
  const buf = Buffer.from(String(data).replace(/^data:[^,]*,/, ''), 'base64');
  const asText = () => buf.toString('utf8').replace(/^﻿/, '');
  if (!buf.length) return { error: `${name}: からの ファイルです` };
  if (/^image\//.test(type) || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    const mime = /^image\//.test(type) ? type : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return { image: `data:${mime};base64,${buf.toString('base64')}` };
  }
  if (['heic', 'heif'].includes(ext)) return { error: `${name}: HEIC は この 画面で JPEG に なおしてから 送ります（Safari・Chrome で ひらいて ください）` };
  if (ext === 'pdf' || type === 'application/pdf') return { pdf: `data:application/pdf;base64,${buf.toString('base64')}`, text: await pdfText(buf), name };
  if (ext === 'xlsx' || ext === 'xlsm') return rowsToItems(xlsxRows(buf));
  if (ext === 'ods') return rowsToItems(odsRows(buf));
  if (ext === 'csv' || ext === 'tsv') return rowsToItems(delimitedRows(asText()));
  if (ext === 'docx') return { text: docxText(buf) };
  if (ext === 'pptx') return { text: pptxText(buf) };
  if (ext === 'odt' || ext === 'odp') return { text: odtText(buf) };
  if (['doc', 'xls', 'ppt'].includes(ext)) return { error: `${name}: 古い 形式（.${ext}）は 読めません。Word・Excel・PowerPoint で .${ext}x に 保存しなおして ください` };
  if (ext === 'json') {
    let j; try { j = JSON.parse(asText()); } catch { return { error: `${name}: JSON が 読めません` }; }
    const list = Array.isArray(j) ? j : Array.isArray(j.items) ? j.items : [];
    return { items: list, format: 'json', title: typeof j.title === 'string' ? j.title : '' };
  }
  if (ext === 'xml' && /<quiz[\s>]/.test(asText())) return { items: parseMoodleXml(asText()), format: 'moodle-xml' };
  if (ext === 'gift') return { items: parseGift(asText()), format: 'gift' };
  // テキスト：書式を 見わける（Aiken → GIFT → 表っぽい → ふつうの 文）
  const t = ext === 'html' || ext === 'htm' ? xmlText(asText().replace(/<(br|p|div|li|tr)[^>]*>/gi, '\n')) : asText();
  if (/^\s*ANSWER\s*:\s*[A-H]\s*$/im.test(t)) { const items = parseAiken(t); if (items.length) return { items, format: 'aiken' }; }
  if (/\{[^}]*[=~][^}]*\}/.test(t)) { const items = parseGift(t); if (items.length) return { items, format: 'gift' }; }
  return { text: t };
}
