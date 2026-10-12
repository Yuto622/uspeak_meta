// 保護者レポート（LINE 配信）を 組み立てる 入口。index.js から 1 回 呼ぶ。
// 記録は DATA_DIR/parent-reports.json、ファイルは DATA_DIR/parent-reports/（Fly の ボリューム）。
import path from 'node:path';
import { ReportStore } from './store.js';
import { createRenderer } from './render.js';
import { createLine } from './line.js';
import { createParentReports } from './service.js';
import { mountParentReports } from './routes.js';
import { adminExtension } from './admin.js';

export async function setupParentReports({ store, roblox, dataDir, memory = false, baseUrl = '', log = console, line = null, renderer = null, now = Date.now, secret = '' }) {
  const reports = await new ReportStore(memory ? null : path.resolve(dataDir, 'parent-reports.json'), { log }).init();
  const lineClient = line || createLine({ log });
  const rend = renderer || createRenderer({ log });
  const service = createParentReports({
    store, reports, roblox, renderer: rend, line: lineClient, log, now,
    baseUrl: process.env.REPORT_BASE_URL || baseUrl,
    filesDir: path.resolve(dataDir, memory ? `parent-reports-mem-${process.pid}` : 'parent-reports'),
  });
  return {
    service, reports, line: lineClient, renderer: rend,
    adminExtend: adminExtension({ service, reports, line: lineClient, renderer: rend, store, secret }),
    mount(app, { verifyClass, secret }) { mountParentReports(app, { service, reports, line: lineClient, verifyClass, secret, log }); },
    start() { if (process.env.PARENT_REPORT_SCHEDULER !== '0') this.timer = service.start(); },
    async close() { clearInterval(this.timer); await reports.close(); },
  };
}
