// つづけてもらうための読み取り — 貯めた月ごとの記録から「声をかけたほうがいい子」
// 「去年の自分」「何か月つづけているか」を出す。
//
// **調べてから決めた。** 根拠は `docs/uspeak-retention.md`。要点だけ書くと：
//
// 1. **子ども英語教室の退会は「見えない」から起きる。** 伸びは階段型で、最初の
//    3〜6か月は「沈黙期」——子どもは英語を口に出さず、テストの点も動かない。
//    ここがいちばん辞めやすい。累計（レベル・総正解数）は沈黙期には動いて見えないが、
//    **来た日・といた問題・時間は動く**。
// 2. **塾向けの Comiru（4,000教室以上）で継続に効いているのは「退塾予備軍の早期発見」。**
//    数字を貯めて見せるだけでは先生の行動は変わらない。**「この子に今週声をかけて」と
//    名指しで出す**ところまでやって初めて変わる。
// 3. **ストリークは効くが効きすぎる。** Duolingo の連続は14日後の継続を +14% にするが、
//    「連続を伸ばすこと」が学ぶことより大事になる（Journal of Consumer Research）。
//    損失回避より「自分はこれを続ける人だ」という自己像のほうが長持ちする。
//    だから**日ではなく月**で数え、**途切れを煽らない**。
//
// **他人と比べない。** ここにあるのは全部「その子の過去との比較」で、
// 教室の中の順位は作らない。順位は、下にいる子の保護者に見せられない。

import { monthKey } from './months.js';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 何もしていない月を数えないための物差し。日数でも回答数でもよい。
const busy = (m) => !!m && (m.days?.length > 0 || m.answers > 0);

// `2026-09` の1年前は `2025-09`。**月をまたぐ計算を Date にやらせない**：
// 文字列のほうが、うるう年も月末も関係なく正しい。
export function keyMinusYears(key, years = 1) {
  const y = Number(String(key).slice(0, 4));
  return `${y - years}${String(key).slice(4)}`;
}

// `2026-09` の1か月前。12月をまたぐときだけ年が動く。
export function keyMinusMonth(key) {
  const y = Number(String(key).slice(0, 4));
  const m = Number(String(key).slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export const labelOf = (key) => `${Number(String(key).slice(0, 4))}年${Number(String(key).slice(5, 7))}月`;

// その月は何日あるか（JST）。ペースの日割りに使う。
export function daysInMonth(key) {
  const y = Number(String(key).slice(0, 4));
  const m = Number(String(key).slice(5, 7));
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).getUTCDate();
}

// 今日は今月の何日めか（JST）。
export function dayOfMonth(now = Date.now()) {
  return new Date(Number(now) + JST_OFFSET_MS).getUTCDate();
}

// 去年の同じ月。**13か月ぶん持っているのは、まさにこれを出すため**
// （4月に「去年の4月」と並べられる長さにしてある）。
// まだ1年たっていない子には `null` を返す——無い数字は出さない。
export function lastYear(months, { now = Date.now() } = {}) {
  const key = keyMinusYears(monthKey(now));
  const m = months?.[key];
  if (!busy(m)) return null;
  return {
    key,
    label: labelOf(key),
    days: m.days.length,
    answers: m.answers,
    correct: m.correct,
    accuracy: m.answers ? Math.round((m.correct / m.answers) * 100) : null,
    minutes: Math.round(m.seconds / 60),
  };
}

// 何か月つづけているか。**答えた月の連続**で数える（在籍ではなく、実際に来た月）。
//
// 今月にまだ何もしていなくても切らない：月の1日に「0か月」と出るのは、
// その子が何かしたかどうかではなく**カレンダーの都合**でしかない。
// 先月から数えはじめて、今月ぶんは有れば足す。
export function monthsInARow(months, { now = Date.now() } = {}) {
  const src = months || {};
  const here = monthKey(now);
  let key = busy(src[here]) ? here : keyMinusMonth(here);
  let n = 0;
  // 13か月ぶんしか持っていないので、それ以上は数えようがない（14で止める）。
  while (n < 14 && busy(src[key])) { n += 1; key = keyMinusMonth(key); }
  return n;
}

// 在籍の長さ（月）。`first_seen` があればそこから、無ければ持っている月の古いほうから。
// **13か月より前は「1年以上」としか言えない**（それ以上は記録を捨てているため）。
export function monthsSinceStart(months, { firstSeen = '', now = Date.now() } = {}) {
  const t = Date.parse(firstSeen || '');
  if (Number.isFinite(t)) return Math.max(0, Math.floor((Number(now) - t) / (30.44 * DAY_MS)));
  const keys = Object.keys(months || {}).filter((k) => busy(months[k])).sort();
  if (!keys.length) return 0;
  const [y, m] = keys[0].split('-').map(Number);
  const [ny, nm] = monthKey(now).split('-').map(Number);
  return Math.max(0, (ny - y) * 12 + (nm - m));
}

// 今月のペースを、**その子の先月**と比べる。
//
// 月の途中で「先月より少ない」と言っても意味がないので、**月の進み具合で日割りする**。
// 9月10日なら先月の3分の1が目安。`ratio` は「目安の何倍か」。
export function paceOf(months, { now = Date.now() } = {}) {
  const src = months || {};
  const here = monthKey(now);
  const prevKey = keyMinusMonth(here);
  const days = src[here]?.days?.length || 0;
  const prev = src[prevKey]?.days?.length || 0;
  const through = Math.min(1, dayOfMonth(now) / daysInMonth(here));
  const expected = prev * through;
  return {
    days,
    prev,
    through,
    expected: Math.round(expected * 10) / 10,
    // 先月が0日なら比べようがない（割り算にしない）。
    ratio: prev > 0 ? days / Math.max(expected, 0.001) : null,
  };
}

// 最後にあそんだ日から何日たったか。記録が無ければ `null`。
export function daysAway(lastSeen, { now = Date.now() } = {}) {
  const t = Date.parse(lastSeen || '');
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Number(now) - t) / DAY_MS));
}

