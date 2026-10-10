// 名簿スプレッドシート — the class register read from a Google Sheet, on its own.
//
// Until now the register could only come from the store: the `roster` tab of the Sheets
// store, or data/roster.json beside the file store. A school that keeps its progress on
// the Fly volume (the file store) had to hand-edit a JSON file on the server to add a
// child. This reader lets the register be a spreadsheet the teacher owns and edits in a
// browser, while the game's own data stays wherever it is.
//
// It only ever reads (spreadsheets.readonly), so the service account can be given the
// sheet as a 閲覧者, and nothing this server does can change the teacher's list.
//
// Sheet shape, forgiving on purpose (a teacher types this by hand):
//   class | name | note     the first row may be a header (class/name/note, クラス/名前/メモ)
//   6-1   | Aki  |
//         | Sora |          an empty class, or *, means "every class"
//   *     | Sensei-no-ko |
// A sheet with only one column is a list of names for every class.
// The tab is ROSTER_SHEET_TAB if set, else a tab called `roster`, else the first tab.

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const HEADER_CLASS = new Set(['class', 'クラス', 'くらす', 'class code', 'classcode', 'クラスコード', '組', 'クラス名']);
const HEADER_NAME = new Set(['name', 'なまえ', '名前', 'account', 'アカウント', 'アカウント名', 'account name', 'user', 'ユーザー', 'ユーザー名', 'id']);
export const ANY_CLASS = '*';
// 先生の 列（2026-10）：true の 人は 講師キーなしで 先生として 入る（授業モードの ボタンが 出る）。
const HEADER_TEACHER = new Set(['teacher', 'is teacher', 'isteacher', '先生', 'せんせい', '先生か', '講師', 'role', 'ロール']);
const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'はい', '○', '◯', 'o', '先生', 'せんせい', 'teacher', '講師', 'on', '✓', '✔']);
export const isTrueCell = (v) => v === true || TRUE_WORDS.has(fold(v));

// Rows straight from the sheet (arrays of cell strings) -> [{ class, name, note }].
// `class` is ANY_CLASS for a row that applies to every class.
export function parseRosterRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const cells = rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []));
  let classCol = 0; let nameCol = 1; let noteCol = 2; let teacherCol = -1; let start = 0;
  const first = cells[0].map(fold);
  const headerName = first.findIndex((c) => HEADER_NAME.has(c));
  const headerClass = first.findIndex((c) => HEADER_CLASS.has(c));
  if (headerName >= 0) {
    // A labelled sheet: the columns are wherever the teacher put them.
    nameCol = headerName;
    classCol = headerClass;                     // -1 when there is no class column at all
    teacherCol = first.findIndex((c) => HEADER_TEACHER.has(c));
    noteCol = first.findIndex((c, i) => i !== nameCol && i !== classCol && i !== teacherCol && c);
    start = 1;
  } else if (headerClass >= 0) {
    classCol = headerClass; nameCol = first.findIndex((c, i) => i !== classCol); start = 1;
  } else {
    // No header. One column is a list of names; two or more are class | name | note.
    const widest = Math.max(...cells.map((r) => r.filter(Boolean).length));
    if (widest <= 1) { classCol = -1; nameCol = 0; noteCol = -1; }
  }
  const out = [];
  for (const row of cells.slice(start)) {
    const name = row[nameCol] ?? '';
    if (!name) continue;
    const cls = classCol >= 0 ? (row[classCol] ?? '') : '';
    const note = noteCol >= 0 ? (row[noteCol] ?? '') : '';
    const teacher = teacherCol >= 0 && isTrueCell(row[teacherCol] ?? '');
    out.push({ class: !cls || cls === ANY_CLASS ? ANY_CLASS : cls, name, note, ...(teacher ? { teacher: true } : {}) });
  }
  return out;
}

// The rows that admit someone to `classCode`: that class's rows and the every-class rows.
export function rowsForClass(rows, classCode) {
  const wanted = fold(classCode);
  return rows.filter((r) => r.class === ANY_CLASS || fold(r.class) === wanted).map((r) => ({ ...r, class: classCode }));
}

// api: { getSheetTitles(), getValues(range) } — the read half of createSheetsApi.
export function createSheetRoster(api, { tab = '', log = console } = {}) {
  let resolvedTab = tab;
  async function tabName() {
    if (resolvedTab) return resolvedTab;
    const titles = await api.getSheetTitles();
    if (!titles.length) throw new Error('the roster spreadsheet has no tabs');
    resolvedTab = titles.includes('roster') ? 'roster' : titles[0];
    log.info?.(`[roster] reading the register from tab "${resolvedTab}"`);
    return resolvedTab;
  }
  return {
    name: 'google-sheet',
    get tab() { return resolvedTab; },
    // Every row on the sheet, parsed. Used by the probe at start-up and the check script.
    async listAll() {
      const name = await tabName();
      return parseRosterRows(await api.getValues(`'${name.replace(/'/g, "''")}'!A1:D`));
    },
    async listRoster(classCode) {
      return rowsForClass(await this.listAll(), classCode);
    },
  };
}
