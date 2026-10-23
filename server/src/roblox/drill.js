// Roblox の「英検ドリル」ワールド — /admin/qbank の 問題を、メインワールドと 同じ 7 形式（mc・match・spell・type・order・
// fill・listen）で 出す（docs/QBANK.md の「Roblox の ドリル ワールド」）。
//
// DB の 1 行（英検形式）を 宿題と 同じ 1 問の 形（homework/items.js）に なおし、formats-core の build* で 作る。
// 形の 作りかたと 判定は web版と 同じ ファイルを 使うので、Roblox に 同じ ロジックを 書きなおさない。
//
//  * GET  /api/roblox/drill?grade=5級&n=10        10 問。1 問ずつ { token, kind, public }（public は 答えの ない 形）
//  * POST /api/roblox/drill/check                { token, answer, attempt, username, userId, classCode, ms }
//                                                → { correct, reveal?, retry?, coins }。学習の 記録も ここで のこす。
// token は 答えつきの 形を サーバーの 鍵で 署名した もの。Roblox の サーバーだけが 持ち、子どもの 端末には 送らない。
// 正解・コインは ここで 決める（Roblox は 返ってきた coins を 足すだけ）。
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { publicFormat, checkFormat, revealFormat, shuffle } from '../../../client/dist/formats-core.js';
import { assignKinds, buildItem, wordOf } from '../homework/items.js';

export const DRILL_KINDS = ['mc', 'match', 'spell', 'type', 'order', 'fill', 'listen'];
export const MAX_N = 20;
export const COIN_RIGHT = 10;            // 1 回目で 正解（やりなおしは コインなし）
export const DAILY_COINS = 300;          // 1 人 1 日の 上限（JST）
const TOKEN_TTL_MS = 3 * 60 * 60 * 1000;
const LEVEL = { '5級': '5', '4級': '4', '3級': '3', '準2級': 'pre2', '2級': '2', '準1級': 'pre1', '準1級以上': 'pre1', '1級': '1', ジュニア: 'jr' };

const hasJa = (s) => /[぀-ヿ㐀-鿿]/.test(String(s || ''));
const isEnglish = (s) => /^[A-Za-z][A-Za-z '.,!?’'-]*$/.test(String(s || '').trim());
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const quoted = (s) => (String(s || '').match(/「([^」]+)」/) || [])[1] || '';
const others = (row) => row.choices.filter((c) => c !== row.answer);
// 「（これは りんご です。）」の ような 日本語の 訳を 文から 取りだす
const splitJa = (s) => {
  const m = String(s || '').match(/^(.*?)[（(]([^（）()]*[぀-ヿ㐀-鿿][^（）()]*)[）)]\s*$/s);
  return m ? { text: m[1].trim(), ja: m[2].trim() } : { text: String(s || '').trim(), ja: '' };
};

// DB の 1 行 → 7 形式の 1 問（homework/items.js の 形）。出せない 行は null。
export function drillItem(row) {
  if (!row || row.skill === 'speaking' || row.skill === 'writing') return null;
  const f = row.format || '';
  const base = { id: row.id };
  // ことばの 問題（日→英・英→日・聞いて えらぶ）… 形は あとで まぜて わりあてる
  if (/日→英/.test(f)) {
    const ja = quoted(row.question);
    return ja && isEnglish(row.answer) ? { ...base, en: row.answer, ja, wrong: others(row) } : null;
  }
  if (/英→日/.test(f) || /聞いて 絵を えらぶ/.test(f)) {
    const en = quoted(row.question);
    return en && isEnglish(en) && hasJa(row.answer) ? { ...base, en: /^[A-Z][a-z]+$/.test(en) ? en.toLowerCase() : en, ja: row.answer, wrong: others(row) } : null;
  }
  if (/聞いて 英単語を えらぶ/.test(f)) {
    const ja = (String(row.explanation || '').match(/[=＝]\s*(.+)$/) || [])[1] || '';
    return isEnglish(row.answer) ? { ...base, kind: 'listen', en: row.answer, ja: ja.trim(), wrong: others(row) } : null;
  }
  // ならべかえ
  if (/ならべかえ/.test(f) && !row.choices.length) {
    const n = words(row.answer).length;
    return isEnglish(row.answer) && n >= 2 && n <= 10 ? { ...base, kind: 'order', sentence: row.answer, ja: row.question.split('\n')[0].trim() } : null;
  }
  if (/語句整序/.test(f)) {
    const sentence = (String(row.explanation || '').match(/「([A-Za-z][^」]+)」/) || [])[1] || '';
    const n = words(sentence).length;
    return sentence && isEnglish(sentence) && n >= 2 && n <= 10 ? { ...base, kind: 'order', sentence, ja: row.question.split('\n')[0].trim() } : null;
  }
  if (!row.choices.length) return null;
  // 聞く 問題（本文が 読まれる もの）と 絵を 見る 問題は、Roblox の 画面で 音や 絵が 出せないので 出さない
  if (row.skill === 'listening' || /イラスト/.test(f)) return null;
  // あなうめ：文の ( ) に 英単語 1 語が 入る 問題
  const { text, ja } = splitJa(row.question);
  if (/\(\s*\)/.test(text) && !row.passage && /^[A-Za-z'-]+$/.test(row.answer) && !text.includes('\n')) {
    const sentence = text.replace(/\(\s*\)/, row.answer);
    if (isEnglish(sentence.replace(/^[^A-Za-z]+/, ''))) return { ...base, kind: 'fill', sentence, blank: row.answer, ja, wrong: others(row) };
  }
  // のこりの 4 択は 問題文つきの「えらぶ」（本文が 長い ものは 出さない）
  const prompt = [row.passage, row.question].filter(Boolean).join('\n');
  return prompt.length <= 300 ? { ...base, kind: 'mc', prompt, answer: row.answer, wrong: others(row) } : null;
}

// ---- 署名つきの token ---------------------------------------------------------------------------
export function signToken(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}
export function readToken(secret, token, now = Date.now()) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', secret).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p && p.exp > now ? p : null;
  } catch { return null; }
}

