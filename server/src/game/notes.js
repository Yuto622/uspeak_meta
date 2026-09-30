// 先生のメモと、声かけの記録 — 記録を「サービスが勝手に集めたもの」から
// 「先生が自分で書いたもの」にする。
//
// **自動で貯まる数字は、理屈の上ではどこでも作り直せる。先生が3年書き溜めた所見は、
// どこにも移せない。** 教室にとっていちばん手放しにくい記録はこちらで、だから
// CSV にも必ず出す（書いたものを人質にしない。出せるから、安心して書ける）。
//
// 2種類だけ：
//   note … 所見。面談の前に読み返すためのもの。`share` を付けたものだけ、
//          保護者のレポートに「先生から」として出る。**既定は出さない**。
//   call … 「声をかけた」。先生コンソールの気づき（`retention.js`）から1押しで残す。
//          そのあと2週間のうちに、その子が戻ってきたかを数える。
//
// **因果は言わない。** 声をかけた子が戻ったからといって、声をかけたから戻ったとは
// 限らない（比べる相手がいない）。出すのは「声をかけた N人のうち M人が 2週間以内に
// 戻ってきました」という**起きたこと**だけ。
import { randomBytes } from 'node:crypto';
import { dayKey } from './months.js';

export const KINDS = ['note', 'call'];
export const MAX_NOTES = 60;        // 1人ぶん。月1回書いて5年もつ
export const MAX_TEXT = 400;        // 面談メモとして読み返せる長さ
export const FOLLOW_DAYS = 14;      // 声かけのあと、何日のうちに戻れば「戻った」とするか
export const LOOK_BACK_DAYS = 120;  // 教室のまとめに入れる声かけの古さ

const DAY_MS = 24 * 60 * 60 * 1000;

// 制御文字を落とし、改行は2つまでに詰め、長さで切る。**HTML は出すときに必ずエスケープ**
// するので、ここでは文字を変えない（先生が書いた「<」を消さない）。
export function cleanText(raw) {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);
}

const iso = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };

export function sanitizeNotes(raw) {
  let src = raw;
  if (typeof src === 'string') { try { src = JSON.parse(src); } catch { return []; } }
  if (!Array.isArray(src)) return [];
  const out = [];
  for (const n of src) {
    if (!n || typeof n !== 'object' || !KINDS.includes(n.kind)) continue;
    const at = iso(n.at);
    const text = cleanText(n.text);
    if (!at || (n.kind === 'note' && !text)) continue;
    out.push({
      id: typeof n.id === 'string' && /^[\w-]{4,40}$/.test(n.id) ? n.id : `${Date.parse(at).toString(36)}-x`,
      at, kind: n.kind, text,
      share: n.kind === 'note' && n.share === true,
      by: cleanText(n.by).slice(0, 40),
    });
  }
  // 古い順に並べ、多すぎたら古いほうから落とす。
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out.slice(-MAX_NOTES);
}

// 1つ足す。書けなかったら null（空の所見は残さない）。
export function addNote(notes, { kind = 'note', text = '', share = false, by = '', now = Date.now() } = {}) {
  if (!KINDS.includes(kind)) return null;
  const body = cleanText(text);
  if (kind === 'note' && !body) return null;
  const entry = {
    id: `${Number(now).toString(36)}-${randomBytes(3).toString('hex')}`,
    at: new Date(now).toISOString(), kind, text: body,
    share: kind === 'note' && share === true,
    by: cleanText(by).slice(0, 40),
  };
  notes.push(entry);
  while (notes.length > MAX_NOTES) notes.shift();
  return entry;
}

export function removeNote(notes, id) {
  const i = notes.findIndex((n) => n.id === id);
  if (i < 0) return false;
  notes.splice(i, 1);
  return true;
}

// 保護者に見せてよい所見。新しい順、3つまで（レポートは読み物ではない）。
export const sharedNotes = (notes, limit = 3) => (notes || [])
  .filter((n) => n.kind === 'note' && n.share)
  .slice(-limit)
  .reverse()
  .map((n) => ({ at: n.at, text: n.text }));

export const lastCall = (notes) => [...(notes || [])].reverse().find((n) => n.kind === 'call') || null;

const dayNumber = (key) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY_MS);

// 声かけ1つの結果。
//   back    … 声をかけた日の翌日から14日のうちに、1問でも答えた日がある
//   waiting … まだ14日たっていない（戻っていない）
//   away    … 14日たっても戻っていない
export function callOutcome(entry, months, { now = Date.now() } = {}) {
  const at = Date.parse(entry?.at || '');
  if (!Number.isFinite(at)) return null;
  const from = dayNumber(dayKey(at));
  const days = Object.values(months || {}).flatMap((m) => (Array.isArray(m?.days) ? m.days : []));
  const after = days.map(dayNumber).filter((d) => d > from && d <= from + FOLLOW_DAYS).sort((a, b) => a - b);
  if (after.length) return { result: 'back', after: after[0] - from };
  return { result: (Number(now) - at) / DAY_MS < FOLLOW_DAYS ? 'waiting' : 'away', after: null };
}

// 教室ぶん。`LOOK_BACK_DAYS` より古い声かけは入れない（去年の話を今月のまとめに混ぜない）。
export function classCallOutcomes(records, { now = Date.now(), sanitizeMonths = (x) => x || {} } = {}) {
  const rows = [];
  for (const record of records || []) {
    if (!record?.name || record.role === 'teacher' || record.moved_to) continue;
    const notes = Array.isArray(record.notes) ? record.notes : sanitizeNotes(record.notes_json);
    const months = record.months && typeof record.months === 'object' ? record.months : sanitizeMonths(record.months_json);
    for (const n of notes) {
      if (n.kind !== 'call') continue;
      if ((Number(now) - Date.parse(n.at)) / DAY_MS > LOOK_BACK_DAYS) continue;
      const o = callOutcome(n, months, { now });
      if (o) rows.push({ name: record.name, at: n.at, why: n.text, ...o });
    }
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  const count = (r) => rows.filter((x) => x.result === r).length;
  return { total: rows.length, back: count('back'), waiting: count('waiting'), away: count('away'), rows, days: FOLLOW_DAYS };
}
