import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { Server, matchMaker, WebSocketTransport } from './colyseus.js';
import { createBlockwildServer } from './blockwild/server.js';
import { config, validateConfig } from './config.js';
import { createStore, createSheetsApi } from './store/index.js';
import { createRobloxSeats } from './parent-report/roblox-seats.js';
import { createAccess } from './game/access.js';
import { mountAdmin } from './admin/roster-admin.js';
import { eraseStudent, startRetention, rateLimit } from './privacy.js';
import { TaskStore } from './tasks/store.js';
import { tasksAdminExtension } from './tasks/admin.js';
import { QBankStore } from './qbank/store.js';
import { qbankAdminExtension } from './qbank/admin.js';
import { HomeworkStore } from './homework/store.js';
import { homeworkAdminExtension } from './homework/admin.js';
import { RoadmapStore } from './roadmap/store.js';
import { createRoadmapService } from './roadmap/service.js';
import { roadmapAdminExtension } from './roadmap/admin.js';
import { mountRoadmapApi } from './roadmap/api.js';
import { roadmapClassHtml } from './roadmap/pages.js';
import { setQbankWords } from './game/roadmap.js';
import { setPierQuestions } from './game/eiken-pier.js';
import { setExtraQuestions } from './game/eiken.js';
import { ClassRoom } from './rooms/ClassRoom.js';
import { createTutor } from './ai/tutor.js';
import { createTts } from './tts/service.js';
import { reportFor, reportHtml, reportNoLatexHtml, verifyReport, verifyExport, verifyClass, classCsv, certHtml } from './game/report.js';
import { classView, classHtml } from './game/classview.js';
import { rankings, standingOf, classRankingHtml } from './game/rankings.js';
import { weekIndex } from './game/daily.js';
import { sanitizeMonths } from './game/months.js';
import { reportTex } from './game/report-tex.js';
import { texToPdf, latexAvailable, LatexError } from './game/latex.js';
import { createRoblox, verifyRobloxReport } from './roblox/sync.js';
import { parentHtml as robloxParentHtml, classSection as robloxClassSection, classCsv as robloxClassCsv } from './roblox/pages.js';
import { setupParentReports } from './parent-report/index.js';
import { log } from './log.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '../../client/dist');

export function originAllowed(origin) {
  if (!origin) return true; // same-origin requests and non-browser clients send no Origin header
  if (config.corsOrigins.includes('*')) return true;
  if (!config.corsOrigins.length) return !config.isProduction;
  return config.corsOrigins.includes(origin);
}

// CPU sampler for /healthz: percentage of one core over the last sample window.
function createCpuSampler(intervalMs = 2000) {
  let last = process.cpuUsage();
  let lastAt = process.hrtime.bigint();
  let percent = 0;
  const timer = setInterval(() => {
    const usage = process.cpuUsage(last);
    const now = process.hrtime.bigint();
    const elapsedUs = Number(now - lastAt) / 1000;
    percent = elapsedUs > 0 ? Math.round(((usage.user + usage.system) / elapsedUs) * 1000) / 10 : 0;
    last = process.cpuUsage();
    lastAt = now;
  }, intervalMs);
  timer.unref();
  return () => percent;
}

