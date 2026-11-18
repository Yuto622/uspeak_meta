// /reading-art/<本の id>/<ページ>.svg — 絵本の 絵（0 = 表紙、1〜 = ページ）。サーバーが 場面から かく（game/reading-art/render.js）。
// 絵に 答えは 入って いない（場面は もともと ページに 送って いる もの）ので、ログイン なしで 出す。?still=1 は うごかない 絵（本だなの 表紙）。
// ?v= が いまの 版なら 1 年 キャッシュ（絵の かき方を 変えたら ART_VERSION が 上がって URL が 変わる）。
import { bookById, ART_VERSION } from '../game/reading.js';
import { renderScene } from '../game/reading-art/render.js';

export function mountReadingArt(app, { log = console } = {}) {
  app.get('/reading-art/:book/:file', (req, res) => {
    const m = /^(\d{1,2})\.svg$/.exec(String(req.params.file || ''));
    const book = /^rd-[A-Za-z0-9-]{1,40}$/.test(String(req.params.book || '')) ? bookById(req.params.book) : null;
    const page = m ? Number(m[1]) : -1;
    const scene = !book ? null : page === 0 ? book.cover : book.pages[page - 1]?.scene;
    if (!scene) { res.status(404).type('text/plain').send('not found'); return; }
    try {
      const svg = renderScene(scene, { seed: book.id, still: req.query.still === '1' });
      res.set('Cache-Control', String(req.query.v) === String(ART_VERSION) ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
      res.set('X-Content-Type-Options', 'nosniff');
      res.type('image/svg+xml; charset=utf-8').send(svg);
    } catch (err) { log.warn?.('[reading-art] render failed:', req.params.book, page, err.message); res.status(500).type('text/plain').send('error'); }
  });
}
