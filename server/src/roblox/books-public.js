// 絵本を 合言葉なしで わたす 口（/api/public/books…）。Roblox の 絵本の place が Secrets なしで 読む（2026-11）。
//
//  * GET  /api/public/books                 本の 一覧（段階ごと）：id・題名・段階・表紙の 絵（Roblox の 審査を 通った ものだけ。なければ ""）
//  * GET  /api/public/books/<id>            1 冊：本文・日本語・ことば・ページの 絵・クイズ（しつもんと 選択肢だけ。**答えは 入れない**）
//  * POST /api/public/books/<id>/check      { n, choice } → { correct, answer }（1 問ぶん。こたえた あとに だけ 正解が わかる＝Web の クイズと 同じ）
//
// だれでも 読める 口なので：
//  ・子どもの 名前・記録は あつかわない。**ここで あそんだ ぶんは 学習の 記録にも コインにも のらない**（のせたい ときは 合言葉つきの /api/roblox/books）。
//  ・出すのは 本の 中身（Web の 絵本と 同じ もの）と、審査を 通った 絵の 番号だけ。
//  ・1 つの IP から 1 分に きまった 回数まで（Roblox の サーバーは 同じ IP から 何人ぶんも 来るので ゆるめ）。GET は 1 分 おぼえて もらう。
import { allBooks, bookById, QUIZ_PASS, SHAPE } from '../game/reading.js';
import { DEFAULT_STAGES } from '../game/roadmap.js';

const ID = /^rd-[A-Za-z0-9-]{1,40}$/;
const shuffle = (a, rng) => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function createPublicBooks({ assets = null, rng = Math.random } = {}) {
  const image = (id, n) => (assets ? assets.imageFor(id, n) : '');
  const stageInfo = Object.fromEntries(DEFAULT_STAGES.map((s) => [s.id, s]));

  function list({ stage = '' } = {}) {
    const books = [...allBooks().values()].filter((b) => !stage || b.stage === stage)
      .map((b) => ({ id: b.id, stage: b.stage, title: b.title, titleJa: b.titleJa, kind: b.kind || 'story', words: b.words, pages: b.pages.length, image: image(b.id, 0),
        ready: Array.from({ length: b.pages.length + 1 }, (_, n) => image(b.id, n)).filter(Boolean).length }));
    return { ok: true, stages: Object.keys(SHAPE).map((id) => ({ id, ja: stageInfo[id]?.ja || '', en: stageInfo[id]?.en || '' })), books };
  }
  // 1 冊。クイズは n（1〜）と しつもん・選択肢だけ：正解は どこにも 入れない（check が こたえる）。
  function one(id) {
    const b = ID.test(String(id)) ? bookById(id) : null;
    if (!b) return null;
    return { ok: true, book: {
      id: b.id, stage: b.stage, title: b.title, titleJa: b.titleJa, kind: b.kind || 'story', words: b.words, cover: image(b.id, 0),
      pages: b.pages.map((p, i) => ({ n: i + 1, text: p.text, ja: p.ja, image: image(b.id, i + 1) })),
      glossary: b.glossary.map((g) => ({ en: g.en, ja: g.ja })),
      quiz: b.quiz.map((q, i) => ({ n: i + 1, q: q.q, ja: q.ja, choices: shuffle(q.choices, rng) })),
      pass: QUIZ_PASS,
    } };
  }
  function check(id, { n, choice } = {}) {
    const b = ID.test(String(id)) ? bookById(id) : null;
    if (!b) return null;
    const i = Math.floor(Number(n)) - 1;
    const q = Number.isFinite(i) ? b.quiz[i] : null;
    if (!q || typeof choice !== 'string' || !choice || choice.length > 200) return { ok: false, error: 'bad question' };
    return { ok: true, correct: choice === q.answer, answer: q.answer, n: i + 1, of: b.quiz.length };
  }
  return { list, one, check };
}

// limiter：privacy.js の rateLimit（読む 口と こたえる 口で べつべつに 数える）。express：JSON の 読みとり用。
export function mountPublicBooks(app, { express, assets = null, readLimiter = null, checkLimiter = null, rng = Math.random } = {}) {
  const books = createPublicBooks({ assets, rng });
  const pass = (req, res, next) => next();
  const head = (res, cache) => { res.set('Cache-Control', cache ? 'public, max-age=60' : 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); };
  app.get('/api/public/books', readLimiter || pass, (req, res) => { head(res, true); res.json(books.list({ stage: String(req.query.stage ?? '').trim().slice(0, 4) })); });
  app.get('/api/public/books/:id', readLimiter || pass, (req, res) => {
    const out = books.one(req.params.id);
    if (!out) { head(res, false); res.status(404).json({ ok: false, error: 'no book' }); return; }
    head(res, true); res.json(out);
  });
  app.post('/api/public/books/:id/check', checkLimiter || pass, express.json({ limit: '2kb' }), (req, res) => {
    head(res, false);
    const out = books.check(req.params.id, { n: req.body?.n, choice: req.body?.choice });
    if (!out) { res.status(404).json({ ok: false, error: 'no book' }); return; }
    res.status(out.ok ? 200 : 400).json(out);
  });
  return books;
}
