import path from 'node:path';
import { config } from '../config.js';
import { FileStore } from './FileStore.js';
import { SheetsStore } from './SheetsStore.js';

// Thin adapter over the Google Sheets v4 client so SheetsStore stays testable.
export async function createSheetsApi({ sheetId, email, privateKey, jsonBase64 }) {
  const { sheets } = await import('@googleapis/sheets');
  const { JWT } = await import('google-auth-library');
  let credentials = { email, key: privateKey };
  if (jsonBase64) {
    const parsed = JSON.parse(Buffer.from(jsonBase64, 'base64').toString('utf8'));
    credentials = { email: parsed.client_email, key: parsed.private_key };
  }
  if (!credentials.email || !credentials.key) throw new Error('Google service account credentials are missing');
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID is missing');
  const auth = new JWT({ email: credentials.email, key: credentials.key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
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
  const timer = setInterval(() => store.flush().catch((err) => log.warn('[store] flush error:', err.message)), config.storeFlushMs);
  timer.unref();
  const close = async () => { clearInterval(timer); await store.close(); };
  log.info(`[store] backend=${store.name} flush=${config.storeFlushMs}ms`);
  return { store, close };
}
