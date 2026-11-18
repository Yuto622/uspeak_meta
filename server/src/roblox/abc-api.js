// Roblox 版の「ABC と おと」の 口（/api/roblox/abc…・合言葉 X-USpeak-Key は sync.js が たしかめる）。
//
//  * GET  /api/roblox/abc/state?username=…&classCode=…   いまの ようす（もじ ○/26・きまり ○こ・つぎに やる こと・絵の そろい）
//  * POST /api/roblox/abc/start   { username, userId, classCode, review? }           → { sid, q, state }
//  * POST /api/roblox/abc/answer  { sid, choice | order | seen, ms, placeId … }      → { teach, correct, answer, over, next, summary, state }
//
// **問題・きまりは Web 版と 同じ もの**（game/abc.js：はじめの 数問・とばす・8 割で つぎへ・にがての ふくしゅう・クラスごとの 設定）。
// 問題を 作るのも 判定も ここ（Web の サーバー）。1 回ぶん（round）は ここで おぼえ、Roblox には sid と 選択肢だけ わたす＝**答えは 答える 前に 出ない**。
// 記録は Web の 子と **同じ 1 つ**（AbcStore の クラス｜名前。Roblox の 名前は つなぎ表 childFor で Web の 名前に なおす）。
// 判定した 答えは 1 問ずつ roblox_events の quiz（world=abc・source=roblox）に、1 回ぶんが おわると type=abc（保護者レポートの 数字）に 書く。
// Roblox に 出さない ことば（abc-assets.js の ROBLOX_BLOCKED）と、まだ 審査を 通って いない 絵の ことばは 問題に 使わない。
// 絵が そろうまで（もじ 26・きまり ぜんぶに 使える ことばが ある）は はじめられない（error: 'pictures'）。
import { createHash, randomBytes } from 'node:crypto';
import * as abcGame from '../game/abc.js';
import { gradeOfStage } from '../game/reading.js';
import { ROBLOX_BLOCKED, robloxWords, abcBookId } from './abc-assets.js';

const ROUND_TTL_MS = 2 * 60 * 60 * 1000;
const VOWELS = ['a', 'e', 'i', 'o', 'u'];

