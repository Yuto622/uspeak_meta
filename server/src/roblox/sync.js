// Roblox 版 U-Speak との連携（docs/ROBLOX_SYNC.md）。
//
// Roblox 側が送ってくるのは2種類：**学習の記録**（何を答えたか・何秒いたか）と、
// **コインのやりとり**（Roblox の残高を教え、Web で動いたぶんを取りに来る）。
// どちらも合言葉（`USPEAK_ROBLOX_KEY`、ヘッダー `X-USpeak-Key`）がなければ 401。
//
//  * `POST /api/roblox/events`          記録を貯める。`id` で冪等（同じ id は1度だけ）。
//  * `POST /api/roblox/wallet/pending`  残高を預かり、まだ届けていない Web の増減を返す。
//  * `POST /api/roblox/wallet/ack`      届いた増減に印を付け、適用後の残高を預かる。
//
// **Web のコイン残高 = Roblox の残高の最新値 ＋ まだ Roblox に届いていない Web の増減。**
// 2つの世界が同じ数字を見せるための約束で、Roblox にまだ1度も入っていない子は
// これまで通り Web の残高だけで動く（`balanceOf` が null を返す）。
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import express from 'express';
import { SEED_METRICS, summarize, parseMetric } from '../game/roblox-metrics.js';
import { sameUser } from '../store/FileStore.js';

const MAX_EVENTS = 300;
const MAX_DATA_BYTES = 32 * 1024;
const MAX_USERS = 50;
const MAX_ID = 120;
const MAX_NAME = 40;
const WINDOW_MS = 60 * 1000;
const LINKS_TTL_MS = 60 * 1000;

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
// 時刻：ミリ秒か秒か ISO 文字列。Roblox の `os.time()` は秒。
export function toMillis(v, fallback = 0) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 1e11 ? Math.round(n) : Math.round(n * 1000);
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : fallback;
}

// 保護者ページ `/report/<username>` のリンク。署名は1人ぶんの Web レポートとも別
// （`roblox|<username>`）なので、どちらのリンクも読み替えられない。
export const signRobloxReport = (secret, username) => createHmac('sha256', secret).update(`roblox|${username}`).digest('base64url').slice(0, 24);
export function verifyRobloxReport(secret, username, token) {
  if (!secret || !username || !token) return false;
  return safeEqual(signRobloxReport(secret, username), String(token));
}
export const robloxReportPath = (secret, username) => `/report/${encodeURIComponent(username)}?t=${signRobloxReport(secret, username)}`;

