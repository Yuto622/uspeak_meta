// All runtime configuration comes from environment variables. See /.env.example.
import 'dotenv/config';

const env = process.env;
const int = (key, fallback) => {
  const v = Number.parseInt(env[key] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
};
const float = (key, fallback) => {
  const v = Number.parseFloat(env[key] ?? '');
  return Number.isFinite(v) ? v : fallback;
};
const bool = (key, fallback) => {
  const v = (env[key] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v);
};
const list = (key) => (env[key] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
// ICE_SERVERS is JSON or nothing. A typo here must not take the server down at boot, so
// a value that does not parse to a list of {urls} entries is logged and ignored.
function iceServersFrom(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const list = JSON.parse(text);
    if (!Array.isArray(list)) throw new Error('not a list');
    return list.filter((e) => e && typeof e === 'object' && e.urls).map((e) => ({
      urls: e.urls, ...(e.username ? { username: String(e.username) } : {}), ...(e.credential ? { credential: String(e.credential) } : {}),
    }));
  } catch (err) {
    console.warn(`[config] ICE_SERVERS ignored: ${err.message}`);
    return [];
  }
}


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
  // 入って 何ミリ秒後に「Review time!」の カードを 出すか（検査では 短く する）。
  reviewOfferDelayMs: int('REVIEW_OFFER_DELAY_MS', 20000),
  // 授業モード：ストップの 自動再開と、復習の クラス結果を 出すまで（検査では 短く する）。
  classAutoResumeMs: int('CLASS_AUTO_RESUME_MS', 10 * 60 * 1000),
  classResultMs: int('CLASS_RESULT_MS', 75000),
  // Shifts the world's clock (day, dusk, night, dawn). Zero in a classroom; a test or a
  // demo sets it to walk into the night without waiting for it. Clients are told the
  // shifted time, so everyone still sees the same sky.
  worldOffsetMs: int('WORLD_TIME_OFFSET_MS', 0),
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
  // 大広間（SFU）. A mesh is six children; a school assembly is a hundred, and a hundred
  // browsers cannot each hold ninety-nine connections. A LiveKit server forwards the
  // streams instead. The key and the secret never leave this server: the browser is handed
  // a token minted here, for one room, for one child, for two hours. Without these three
  // set, big rooms simply fall back to a six-child mesh and the panel says so.
  livekit: {
    url: (env.LIVEKIT_URL ?? '').trim(),
    apiKey: (env.LIVEKIT_API_KEY ?? '').trim(),
    apiSecret: (env.LIVEKIT_API_SECRET ?? '').trim(),
    tokenTtlSec: Math.max(300, int('LIVEKIT_TOKEN_TTL_SEC', 7200)),
  },
  // A microphone left open costs something every second it is open — a mesh call costs a
  // classmate's battery and bandwidth, a big room costs LiveKit minutes — and unlike the
  // AI conversation (capped at AI_DAILY_TURNS_PER_STUDENT), nothing bounded how long a
  // forgotten tab could sit in a call. This is that bound, in minutes per student per day.
  // A teacher is exempt: the one adult supervising the lesson is not the exposure this
  // guards against.
  voice: {
    // A float, not an int: production wants whole minutes, but a test wants to prove the
    // cap actually cuts a call off without a real 120-minute wait, and a few seconds
    // (e.g. 0.05) only expresses as a fraction.
    dailyMinutesPerStudent: Math.max(0.05, float('VOICE_DAILY_MINUTES_PER_STUDENT', 120)),
    // STUN/TURN for the browser-to-browser rooms, as the JSON an RTCPeerConnection takes:
    //   ICE_SERVERS='[{"urls":"turn:turn.example.com:443?transport=tcp","username":"u","credential":"p"}]'
    // A school network that blocks UDP cannot connect two iPads directly without a TURN
    // relay; with none set the browsers use Google's public STUN and hope. These reach
    // the browser (that is what TURN credentials are for), so use a dedicated, rotatable
    // TURN user rather than anything shared with another service.
    iceServers: iceServersFrom(env.ICE_SERVERS),
    // With LiveKit configured, VOICE_SFU_ALL=1 sends every room through it — not only the
    // hundred-child hall. An SFU keeps a call usable through packet loss (one uplink per
    // child, simulcast, TCP/TLS fallback) where a six-way mesh on a classroom Wi-Fi does
    // not. Off by default: it costs LiveKit minutes a mesh does not.
    sfuAll: bool('VOICE_SFU_ALL', false),
  },
  // 入場ゲート: 'open' lets anyone with the class code in (the default, and what a
  // demo or a home user wants); 'roster' admits only children on the class register,
  // with the fallbacks in game/gate.js so an outage never locks a class out.
  accessMode: ((env.ACCESS_MODE ?? 'open').trim().toLowerCase() === 'roster' ? 'roster' : 'open'),
  // Whether ACCESS_MODE was set at all. Set, it is the law; unset, the admin page's
  // switch (game/access.js) decides, and the default is still open.
  accessModeSet: !!(env.ACCESS_MODE ?? '').trim(),
  // 管理ページ (/admin): the owner's password for the register editor. Without it the
  // page is not served at all. Not the teacher key: teachers get a lobby, the owner gets
  // the list of who may enter.
  adminKey: (env.ADMIN_KEY ?? '').trim(),
  rosterTtlMs: Math.max(30000, int('ROSTER_TTL_MS', 5 * 60 * 1000)),
  // 名簿スプレッドシート. The register as a Google Sheet of its own (store/roster-sheet.js),
  // whatever the store backend: the teacher edits names in a browser, the game's data
  // stays on the volume. Read with the same service account as the Sheets store, and
  // only ever read. Without ROSTER_SHEET_ID, GOOGLE_SHEET_ID is used when the store is
  // not already Sheets (where the register is that spreadsheet's `roster` tab anyway).
  roster: {
    sheetId: (env.ROSTER_SHEET_ID ?? '').trim(),
    tab: (env.ROSTER_SHEET_TAB ?? '').trim(),
  },
  // Signs the parent-report links. Without it, reports are simply not served: a
  // guessable link would show one family another family's child.
  reportSecret: (env.REPORT_SECRET ?? '').trim(),
  // Roblox 連携（docs/ROBLOX_SYNC.md）. Roblox 版が学習の記録とコインの増減を送ってくる
  // `/api/roblox/*` の合言葉（ヘッダー `X-USpeak-Key`）。空なら口は開かない。32 文字以上。
  // Roblox 側の Secret `USPEAK_WEB_KEY` と同じ文字列を入れる。
  roblox: {
    key: (env.USPEAK_ROBLOX_KEY ?? '').trim(),
    // 1つの鍵あたりの上限（1分に何回まで）。
    ratePerMin: Math.max(10, int('ROBLOX_RATE_PER_MIN', 120)),
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
  if (config.accessMode === 'roster' && !config.teacherKey) problems.push('ACCESS_MODE=roster needs TEACHER_KEY, or a teacher cannot get in either.');
  if (config.adminKey && config.adminKey.length < 12) problems.push('ADMIN_KEY must be at least 12 characters.');
  if (config.adminKey && config.isProduction && config.adminKey === config.teacherKey) problems.push('ADMIN_KEY must not be the same as TEACHER_KEY.');
  if (!config.adminKey) log.warn('[config] ADMIN_KEY is empty: the /admin register page is not served.');
  const hasGoogleCreds = !!(config.google.jsonBase64 || (config.google.email && config.google.privateKey));
  if (config.roster.sheetId && !hasGoogleCreds) problems.push('ROSTER_SHEET_ID is set but no service account is: set GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY).');
  if (config.accessMode === 'roster' && !config.roster.sheetId && !config.google.sheetId) log.warn('[config] ACCESS_MODE=roster without ROSTER_SHEET_ID: the register is data/roster.json only.');
  if (config.reportSecret && config.reportSecret.length < 16) problems.push('REPORT_SECRET must be at least 16 characters.');
  if (!config.reportSecret) log.warn('[config] REPORT_SECRET is empty: parent reports are disabled.');
  if (config.roblox.key && config.roblox.key.length < 32) problems.push('USPEAK_ROBLOX_KEY must be at least 32 characters.');
  if (config.roblox.key && config.isProduction && [config.teacherKey, config.adminKey, config.reportSecret].includes(config.roblox.key)) problems.push('USPEAK_ROBLOX_KEY must not be the same as another key.');
  if (!config.roblox.key) log.warn('[config] USPEAK_ROBLOX_KEY is empty: the Roblox sync endpoints are not served.');
  return problems;
}
