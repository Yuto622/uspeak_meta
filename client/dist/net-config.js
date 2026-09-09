// Multiplayer tuning constants. Everything that may need adjusting on real classroom
// Wi-Fi lives here, in one place.
// Any key below can be overridden without editing code: window.USPEAK_CONFIG.net = {...}
// (served by the server from the NET_OVERRIDES env variable, see /config.js).
const DEFAULTS = {
  // Client -> server position updates (Hz). Server broadcasts at PATCH_RATE_MS (10 Hz).
  SEND_HZ: 20,
  // Even when standing still, send a keep-alive sample this often (ms).
  HEARTBEAT_MS: 500,
  // Remote avatars are rendered this far in the past so there is always a sample to
  // interpolate towards. With 10 Hz broadcasts, 100 ms = one packet of slack.
  INTERP_DELAY_MS: 100,
  // Packet loss / stalls: extrapolate along the last velocity for at most this long,
  // then freeze in place until fresh samples arrive.
  EXTRAPOLATE_MAX_MS: 250,
  // Samples older than this are dropped from the interpolation buffer.
  BUFFER_KEEP_MS: 1500,
  // A jump larger than this (world units) is treated as a teleport: no interpolation.
  SNAP_DISTANCE: 6,
  // Reconnection schedule (ms). First attempt is immediate; then backoff, capped.
  RECONNECT_DELAYS_MS: [0, 500, 1000, 2000, 3000, 5000],
  RECONNECT_MAX_ATTEMPTS: 40,
  // When the page becomes visible again, prove the socket is alive within this time
  // or force a reconnect. Keeps resume-after-lock under the 3 s target.
  RESUME_PROBE_TIMEOUT_MS: 1200,
  // Learning-progress snapshot upload interval (ms). Also sent on pagehide.
  PROGRESS_SYNC_MS: 60000,
  // Chat bubble lifetime (ms).
  CHAT_BUBBLE_MS: 4000,
  // Teacher roster refresh (ms).
  ROSTER_REFRESH_MS: 3000,
  // ---- Rendering budget for large rooms (up to 100 players) ----
  // Only the nearest N remote avatars are rendered; the rest are kept in memory but hidden.
  MAX_RENDERED_REMOTES: 32,
  // Beyond this distance (world units) a remote avatar is not rendered at all.
  REMOTE_CULL_DISTANCE: 70,
  // Beyond this distance name labels / bubbles are hidden (sprites are the costly part).
  REMOTE_LABEL_DISTANCE: 35,
  // Remote avatars never cast/receive shadows (shadow pass cost scales with mesh count).
  REMOTE_SHADOWS: false,
};
const overrides = globalThis.USPEAK_CONFIG?.net;
export const NET = Object.freeze({ ...DEFAULTS, ...(overrides && typeof overrides === 'object' ? overrides : {}) });

export const STORAGE_KEYS = Object.freeze({
  prefs: 'uspeak-net-prefs-v1', // localStorage: last name / class (prefill only)
  session: 'uspeak-net-session-v1', // sessionStorage: active session for auto-rejoin after reload
});

// Server URL resolution order: window.USPEAK_CONFIG.serverUrl (served at /config.js from env),
// <meta name="uspeak-server">, ?server= query param, then same host as the page.
export function resolveServerUrl() {
  const fromConfig = globalThis.USPEAK_CONFIG?.serverUrl;
  if (typeof fromConfig === 'string' && fromConfig.trim()) return normalize(fromConfig.trim());
  const meta = document.querySelector('meta[name="uspeak-server"]')?.content;
  if (meta) return normalize(meta.trim());
  const q = new URLSearchParams(location.search).get('server');
  if (q) return normalize(q.trim());
  if (location.protocol === 'file:') return 'ws://localhost:2567';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

function normalize(url) {
  // Accept https://host or wss://host; https pages must use wss.
  let u = url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/+$/, '');
  if (location.protocol === 'https:' && u.startsWith('ws:')) u = u.replace(/^ws:/, 'wss:');
  return u;
}

export function defaultClassCode() {
  const fromConfig = globalThis.USPEAK_CONFIG?.defaultClass;
  if (typeof fromConfig === 'string' && fromConfig) return fromConfig;
  return new URLSearchParams(location.search).get('class') || '';
}

export const storage = {
  get(area, key) { try { return JSON.parse(area.getItem(key)); } catch { return null; } },
  set(area, key, value) { try { area.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
  remove(area, key) { try { area.removeItem(key); } catch { /* ignore */ } },
};
