// 管理ページ (/admin) — the owner's register editor.
//
// One password (ADMIN_KEY), one page: the list of account names that may enter — only
// names, no classes — as a table the owner types into, pastes into, or loads from a CSV;
// a switch that turns the gate on and off; a CSV download. A name on the list may enter
// any class (stored as class '*'). Everything is judged and stored on the server
// (game/access.js → the store); the page is only a view of it.
//
// Without ADMIN_KEY this module is never mounted, like the parent reports without
// REPORT_SECRET: a page that lists children's names is not served on a guess.
//
// Session: a cookie holding `expiry.hmac(ADMIN_KEY, expiry)`, HttpOnly, SameSite=Strict,
// twelve hours. Nothing is kept server-side, so a restart does not log the owner out and
// there is nothing to leak. Writes also need a custom header the browser only sends from
// this page's own script, which with SameSite=Strict closes cross-site requests.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { decodeUpload, rosterFromText, rosterToCsv } from '../store/roster-text.js';
import { isTrueCell } from '../store/roster-sheet.js';
import { validateMetric, metricToRow, parseMetric } from '../game/roblox-metrics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(path.join(here, 'roster-admin.html'), 'utf8');
const COOKIE = 'uspeak_admin';
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_ROWS = 5000;
const MAX_CELL = 80;
const FAILS_PER_WINDOW = 8;
const WINDOW_MS = 10 * 60 * 1000;

