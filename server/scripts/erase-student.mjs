#!/usr/bin/env node
// 個人情報の 削除（コマンド版）。Fly の 中で：
//   fly ssh console -a uspeak-multiplayer -C "node server/scripts/erase-student.mjs <クラス> <名前> [Robloxの名前]"
// 画面からは /admin の「この 子の 記録を 消す」。どちらも 同じ privacy.js を 通る。
import path from 'node:path';
import { FileStore } from '../src/store/FileStore.js';
import { ReportStore } from '../src/parent-report/store.js';
import { eraseStudent } from '../src/privacy.js';
import { HomeworkStore } from '../src/homework/store.js';
import { RoadmapStore } from '../src/roadmap/store.js';
import { promises as fs } from 'node:fs';

const [classCode, name, username = ''] = process.argv.slice(2);
if (!classCode || !name) { console.error('usage: erase-student.mjs <classCode> <name> [robloxUsername]'); process.exit(2); }
if (process.env.STORE_BACKEND === 'sheets') { console.error('Google シートの 記録は /admin の 画面から 消してください（players の 行を 空に します）。'); process.exit(2); }
const dataDir = path.resolve(process.env.DATA_DIR || './data');
const store = new FileStore(path.join(dataDir, 'store.json')); await store.init();
const reports = await new ReportStore(path.join(dataDir, 'parent-reports.json')).init();
const dir = path.join(dataDir, 'parent-reports');
const service = { eraseStudent: async (c, u) => { const r = reports.eraseStudent(c, u); for (const t of r.tokens) for (const ext of ['pdf', 'png', 'thumb.png']) await fs.rm(path.join(dir, `${t}.${ext}`), { force: true }).catch(() => {}); await reports.flush(); const { tokens, ...n } = r; return n; } };
const homework = await new HomeworkStore(path.join(dataDir, 'homework.json')).init();
const roadmap = await new RoadmapStore(path.join(dataDir, 'roadmap.json')).init();
const out = await eraseStudent({ store, parentReports: { service }, homework, roadmap }, { classCode, name, username });
await store.close(); await reports.close();
console.log(JSON.stringify(out, null, 2));
