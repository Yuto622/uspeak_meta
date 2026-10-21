// /teacher/homework — 英会話教室の 先生が 使う 宿題の 管理画面（運営の /admin とは べつ）。
//
// パスワード 1 つで 入る。パスワードで 教室が きまり、その 教室の クラスの 宿題だけ 見えて・作れて・くばれる
// （クラスコードは 入れなくて いい。どの クラスを さわれるかは サーバーが きめる）。
// パスワードは /admin/classrooms で 運営が 教室ごとに つける。
//
// セッション：`expiry.roomId.setAt.hmac` の クッキー（HttpOnly・SameSite=Strict・Path=/teacher・12 時間）。
// setAt が 入るので、運営が パスワードを かえると 前の ログインは 使えなく なる。教室を 消しても 同じ。
// 書きこみは 画面の スクリプトだけが 送る ヘッダー（x-requested-with: uspeak-teacher）も いる。
import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { ipTag } from '../log.js';
import { mountHomeworkApi, page as homeworkPage } from '../homework/admin.js';

const COOKIE = 'uspeak_teacher';
const SESSION_MS = 12 * 60 * 60 * 1000;
const FAILS_PER_WINDOW = 8;
const WINDOW_MS = 10 * 60 * 1000;
const EXTRACTS_PER_HOUR = 40;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const safeEqual = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function mountTeacherHomework(app, { classrooms, homework, secret, aiReady = false, isProduction = false, log = console, now = Date.now }) {
  if (!secret) return;
  const sign = (exp, id, setAt) => createHmac('sha256', secret).update(`teacher|${exp}|${id}|${setAt}`).digest('hex');
  const fails = new Map();
  const extracts = new Map(); // roomId -> [時刻]

  // ログイン中の 教室（なければ null）。
  const roomOf = (req) => {
    const [exp, id, setAt, sig] = String(cookies(req)[COOKIE] || '').split('.');
    if (!exp || !id || !sig || !/^\d+$/.test(exp) || Number(exp) < now()) return null;
    if (!safeEqual(sig, sign(exp, id, setAt))) return null;
    const room = classrooms.get(id);
    if (!room || String(room.setAt || 0) !== setAt || !room.classes.length) return null;
    return room;
  };
  const setCookie = (res, value, maxAgeSec, req) => {
    res.append('Set-Cookie', `${COOKIE}=${value}; Path=/teacher; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isProduction || req?.secure ? '; Secure' : ''}`);
  };
  const locked = (ip) => { const f = fails.get(ip); return !!f && now() - f.at <= WINDOW_MS && f.count >= FAILS_PER_WINDOW; };
  const noteFail = (ip) => { const f = fails.get(ip); if (!f || now() - f.at > WINDOW_MS) fails.set(ip, { count: 1, at: now() }); else f.count += 1; };

  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('X-Frame-Options', 'DENY');
    next();
  });
  router.get(['/', '/homework'], (req, res) => {
    const room = roomOf(req);
    res.type('text/html; charset=utf-8');
    if (!room) { res.send(loginHtml({ bad: 'bad' in req.query, locked: 'locked' in req.query })); return; }
    if (req.path === '/') { res.redirect(303, '/teacher/homework'); return; }
    res.send(homeworkPage({ aiReady, room: { name: room.name, classes: room.classes } }));
  });
  router.post('/login', express.urlencoded({ extended: false, limit: '4kb' }), (req, res) => {
    const ip = req.get('fly-client-ip') || req.ip || 'unknown';
    if (locked(ip)) { log.warn(`[teacher] login locked for ${ipTag(ip)}`); res.redirect(303, '/teacher/homework?locked'); return; }
    const room = classrooms.byPassword(req.body?.password);
    if (!room || !room.classes.length) { noteFail(ip); log.warn(`[teacher] wrong password from ${ipTag(ip)}`); res.redirect(303, '/teacher/homework?bad'); return; }
    fails.delete(ip);
    const exp = now() + SESSION_MS;
    setCookie(res, `${exp}.${room.id}.${room.setAt || 0}.${sign(exp, room.id, room.setAt || 0)}`, Math.floor(SESSION_MS / 1000), req);
    log.info(`[teacher] ${room.name} logged in from ${ipTag(ip)}`);
    res.redirect(303, '/teacher/homework');
  });
  router.post('/logout', (req, res) => { setCookie(res, '', 0, req); res.redirect(303, '/teacher/homework'); });

  const api = express.Router();
  api.use((req, res, next) => {
    const room = roomOf(req);
    if (!room) { res.status(401).json({ ok: false, error: 'login' }); return; }
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'uspeak-teacher') { res.status(403).json({ ok: false, error: 'forbidden' }); return; }
    req.classroom = room;
    next();
  });
  mountHomeworkApi(api, {
    homework, aiReady, log, header: 'uspeak-teacher',
    scope: (req) => req.classroom.classes,
    // 読みとり（AI）は お金が かかるので、1 つの 教室で 1 時間 EXTRACTS_PER_HOUR 回まで。
    extractLimit: (req) => {
      const id = req.classroom.id; const t = now();
      const list = (extracts.get(id) || []).filter((x) => t - x < 3600e3);
      if (list.length >= EXTRACTS_PER_HOUR) { extracts.set(id, list); return false; }
      list.push(t); extracts.set(id, list); return true;
    },
  });
  router.use('/api', api);
  app.use('/teacher', router);
}

function loginHtml({ bad, locked }) {
  const msg = locked ? 'まちがいが 多いので、10 分 まって から 入って ください。' : bad ? 'パスワードが ちがいます。' : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>U-Speak 宿題 — 教室の 先生</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;background:#fffbf5;color:#1b3a2f;display:grid;place-items:center;min-height:100vh}
  form{background:#fff;padding:32px 28px;border-radius:16px;box-shadow:0 10px 30px rgba(27,58,47,.12);width:min(92vw,380px)}
  h1{font-size:19px;margin:0 0 6px}p{margin:0 0 18px;color:#5b6b63;font-size:14px;line-height:1.6}
  input{width:100%;box-sizing:border-box;font-size:16px;padding:12px;border:1px solid #c9d4cd;border-radius:10px}
  button{margin-top:14px;width:100%;font-size:16px;padding:12px;border:0;border-radius:10px;background:#1b3a2f;color:#fff;font-weight:700;cursor:pointer}
  .bad{color:#b4322a;font-size:14px;margin:10px 0 0}
</style></head><body>
<form method="post" action="/teacher/login" autocomplete="off">
  <h1>📝 U-Speak 宿題</h1>
  <p>教室の パスワードを 入れて ください。<br>パスワードで 教室と クラスが きまります（クラスコードを 入れる ひつようは ありません）。</p>
  <input type="password" name="password" placeholder="教室の パスワード" autofocus required autocomplete="current-password">
  ${msg ? `<div class="bad">${esc(msg)}</div>` : ''}
  <button type="submit">入る</button>
</form></body></html>`;
}
