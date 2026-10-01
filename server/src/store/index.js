import path from 'node:path';
import { config } from '../config.js';
import { FileStore } from './FileStore.js';
import { SheetsStore } from './SheetsStore.js';
import { createSheetRoster } from './roster-sheet.js';

// Thin adapter over the Google Sheets v4 client so SheetsStore stays testable.
// `readonly` asks for the read-only scope: the roster sheet is never written to.
export async function createSheetsApi({ sheetId, email, privateKey, jsonBase64, readonly = false }) {
  const { sheets } = await import('@googleapis/sheets');
  const { JWT } = await import('google-auth-library');
  let credentials = { email, key: privateKey };
  if (jsonBase64) {
    const parsed = JSON.parse(Buffer.from(jsonBase64, 'base64').toString('utf8'));
    credentials = { email: parsed.client_email, key: parsed.private_key };
  }
  if (!credentials.email || !credentials.key) throw new Error('Google service account credentials are missing');
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is missing');
  const auth = new JWT({ email: credentials.email, key: credentials.key, scopes: [readonly ? 'https://www.googleapis.com/auth/spreadsheets.readonly' : 'https://www.googleapis.com/auth/spreadsheets'] });
  const svc = sheets({ version: 'v4', auth });
  const spreadsheetId = sheetId;
  return {
    async getSheetTitles() {
      const r = await svc.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
      return (r.data.sheets || []).map((s) => s.properties.title);
    },
    async addSheet(title) {
      await svc.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title } } }] } });
    },
    async getValues(range) {
      const r = await svc.spreadsheets.values.get({ spreadsheetId, range });
      return r.data.values || [];
    },
    async update(range, values) {
      await svc.spreadsheets.values.update({ spreadsheetId, range, valueInputOption: 'RAW', requestBody: { values } });
    },
    async batchUpdate(data) {
      await svc.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
    },
    async append(range, values) {
      const r = await svc.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values },
      });
      return r.data.updates?.updatedRange || '';
    },
  };
}

export async function createStore(log = console) {
  const backend = config.storeBackend === 'auto' ? (config.google.sheetId ? 'sheets' : 'file') : config.storeBackend;
  let store;
  if (backend === 'sheets') {
    const api = await createSheetsApi(config.google);
    store = new SheetsStore(api, { log });
  } else if (backend === 'memory') {
    store = new FileStore(null, { log });
  } else {
    store = new FileStore(path.resolve(config.dataDir, 'store.json'), { log });
  }
  await store.init();
  // 名簿. The Sheets store carries its own `roster` tab; any other backend may read the
  // register from a spreadsheet of its own, or falls back to the store's (roster.json).
  // An explicit ROSTER_SHEET_ID wins whatever the backend.
  let roster = store;
  const rosterSheetId = config.roster.sheetId || (backend !== 'sheets' ? config.google.sheetId : '');
  if (rosterSheetId && (backend !== 'sheets' || config.roster.sheetId)) {
    const api = await createSheetsApi({ ...config.google, sheetId: rosterSheetId, readonly: true });
    roster = createSheetRoster(api, { tab: config.roster.tab, log });
    // A probe, so a wrong id or an unshared sheet shows up in the logs at start-up and
    // not at the first child's arrival. Never fatal: the gate has its fallbacks.
    try {
      const rows = await roster.listAll();
      log.info(`[roster] google sheet ${rosterSheetId.slice(0, 6)}… tab="${roster.tab}" rows=${rows.length}`);
      if (!rows.length) log.warn('[roster] the register sheet is empty: nobody but a teacher can get in while ACCESS_MODE=roster');
    } catch (err) {
      log.warn(`[roster] the register sheet could not be read: ${err.message} (is it shared with the service account?)`);
    }
  }
  const timer = setInterval(() => store.flush().catch((err) => log.warn('[store] flush error:', err.message)), config.storeFlushMs);
  timer.unref();
  const close = async () => { clearInterval(timer); await store.close(); };
  log.info(`[store] backend=${store.name} flush=${config.storeFlushMs}ms register=${roster === store ? store.name : roster.name}`);
  return { store, roster, close };
}
