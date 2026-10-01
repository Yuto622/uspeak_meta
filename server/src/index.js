import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { Server, matchMaker, WebSocketTransport } from './colyseus.js';
import { config, validateConfig } from './config.js';
import { createStore } from './store/index.js';
import { createAccess } from './game/access.js';
import { mountAdmin } from './admin/roster-admin.js';
import { ClassRoom } from './rooms/ClassRoom.js';
import { createTutor } from './ai/tutor.js';
import { reportFor, reportHtml, reportNoLatexHtml, verifyReport, verifyExport, verifyClass, classCsv, certHtml } from './game/report.js';
import { classView, classHtml } from './game/classview.js';
import { sanitizeMonths } from './game/months.js';
import { reportTex } from './game/report-tex.js';
import { texToPdf, latexAvailable, LatexError } from './game/latex.js';
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

export async function startServer({ port = config.port, storeOverride = null } = {}) {
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

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors({ origin: (origin, cb) => cb(null, originAllowed(origin)), credentials: false }));
  // gzip the static client: three.module.js is 1.27 MB raw (~300 KB gzipped), which matters
  // when a whole class (or several) opens the page at the same moment on one Wi-Fi AP.
  app.use(compression({ threshold: 1024 }));

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
      if (String(req.query.format || '').toLowerCase() === 'json') { res.json(view); return; }
      res.type('text/html; charset=utf-8').send(classHtml(view));
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
  mountAdmin(app, { access, adminKey: config.adminKey, teacherKeySet: !!config.teacherKey, isProduction: config.isProduction, log });

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
    const VENDORED = /[\\/](racers|blockwild|puyo|suika|assets|vendor)[\\/]/;
    app.use(express.static(clientDir, {
      maxAge: '1h',
      etag: true,
      setHeaders(res, filePath) {
        if (VENDORED.test(filePath)) { res.setHeader('Cache-Control', 'public, max-age=86400'); return; }
        if (/\.(js|mjs|css|html|json)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
  }

  const server = http.createServer(app);
  const transport = new WebSocketTransport({
    server,
    pingInterval: 3000,
    pingMaxRetries: 2,
    maxPayload: 64 * 1024,
    verifyClient: (info, next) => next(originAllowed(info.origin)),
  });
  const gameServer = new Server({ transport, gracefullyShutdown: false });
  const tutor = createTutor();
  gameServer.define('class', ClassRoom, { store, roster, access, tutor }).filterBy(['classCode']);

  await gameServer.listen(port);
  log.info(`[server] listening on :${port} env=${config.nodeEnv} maxClients=${config.maxClients} cors=${config.corsOrigins.join(',') || '(dev: any)'} serveClient=${config.serveClient}`);

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    log.info(`[server] ${signal} received, shutting down`);
    try { await gameServer.gracefullyShutdown(false); } catch (err) { log.warn('[server] shutdown error:', err.message); }
    await closeStore();
  };
  return { app, server, gameServer, store, shutdown, port };
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
