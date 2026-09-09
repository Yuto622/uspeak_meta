import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server, matchMaker, WebSocketTransport } from './colyseus.js';
import { config, validateConfig } from './config.js';
import { createStore } from './store/index.js';
import { ClassRoom } from './rooms/ClassRoom.js';
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
  const { store, close: closeStore } = storeOverride ? { store: storeOverride, close: async () => {} } : await createStore(log);
  const cpuPercent = createCpuSampler();
  const startedAt = Date.now();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cors({ origin: (origin, cb) => cb(null, originAllowed(origin)), credentials: false }));

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
    });
  });

  // Runtime client configuration generated from environment variables.
  app.get('/config.js', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.send(`window.USPEAK_CONFIG=${JSON.stringify({ serverUrl: config.publicServerUrl || '', defaultClass: config.publicDefaultClass || '', maxClients: config.maxClients })};\n`);
  });

  if (config.serveClient) {
    app.use(express.static(clientDir, {
      maxAge: '1h',
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html') || filePath.endsWith('.json')) res.setHeader('Cache-Control', 'no-cache');
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
  gameServer.define('class', ClassRoom, { store }).filterBy(['classCode']);

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
