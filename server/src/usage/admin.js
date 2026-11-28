// /admin/usage — 使用履歴の 見える化（運営用）。ログインは 名簿の 管理ページと 同じ（roster-admin の extend）。
// 画面は usage-page.html（手書きの SVG・外の ライブラリなし）。中身は /admin/api/usage/... の JSON。
// /teacher/usage（教室の 先生）も 同じ 画面で、その 教室の クラスだけ（mountTeacherUsage）。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from '../privacy.js';
import { parseQuery } from './service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(path.join(here, 'usage-page.html'), 'utf8');
export const usagePage = ({ api, home, homeLabel, scope = 'admin', title = '使用履歴' }) => PAGE
  .replaceAll('__API__', api).replaceAll('__HOME__', home).replaceAll('__HOME_LABEL__', homeLabel).replaceAll('__SCOPE__', scope).replaceAll('__TITLE__', title);

const bad = (res, error) => res.status(400).json({ ok: false, error });
const fileDay = (now) => new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
const safeFile = (s) => String(s).replace(/[^\w.-]+/g, '_').slice(0, 80);

// 1 組の 口（admin と teacher で 同じ もの）。allowed(req) が 配列なら その クラスだけ。
export function mountUsageRoutes(api, { service, allowed = () => null, now = Date.now, log = console, limiter = rateLimit({ windowMs: 60_000, max: 120 }) }) {
  const scoped = (req, res, opts = {}) => {
    const q = parseQuery(req.query, opts);
    if (q.error) { bad(res, q.error); return null; }
    const list = allowed(req);
    if (list && q.cls && !list.includes(q.cls)) { res.status(404).json({ ok: false, error: 'class' }); return null; }
    return { ...q, allowed: list };
  };
  api.get('/usage/overview', limiter, (req, res) => {
    const q = scoped(req, res); if (!q) return;
    try { res.json({ ok: true, ...service.overview({ days: q.days, cls: q.cls, allowed: q.allowed }) }); } catch (err) { log.warn?.('[usage] overview failed:', err.message); res.status(500).json({ ok: false, error: 'failed' }); }
  });
  api.get('/usage/class', limiter, (req, res) => {
    const q = scoped(req, res); if (!q) return;
    try { res.json({ ok: true, days: q.days, class: q.cls, rows: service.rows(q), classes: q.allowed || service.classes() }); } catch (err) { log.warn?.('[usage] class failed:', err.message); res.status(500).json({ ok: false, error: 'failed' }); }
  });
  api.get('/usage/class.csv', limiter, (req, res) => {
    const q = scoped(req, res); if (!q) return;
    res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${safeFile(`uspeak-usage-${q.cls || 'all'}-${q.days}d-${fileDay(now())}`)}.csv"`);
    res.send(service.rowsCsv(q));
  });
  const student = async (req, res, csv) => {
    const q = scoped(req, res, { needName: true }); if (!q) return;
    try {
      const d = await service.student({ cls: q.cls, name: q.name, days: q.days });
      if (!d) { res.status(404).json({ ok: false, error: 'not-found' }); return; }
      if (!csv) { res.json(d); return; }
      res.type('text/csv; charset=utf-8').set('Content-Disposition', `attachment; filename="${safeFile(`uspeak-usage-${q.cls}-student-${q.days}d-${fileDay(now())}`)}.csv"`);
      res.send(service.dailyCsv(d));
    } catch (err) { log.warn?.('[usage] student failed:', err.message); res.status(500).json({ ok: false, error: 'failed' }); }
  };
  api.get('/usage/student', limiter, (req, res) => student(req, res, false));
  api.get('/usage/student.csv', limiter, (req, res) => student(req, res, true));
}

export function usageAdminExtension({ service, now = Date.now, log = console }) {
  return ({ router, api, authed }) => {
    router.get('/usage', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(usagePage({ api: '/admin/api', home: '/admin', homeLabel: '管理トップ' }));
    });
    mountUsageRoutes(api, { service, now, log });
  };
}
