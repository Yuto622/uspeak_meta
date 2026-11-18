// /abc-art/… — 「ABC と おと」の 絵（サーバーが かく SVG・game/abc-art.js）。答えは 入って いないので ログイン なしで 出す。
//   /abc-art/letter/<a-z>.svg?case=both|upper|lower ・ /abc-art/word/<ことば>.svg（abc-data.json に ある ことばだけ）・ /abc-art/cover.svg
// ?v= が いまの 版なら 1 年 キャッシュ（かき方を 変えたら ABC_ART_VERSION が 上がる）。
import { letterSvg, wordSvg, coverSvg, ABC_ART_VERSION } from '../game/abc-art.js';

const CASES = new Set(['both', 'upper', 'lower']);
export function mountAbcArt(app, { log = console } = {}) {
  const send = (req, res, make) => {
    let svg = null;
    try { svg = make(); } catch (err) { log.warn?.('[abc-art] render failed:', req.path, err.message); res.status(500).type('text/plain').send('error'); return; }
    if (!svg) { res.status(404).type('text/plain').send('not found'); return; }
    res.set('Cache-Control', String(req.query.v) === String(ABC_ART_VERSION) ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    res.set('X-Content-Type-Options', 'nosniff');
    res.type('image/svg+xml; charset=utf-8').send(svg);
  };
  app.get('/abc-art/cover.svg', (req, res) => send(req, res, () => coverSvg()));
  app.get('/abc-art/letter/:file', (req, res) => {
    const m = /^([a-z])\.svg$/.exec(String(req.params.file || ''));
    const mode = req.query.case === undefined ? 'both' : String(req.query.case);
    send(req, res, () => (m && CASES.has(mode) ? letterSvg(m[1], mode) : null));
  });
  app.get('/abc-art/word/:file', (req, res) => {
    const m = /^([a-z]{1,16}(?:-[a-z]{1,8})?)\.svg$/.exec(String(req.params.file || ''));
    send(req, res, () => (m ? wordSvg(m[1]) : null));
  });
}
