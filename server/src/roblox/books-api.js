// Roblox 版に 絵本を わたす 口（/api/roblox/books…・合言葉 X-USpeak-Key は sync.js が たしかめる）。
//
//  * GET  /api/roblox/books?stage=A            本の 一覧（段階ごと）。表紙の 絵（審査を 通った ものだけ。なければ image は ""）。
//  * GET  /api/roblox/books/<id>?username=…    1 冊：本文・日本語・ことば・ページの 絵・クイズ 5 問（答えは 入れない）。
//  * POST /api/roblox/books/check              { token, choice, username, userId, classCode, ms, placeId } → { correct, answer, done?, … }
//
// **判定は 英検ドリル（drill.js）と 同じ やり方**：答えは 署名つきの token に とじて Roblox の サーバーだけが 持ち、
// 判定・コイン・学習の 記録は ここ（Web の サーバー）で 決める。Roblox は 返って きた coins を 足すだけ。
// 記録は Web の よみもの島と 同じ 形（type=quiz・world=reading・その 段階の 級／ ✓ の とき type=book）＝ロードマップ・保護者レポートが 数える。
// Roblox では きく・よむ の しるしが ないので、**クイズ 8 割で その 本は ✓**（コインは 1 人 1 冊 1 回・1 日 80 まで。Web と 同じ 数）。
import { createHash, randomBytes } from 'node:crypto';
import { signToken, readToken } from './drill.js';
import { allBooks, bookById, gradeOfStage, QUIZ_PASS, BOOK_COINS, DAILY_COIN_CAP, SHAPE } from '../game/reading.js';
import { DEFAULT_STAGES } from '../game/roadmap.js';