export function createRobloxAbc({ abc = null, assets = null, store = null, childFor = () => null, stageOf = async () => 'A', now = Date.now, rng = Math.random, log = console }) {
  const rounds = new Map(); // sid → { round, cls, name, username, userId, classCode, at }
  const memory = new Map(); // AbcStore が ない とき（テスト）の 記録
  const image = (word) => (assets ? assets.imageFor(abcBookId(word), 0) : '');

  // この 子の 記録の 場所（Web と 同じ）。つなぎ表に あれば その クラス・名前、なければ Roblox が 言う クラスと Roblox の 名前。
  function who(username, classCode) {
    const c = childFor(username);
    const cls = c && c.class && c.class !== '*' ? c.class : (String(classCode || '').trim() || 'roblox');
    return { cls, name: c?.name || username };
  }
  const progressOf = (w) => (abc ? abc.of(w.cls, w.name) : (memory.get(`${w.cls}|${w.name}`) || memory.set(`${w.cls}|${w.name}`, abcGame.blankProgress()).get(`${w.cls}|${w.name}`)));
  const settingsOf = (w) => (abc ? abc.settingsOf(w.cls) : { ...abcGame.DEFAULT_SETTINGS });

  // いま 使える 絵（審査を 通った もの）。外す ことば＝出さない もの＋まだ 絵が ない もの。
  function pictures() {
    const all = robloxWords(); const ready = all.filter((w) => image(w));
    const have = new Set(ready);
    const exclude = new Set([...abcGame.allWords().filter((w) => !have.has(w))]);
    // あそべるか：外した あとも、もじ 26 と きまり ぜんぶに 絵の ある ことばが 足りて いる（足りない グループは もとの ことばが のこる＝絵が ない）。
    const d = abcGame.data();
    let playable = !!d;
    if (d) {
      for (const l of Object.keys(d.letters)) if (!d.letters[l].words.some((x) => have.has(x.w))) playable = false;
      for (const v of VOWELS) if (d.cvc.filter((x) => x.parts[1] === v && have.has(x.w)).length < 3) playable = false;
      for (const list of [...Object.values(d.digraphs), ...Object.values(d.magicE)]) if (list.filter((x) => have.has(x.w)).length < 3) playable = false;
    }
    return { total: all.length, ready: ready.length, playable, exclude };
  }
  const stateOf = (w, pics) => ({ ...abcGame.withWords(pics.exclude, () => abcGame.publicState(progressOf(w), settingsOf(w))), pictures: { ready: pics.ready, total: pics.total, playable: pics.playable } });

  // Roblox に わたす 1 問：Web と 同じ 中身＋その 問題に 出る ことばの 絵の 番号（images）。
  function publicQ(round) {
    const q = abcGame.question(round); if (!q) return null;
    const words = new Set();
    if (q.word) words.add(q.word);
    if (q.kind === 'sound' && q.say) words.add(q.say);
    if (q.kind === 'picture' || q.kind === 'blend') for (const c of q.choices || []) words.add(c);
    for (const ln of q.lines || []) if (ln.word) words.add(ln.word);
    return { ...q, images: Object.fromEntries([...words].map((w) => [w, image(w)])) };
  }
  const event = (row) => { try { store?.appendRobloxEvents?.([row]); } catch (err) { log.warn?.('[roblox-abc] event failed:', err.message); } };
  const sweep = (at) => { for (const [k, r] of rounds) if (at - r.at > ROUND_TTL_MS) rounds.delete(k); };

  function state({ username = '', classCode = '' }) {
    if (!abcGame.ready()) return { ok: false, error: 'no data' };
    const w = who(username, classCode);
    return { ok: true, state: stateOf(w, pictures()) };
  }

  async function start({ username = '', userId = '', classCode = '', review = false }) {
    if (!abcGame.ready()) return { ok: false, error: 'no data' };
    if (!username) return { ok: false, error: 'no user' };
    const pics = pictures();
    if (!pics.playable) return { ok: false, error: 'pictures', pictures: { ready: pics.ready, total: pics.total } };
    const w = who(username, classCode); const progress = progressOf(w); const settings = settingsOf(w);
    // はじめの 数問：学年の かわりに ロードマップの 段階（Web と 同じ きまり）。
    let hi = false;
    if (!progress.placed) { let stage = 'A'; try { stage = String(await stageOf(w.cls, w.name, username)) || 'A'; } catch { stage = 'A'; } hi = ['A', 'B', 'C'].indexOf(stage) < 0; }
    const round = abcGame.withWords(pics.exclude, () => abcGame.startRound(progress, settings, { review: review === true, hi, rng }));
    if (!round) return { ok: false, error: review === true ? 'no review' : 'nothing' };
    const at = now(); sweep(at);
    for (const [k, r] of rounds) if (r.username === username) rounds.delete(k); // 1 人 1 つ
    const sid = randomBytes(12).toString('base64url');
    rounds.set(sid, { round, ...w, username, userId, classCode, at });
    return { ok: true, sid, q: publicQ(round), state: stateOf(w, pics) };
  }

  async function answer({ sid = '', choice, order, seen, ms = 0, username = '', placeId = '' }) {
    const at = now();
    const r = rounds.get(String(sid));
    if (!r || (username && r.username !== username)) return { ok: false, error: 'no round' };
    r.at = at;
    const pics = pictures();
    const out = abcGame.withWords(pics.exclude, () => abcGame.answer(r.round, { choice, order, seen }, { rng }));
    if (!out) return { ok: false, error: 'no question' };
    const base = { world: 'abc', place_id: String(placeId).slice(0, 32), username: String(r.username).slice(0, 40), user_id: String(r.userId || '').slice(0, 32), class_code: String(r.classCode || r.cls).slice(0, 24), received_at: new Date(at).toISOString(), source: 'roblox' };
    if (!out.teach) {
      const it = out.item;
      // Web の 部屋（ClassRoom.onAbc）と 同じ 形。ことば（cat など）は 苦手単語の 箱にも 入る。もじ 1 つは 入れない。
      event({ ...base, id: `ra-${createHash('sha256').update(`${sid}|${r.round.judged}`).digest('hex').slice(0, 22)}`, ts: at, type: 'quiz',
        data_json: JSON.stringify({ correct: out.correct, grade: gradeOfStage(it.key[0] === 'L' ? 'A' : '1'), level: 'ABC', format: it.format === 'listen' ? 'listen' : it.format === 'spell' ? 'spell' : 'mc',
          ...(it.word && it.key[0] === 'R' ? { word: it.word } : {}), abc: it.key, ms: Math.max(0, Math.round(Number(ms) || 0)), source: 'roblox' }) });
    }
    let summary = null; let st;
    if (out.over) {
      const progress = progressOf(r);
      summary = abcGame.withWords(pics.exclude, () => abcGame.finish(progress, r.round, { now: at }));
      rounds.delete(String(sid));
      try { await abc?.save(); } catch (err) { log.warn?.('[roblox-abc] save failed:', err?.message || err); }
      // 保護者レポート（LINE）の「おぼえた もじ ○/26・よめる ルール ○こ」は この 1 行を 読む（Web と 同じ）。
      event({ ...base, id: `ra-sum-${createHash('sha256').update(`${sid}`).digest('hex').slice(0, 22)}`, ts: at + 1, type: 'abc', data_json: JSON.stringify({ ...abcGame.reportNumbers(progress), source: 'roblox' }) });
      st = stateOf(r, pics);
    }
    return { ok: true, teach: out.teach, correct: out.correct, answer: out.answer, parts: out.parts, over: out.over, next: out.over ? null : publicQ(r.round), summary, state: st };
  }

  // sync.js の ルーターに 足す。
  function mount(api) {
    const str = (v, n) => String(v ?? '').trim().slice(0, n);
    api.get('/abc/state', (req, res) => { const out = state({ username: str(req.query.username, 40), classCode: str(req.query.classCode, 24) }); res.status(out.ok ? 200 : 400).json(out); });
    api.post('/abc/start', async (req, res) => {
      const b = req.body || {};
      const out = await start({ username: str(b.username, 40), userId: str(b.userId, 32), classCode: str(b.classCode, 24), review: b.review === true });
      res.status(out.ok ? 200 : 400).json(out);
    });
    api.post('/abc/answer', async (req, res) => {
      const b = req.body || {};
      const out = await answer({ sid: str(b.sid, 40), choice: b.choice === undefined ? undefined : str(b.choice, 20), order: Array.isArray(b.order) ? b.order.slice(0, 12).map((x) => str(x, 8)) : undefined, seen: b.seen === true, ms: b.ms, username: str(b.username, 40), placeId: str(b.placeId, 32) });
      res.status(out.ok ? 200 : 400).json(out);
    });
  }
  return { state, start, answer, mount, pictures, blocked: ROBLOX_BLOCKED };
}
