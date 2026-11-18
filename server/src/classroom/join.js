// なまえを えらんで 入る（F7）— クラスの QR／URL を ひらくと、名簿の なまえを えらぶ だけで 入れる。
//
// ・**はじめは オフ。** 教室の 先生が /teacher/kids（運営は /admin/kids）で クラスごとに オンに する（子どもの なまえを 見せるか どうかは 教室が きめる）。
// ・URL は `/?class=<コード>&k=<署名>`。署名は REPORT_SECRET の HMAC・クラスに むすぶ・**レポートの リンクとは べつの 文字**を まぜる
//   （教室の ようすの リンクで なまえの 一覧は 出ない・その ぎゃくも ない）。
// ・口（/api/join/names）が 返すのは **その クラスの 子どもの なまえ だけ**（先生の 行・停止の 行・クラスの 書いて いない 行は 出さない）。
//   署名が ちがう・オフ・知らない クラスは どれも 同じ 404。
// ・一覧は 入力の かわり。入れるか どうかは いつもの onAuth（名簿・停止・クラスコード・先生パスワード）が きめる。
import { signLink, verifyLink } from '../game/report.js';

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase();
const JOIN_TTL_MS = 400 * 24 * 60 * 60 * 1000; // 印刷した QR を 1 年 つかえる ように
const MAX_NAMES = 60;

export const signJoin = (secret, classCode) => signLink(secret, `join|${fold(classCode)}`, JOIN_TTL_MS);
export const verifyJoin = (secret, classCode, token) => !!secret && !!fold(classCode) && verifyLink(secret, `join|${fold(classCode)}`, token);
export const joinPath = (secret, classCode) => `/?class=${encodeURIComponent(classCode)}&k=${encodeURIComponent(signJoin(secret, classCode))}`;

// その クラスの 子どもの なまえ（先生・停止・クラスなしの 行は のぞく）。
export function namesFor(rows, classCode) {
  const code = fold(classCode); const seen = new Set(); const out = [];
  for (const r of rows || []) {
    if (!r?.name || r.teacher || r.stopped || !r.class || r.class === '*' || fold(r.class) !== code) continue;
    const name = String(r.name).trim().slice(0, 16); const k = fold(name);
    if (!name || seen.has(k)) continue;
    seen.add(k); out.push(name);
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}

export function mountJoinNames(app, { kids, rosterRows = async () => [], secret, limiter = null, log = console }) {
  const handlers = [];
  if (limiter) handlers.push(limiter);
  handlers.push(async (req, res) => {
    res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Referrer-Policy', 'no-referrer');
    const classCode = String(req.query.class ?? '').trim().slice(0, 40);
    const none = () => res.status(404).json({ ok: false });
    if (!secret || !kids || !classCode || !kids.pickOf(classCode) || !verifyJoin(secret, classCode, String(req.query.k ?? '').slice(0, 200))) { none(); return; }
    let names = [];
    try { names = namesFor(await rosterRows(), classCode); } catch (err) { log.warn?.('[join] roster failed:', err.message); }
    if (!names.length) { none(); return; }
    res.json({ ok: true, names });
  });
  app.get('/api/join/names', ...handlers);
}