export async function startServer({ port = config.port, storeOverride = null, ttsGenerate = null } = {}) {
  const problems = validateConfig(log);
  if (problems.length) {
    for (const p of problems) log.error('[config]', p);
    throw new Error('invalid configuration');
  }
  const { store, roster, close: closeStore } = storeOverride ? { store: storeOverride, roster: storeOverride, close: async () => {} } : await createStore(log);
  // 入場の切り替えと名簿: shared by the rooms' gates and the admin page.
  const access = createAccess({ store, roster, dataDir: config.dataDir, envMode: config.accessMode, envModeSet: config.accessModeSet, log });
  await access.init();
  const cpuPercent = createCpuSampler();
  const startedAt = Date.now();
  // Roblox 連携（roblox/sync.js）: 学習の記録を受け、コインを両側で同じにする。鍵がなければ口は開かない。
  const roblox = createRoblox({ store, key: config.roblox.key, ratePerMin: config.roblox.ratePerMin, reportSecret: config.reportSecret, questions: () => ({ updatedAt: qbank.updatedAt, items: qbank.live('roblox') }), log });
  await roblox.ensureSeeds();
  await roblox.refreshLinks();

  // 保護者レポート（LINE 配信・parent-report/）。記録と ファイルは ボリュームの DATA_DIR。教室が オンに するまで 何も 送らない。
  // Roblox の 座席シート（あれば）。共有されていなくても 起動は 止めない（ログに 出すだけ）。
  let seats = null;
  if (config.robloxSeats.sheetId && (config.google.jsonBase64 || (config.google.email && config.google.privateKey))) {
    try {
      seats = createRobloxSeats({ api: await createSheetsApi({ ...config.google, sheetId: config.robloxSeats.sheetId, readonly: true }), log });
      seats.refresh().then(async () => log.info(`[parent-report] Roblox seat sheet: ${(await seats.classes()).length} classes, ${(await seats.seats()).length} seats`));
    } catch (err) { log.warn('[parent-report] Roblox seat sheet disabled:', err.message); }
  }
  // 宿題（/admin/homework で 入れて くばる。宿題島で とく）。答えつきなので DATA_DIR に だけ 置く。保護者レポート（LINE）も 読む。
  const homework = await new HomeworkStore(config.storeBackend === 'memory' ? null : path.resolve(config.dataDir, 'homework.json'), { log }).init();
  // ロードマップ（A・B・C・1〜9）。設定と 段階は DATA_DIR/roadmap.json、計算は 記録（Roblox と Web）から 毎回。
  const roadmapStore = await new RoadmapStore(config.storeBackend === 'memory' ? null : path.resolve(config.dataDir, 'roadmap.json'), { log }).init();
  const roadmap = createRoadmapService({ store, roadmap: roadmapStore, roblox, log });
  const parentReports = await setupParentReports({
    store, roster, seats, roblox, homework, roadmap, dataDir: config.dataDir, memory: config.storeBackend === 'memory', log, secret: config.reportSecret,
    baseUrl: config.corsOrigins.find((o) => /^https?:\/\//.test(o)) || '',
  });

  // タスクの 表（/admin/tasks で 書きかえる。ゲームは /api/tasks で 採用の 行だけ 読む）。
  // テスト（node --test）では ほかの 検査の コインの 数を うごかさないよう 切る。タスクの 検査は TASKS=on で 入れる。
  const tasksOn = process.env.TASKS === 'on' || (process.env.TASKS !== 'off' && !process.env.NODE_TEST_CONTEXT);
  // 問題データベース（/admin/qbank）。web版に出す 問題は 英検の島に まざり、Robloxに出す 問題は /api/roblox/questions で 取られる。
  const qbank = await new QBankStore(config.storeBackend === 'memory' ? null : path.resolve(config.dataDir, 'qbank.json'), { log }).init();
  qbank.onChange((q) => { const added = setExtraQuestions(q.live('web')); if (q.items.length) log.info('[qbank] web questions mixed in:', JSON.stringify(added)); setQbankWords(q.items.filter((it) => it.on !== false)); setPierQuestions(q.live('web')); });
  const tasks = await new TaskStore(config.storeBackend === 'memory' ? null : path.resolve(config.dataDir, 'tasks.json'), { log }).init();

  const app = express();
  app.disable('x-powered-by');
  // Fly の 前段 1 つだけ 信じる（true だと X-Forwarded-For の 左はし＝利用者が 書ける 値が req.ip に なり、しめ出しが すり抜けられる）。
  app.set('trust proxy', 1);
  app.use(cors({ origin: (origin, cb) => cb(null, originAllowed(origin)), credentials: false }));
  // gzip the static client: three.module.js is the official minified r160 (670 KB raw), which matters
  // when a whole class (or several) opens the page at the same moment on one Wi-Fi AP.
  app.use(compression({ threshold: 1024 }));
  // 個人情報の 守り：どの へんじにも つける 頭。
  // - HSTS：https で 来た ときだけ（Fly の 前段が https を 終える。http の LAN 配信では つけない）
  // - frame は 同じ origin だけ（同梱ゲームの iframe は 同じ origin。よその サイトに 埋められて 子どもの 画面を 盗まれない）
  // - カメラ・マイクは 自分だけ、よその サイトからは 使えない。Referrer は よそへ 送らない（URL に クラス・名前が 入ることが ある）。
  // CSP：script は 自分の ファイルと インライン（index.html・管理画面）、外から 読むのは Google Fonts と LINE の LIFF SDK だけ。
  // つなぐ 先は 自分（wss も）・LiveKit・LINE。よその サイトへ 子どもの 情報を 送る script は 動かない。iframe は 同梱ゲーム（自分）だけ。
  const lk = config.livekit?.url ? config.livekit.url.replace(/^ws/, 'http') : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.line-scdn.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.line-scdn.net https://profile.line-scdn.net",
    "media-src 'self' blob: data:",
    `connect-src 'self' ws: wss: https://api.line.me https://access.line.me${lk ? ' ' + lk + ' ' + lk.replace(/^http/, 'ws') : ''}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://access.line.me",
  ].join('; ');
  app.use((req, res, next) => {
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Content-Security-Policy', csp);
    next();
  });

  // 問題の形式（7つ）の見た目と操作を試す開発用のページ（client/dist/dev-formats.html）。
  app.get('/dev/formats', (req, res) => res.redirect(302, '/dev-formats.html'));

  app.get('/healthz', (req, res) => {
    const mem = process.memoryUsage();
    res.set('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      rooms: matchMaker.stats.local.roomCount,
      clients: matchMaker.stats.local.ccu,
      cpuPercent: cpuPercent(),
      memory: { rssMb: Math.round((mem.rss / 1048576) * 10) / 10, heapUsedMb: Math.round((mem.heapUsed / 1048576) * 10) / 10 },
      store: { backend: store.name, pending: store.pendingCount ?? 0, ...(store.stats || {}) },
      // 入場ゲート: the mode and where the register comes from, never a name on it.
      gate: { mode: access.mode(), register: access.source, admin: !!config.adminKey },
      // Roblox 連携: 鍵が入っているか（鍵そのものは出さない）。
      roblox: { enabled: roblox.enabled },
      // **鍵が効いているかを、ここで1目で見られるようにしてある。** `OPENAI_API_KEY` を
      // 入れたのに AI が動かないとき、いままでは `fly logs` の `[tutor] provider=` を
      // 探すしかなかった。**出しているのは「鍵が入っているか」だけ**で、鍵そのものも
      // その一部も出さない（ブラウザーには昔から何も渡していない）。
      // `scripted` は 台本の相手。AI は止まっていて、授業はそのまま進む。
      ai: { provider: config.ai.apiKey ? 'openai' : 'scripted', model: config.ai.apiKey ? config.ai.model : '', dailyTurnsPerStudent: config.ai.dailyTurnsPerStudent },
      voice: { dailyMinutesPerStudent: config.voice.dailyMinutesPerStudent, bigRoom: !!(config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret) },
    });
  });

  // Runtime client configuration generated from environment variables.
  app.get('/config.js', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.send(`window.USPEAK_CONFIG=${JSON.stringify({ serverUrl: config.publicServerUrl || '', defaultClass: config.publicDefaultClass || '', maxClients: config.maxClients, net: config.netOverrides })};\n`);
  });

  // 保護者レポート. One child, one signed link, no login and no third party. Without a
  // REPORT_SECRET the route is not mounted at all — a guessable link would show one
  // family another family's child.
  if (config.reportSecret) {
    // クラスぜんぶを1枚の CSV に。**教室が自分の記録を持ち出せること**が、この口の
    // 目的そのもの。出せるほうが導入されやすく、実際には誰も出ていかない。
    // 署名は1人ぶんのリンクとは別（`export|<クラス>`）なので、子どものリンクを
    // クラス全員ぶんに読み替えることはできない。
    app.get('/export/:classCode.csv', async (req, res) => {
      const classCode = req.params.classCode;
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      if (!verifyExport(config.reportSecret, classCode, req.query.t)) {
        res.status(404).type('text/plain; charset=utf-8').send('見つかりません。先生コンソールからリンクを取り直してください。');
        return;
      }
      let records = [];
      try { records = store.listClass?.(classCode) || []; } catch (err) { log.warn('[export] listClass failed:', err.message); }
      const file = `uspeak-${classCode}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/[^\w.-]+/g, '_');
      res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${file}"`);
      res.send(classCsv(records));
    });

    // 教室のようす（オーナー向け）。利用継続率・はじめたばかりの子・声かけの結果・英検の準会場。
    // **子どもの名前が載る**ので、CSV と同じく署名つき。ただし署名の文字は CSV とも
    // 1人ぶんとも別（`class|<クラス>`）で、どちらのリンクもここには読み替えられない。
    app.get('/class/:classCode', async (req, res) => {
      const classCode = req.params.classCode;
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      if (!verifyClass(config.reportSecret, classCode, req.query.t)) {
        res.status(404).type('text/plain; charset=utf-8').send('見つかりません。先生コンソールからリンクを取り直してください。');
        return;
      }
      let records = [];
      try { records = store.listClass?.(classCode) || []; } catch (err) { log.warn('[class] listClass failed:', err.message); }
      const view = classView(records, { classCode, sanitizeMonths });
      // Roblox の学習の表。鍵が無くても、記録が貯まっていれば出す（記録は消さないので）。
      let robloxRows = [];
      try { robloxRows = await roblox.classRows(classCode, { records }); } catch (err) { log.warn('[class] roblox rows failed:', err.message); }
      // ロードマップ：Web の 名簿の 子と、Roblox だけの 子。
      let roadmapRows = [];
      try {
        const names = [...new Set([...records.filter((r) => r?.name && r.role !== 'teacher').map((r) => r.name), ...robloxRows.map((r) => r.name || r.username).filter(Boolean)])];
        roadmapRows = await roadmap.classList(classCode, names);
      } catch (err) { log.warn('[class] roadmap failed:', err.message); }
      if (String(req.query.format || '').toLowerCase() === 'json') { res.json({ ...view, rankings: rankings(records, { weekKey: weekIndex() }), roblox: robloxRows.map(({ reportToken, ...r }) => r), roadmap: roadmapRows }); return; }
      const parentsLink = `<section style="margin:16px 0;padding:14px 16px;border-radius:14px;background:#fff3e6;border:1px solid #f0c9a5"><b>📨 保護者レポート（LINE配信）</b> — 配信の設定・QRカードの印刷・先生のひとこと：<a href="/class/${encodeURIComponent(classCode)}/parents?t=${encodeURIComponent(String(req.query.t || ''))}">ひらく →</a></section>`;
      res.type('text/html; charset=utf-8').send(classHtml(view, { extra: parentsLink + roadmapClassHtml(roadmapRows, { classCode, token: String(req.query.t || ''), saved: String(req.query.saved || '') }) + classRankingHtml(rankings(records, { weekKey: weekIndex() })) + robloxClassSection(robloxRows, { classCode, token: String(req.query.t || '') }) }));
    });

    // ロードマップの 段階を 先生が 手で かえる（/class の 表の フォーム）。署名は 教室ページと 同じ。
    app.post('/class/:classCode/roadmap', express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
      const classCode = req.params.classCode;
      const t = String(req.body?.t || '');
      res.set('Cache-Control', 'no-store');
      if (!verifyClass(config.reportSecret, classCode, t)) { res.status(404).type('text/plain; charset=utf-8').send('見つかりません。'); return; }
      const name = String(req.body?.name || '').trim().slice(0, 40);
      const r = name ? await roadmap.setStage(classCode, name, String(req.body?.stage || '')) : { ok: false };
      const saved = r.ok ? `${name} さんを ${req.body.stage} に しました` : '';
      res.redirect(303, `/class/${encodeURIComponent(classCode)}?t=${encodeURIComponent(t)}&saved=${encodeURIComponent(saved)}#roadmap`);
    });

    // 先生ページの Roblox の表を CSV に。署名は教室ページと同じ。
    app.get('/class/:classCode/roblox.csv', async (req, res) => {
      const classCode = req.params.classCode;
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      if (!verifyClass(config.reportSecret, classCode, req.query.t)) {
        res.status(404).type('text/plain; charset=utf-8').send('見つかりません。先生コンソールからリンクを取り直してください。');
        return;
      }
      let records = [];
      try { records = store.listClass?.(classCode) || []; } catch (err) { log.warn('[class] listClass failed:', err.message); }
      const rows = await roblox.classRows(classCode, { records });
      const file = `uspeak-roblox-${classCode}-${new Date().toISOString().slice(0, 10)}.csv`.replace(/[^\w.-]+/g, '_');
      res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${file}"`);
      res.send(robloxClassCsv(rows));
    });

    // Roblox の保護者ページ。1人ぶんの署名つきリンク（`roblox|<username>`）。
    // `/report/<クラス>/<名前>` とは段の数が違うので、ぶつからない。
    app.get('/report/:username', async (req, res) => {
      const { username } = req.params;
      res.set('Cache-Control', 'no-store');
      res.set('Referrer-Policy', 'no-referrer');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      if (!verifyRobloxReport(config.reportSecret, username, req.query.t)) {
        res.status(404).type('text/plain; charset=utf-8').send('レポートが見つかりません。先生にリンクを確認してください。');
        return;
      }
      const summary = await roblox.summaryFor(username);
      if (String(req.query.format || '').toLowerCase() === 'json') { res.json(summary); return; }
      res.type('text/html; charset=utf-8').send(robloxParentHtml(summary));
    });

    app.get('/report/:classCode/:name', async (req, res) => {
      const { classCode, name } = req.params;
      res.set('Cache-Control', 'no-store');
      // Referrers and search engines are told to keep out; the link is for one family.
      res.set('Referrer-Policy', 'no-referrer');
      res.set('X-Robots-Tag', 'noindex, nofollow');
      if (!verifyReport(config.reportSecret, classCode, name, req.query.t)) {
        res.status(404).type('text/plain; charset=utf-8').send('レポートが見つかりません。先生にリンクを確認してください。');
        return;
      }
      let record = null;
      try { record = await store.loadPlayer(classCode, name); } catch (err) { log.warn('[report] loadPlayer failed:', err.message); }
      // **年度またぎ。** 4月にクラスが変わると記録は新しいクラスの下へ移るが、
      // 保護者に配ったリンクは去年のまま（署名がクラス名を含むので発行し直せない）。
      // 引っ越し先が書いてあれば、そちらを読んで見せる。**去年配った紙が、来年も動く。**
      // 追いかけるのは1回だけ（表が壊れて輪になっても止まる）。
      if (record?.moved_to) {
        try {
          const next = await store.loadPlayer(record.moved_to, name);
          if (next && !next.moved_to) record = next;
        } catch (err) { log.warn('[report] could not follow moved_to:', err.message); }
      }
      if (!record) {
        res.status(404).type('text/plain; charset=utf-8').send('まだ記録がありません。一度あそんでから、もう一度ひらいてください。');
        return;
      }
      const report = reportFor(record);
      // クラスの なかの 順位（その 子の ぶんだけ）。
      try { report.ranks = standingOf(rankings(store.listClass?.(record.class) || [], { weekKey: weekIndex() }), record.name); } catch (err) { log.warn('[report] ranks failed:', err.message); report.ranks = []; }
      // 宿題（くばった もの・その 子の すすみぐあい）。
      try { report.homework = homework.listFor(record.class, record.name); } catch (err) { log.warn('[report] homework failed:', err.message); report.homework = []; }
      // ロードマップ（今の 段階・次まで・英検の 見込み）。見るだけ（ここでは 段階を 上げない）。
      try { report.roadmap = await roadmap.view(record.class, record.name, { advance: false }); } catch (err) { log.warn('[report] roadmap failed:', err.message); report.roadmap = null; }
      const token = String(req.query.t || '');
      const format = String(req.query.format || '').toLowerCase();
      if (format === 'json') { res.json(report); return; }
      const file = `uspeak-${classCode}-${name}`.replace(/[^\w.-]+/g, '_');
      // The LaTeX source. Always available, needs nothing installed, and a teacher who
      // wants to change a word can: it is one readable file.
      if (format === 'tex') {
        res.type('application/x-tex; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${file}.tex"; filename*=UTF-8''${encodeURIComponent(`${name}.tex`)}`);
        res.send(reportTex(report));
        return;
      }
      // The PDF, if this server has a TeX engine. If it has not, say so on a page that
      // hands over the .tex and the one command that installs it, rather than 500ing at
      // a parent who tapped a button.
      if (format === 'pdf') {
        if (!await latexAvailable()) {
          res.status(501).type('text/html; charset=utf-8')
            .send(reportNoLatexHtml(report, { token, backUrl: req.originalUrl }));
          return;
        }
        try {
          const pdf = await texToPdf(reportTex(report), { name: file });
          res.type('application/pdf');
          res.set('Content-Disposition', `inline; filename="${file}.pdf"; filename*=UTF-8''${encodeURIComponent(`${name}.pdf`)}`);
          res.send(pdf);
        } catch (err) {
          log.warn('[report] pdf failed:', err instanceof LatexError ? err.message : err);
          res.status(500).type('text/html; charset=utf-8')
            .send(reportNoLatexHtml(report, { token, backUrl: req.originalUrl, failed: true }));
        }
        return;
      }
      // 学習の記録証（印刷用の1枚）。
      if (format === 'cert') { res.type('text/html; charset=utf-8').send(certHtml(report)); return; }
      // `view=meet` は面談用：いちばん上に「きょう お話しすること」を出す。
      // **中身は保護者のレポートと同じ**（先生だけのメモは入らない）ので、同じ署名で開ける。
      const view = String(req.query.view || '') === 'meet' ? 'meet' : '';
      res.type('text/html; charset=utf-8').send(reportHtml(report, { token, view }));
    });
  }

  // 管理ページ. Mounted only with ADMIN_KEY (admin/roster-admin.js).
  const tasksAdmin = tasksAdminExtension({ tasks, log });
  const qbankAdmin = qbankAdminExtension({ qbank, log });
  const homeworkAdmin = homeworkAdminExtension({ homework, aiReady: !!config.ai.apiKey, rosterClasses: async () => ((await roster.listAllRoster?.()) || []).map((r) => r.class), log });
  const roadmapAdmin = roadmapAdminExtension({ roadmap: roadmapStore, log });
  // 個人情報の 削除（/admin の「この 子の 記録を 消す」）。名簿の 行は 先生が 名簿で 消す。
  const privacyAdmin = ({ api }) => {
    api.post('/erase', express.json({ limit: '4kb' }), async (req, res) => {
      const classCode = String(req.body?.classCode || '').trim().slice(0, 40);
      const name = String(req.body?.name || '').trim().slice(0, 40);
      const username = String(req.body?.username || '').trim().slice(0, 40);
      if (!classCode || !name) { res.status(400).json({ ok: false, error: 'クラスと 名前が いります' }); return; }
      try { res.json({ ok: true, ...(await eraseStudent({ store, parentReports, homework, roadmap: roadmapStore, log }, { classCode, name, username })) }); }
      catch (err) { log.warn('[privacy] erase failed:', err.message); res.status(500).json({ ok: false, error: '消せませんでした' }); }
    });
  };
  mountAdmin(app, { access, roblox, adminKey: config.adminKey, teacherKeySet: !!config.teacherKey, isProduction: config.isProduction, log, extend: (ctx) => { parentReports.adminExtend?.(ctx); tasksAdmin(ctx); qbankAdmin(ctx); homeworkAdmin(ctx); roadmapAdmin(ctx); privacyAdmin(ctx); } });
  // 保持期間（RETENTION_DAYS、既定 400 日）：学習ログ・コインログ・送信の 記録を 毎日 消す。
  const stopRetention = startRetention({ store, parentReports, days: config.retentionDays, log });
  // 子どもの 名前や リンクが 入る 口には 1 つの IP から 1 分 120 回まで（総当たりの 守り）。
  app.use(['/api/liff', '/r', '/report', '/class', '/export'], rateLimit({ windowMs: 60_000, max: 120 }));
  app.get('/api/tasks', (req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json({ ok: true, updatedAt: tasks.updatedAt, ...tasks.adopted() }); });
  // 保護者レポートの 口（Webhook・LIFF・/r/:token・教室の タブ）。
  parentReports.mount(app, { verifyClass, secret: config.reportSecret });
  // Roblox 版からの口（鍵がなければ開かない）。
  roblox.mount(app);
  // 自然な 声（鍵が なければ 503 で、ブラウザの 声に もどる）。
  const tts = createTts({ dir: config.storeBackend === 'memory' ? '' : path.resolve(config.dataDir, 'tts'), apiKey: config.ai.apiKey, model: config.ai.ttsModel, voice: config.ai.ttsVoice, dailyNew: config.ai.ttsDailyNew, timeoutMs: config.ai.timeoutMs, generate: ttsGenerate, log });
  tts.mount(app);
  mountRoadmapApi(app, { service: roadmap, roadmap: roadmapStore, roblox, key: config.roblox.key, log });

  if (config.serveClient) {
    // このゲームのファイル名にはバージョンが入っていない（`game.js` は毎回 `game.js`）。
    // なので1時間の max-age をそのまま当てると、**新しい版を出した直後の1時間、教室の
    // iPad には古いものが出る**。実際それで「直したはずのものが出ない」が起きた。
    //
    // 自分たちの js と css は `no-cache`＝**毎回サーバーに聞く**。変わっていなければ
    // ETag で 304 が返るので、中身は流れない（要求1つ分だけ）。
    //
    // 同梱ゲーム（racers / blockwild / puyo / suika）と character の動画は別扱い。
    // あちらは丸ごと差し替えるまで1バイトも変わらないうえ、1本で何百ファイル・数MB
    // あるので、開くたびに全部へ問い合わせると目に見えて遅くなる。長めに持たせる。
    // ホーム画面の アイコン（PWA）は manifest の start_url で 開く。教室ごとの URL（`/?class=...`）から
    // 追加したら そのクラスで 開くように、index.html が `?class=` を つけて 取りに くる。
    let manifest = null;
    app.get('/manifest.webmanifest', async (req, res, next) => {
      try {
        manifest ||= JSON.parse(await fs.promises.readFile(path.join(clientDir, 'manifest.webmanifest'), 'utf8'));
      } catch { next(); return; }
      const cls = String(req.query.class || '').trim().slice(0, 64);
      res.set('Cache-Control', 'no-cache');
      res.type('application/manifest+json').send(JSON.stringify({ ...manifest, start_url: cls ? `/?class=${encodeURIComponent(cls)}` : '/' }));
    });
    const VENDORED = /[\\/](racers|blockwild|puyo|suika|assets|vendor)[\\/]/;
    app.use(express.static(clientDir, {
      maxAge: '1h',
      etag: true,
      setHeaders(res, filePath) {
        if (VENDORED.test(filePath)) { res.setHeader('Cache-Control', 'public, max-age=86400'); return; }
        if (/\.(js|mjs|css|html|json|webmanifest)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
  }

  // エラーは 中身を 出さない（スタック・パス・シートの エラー文を 子どもや 攻撃者に 見せない）。ログにだけ。
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    log.warn(`[http] ${req.method} ${req.path}: ${err.status || 500} ${err.message}`);
    const status = err.status || err.statusCode || 500;
    res.status(status).type('text/plain; charset=utf-8').send(status === 413 ? 'too large' : status === 400 ? 'bad request' : 'うまく いきませんでした。もう一度 ためしてください。');
  });

  const server = http.createServer(app);
  const transport = new WebSocketTransport({
    server,
    pingInterval: 3000,
    pingMaxRetries: 2,
    maxPayload: 64 * 1024,
    verifyClient: (info, next) => next(originAllowed(info.origin)),
  });
  const gameServer = new Server({ transport, gracefullyShutdown: false });
  // BLOCKWILD's own room server, on this port, behind Colyseus's door: `/bw/<class>/ws`.
  const blockwild = createBlockwildServer({ server, dataDir: config.dataDir, log, originAllowed });
  const tutor = createTutor();
  gameServer.define('class', ClassRoom, { store, roster, access, tutor, roblox, tasks: tasksOn ? tasks : null, homework, roadmap, claps: parentReports.service.clapHub }).filterBy(['classCode']);

  await gameServer.listen(port);
  parentReports.start();
  log.info(`[server] listening on :${port} env=${config.nodeEnv} maxClients=${config.maxClients} cors=${config.corsOrigins.join(',') || '(dev: any)'} serveClient=${config.serveClient}`);

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    log.info(`[server] ${signal} received, shutting down`);
    try { blockwild.close(); } catch (err) { log.warn('[server] blockwild shutdown error:', err.message); }
    try { await gameServer.gracefullyShutdown(false); } catch (err) { log.warn('[server] shutdown error:', err.message); }
    stopRetention();
    await parentReports.close();
    await closeStore();
  };
  return { app, server, gameServer, store, shutdown, port, blockwild, roblox, parentReports, homework, roadmap, roadmapStore };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer().then(({ shutdown }) => {
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.on(signal, () => shutdown(signal).then(() => process.exit(0)).catch(() => process.exit(1)));
    }
  }).catch((err) => {
    log.error('[server] failed to start:', err);
    process.exit(1);
  });
}
