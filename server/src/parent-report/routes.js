// 保護者レポートの 口（HTTP）。index.js が mountParentReports() を 呼ぶ。
//
//   POST /api/line/webhook                 LINE の Webhook（署名を 確かめる）。follow / unfollow。
//   GET  /liff/link                        LIFF の 登録ページ（QR → LINE の 中で ひらく）
//   POST /api/liff/info  /api/liff/link    登録ページの 中身と 登録（ID トークンを サーバーで 確かめる）
//   GET  /r/:token  (.png  /thumb.png)     レポートの PDF・画像（推測できない URL・60 日・noindex）
//   GET  /class/:code/parents?t=…          先生の「保護者レポート」タブ（教室ページと 同じ 署名）
//   *    /class/:code/parents/api/…        そのタブの 操作
// /admin の 画面と API は admin.js（roster-admin の ログインを 使う）。
import express from 'express';
import { createReadStream, promises as fs } from 'node:fs';
import { CONSENT_VERSION } from './service.js';
import { texts } from './render-tex.js';
import { liffHtml, classTabHtml, studentPageHtml } from './pages.js';
import { weekOf, isoWeekNumber } from './jst.js';

const noindex = (res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cache-Control', 'private, no-store');
};

export function mountParentReports(app, { service, reports, line, verifyClass, secret, liffId = process.env.LIFF_ID || '', botBasicId = process.env.LINE_BOT_BASIC_ID || '', log = console }) {
  // ---- Webhook ----------------------------------------------------------------------------
  app.post('/api/line/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!line.verifySignature(raw, req.get('x-line-signature'))) { res.status(401).end(); return; }
    let body = {};
    try { body = JSON.parse(raw.toString('utf8')); } catch { res.status(400).end(); return; }
    try { service.onWebhookEvents(body.events || []); } catch (err) { log.warn?.('[line] webhook failed:', err.message); }
    res.status(200).json({ ok: true });
  });

  // ---- LIFF（保護者の 登録）---------------------------------------------------------------
  app.get('/liff/link', (req, res) => {
    noindex(res);
    res.type('text/html; charset=utf-8').send(liffHtml({ liffId, botBasicId }));
  });
  app.post('/api/liff/info', express.json({ limit: '4kb' }), (req, res) => {
    noindex(res);
    const info = service.linkInfo(String(req.body?.t || ''));
    if (!info) { res.status(404).json({ ok: false, error: 'このQRコードは使えません。教室にお問い合わせください。' }); return; }
    res.json({ ok: true, ...info });
  });
  app.post('/api/liff/link', express.json({ limit: '8kb' }), async (req, res) => {
    noindex(res);
    if (req.body?.consent !== CONSENT_VERSION) { res.status(400).json({ ok: false, error: '同意が必要です。' }); return; }
    const r = await service.register(String(req.body?.t || ''), String(req.body?.idToken || ''));
    res.status(r.ok ? 200 : 400).json(r);
  });

  // ---- レポートの ファイル ------------------------------------------------------------------
  const sendFile = async (req, res, variant) => {
    noindex(res);
    const token = String(req.params.token || '');
    if (!/^[\w-]{32,}$/.test(token)) { res.status(404).type('text/plain').send('見つかりません'); return; }
    const f = service.fileForRequest(token, variant);
    if (!f) { res.status(404).type('text/plain; charset=utf-8').send('このレポートは見られません（期限切れ・停止）。'); return; }
    try { await fs.access(f.file); } catch { res.status(404).type('text/plain; charset=utf-8').send('見つかりません'); return; }
    res.type(f.type);
    if (variant === 'pdf') res.set('Content-Disposition', 'inline; filename="uspeak-report.pdf"');
    createReadStream(f.file).pipe(res);
  };
  app.get('/r/:token.png', (req, res) => sendFile(req, res, 'png'));
  app.get('/r/:token/thumb.png', (req, res) => sendFile(req, res, 'thumb'));
  // 同じ /r/… で、QR の 合言葉なら お子さまの ページ、レポートの 合言葉なら その PDF。
  app.get('/r/:token/month', async (req, res) => {
    noindex(res);
    try {
      const t = await service.studentMonthly(String(req.params.token || ''));
      if (!t) { res.status(404).type('text/plain; charset=utf-8').send('見つかりません'); return; }
      res.redirect(302, `/r/${t}`);
    } catch { res.status(503).type('text/plain; charset=utf-8').send('いま作れませんでした。しばらくしてから もう一度 ひらいてください。'); }
  });
  app.post('/r/:token/clap', async (req, res) => {
    noindex(res);
    if (req.get('x-requested-with') !== 'uspeak-page') { res.status(403).json({ ok: false }); return; }
    const r = await service.clap(String(req.params.token || ''));
    res.status(r.ok ? 200 : 404).json(r);
  });
  app.get('/r/:token', async (req, res) => {
    const token = String(req.params.token || '');
    if (!service.isStudentToken(token)) { sendFile(req, res, 'pdf'); return; }
    noindex(res);
    const page = await service.studentPage(token);
    if (!page) { res.status(404).type('text/plain; charset=utf-8').send('見つかりません'); return; }
    res.type('text/html; charset=utf-8').send(studentPageHtml({ ...page, token }));
  });

  // ---- 先生の タブ --------------------------------------------------------------------------
  if (!secret) return;
  const ok = (req) => verifyClass(secret, req.params.code, String(req.query.t || req.get('x-class-token') || ''));
  const guard = (req, res, next) => {
    noindex(res);
    if (!ok(req)) { res.status(404).json({ ok: false, error: 'not found' }); return; }
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'uspeak-class') { res.status(403).json({ ok: false, error: 'forbidden' }); return; }
    next();
  };
  app.get('/class/:code/parents', (req, res) => {
    noindex(res);
    if (!ok(req)) { res.status(404).type('text/plain; charset=utf-8').send('見つかりません。先生コンソールからリンクを取り直してください。'); return; }
    res.type('text/html; charset=utf-8').send(classTabHtml({ classCode: req.params.code, token: String(req.query.t || ''), fromAdmin: req.query.from === 'admin' }));
  });
  const api = express.Router({ mergeParams: true });
  api.use(guard);
  api.use(express.json({ limit: '32kb' }));
  const code = (req) => req.params.code;

  api.get('/state', async (req, res) => {
    const status = await service.classStatus(code(req), { withUrl: true });
    const next = service.nextSend(code(req));
    res.json({ ok: true, ...status, next, candidates: texts().teacherCandidates, comments: next ? reports.commentsFor(code(req), next.periodKey) : [], lineReady: !line.dryRun });
  });
  api.post('/settings', (req, res) => {
    const b = req.body || {};
    const patch = {};
    if ('enabled' in b) patch.enabled = !!b.enabled;
    if (['weekly', 'biweekly', 'monthly'].includes(b.frequency)) patch.frequency = b.frequency;
    if (Number.isInteger(b.send_weekday) && b.send_weekday >= 0 && b.send_weekday <= 6) patch.send_weekday = b.send_weekday;
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.send_time || ''))) patch.send_time = b.send_time;
    if ('skip_zero_week' in b) patch.skip_zero_week = !!b.skip_zero_week;
    if ('monthly_pdf' in b) patch.monthly_pdf = !!b.monthly_pdf;
    if (typeof b.sender_name === 'string') patch.sender_name = b.sender_name.trim().slice(0, 30);
    if (typeof b.teacher_label === 'string') patch.teacher_label = b.teacher_label.trim().slice(0, 20) || '先生';
    const before = reports.settings(code(req));
    // 隔週は オンに した 週から 数える（その 週の 偶奇）。
    if ((patch.frequency === 'biweekly' && before.frequency !== 'biweekly') || (patch.enabled && !before.enabled)) {
      patch.biweekly_parity = isoWeekNumber(weekOf(Date.now()).key) % 2;
    }
    if (patch.enabled) patch.stopped_at = '';
    res.json({ ok: true, settings: reports.saveSettings(code(req), patch) });
  });
  api.post('/student/stop', (req, res) => res.json({ ok: true, paused: service.stopStudent(code(req), String(req.body?.username || ''), req.body?.stop !== false) }));
  api.post('/student/token', async (req, res) => {
    const st = (await service.students(code(req))).find((s) => s.username === req.body?.username);
    if (!st) { res.status(404).json({ ok: false }); return; }
    reports.regenerateToken(code(req), st.username, st.nick);
    res.json({ ok: true });
  });
  api.post('/comment', (req, res) => {
    const next = service.nextSend(code(req));
    if (!next) { res.status(409).json({ ok: false, error: '配信がオフです。' }); return; }
    if (Date.now() > next.deadline) { res.status(409).json({ ok: false, error: '締め切り（配信の前日 23:59）を過ぎています。' }); return; }
    reports.chooseComment({ classroomId: code(req), username: String(req.body?.username || ''), periodKey: next.periodKey, text: String(req.body?.text || '') });
    res.json({ ok: true, comments: reports.commentsFor(code(req), next.periodKey) });
  });
  api.get('/preview.png', async (req, res) => {
    try {
      const out = await service.preview(code(req), String(req.query.u || ''), req.query.kind === 'monthly' ? 'monthly' : 'weekly');
      res.type('image/png').send(out.png);
    } catch (err) { res.status(500).type('text/plain; charset=utf-8').send(`プレビューを作れませんでした：${err.message}`); }
  });
  api.get('/cards.pdf', async (req, res) => {
    try {
      const pdf = await service.qrCards(code(req));
      res.type('application/pdf').set('Content-Disposition', `inline; filename="uspeak-qr-${code(req)}.pdf"`).send(pdf);
    } catch (err) { res.status(500).type('text/plain; charset=utf-8').send(`QRカードを作れませんでした：${err.message}`); }
  });
  // 先生の LINE（クラス 全員の まとめ）を ぜんぶ 止めて、ゲームの 先生の QR を 作りなおす。
  api.post('/teacher-line/reset', (req, res) => res.json({ ok: true, removed: service.resetTeacherLine(code(req)) }));
  api.post('/stop-all', async (req, res) => {
    if (req.body?.confirm !== code(req)) { res.status(400).json({ ok: false, error: '確認の文字が違います。' }); return; }
    const n = await service.stopClass(code(req));
    res.json({ ok: true, stopped: n });
  });
  app.use('/class/:code/parents/api', api);
}