const TOKEN_TTL_MS = 3 * 60 * 60 * 1000;
const jstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const shuffle = (a, rng) => { const b = [...a]; for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function createRobloxBooks({ secret, assets = null, store = null, now = Date.now, rng = Math.random, log = console }) {
  const sessions = new Map();   // sid → { book, username, right, seen:Set, at }
  const coinsToday = new Map(); // username → { day, n }
  const image = (id, n) => (assets ? assets.imageFor(id, n) : '');
  const stageInfo = Object.fromEntries(DEFAULT_STAGES.map((s) => [s.id, s]));

  function list({ stage = '' } = {}) {
    const books = [...allBooks().values()].filter((b) => !stage || b.stage === stage)
      .map((b) => ({ id: b.id, stage: b.stage, title: b.title, titleJa: b.titleJa, kind: b.kind || 'story', words: b.words, pages: b.pages.length, image: image(b.id, 0),
        ready: Array.from({ length: b.pages.length + 1 }, (_, n) => image(b.id, n)).filter(Boolean).length }));
    return { ok: true, stages: Object.keys(SHAPE).map((id) => ({ id, ja: stageInfo[id]?.ja || '', en: stageInfo[id]?.en || '' })), books };
  }

  function one(id, { username = '' } = {}) {
    const b = bookById(id);
    if (!b) return null;
    const at = now(); const sid = randomBytes(9).toString('base64url');
    sessions.set(sid, { book: b.id, username, right: 0, seen: new Set(), at });
    for (const [k, s] of sessions) if (at - s.at > TOKEN_TTL_MS) sessions.delete(k);
    return { ok: true, book: {
      id: b.id, stage: b.stage, title: b.title, titleJa: b.titleJa, kind: b.kind || 'story', words: b.words, cover: image(b.id, 0),
      // image が "" の ページは まだ 審査中（Roblox 側で「じゅんびちゅう」の 絵を 出す）。
      pages: b.pages.map((p, i) => ({ n: i + 1, text: p.text, ja: p.ja, image: image(b.id, i + 1) })),
      glossary: b.glossary.map((g) => ({ en: g.en, ja: g.ja })),
      quiz: b.quiz.map((q, i) => ({ token: signToken(secret, { sid, book: b.id, i, answer: q.answer, iat: at, exp: at + TOKEN_TTL_MS }), n: i + 1, q: q.q, ja: q.ja, choices: shuffle(q.choices, rng) })),
      pass: QUIZ_PASS,
    } };
  }

  function award(username, at) {
    const day = jstDay(at); const c = coinsToday.get(username); const used = c && c.day === day ? c.n : 0;
    const give = used + BOOK_COINS <= DAILY_COIN_CAP ? BOOK_COINS : 0;
    coinsToday.set(username, { day, n: used + give });
    return give;
  }
  const event = (row) => { try { store?.appendRobloxEvents?.([row]); } catch (err) { log.warn?.('[roblox-books] event failed:', err.message); } };

  async function check({ token, choice, username = '', userId = '', classCode = '', ms = 0, placeId = '' }) {
    const at = now();
    const p = readToken(secret, token, at);
    if (!p || !p.book) return { ok: false, error: 'bad token' };
    const b = bookById(p.book);
    if (!b) return { ok: false, error: 'no book' };
    const correct = String(choice) === String(p.answer);
    const s = sessions.get(p.sid) || { book: p.book, username, right: 0, seen: new Set(), at };
    const first = !s.seen.has(p.i);
    if (first) { s.seen.add(p.i); if (correct) s.right += 1; sessions.set(p.sid, s); }
    const base = { world: 'reading', place_id: String(placeId).slice(0, 32), username: String(username).slice(0, 40), user_id: String(userId).slice(0, 32), class_code: String(classCode).slice(0, 24), received_at: new Date(at).toISOString(), source: 'roblox' };
    if (first && username) {
      event({ ...base, id: `rb-${createHash('sha256').update(String(token)).digest('hex').slice(0, 22)}`, ts: at, type: 'quiz',
        data_json: JSON.stringify({ correct, grade: gradeOfStage(b.stage), level: 'Reading', format: 'mc', book: b.id, stage: b.stage, ms: Math.max(0, Math.round(Number(ms) || 0)), source: 'roblox' }) });
    }
    const out = { ok: true, correct, answer: p.answer, n: s.seen.size, of: b.quiz.length };
    if (s.seen.size >= b.quiz.length && !s.finished) {
      s.finished = true;
      const passed = s.right / b.quiz.length >= QUIZ_PASS;
      let coins = 0; let firstDone = false;
      if (passed && username) {
        // その 子が この 本を はじめて ✓ に した ときだけ（記録の 箱を 見る）。
        let before = [];
        try { before = (await store?.listRobloxEvents?.({ username })) || []; } catch { before = []; }
        firstDone = !before.some((e) => { if (e.type !== 'book') return false; try { return JSON.parse(e.data_json || '{}').book === b.id; } catch { return false; } });
        if (firstDone) {
          coins = award(username, at);
          event({ ...base, id: `rb-book-${createHash('sha256').update(`${username}|${b.id}`).digest('hex').slice(0, 22)}`, ts: at, type: 'book',
            data_json: JSON.stringify({ book: b.id, title: b.title, stage: b.stage, words: b.words, source: 'roblox' }) });
        }
      }
      Object.assign(out, { done: true, right: s.right, passed, firstDone, coins });
    }
    return out;
  }

  // sync.js の ルーターに 足す。
  function mount(api) {
    const str = (v, n) => String(v ?? '').trim().slice(0, n);
    api.get('/books', (req, res) => res.json(list({ stage: str(req.query.stage, 4) })));
    api.get('/books/:id', (req, res) => {
      const out = /^rd-[A-Za-z0-9-]{1,40}$/.test(String(req.params.id)) ? one(req.params.id, { username: str(req.query.username, 40) }) : null;
      if (!out) { res.status(404).json({ ok: false, error: 'no book' }); return; }
      res.json(out);
    });
    api.post('/books/check', async (req, res) => {
      const b = req.body || {};
      const out = await check({ token: b.token, choice: b.choice, username: str(b.username, 40), userId: str(b.userId, 32), classCode: str(b.classCode, 24), ms: b.ms, placeId: str(b.placeId, 32) });
      res.status(out.ok ? 200 : 400).json(out);
    });
  }
  return { list, one, check, mount };
}