// ---- 気づき ------------------------------------------------------------------------
//
// 先生に出すのはこの3つだけ。**多いほど読まれない**ので、1人につき1行、理由は1つ。
//
//   call  … 今週のうちに声をかけたほうがいい
//   watch … 気にしておく（まだ声をかけるほどではない）
//   cheer … いいことが起きている。**保護者に伝える機会**（これも継続の道具）
//
// しきい値は「教室から見て説明できる数」にしてある。機械が勝手に決めた
// 相関ではないので、先生が「それは違う」と言えるし、言われたら直せる。
export const AWAY_CALL = 21;        // 3週間来ていない：ほぼ辞めている
export const AWAY_WATCH = 14;       // 2週間：まだ間に合う
export const NEW_DAYS = 90;         // 沈黙期（最初の3か月）
export const SLOW = 0.6;            // 目安の6割を切ったら落ちている
export const UP = 1.4;              // 目安の1.4倍なら伸びている
export const PACE_FROM = 0.4;       // 月の4割が過ぎるまでペースの話はしない
export const ENOUGH = 3;            // 先月3日未満の子は、比べる相手がいない

export function noticeFor(record, { now = Date.now(), months = null } = {}) {
  const src = months || {};
  const name = String(record?.name || '');
  const away = daysAway(record?.last_seen, { now });
  const since = monthsSinceStart(src, { firstSeen: record?.first_seen, now });
  const pace = paceOf(src, { now });
  const row = { name, level: '', why: '', away, since, days: pace.days, prev: pace.prev, row: 0 };

  const fresh = Date.parse(record?.first_seen || '');
  const isNew = Number.isFinite(fresh) && (Number(now) - fresh) / DAY_MS <= NEW_DAYS;

  // 1. 来ていない。**いちばん強い信号**なので先に見る。
  if (away !== null && away >= AWAY_CALL) {
    return { ...row, level: 'call', why: `${away}日 来ていません`, row: 3 };
  }
  if (away !== null && away >= AWAY_WATCH) {
    // はじめて3か月以内の子が2週間来ていないのは、**沈黙期に消える形**そのもの。
    return isNew
      ? { ...row, level: 'call', why: `はじめて${Math.max(1, since)}か月・${away}日 来ていません`, row: 3 }
      : { ...row, level: 'watch', why: `${away}日 来ていません`, row: 2 };
  }

  // 2. ペースが落ちている。月の前半では言わない（日割りが荒すぎる）。
  if (pace.through >= PACE_FROM && pace.prev >= ENOUGH && pace.ratio !== null && pace.ratio < SLOW) {
    const level = isNew ? 'call' : 'watch';
    return { ...row, level, why: `先月より ペースが落ちています（今月${pace.days}日・先月${pace.prev}日）`, row: level === 'call' ? 3 : 2 };
  }

  // 3. 伸びている。**これも出す。** 良い知らせを保護者に渡せる日は、
  //    悪い知らせを渡す日より多いほうがいい。
  if (pace.through >= PACE_FROM && pace.prev >= ENOUGH && pace.ratio !== null && pace.ratio >= UP) {
    return { ...row, level: 'cheer', why: `先月より よく来ています（今月${pace.days}日・先月${pace.prev}日）`, row: 1 };
  }

  // 4. はじめての子は、何も起きていなくても名簿に出しておく（沈黙期は見守る期間）。
  if (isNew) {
    return { ...row, level: 'watch', why: `はじめて${Math.max(1, since)}か月め（沈黙期）`, row: 1 };
  }
  return null;
}

// クラスぶん。**強い順に並べて、多すぎたら切る**（30人の教室で30行出しても読まれない）。
export function noticesFor(records, { now = Date.now(), limit = 12, sanitize = null } = {}) {
  const out = [];
  for (const record of records || []) {
    if (!record?.name || record.role === 'teacher' || record.moved_to) continue;
    // いま部屋にいる子は、保存より**部屋の側のほうが新しい**（保存は折々にしか走らない）。
    // 渡されていればそちらを使い、無ければ保存の JSON を読む。
    const months = record.months && typeof record.months === 'object' ? record.months
      : (sanitize ? sanitize(record.months_json) : {});
    const notice = noticeFor(record, { now, months });
    if (notice) out.push(notice);
  }
  // 強いものが上。同じ強さなら、来ていない日数が多い子が上。名前は最後の決め手。
  out.sort((a, b) => (b.row - a.row) || ((b.away ?? -1) - (a.away ?? -1)) || (a.name < b.name ? -1 : 1));
  return out.slice(0, limit);
}
