// 名簿スプレッドシートの確認. Reads the register the way the server will, with the
// environment it is given (server/.env or the shell), and prints who is on it — so a
// wrong sheet id, an unshared sheet or a header the parser does not recognise shows up
// here, before a child is refused at the door.
//
//   cd server && node scripts/check-roster.mjs            # every class
//   cd server && node scripts/check-roster.mjs 6-1        # one class, as the gate sees it
//
// Nothing is written to the sheet, and nothing secret is printed: the service account's
// email is shown (that is what the sheet has to be shared with), the key never is.
import { config } from '../src/config.js';
import { createSheetsApi } from '../src/store/index.js';
import { createSheetRoster } from '../src/store/roster-sheet.js';

const sheetId = config.roster.sheetId || config.google.sheetId;
if (!sheetId) {
  console.error('No ROSTER_SHEET_ID (or GOOGLE_SHEET_ID) is set. Put it in server/.env or the environment.');
  process.exit(2);
}
let email = config.google.email;
if (config.google.jsonBase64) {
  try { email = JSON.parse(Buffer.from(config.google.jsonBase64, 'base64').toString('utf8')).client_email || email; } catch { /* reported below */ }
}
console.log(`sheet: ${sheetId}`);
console.log(`service account: ${email || '(none: set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY)'}`);
console.log(`access mode: ${config.accessMode}${config.accessMode !== 'roster' ? '  (the register is not enforced until ACCESS_MODE=roster)' : ''}`);

try {
  const api = await createSheetsApi({ ...config.google, sheetId, readonly: true });
  const roster = createSheetRoster(api, { tab: config.roster.tab, log: { info() {}, warn() {} } });
  const rows = await roster.listAll();
  console.log(`tab: ${roster.tab}`);
  const classCode = process.argv[2];
  if (classCode) {
    const mine = rows.filter((r) => r.class === '*' || r.class.normalize('NFKC').trim().toLowerCase() === classCode.normalize('NFKC').trim().toLowerCase());
    console.log(`${mine.length} name(s) may enter class ${classCode}:`);
    for (const r of mine) console.log(`  ${r.name}${r.class === '*' ? '  (every class)' : ''}${r.note ? `  — ${r.note}` : ''}`);
  } else {
    const byClass = new Map();
    for (const r of rows) { if (!byClass.has(r.class)) byClass.set(r.class, []); byClass.get(r.class).push(r); }
    console.log(`${rows.length} row(s) in ${byClass.size} class group(s):`);
    for (const [cls, list] of byClass) {
      console.log(`  ${cls === '*' ? '(every class)' : cls}: ${list.map((r) => r.name).join(', ')}`);
    }
  }
  if (!rows.length) console.log('The sheet has no names. With ACCESS_MODE=roster only a teacher with TEACHER_KEY can get in.');
} catch (err) {
  console.error(`Could not read the sheet: ${err.message}`);
  if (/403|permission|PERMISSION_DENIED/i.test(err.message)) console.error(`Share the spreadsheet with ${email || 'the service account'} (閲覧者 is enough).`);
  if (/404|not found|Requested entity/i.test(err.message)) console.error('Check the spreadsheet id: the part of the URL between /d/ and /edit.');
  if (/API has not been used|disabled/i.test(err.message)) console.error('Enable the Google Sheets API in the Google Cloud project of this service account.');
  process.exit(1);
}
