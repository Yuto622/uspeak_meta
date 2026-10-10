// 名簿のテキスト — a CSV or a paste from a spreadsheet, turned into rows.
//
// The admin page takes the register as a file (CSV from Excel or Google Sheets) or as
// cells pasted straight out of a spreadsheet (tab-separated). Both land here, and the
// rows go through the same header rules as the Google Sheet reader, so a file exported
// from the sheet and the sheet itself mean the same thing.
import { parseRosterRows } from './roster-sheet.js';

// Bytes from an upload -> text. Excel on Windows writes Shift_JIS CSVs; Google Sheets
// writes UTF-8 (sometimes with a BOM). Decode as UTF-8, and if that produced
// replacement characters, try Shift_JIS, which Node's ICU build knows.
export function decodeUpload(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try { return new TextDecoder('shift_jis').decode(buf); } catch { return utf8.replace(/^﻿/, ''); }
}

// CSV/TSV -> array of rows of cells. RFC 4180 quoting (a cell in quotes may hold the
// delimiter, a newline or a doubled quote). The delimiter is whichever of tab, comma
// and semicolon appears first on the first line — a paste from a spreadsheet is tabs.
export function parseDelimited(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  if (!src.trim()) return [];
  const firstLine = src.split(/\r?\n/, 1)[0];
  let delim = ',';
  let at = Infinity;
  for (const d of ['\t', ',', ';']) { const i = firstLine.indexOf(d); if (i >= 0 && i < at) { at = i; delim = d; } }
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') { quoted = true; continue; }
    if (ch === delim) { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      rows.push(row); row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  rows.push(row);
  // Trailing empty line(s) from a final newline are not rows.
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
  return rows.map((r) => r.map((c) => c.trim()));
}

// Text (CSV, TSV, a paste) -> [{ class, name, note }], ANY_CLASS for every-class rows.
export function rosterFromText(text) {
  return parseRosterRows(parseDelimited(text));
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Rows -> a one-column CSV of names with a `name` header, UTF-8 with a BOM so Excel
// opens the Japanese correctly. It reads back through rosterFromText as every-class rows.
export function rosterToCsv(rows) {
  const lines = ['name,teacher'];
  for (const r of rows) if (r && r.name) lines.push(`${csvCell(r.name)},${r.teacher ? 'TRUE' : 'FALSE'}`);
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