export function createRoblox({ store, key = '', ratePerMin = 120, reportSecret = '', log = console, now = Date.now }) {
  const enabled = !!key;
  const rooms = new Set();          // ClassRoom が入室時に登録する（残高を押し込むため）
  const hits = new Map();           // key -> { count, at }
  let links = []; let linksAt = 0; let linksLoading = null;
  let seq = 0;

  const newId = () => `${now().toString(36)}-${(seq += 1).toString(36)}-${randomBytes(3).toString('hex')}`;

  // ---- 紐づけ（Roblox のアカウント名 ⇔ Web の子）---------------------------------------
  // 表が空、または載っていない名前は「同じ名前」。表は1分ほど手元に置く（コインの行は
  // 同期の中から書くので、ここは待てない）。
  async function refreshLinks() {
    if (linksLoading) return linksLoading;
    linksLoading = (async () => {
      try { links = (await store.listRobloxLinks?.()) || []; linksAt = now(); } catch (err) { log.warn('[roblox] links could not be read:', err.message); }
      finally { linksLoading = null; }
    })();
    return linksLoading;
  }
  const linksFresh = () => { if (now() - linksAt > LINKS_TTL_MS) refreshLinks(); return links; };
  const usernameFor = (classCode, name) => {
    const row = linksFresh().find((r) => r.name === name && (!r.class || r.class === '*' || r.class === classCode));
    return row ? row.username : name;
  };
  const childFor = (username) => {
    const row = linksFresh().find((r) => sameUser(r.username, username));
    return row ? { class: row.class || '*', name: row.name } : null;
  };

  // ---- 指標の定義 -----------------------------------------------------------------------
  async function metricDefs() {
    const rows = (await store.listMetrics?.()) || [];
    return rows.length ? rows : SEED_METRICS;
  }
  // 最初から入っている指標。**版が上がって seed が増えたら、無い key だけ足す**（消したい
  // 指標は「有効」を外す。行を消しても次の起動で戻る）。
  async function ensureSeeds() {
    try {
      const rows = (await store.listMetrics?.()) || [];
      const have = new Set(rows.map((r) => r.key));
      const missing = SEED_METRICS.filter((m) => !have.has(m.key));
      if (missing.length && store.saveMetrics) {
        await store.saveMetrics([...rows, ...missing]);
        log.info(`[roblox] metric_definitions seeded (+${missing.length}: ${missing.map((m) => m.key).join(', ')})`);
      }
    } catch (err) { log.warn('[roblox] could not seed metric_definitions:', err.message); }
  }

  // ---- 残高 -----------------------------------------------------------------------------
  async function balanceOf(username) {
    const snapshot = await store.getWalletSnapshot?.(username);
    if (!snapshot) return null;
    const entries = await store.listWalletEntries({ username, undelivered: true });
    const pending = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { balance: Math.max(0, Math.round(Number(snapshot.balance) || 0) + pending), snapshot: Number(snapshot.balance) || 0, pending, at: snapshot.at, entries };
  }
  // Web でコインが動いた（ClassRoom の coinRow から）。0 は書かない。
  function walletAdd(username, amount, reason) {
    if (!enabled || !username) return false;
    const n = Math.round(Number(amount) || 0);
    if (!n) return false;
    store.addWalletEntry({ id: newId(), username, amount: n, reason: str(reason, 80), created_at: new Date(now()).toISOString(), delivered_at: '' });
    return true;
  }
  // オンラインの子に、計算し直した残高を押し込む。
  async function pushBalance(username) {
    const bal = await balanceOf(username);
    if (!bal) return;
    for (const room of rooms) { try { room.robloxBalance?.(username, bal.balance); } catch (err) { log.warn('[roblox] push failed:', err.message); } }
  }

  // ---- 指標 -----------------------------------------------------------------------------
  async function summaryFor(username, { at = now() } = {}) {
    const [defs, events, wallet] = await Promise.all([metricDefs(), store.listRobloxEvents({ username }), balanceOf(username)]);
    return { username, child: childFor(username), ...summarize(defs, events, { now: at, wallet }) };
  }
  // 先生ページの表：そのクラスの子（記録に class_code が付いたもの、紐づけ、Web の記録）。
  async function classRows(classCode, { at = now(), records = [] } = {}) {
    await refreshLinks();
    const names = new Map(); // username -> web name | ''
    for (const r of links) if (r.class === classCode || r.class === '*' || !r.class) names.set(r.username, r.name);
    for (const r of records) if (r?.name && r.role !== 'teacher') { const u = usernameFor(classCode, r.name); if (!names.has(u)) names.set(u, r.name); }
    const known = new Set([...names.values()].filter(Boolean));
    const lower = () => new Map([...names.keys()].map((u) => [u.toLowerCase(), u]));
    for (const e of await store.listRobloxEvents({ classCode })) {
      if (!e.username || lower().has(e.username.toLowerCase())) continue;
      names.set(e.username, known.has(e.username) ? e.username : '');
    }
    const rows = [];
    for (const [username, name] of names) {
      const s = await summaryFor(username, { at });
      if (!s.counts.all && !name) continue;   // 記録もなく Web にもいない名前は出さない
      rows.push({
        ...s, name: name || (childFor(username)?.name ?? ''), registered: !!name || !!childFor(username),
        reportToken: reportSecret ? signRobloxReport(reportSecret, username) : '',
      });
    }
    rows.sort((a, b) => (b.lastSeen - a.lastSeen) || a.username.localeCompare(b.username));
    return rows;
  }

  // ---- HTTP ---------------------------------------------------------------------------
  function limited(k) {
    const h = hits.get(k);
    if (!h || now() - h.at > WINDOW_MS) { hits.set(k, { count: 1, at: now() }); return false; }
    h.count += 1;
    return h.count > ratePerMin;
  }
  function mount(app) {
    if (!enabled) return;
    const api = express.Router();
    api.use((req, res, next) => {
      res.set('Cache-Control', 'no-store');
      const given = req.get('x-uspeak-key') || '';
      if (!given || !safeEqual(given, key)) { res.status(401).json({ ok: false, error: 'bad key' }); return; }
      if (limited(given.slice(-8))) { res.status(429).json({ ok: false, error: 'rate limit' }); return; }
      next();
    });
    api.use(express.json({ limit: '12mb' }));
    api.use((err, req, res, next) => { // bad JSON
      if (err) { res.status(400).json({ ok: false, error: 'bad json' }); return; }
      next();
    });

    api.post('/events', async (req, res) => {
      const body = req.body || {};
      const list = body.events;
      if (!Array.isArray(list)) { res.status(400).json({ ok: false, error: 'events must be a list' }); return; }
      if (list.length > MAX_EVENTS) { res.status(400).json({ ok: false, error: `too many events (max ${MAX_EVENTS})` }); return; }
      const placeId = str(body.placeId, 32);
      const world = str(body.world, 40);
      const received = new Date(now()).toISOString();
      const rows = [];
      for (const ev of list) {
        if (!ev || typeof ev !== 'object') { res.status(400).json({ ok: false, error: 'event must be an object' }); return; }
        const id = str(ev.id, MAX_ID);
        if (!id) { res.status(400).json({ ok: false, error: 'event id is required' }); return; }
        const data = ev.data && typeof ev.data === 'object' ? ev.data : {};
        const dataJson = JSON.stringify(data);
        if (Buffer.byteLength(dataJson) > MAX_DATA_BYTES) { res.status(400).json({ ok: false, error: `event ${id}: data over ${MAX_DATA_BYTES} bytes` }); return; }
        rows.push({
          id, ts: toMillis(ev.ts, now()), type: str(ev.type, 40) || 'unknown', world: str(ev.world, 40) || world,
          place_id: str(ev.placeId, 32) || placeId, username: str(ev.username, MAX_NAME), user_id: str(ev.userId, 32),
          class_code: str(ev.classCode, 24), data_json: dataJson, received_at: received,
        });
      }
      const result = store.appendRobloxEvents(rows);
      log.info(`[roblox] events batch=${str(body.batchId, 60) || '-'} accepted=${result.accepted} duplicates=${result.duplicates}`);
      res.json({ ok: true, accepted: result.accepted, duplicates: result.duplicates });
    });

    api.post('/wallet/pending', async (req, res) => {
      const users = req.body?.users;
      if (!Array.isArray(users) || !users.length) { res.status(400).json({ ok: false, error: 'users must be a list' }); return; }
      if (users.length > MAX_USERS) { res.status(400).json({ ok: false, error: `too many users (max ${MAX_USERS})` }); return; }
      const parsed = [];
      for (const u of users) {
        const username = str(u?.username, MAX_NAME);
        if (!username) { res.status(400).json({ ok: false, error: 'username is required' }); return; }
        const balance = Number(u?.balance);
        if (!Number.isFinite(balance) || balance < 0) { res.status(400).json({ ok: false, error: `${username}: balance must be a number >= 0` }); return; }
        parsed.push({ username, balance: Math.round(balance), userId: str(u?.userId, 32) });
      }
      const at = new Date(now()).toISOString();
      const out = [];
      for (const u of parsed) {
        store.saveWalletSnapshot({ username: u.username, balance: u.balance, at });
        const entries = await store.listWalletEntries({ username: u.username, undelivered: true });
        out.push({
          username: u.username, balance: u.balance,
          entries: entries.map((e) => ({ id: e.id, amount: Number(e.amount) || 0, reason: e.reason, createdAt: e.created_at })),
          total: entries.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        });
        pushBalance(u.username).catch(() => {});
      }
      res.json({ ok: true, users: out });
    });

    api.post('/wallet/ack', async (req, res) => {
      const body = req.body || {};
      const acks = Array.isArray(body.acks) ? body.acks : [body];
      if (acks.length > MAX_USERS) { res.status(400).json({ ok: false, error: `too many users (max ${MAX_USERS})` }); return; }
      const parsed = [];
      for (const a of acks) {
        const username = str(a?.username, MAX_NAME);
        if (!username) { res.status(400).json({ ok: false, error: 'username is required' }); return; }
        const ids = Array.isArray(a?.ids) ? a.ids.map((x) => str(x, MAX_ID)).filter(Boolean) : [];
        const balance = a?.balance === undefined ? null : Number(a.balance);
        if (balance !== null && (!Number.isFinite(balance) || balance < 0)) { res.status(400).json({ ok: false, error: `${username}: balance must be a number >= 0` }); return; }
        parsed.push({ username, ids, balance: balance === null ? null : Math.round(balance) });
      }
      const at = new Date(now()).toISOString();
      let acked = 0;
      for (const a of parsed) {
        if (a.ids.length) acked += await store.ackWalletEntries(a.ids, at);
        if (a.balance !== null) store.saveWalletSnapshot({ username: a.username, balance: a.balance, at });
        pushBalance(a.username).catch(() => {});
      }
      res.json({ ok: true, acked });
    });

    app.use('/api/roblox', api);
    log.info(`[roblox] /api/roblox is served (rate=${ratePerMin}/min)`);
  }

  return {
    enabled, rooms, store, mount, ensureSeeds, metricDefs, refreshLinks,
    links: () => links.map((r) => ({ ...r })),
    usernameFor, childFor, balanceOf, walletAdd, pushBalance, summaryFor, classRows,
    reportPath: (username) => (reportSecret ? robloxReportPath(reportSecret, username) : ''),
    parseMetric,
  };
}