const sign = (key, exp) => createHmac('sha256', key).update(`admin|${exp}`).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function mountAdmin(app, { access, roblox = null, adminKey, teacherKeySet = false, isProduction = false, log = console, now = Date.now }) {
  if (!adminKey) return;
  const router = express.Router();
  const fails = new Map(); // ip -> { count, at }

  const authed = (req) => {
    const token = cookies(req)[COOKIE] || '';
    const [exp, sig] = token.split('.');
    if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now()) return false;
    return safeEqual(sig, sign(adminKey, exp));
  };
  const setCookie = (res, value, maxAgeSec) => {
    res.append('Set-Cookie', `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isProduction ? '; Secure' : ''}`);
  };
  const tooManyFails = (ip) => {
    const f = fails.get(ip);
    if (!f || now() - f.at > WINDOW_MS) return false;
    return f.count >= FAILS_PER_WINDOW;
  };
  const noteFail = (ip) => {
    const f = fails.get(ip);
    if (!f || now() - f.at > WINDOW_MS) fails.set(ip, { count: 1, at: now() });
    else f.count += 1;
  };

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  router.get('/', (req, res) => {
    res.type('text/html; charset=utf-8');
    if (authed(req)) { res.send(PAGE); return; }
    res.send(loginHtml({ bad: 'bad' in req.query, locked: 'locked' in req.query }));
  });

  router.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    const ip = req.ip || 'unknown';
    if (tooManyFails(ip)) { log.warn(`[admin] login locked for ${ip}`); res.redirect(303, '/admin?locked'); return; }
    const given = String(req.body?.password ?? '');
    if (!safeEqual(given, adminKey)) {
      noteFail(ip);
      log.warn(`[admin] wrong password from ${ip}`);
      res.redirect(303, '/admin?bad');
      return;
    }
    fails.delete(ip);
    const exp = now() + SESSION_MS;
    setCookie(res, `${exp}.${sign(adminKey, exp)}`, Math.floor(SESSION_MS / 1000));
    log.info(`[admin] login from ${ip}`);
    res.redirect(303, '/admin');
  });

  router.post('/logout', (req, res) => { setCookie(res, '', 0); res.redirect(303, '/admin'); });

  // ---- API (the page's own script) --------------------------------------------
  const api = express.Router();
  api.use((req, res, next) => {
    if (!authed(req)) { res.status(401).json({ ok: false, error: 'login' }); return; }
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'forbidden' }); return; }
    next();
  });

  const state = async () => ({
    ok: true,
    rows: (await access.rows()).map((r) => ({ name: r.name, teacher: !!r.teacher })),
    enforce: access.enforce,
    mode: access.mode(),
    envModeSet: access.envModeSet,
    source: access.source,
    editable: access.editable,
    teacherKeySet,
  });

  api.get('/roster', async (req, res) => {
    try { res.json(await state()); } catch (err) { log.warn('[admin] roster read failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
  });

  api.get('/roster.csv', async (req, res) => {
    try {
      const rows = await access.rows();
      res.type('text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="uspeak-roster-${new Date(now()).toISOString().slice(0, 10)}.csv"`);
      res.send(rosterToCsv(rows));
    } catch (err) { res.status(500).type('text/plain').send(err.message); }
  });

  api.put('/roster', express.json({ limit: '2mb' }), async (req, res) => {
    if (!access.editable) { res.status(409).json({ ok: false, error: 'not-editable' }); return; }
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) { res.status(400).json({ ok: false, error: 'rows' }); return; }
    const clipped = rows.map((r) => ({ class: '*', name: clip(typeof r === 'string' ? r : r?.name), note: '', teacher: typeof r === 'object' && r ? isTrueCell(r.teacher ?? '') : false }));
    try {
      const saved = await access.replace(clipped);
      res.json({ ok: true, count: saved.length, rows: saved.map((r) => ({ name: r.name, teacher: !!r.teacher })) });
    } catch (err) { log.warn('[admin] roster save failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
  });

  api.put('/enforce', express.json({ limit: '1kb' }), async (req, res) => {
    if (access.envModeSet) { res.status(409).json({ ok: false, error: 'env' }); return; }
    try {
      await access.setEnforced(!!req.body?.enforce);
      res.json({ ok: true, enforce: access.enforce, mode: access.mode() });
    } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
  });

  // A CSV or a paste -> rows, parsed on the server with the same rules as every other
  // register source. Nothing is written: the page shows the rows and the owner saves.
  api.post('/parse', express.raw({ type: () => true, limit: '2mb' }), (req, res) => {
    try {
      const text = Buffer.isBuffer(req.body) ? decodeUpload(req.body) : String(req.body ?? '');
      const rows = rosterFromText(text).slice(0, MAX_ROWS).map((r) => ({ name: r.name, teacher: !!r.teacher }));
      res.json({ ok: true, rows });
    } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  });

  // ---- Roblox 連携（roblox/sync.js）：指標の定義と、Roblox の名前 ⇔ Web の子の紐づけ ----
  // どちらも「表を丸ごと保存」。名簿と同じ流儀で、ブラウザーには見るぶんだけ渡す。
  if (roblox) {
    const MAX_METRICS = 200;
    api.get('/roblox', async (req, res) => {
      try {
        await roblox.refreshLinks();
        const [metrics, events] = await Promise.all([roblox.metricDefs(), roblox.store?.listRobloxEvents?.() ?? []]);
        const seen = new Map();
        for (const e of events) {
          const u = e.username; if (!u) continue;
          const cur = seen.get(u) || { username: u, class_code: '', lastSeen: 0, events: 0 };
          cur.events += 1; if (Number(e.ts) > cur.lastSeen) { cur.lastSeen = Number(e.ts); cur.class_code = e.class_code || cur.class_code; }
          seen.set(u, cur);
        }
        res.json({
          ok: true, enabled: roblox.enabled, metrics: metrics.map(metricToRow).map((m) => ({ ...m, ...(() => { try { JSON.parse(m.expr_json || '{}'); return {}; } catch { return { bad: 'expr' }; } })() })),
          links: roblox.links(), usernames: [...seen.values()].sort((a, b) => b.lastSeen - a.lastSeen),
          reports: Object.fromEntries([...seen.keys(), ...roblox.links().map((l) => l.username)].map((u) => [u, roblox.reportPath(u)])),
        });
      } catch (err) { log.warn('[admin] roblox read failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
    });

    api.put('/roblox/metrics', express.json({ limit: '1mb' }), async (req, res) => {
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length > MAX_METRICS) { res.status(400).json({ ok: false, error: 'rows' }); return; }
      const clean = []; const keys = new Set();
      for (const r of rows) {
        const row = metricToRow({ ...r, expr: typeof r?.expr_json === 'string' ? r.expr_json : (r?.expr ?? {}) });
        row.expr_json = String(r?.expr_json ?? row.expr_json).trim() || '{}';
        const why = validateMetric(row);
        if (why) { res.status(400).json({ ok: false, error: `${row.key || '(key なし)'}: ${why}` }); return; }
        if (keys.has(row.key)) { res.status(400).json({ ok: false, error: `${row.key}: key が2回あります` }); return; }
        keys.add(row.key);
        clean.push({ ...row, label_ja: clip(row.label_ja), label_en: clip(row.label_en), event_type: clip(row.event_type), unit: parseMetric(row).unit });
      }
      try {
        await roblox.store.saveMetrics(clean);
        res.json({ ok: true, count: clean.length, rows: clean });
      } catch (err) { log.warn('[admin] metrics save failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
    });

    api.put('/roblox/links', express.json({ limit: '1mb' }), async (req, res) => {
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length > MAX_ROWS) { res.status(400).json({ ok: false, error: 'rows' }); return; }
      const clean = rows.map((r) => ({ username: clip(r?.username), class: clip(r?.class) || '*', name: clip(r?.name), note: clip(r?.note) }))
        .filter((r) => r.username && r.name);
      try {
        await roblox.store.saveRobloxLinks(clean);
        await roblox.refreshLinks();
        res.json({ ok: true, count: clean.length, rows: clean });
      } catch (err) { log.warn('[admin] links save failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
    });
  }

  router.use('/api', api);
  app.use('/admin', router);
  log.info('[admin] /admin is served (register editor)');
}

const clip = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MAX_CELL);

function loginHtml({ bad = false, locked = false } = {}) {
  const msg = locked ? 'まちがいが続いたので、しばらく待ってからもう一度どうぞ。' : bad ? 'パスワードがちがいます。' : '';
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>U-Speak 管理</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#f3f6f2;color:#1b3a2f;display:grid;place-items:center;min-height:100vh}
  form{background:#fff;padding:32px 28px;border-radius:16px;box-shadow:0 10px 30px rgba(27,58,47,.12);width:min(92vw,360px)}
  h1{font-size:18px;margin:0 0 6px}p{margin:0 0 18px;color:#5b6b63;font-size:14px}
  input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1px solid #c9d4cd;border-radius:10px}
  button{margin-top:14px;width:100%;font-size:16px;padding:12px;border:0;border-radius:10px;background:#1b3a2f;color:#fff;font-weight:700}
  .bad{color:#b4322a;font-size:14px;margin:10px 0 0}
</style></head><body>
<form method="post" action="/admin/login" autocomplete="off">
  <h1>U-Speak 管理</h1>
  <p>名簿（ログインできるアカウント名）の管理ページです。</p>
  <input type="password" name="password" placeholder="管理パスワード" autofocus required>
  ${msg ? `<div class="bad">${esc(msg)}</div>` : ''}
  <button type="submit">入る</button>
</form></body></html>`;
}
