// 保護者レポートの TeX worker（別の Fly アプリ「uspeak-report-worker」）。
//
// POST /render  { tex, kind: 'weekly'|'monthly'|'cards', name }  （Authorization: Bearer RENDER_SECRET）
//   → { ok, pdf, png?, thumb? }（base64）
// 本体（uspeak-multiplayer）からだけ 呼ぶ：Fly の 内部ネットワーク（<app>.internal / .flycast）で、外には 出さない。
// 依存は Node だけ（express も 入れない）。組むのは 本体と 同じ compileTex()（server/src/parent-report/render.js）。
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { compileTex, localTexAvailable } from '../src/parent-report/render.js';

const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.RENDER_SECRET || '';
const MAX_BODY = 2 * 1024 * 1024;
const KINDS = new Set(['weekly', 'monthly', 'cards']);
let active = 0;

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

if (!SECRET) { console.error('[worker] RENDER_SECRET is required'); process.exit(1); }

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') { send(res, 200, { ok: true, tex: await localTexAvailable(), active }); return; }
  if (req.method !== 'POST' || req.url !== '/render') { send(res, 404, { ok: false, error: 'not found' }); return; }
  if (!same(req.headers.authorization || '', `Bearer ${SECRET}`)) { send(res, 401, { ok: false, error: 'unauthorized' }); return; }
  if (active >= 2) { send(res, 429, { ok: false, error: 'busy' }); return; }
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
  req.on('end', async () => {
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { send(res, 400, { ok: false, error: 'bad json' }); return; }
    if (typeof body.tex !== 'string' || !KINDS.has(body.kind)) { send(res, 400, { ok: false, error: 'bad request' }); return; }
    active += 1;
    try {
      const out = await compileTex(body.tex, { kind: body.kind, name: String(body.name || 'report').slice(0, 60) });
      send(res, 200, { ok: true, pdf: out.pdf.toString('base64'), png: out.png?.toString('base64'), thumb: out.thumb?.toString('base64') });
    } catch (err) {
      send(res, 422, { ok: false, error: String(err.message).slice(0, 300) });
    } finally { active -= 1; }
  });
}).listen(PORT, () => console.log(`[worker] listening on ${PORT}`));
