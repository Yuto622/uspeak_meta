// 個人情報の 守り：消す（本人・保護者からの もうしで）と 保持期間（毎日 1 回）。
// 1 か所に まとめてあるのは、「どこに その 子の 情報が あるか」を コードで 言えるように するため：
//   記録（players）・学習ログ・コインログ・Roblox の 紐づけと できごと・ウォレット（store）
//   保護者の LINE の 紐づけ・QR・先生の ひとこと・レポートと その PDF/PNG・送信の 記録・👏（parent-reports）
//   宿題の すすみぐあい（homework）
//   名簿（roster）は 消さない：名簿は 教室が 「入れる 人」として 持つ 表で、先生が 画面で 消す。
export async function eraseStudent({ store, parentReports = null, homework = null, log = console }, { classCode, name, username = '' }) {
  if (!classCode || !name) throw new Error('classCode and name are required');
  const out = { classCode, name, username, store: null, reports: null };
  out.store = await store.erasePlayer(classCode, name, { username });
  if (parentReports?.service?.eraseStudent) out.reports = await parentReports.service.eraseStudent(classCode, name);
  if (homework?.eraseStudent) out.homework = await homework.eraseStudent(classCode, name);
  log.info?.(`[privacy] erased one student in class=${classCode} (store ${JSON.stringify(out.store)}, reports ${JSON.stringify(out.reports)})`);
  return out;
}

// 保持期間：起動の 1 分後と、そのあと 24 時間ごと。
export function startRetention({ store, parentReports = null, days = 400, log = console, now = Date.now }) {
  if (!(days > 0)) { log.info?.('[privacy] retention off (RETENTION_DAYS=0)'); return () => {}; }
  const maxAgeMs = days * 86400000;
  const run = async () => {
    try {
      const a = await store.prune?.({ maxAgeMs, now: now() });
      const b = parentReports?.reports?.purge?.(now(), { keepDeliveriesMs: maxAgeMs });
      log.info?.(`[privacy] retention ${days}d: store ${JSON.stringify(a || {})} parent-links ${b ?? 0}`);
    } catch (err) { log.warn?.('[privacy] retention failed:', err.message); }
  };
  const first = setTimeout(run, 60_000); first.unref?.();
  const timer = setInterval(run, 24 * 3600_000); timer.unref?.();
  return () => { clearTimeout(first); clearInterval(timer); };
}

// 1 つの IP から 短い 時間に 来すぎる 要求を ことわる（名前の 総当たり・リンクの 総当たり）。鍵は Fly が くれる 本当の IP。
export function rateLimit({ windowMs = 60_000, max = 120, now = Date.now } = {}) {
  const hits = new Map(); // ip -> { n, at }
  let sweep = 0;
  return (req, res, next) => {
    const t = now();
    if (t - sweep > windowMs) { sweep = t; for (const [k, v] of hits) if (t - v.at > windowMs) hits.delete(k); }
    const ip = req.get('fly-client-ip') || req.ip || 'unknown';
    const h = hits.get(ip);
    if (!h || t - h.at > windowMs) { hits.set(ip, { n: 1, at: t }); next(); return; }
    h.n += 1;
    if (h.n > max) { res.set('Retry-After', String(Math.ceil(windowMs / 1000))); res.status(429).type('text/plain; charset=utf-8').send('少し 待ってから もう一度 ひらいてください。'); return; }
    next();
  };
}
