// GET /api/roadmap/:username — Roblox から ロードマップを 読む（X-USpeak-Key。/api/roblox と 同じ 合言葉）。
// 計算は Web と 同じ（記録は 1 つの 箱）。条件を みたして いれば ここでも 段階が 上がり、コインは Roblox の さいふへ（1 段階 1 回）。
import { timingSafeEqual } from 'node:crypto';

const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function mountRoadmapApi(app, { service, roadmap, roblox, key, log = console }) {
  if (!key) return;
  app.get('/api/roadmap/:username', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const given = req.get('x-uspeak-key') || '';
    if (!given || !same(given, key)) { res.status(401).json({ ok: false, error: 'bad key' }); return; }
    const username = String(req.params.username || '').trim().slice(0, 40);
    if (!username) { res.status(400).json({ ok: false, error: 'username is required' }); return; }
    try {
      const child = roblox?.childFor?.(username);
      const name = child?.name || username;
      const classCode = child?.class && child.class !== '*' ? child.class : (roadmap.classOfName(name) || '*');
      const v = await service.view(classCode, name, { username });
      for (const up of v.ups) if (up.coins > 0) { roblox?.walletAdd?.(username, up.coins, `roadmap:${up.to}`); roblox?.pushBalance?.(username)?.catch?.(() => {}); }
      const { username: _u, ...view } = v;
      res.json({ ok: true, username, classCode, name, ...view });
    } catch (err) {
      log.warn('[roadmap] api failed:', err.message);
      res.status(500).json({ ok: false, error: 'failed' });
    }
  });
  log.info?.('[roadmap] /api/roadmap is served');
}
