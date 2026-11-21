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

// 教室 まとめての QR（2026-11：「クラスは わかれて いるけど ぜんぶ iac。1 つの QR に」）。
// 教室＝/admin/classrooms の 1 行（いくつかの クラス）。URL は `/?room=<教室の id>&k=<署名>`。署名は クラスの QR とも レポートとも べつの 文字（`joinroom|`）。
// 一覧は 教室の クラス ぜんぶの 子。なまえを おすと **その 子の クラス**で 入る（入れるか どうかは いつもの onAuth）。
export const signJoinRoom = (secret, roomId) => signLink(secret, `joinroom|${String(roomId)}`, JOIN_TTL_MS);
export const verifyJoinRoom = (secret, roomId, token) => !!secret && !!roomId && verifyLink(secret, `joinroom|${String(roomId)}`, token);
export const joinRoomPath = (secret, roomId) => `/?room=${encodeURIComponent(roomId)}&k=${encodeURIComponent(signJoinRoom(secret, roomId))}`;
const MAX_ROOM_NAMES = 200;

// 教室の クラス ぜんぶの 子（クラスの 順・先生・停止は のぞく）。同じ なまえが 2 つの クラスに いれば 両方 出す（クラスで 見分ける）。
export function entriesForRoom(rows, classes) {
  const out = []; const seen = new Set();
  for (const code of classes || []) {
    for (const name of namesFor(rows, code)) {
      const k = `${fold(code)}|${fold(name)}`;
      if (seen.has(k)) continue;
      seen.add(k); out.push({ name, class: code });
      if (out.length >= MAX_ROOM_NAMES) return out;
    }
  }
  return out;
}

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

export function mountJoinNames(app, { kids, classrooms = null, rosterRows = async () => [], secret, limiter = null, log = console }) {
  const handlers = [];
  if (limiter) handlers.push(limiter);
  handlers.push(async (req, res) => {
    res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); res.set('Referrer-Policy', 'no-referrer');
    const classCode = String(req.query.class ?? '').trim().slice(0, 40);
    const roomId = String(req.query.room ?? '').trim().slice(0, 64);
    const none = () => res.status(404).json({ ok: false });
    if (roomId) {
      const room = classrooms?.get?.(roomId);
      if (!secret || !kids || !room || !kids.roomPickOf(roomId) || !verifyJoinRoom(secret, roomId, String(req.query.k ?? '').slice(0, 200))) { none(); return; }
      let entries = [];
      try { entries = entriesForRoom(await rosterRows(), room.classes); } catch (err) { log.warn?.('[join] roster failed:', err.message); }
      if (!entries.length) { none(); return; }
      res.json({ ok: true, names: entries.map((e) => e.name), entries });
      return;
    }
    if (!secret || !kids || !classCode || !kids.pickOf(classCode) || !verifyJoin(secret, classCode, String(req.query.k ?? '').slice(0, 200))) { none(); return; }
    let names = [];
    try { names = namesFor(await rosterRows(), classCode); } catch (err) { log.warn?.('[join] roster failed:', err.message); }
    if (!names.length) { none(); return; }
    res.json({ ok: true, names });
  });
  app.get('/api/join/names', ...handlers);
}
