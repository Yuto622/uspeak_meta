// 月ごとの学習記録 — 保護者が「今月どれだけやったか」を読むための、ひと月ぶんの小さな束。
//
// **累計だけでは、続けている理由が見えない。** レポートはこれまで「レベル12・正解340問」
// のような累計のスナップショットだけだった。3年つづけた子と、3年前に3か月だけやった子が、
// 同じ数字に見える。保護者が毎月受け取って意味があるのは「9月は8日きて、62問やって、
// 正答率78%」のほうで、それは累計からは引き算できない（去年の分が混ざる）。
//
// **学習ログから数え直さないのはなぜか。** ログは追記専用（ファイルか Google Sheets）で、
// 読み返す口が無い。月末に全行を走査する仕組みを足すこともできるが、それは Sheets の
// 行数に比例して重くなるうえ、Sheets を使わない教室では数えられない。**答えた瞬間に
// その月の箱へ1つ足す**ほうが、安く、どの保存先でも同じに動く。
//
// **日付は日本時間で切る。** サーバーは UTC で動くので、20時のレッスンは UTC では
// 同じ日の11時だが、月末29日の21時（JST）は UTC では29日12時で問題なく、**1日0時〜9時
// （JST）が前の月に落ちる**。8月1日の朝のレッスンが「7月」に数えられると、保護者の
// 手元の数字と教室の出席簿が合わなくなる。

// 何か月ぶん持つか。**13**にしてあるのは「去年の同じ月」と並べられるようにするため
// （4月に「去年の4月」と比べたい）。1か月ぶんは60バイトほどなので、13で1KB弱。
export const KEEP_MONTHS = 13;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// `2026-09` を返す。**日本時間で切る**（上の注を参照）。
export function monthKey(ts = Date.now()) {
  const d = new Date(Number(ts) + JST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// `2026-09-16`。「その月に何日きたか」を数えるために使う。
export function dayKey(ts = Date.now()) {
  const d = new Date(Number(ts) + JST_OFFSET_MS);
  return `${monthKey(ts)}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const int = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

// 1か月ぶんの箱。**数えるものは足し算だけで決まるものに限る**：
// レベルや所持コインのような「いまいくつか」は累計の側（reportFor）が持っている。
const blank = () => ({ answers: 0, correct: 0, xp: 0, coins: 0, seconds: 0, days: [] });

// 保存から読む。**壊れていたら捨てて空から**（古い保存・手で触った保存・別バージョン）。
// 読めなかった月のせいでレポート全体が出ないほうが、保護者にとっては悪い。
export function sanitizeMonths(raw) {
  let src = raw;
  if (typeof src === 'string') { try { src = JSON.parse(src); } catch { return {}; } }
  if (!src || typeof src !== 'object' || Array.isArray(src)) return {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (!KEY.test(key) || !value || typeof value !== 'object') continue;
    const days = Array.isArray(value.days)
      ? [...new Set(value.days.filter((d) => typeof d === 'string' && d.startsWith(key)))].sort().slice(-31)
      : [];
    out[key] = {
      answers: int(value.answers), correct: int(value.correct), xp: int(value.xp),
      coins: int(value.coins), seconds: int(value.seconds), days,
    };
  }
  // 正解が回答数を超える保存は信じない（数え違いか、手で触ったか）。
  for (const m of Object.values(out)) m.correct = Math.min(m.correct, m.answers);
  return trimMonths(out);
}

// 古い月から落とす。**キーが `YYYY-MM` なので文字列の並び順が時間の順**。
export function trimMonths(months, keep = KEEP_MONTHS) {
  const keys = Object.keys(months).sort();
  if (keys.length <= keep) return months;
  for (const key of keys.slice(0, keys.length - keep)) delete months[key];
  return months;
}

// その月の箱に足す。**呼ぶ側は「いま何月か」を知らなくてよい** — 時刻だけ渡す。
// `day` を true にすると「その日きた」を記録する（同じ日に何回呼んでも1日）。
export function bump(months, patch, { now = Date.now(), day = false } = {}) {
  const key = monthKey(now);
  const m = months[key] || (months[key] = blank());
  m.answers += int(patch.answers);
  m.correct += int(patch.correct);
  m.xp += int(patch.xp);
  m.coins += int(patch.coins);
  m.seconds += int(patch.seconds);
  if (day) {
    const today = dayKey(now);
    if (!m.days.includes(today)) m.days.push(today);
  }
  trimMonths(months);
  return m;
}

// レポートに渡す形。**新しい月が先**で、その月の「何日きたか」は日付の数に畳む
// （保護者に日付そのものを並べても読めない）。まだ何もしていない月は返さない。
export function recentMonths(months, count = 6, { now = Date.now() } = {}) {
  const here = monthKey(now);
  return Object.entries(months || {})
    .filter(([key, m]) => KEY.test(key) && (m.answers || m.seconds || m.days.length))
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, count)
    .map(([key, m]) => ({
      key,
      label: `${Number(key.slice(0, 4))}年${Number(key.slice(5))}月`,
      current: key === here,
      answers: m.answers,
      correct: m.correct,
      // 何もしていない月の正答率は0%ではなく「まだ無い」。
      accuracy: m.answers ? Math.round((m.correct / m.answers) * 100) : null,
      xp: m.xp,
      coins: m.coins,
      minutes: Math.round(m.seconds / 60),
      days: m.days.length,
    }));
}
