// All runtime configuration comes from environment variables. See /.env.example.
import 'dotenv/config';

const env = process.env;
const int = (key, fallback) => {
  const v = Number.parseInt(env[key] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
};
const bool = (key, fallback) => {
  const v = (env[key] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v);
};
const list = (key) => (env[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = Object.freeze({
  nodeEnv: env.NODE_ENV ?? 'development',
  isProduction: env.NODE_ENV === 'production',
  port: int('PORT', 2567),
  maxClients: Math.max(1, int('MAX_CLIENTS', 30)),
  teacherKey: (env.TEACHER_KEY ?? '').trim(),
  corsOrigins: list('CORS_ORIGINS'),
  serveClient: bool('SERVE_CLIENT', true),
  patchRateMs: Math.max(20, int('PATCH_RATE_MS', 100)),
  reconnectGraceSec: Math.max(5, int('RECONNECT_GRACE_SEC', 60)),
  answerMinIntervalMs: int('ANSWER_MIN_INTERVAL_MS', 400),
  chatMinIntervalMs: int('CHAT_MIN_INTERVAL_MS', 1500),
  progressMaxBytes: int('PROGRESS_MAX_BYTES', 45000),
  storeBackend: (env.STORE_BACKEND ?? 'auto').trim().toLowerCase(),
  storeFlushMs: Math.max(1000, int('STORE_FLUSH_MS', 5000)),
  dataDir: env.DATA_DIR ?? './data',
  google: {
    sheetId: (env.GOOGLE_SHEET_ID ?? '').trim(),
    email: (env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '').trim(),
    privateKey: (env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
    jsonBase64: (env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '').trim(),
  },
  // The errand quest's AI partner. The key is read here and never leaves the server;
  // nothing about it is sent to the browser.
  ai: {
    apiKey: (env.OPENAI_API_KEY ?? '').trim(),
    model: (env.OPENAI_MODEL ?? 'gpt-4o-mini').trim(),
    maxTokens: int('AI_MAX_TOKENS', 300),
    timeoutMs: int('AI_TIMEOUT_MS', 20000),
    minIntervalMs: int('AI_MIN_INTERVAL_MS', 1200),
    dailyTurnsPerStudent: int('AI_DAILY_TURNS_PER_STUDENT', 200),
  },
  publicServerUrl: (env.PUBLIC_SERVER_URL ?? '').trim(),
  publicDefaultClass: (env.PUBLIC_DEFAULT_CLASS ?? '').trim(),
  // Optional JSON object merged into the client's NET tuning constants, e.g.
  // NET_OVERRIDES='{"INTERP_DELAY_MS":150,"MAX_RENDERED_REMOTES":24}'
  netOverrides: (() => { try { const v = JSON.parse(env.NET_OVERRIDES || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } })(),
});

export function validateConfig(log = console) {
  const problems = [];
  if (config.isProduction && !config.corsOrigins.length) problems.push('CORS_ORIGINS must be set in production.');
  if (config.corsOrigins.includes('*') && config.isProduction) problems.push('CORS_ORIGINS=* is not allowed in production.');
  if (!config.teacherKey) log.warn('[config] TEACHER_KEY is empty: teacher role is disabled.');
  if (config.teacherKey && config.teacherKey.length < 8) problems.push('TEACHER_KEY must be at least 8 characters.');
  return problems;
}