const jstDay = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function createDrill({ secret, items = () => [], store = null, now = Date.now, rng = Math.random }) {
  const coinsToday = new Map(); // username → { day, n }

  // grade の 問題から n 問。ことばの 問題は 同じ 級の ことばを まぜて 形を わりあてる（せんつなぎ・えらぶの まちがいに 使う）。
  function pick({ grade = '', n = 10, kinds = null } = {}) {
    const rows = items().filter((it) => !grade || it.grade === grade);
    const conv = [];
    for (const r of shuffle(rows, rng)) { const it = drillItem(r); if (it) conv.push(it); if (conv.length >= 400) break; }
    const wordPool = conv.filter((it) => !it.kind && !it.prompt).slice(0, 40);
    const assigned = assignKinds([...wordPool, ...conv.filter((it) => it.kind)].map((it) => ({ ...it })), { respect: true });
    const pool = assigned.filter((it) => ['mc', 'match', 'spell', 'type', 'listen'].includes(it.kind) && !it.prompt);
    const want = Array.isArray(kinds) && kinds.length ? new Set(kinds.filter((k) => DRILL_KINDS.includes(k))) : null;
    // 形を じゅんばんに まぜる（DB は あなうめが 多いので、そのまま 引くと かたよる）
    const byKind = new Map();
    for (const it of shuffle(assigned.filter((x) => !want || want.has(x.kind)), rng)) {
      if (!byKind.has(it.kind)) byKind.set(it.kind, []);
      byKind.get(it.kind).push(it);
    }
    const lanes = shuffle([...byKind.values()], rng);
    const chosen = [];
    const total = Math.min(MAX_N, Math.max(1, n));
    for (let i = 0; chosen.length < total && lanes.some((l) => l.length); i += 1) {
      const lane = lanes[i % lanes.length];
      if (lane.length) chosen.push(lane.shift());
    }
    const at = now();
    return chosen.map((it) => {
      const fmt = buildItem(it, pool, rng);
      const row = rows.find((r) => r.id === it.id) || {};
      const payload = { fmt, qid: it.id, grade: row.grade || grade, skill: row.skill || '', word: wordOf(it), iat: at, exp: at + TOKEN_TTL_MS };
      return { token: signToken(secret, payload), kind: fmt.kind, public: publicFormat(fmt) };
    });
  }

  function award(username, at) {
    const day = jstDay(at);
    const c = coinsToday.get(username);
    const used = c && c.day === day ? c.n : 0;
    const give = Math.max(0, Math.min(COIN_RIGHT, DAILY_COINS - used));
    coinsToday.set(username, { day, n: used + give });
    return give;
  }

  // 判定。attempt 2 は 2 回目（まちがえた あとの やりなおし）。
  function check({ token, answer, attempt = 1, username = '', userId = '', classCode = '', ms = 0, world = 'eiken-drill', placeId = '' }) {
    const at = now();
    const p = readToken(secret, token, at);
    if (!p) return { ok: false, error: 'bad token' };
    const second = Number(attempt) >= 2;
    const correct = checkFormat(p.fmt, answer);
    const coins = correct && !second && username ? award(username, at) : 0;
    if (store?.appendRobloxEvents && username) {
      const id = `dr-${createHash('sha256').update(String(token)).digest('hex').slice(0, 20)}-${second ? 2 : 1}`;
      const data = { level: LEVEL[p.grade] || p.grade, format: p.fmt.kind, correct, fast: !correct && Number(ms) > 0 && Number(ms) < 1200,
        retry: second, ms: Math.max(0, Math.round(Number(ms) || 0)), qid: p.qid, skill: p.skill, source: 'roblox', drill: true, ...(p.word ? { word: p.word } : {}) };
      store.appendRobloxEvents([{ id, ts: at, type: 'quiz', world: String(world).slice(0, 40), place_id: String(placeId).slice(0, 32),
        username: String(username).slice(0, 40), user_id: String(userId).slice(0, 32), class_code: String(classCode).slice(0, 24),
        data_json: JSON.stringify(data), received_at: new Date(at).toISOString(), source: 'roblox' }]);
    }
    const out = { ok: true, correct, coins };
    if (correct || second) out.reveal = revealFormat(p.fmt);
    else out.retry = publicFormat(p.fmt, { attempt: 2 });
    return out;
  }

  return { pick, check };
}
