// Roblox 版の学習記録から、保護者と先生に見せる指標を計算する（docs/ROBLOX_SYNC.md）。
//
// **指標は貯めない。毎回、生の記録（roblox_events）から数える。** 定義は `metric_definitions`
// の行で、行を足せば画面に出る。ふつうの指標は count / sum / ratio / group を JSON の式で
// 書ける。式で書けないもの（連続日数・覚えた単語・あてずっぽう率）は `custom` で、ここに
// 名前つきの関数がある。
//
// **週は日本時間の月曜〜日曜。** サーバーは UTC で動くので、月曜 0:00 JST は日曜 15:00 UTC。
import { dayKey } from './months.js';
import { boxFromEvents, dueCount as reviewDueCount, nextWord as reviewNextWord, graduatedWords } from './review.js';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---- 期間 -------------------------------------------------------------------------------
// 今週（月曜 0:00 JST 〜 次の月曜）、先週、累計。`[since, until)` のミリ秒。
export function periodRange(which, now = Date.now()) {
  if (which === 'all') return { since: 0, until: 0 };
  const jst = new Date(Number(now) + JST_OFFSET_MS);
  const dow = (jst.getUTCDay() + 6) % 7; // 月曜=0
  const mondayJst = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - dow * DAY_MS;
  const monday = mondayJst - JST_OFFSET_MS;
  if (which === 'week') return { since: monday, until: monday + 7 * DAY_MS };
  if (which === 'last') return { since: monday - 7 * DAY_MS, until: monday };
  throw new Error(`unknown period ${which}`);
}
export const PERIODS = ['week', 'last', 'all'];
export const PERIOD_LABEL = { week: '今週', last: '先週', all: '累計' };

const inRange = (e, { since, until }) => (!since || e.ts >= since) && (!until || e.ts < until);

// Roblox のどこで起きた記録か（event の `world`）。Roblox 側が送る名前 → 画面の名前。
// 知らない名前はそのまま出す（新しい場所を足しても壊れない）。管理ページの `labels` で上書きできる。
export const WORLD_LABELS = {
  // Roblox 版（Stats v4.2）が送る world の値。
  hut: '小屋のクイズ', fishing: 'さかなつり', battle: 'バトル', gym: 'ことばのジム', main: 'メインワールド',
  racing: 'レース', rpg: 'RPG', building: 'けんちく', themepark: 'テーマパーク', farm: 'ぼくじょう', island: 'しま',
  quizlab: 'クイズラボ', other: 'そのほか',
  // 古い名前・別名。
  lobby: 'ロビー', fish: 'さかなつり', cabin: '小屋のクイズ', quiz: 'クイズ', school: 'がっこう', shop: 'お店', arena: 'バトル', town: 'まち', park: 'テーマパーク',
};
// quiz の data.level（Stats v4.2）。英検の級（5 / 4 / 3 / pre2 / 2）も受ける。
export const LEVEL_LABELS = {
  supereasy: 'とても かんたん', easy: 'かんたん', medium: 'ふつう', hard: 'むずかしい',
  fishing: 'さかなつり', battle: 'バトル', gym: 'ことばのジム', racing: 'レース',
  5: '5級', 4: '4級', 3: '3級', pre2: '準2級', 2: '2級',
};
export const LEVEL_ORDER = ['supereasy', 'easy', 'medium', 'hard', 'fishing', 'battle', 'gym', 'racing', '5', '4', '3', 'pre2', '2'];
export const levelLabel = (l, labels = null) => labels?.[l] ?? LEVEL_LABELS[String(l || '').toLowerCase()] ?? (l || '（レベルなし）');
export const worldLabel = (w, labels = null) => labels?.[w] ?? WORLD_LABELS[String(w || '').toLowerCase()] ?? (w || '（場所なし）');

// ---- 記録の形 ---------------------------------------------------------------------------
// 保存の行（data_json が文字列）を、計算しやすい形に。`data` は Roblox が付けたまま。
export function parseEvent(row) {
  let data = row.data;
  if (data === undefined) { try { data = JSON.parse(row.data_json || '{}'); } catch { data = {}; } }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  return {
    id: String(row.id || ''), ts: Number(row.ts) || 0, type: String(row.type || ''), world: String(row.world || ''),
    username: String(row.username || ''), class_code: String(row.class_code || ''), data,
  };
}

// ---- 式 ---------------------------------------------------------------------------------
// `where` は `{"retry": false, "level": {"$in": [5, 4]}}` のような JSON。キーは data の中を
// 先に見て、無ければ記録そのもの（world など）を見る。真偽は緩く比べる：`retry: false` は
// retry の無い記録にも当たる（Roblox 側が省いた項目は「ない＝false」）。
function fieldOf(e, key) {
  if (key.startsWith('data.')) return e.data[key.slice(5)];
  if (key in e.data) return e.data[key];
  return e[key];
}
function matchValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    for (const [op, v] of Object.entries(expected)) {
      if (op === '$ne' && matchValue(actual, v)) return false;
      else if (op === '$in' && !(Array.isArray(v) && v.some((x) => matchValue(actual, x)))) return false;
      else if (op === '$exists' && (actual !== undefined) !== !!v) return false;
      else if (op === '$gt' && !(Number(actual) > Number(v))) return false;
      else if (op === '$gte' && !(Number(actual) >= Number(v))) return false;
      else if (op === '$lt' && !(Number(actual) < Number(v))) return false;
      else if (op === '$lte' && !(Number(actual) <= Number(v))) return false;
    }
    return true;
  }
  if (typeof expected === 'boolean') return truthy(actual) === expected;
  if (typeof expected === 'number') return Number(actual) === expected;
  return String(actual ?? '') === String(expected);
}
const truthy = (v) => v === true || v === 1 || v === 'true' || v === '1';
export function matches(e, { event_type = '', where = null } = {}) {
  if (event_type && e.type !== event_type) return false;
  if (where && typeof where === 'object') for (const [k, v] of Object.entries(where)) if (!matchValue(fieldOf(e, k), v)) return false;
  return true;
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

function count(events, sel) { let n = 0; for (const e of events) if (matches(e, sel)) n += 1; return n; }
function sum(events, sel, field) { let n = 0; for (const e of events) if (matches(e, sel)) n += num(fieldOf(e, field)); return n; }

// ---- custom（式では書けないもの）-------------------------------------------------------
const quizzes = (events) => events.filter((e) => e.type === 'quiz' && !truthy(e.data.retry)).sort((a, b) => a.ts - b.ts);
const isCorrect = (e) => truthy(e.data.correct);

export const CUSTOM = {
  // あてずっぽう率：読み上げが終わる前に答えて間違えた割合。
  // (quiz で fast かつ 不正解 ＋ fast-type) ÷ (問題数 ＋ fast-type)
  guess_rate(events) {
    const q = quizzes(events);
    const fastWrong = q.filter((e) => truthy(e.data.fast) && !isCorrect(e)).length;
    const fastType = events.filter((e) => e.type === 'fast-type').length;
    return pct(fastWrong + fastType, q.length + fastType);
  },
  // 来た日（日本時間の日付でかぞえる）。
  active_days(events) { return new Set(events.map((e) => dayKey(e.ts))).size; },
  // 連続日数：きょう（またはきのう）から さかのぼって途切れるまで。
  streak_days(events, { now }) {
    const days = new Set(events.map((e) => dayKey(e.ts)));
    if (!days.size) return 0;
    let day = Math.floor((now + JST_OFFSET_MS) / DAY_MS);
    const key = (d) => dayKey(d * DAY_MS - JST_OFFSET_MS + 1);
    if (!days.has(key(day))) { day -= 1; if (!days.has(key(day))) return 0; }
    let n = 0;
    while (days.has(key(day))) { n += 1; day -= 1; }
    return n;
  },
  // 覚えた単語：その単語の直近3問が連続で正解（retry は数えない）。
  words_mastered(events) {
    const byWord = new Map();
    for (const e of quizzes(events)) {
      const w = String(e.data.word || '');
      if (!w) continue;
      if (!byWord.has(w)) byWord.set(w, []);
      byWord.get(w).push(isCorrect(e));
    }
    const done = new Set();
    for (const [w, list] of byWord) if (list.length >= 3 && list.slice(-3).every(Boolean)) done.add(String(w).toLowerCase());
    // 苦手の 復習（game/review.js）で 卒業した 単語も「覚えた」に 入れる。
    for (const w of graduatedWords(boxFromEvents(events))) done.add(w);
    return done.size;
  },
  // 復習を まっている 単語の 数（いま 時期を 過ぎている もの）。先生の クラス一覧の 列。
  review_due(events, { now = Date.now() } = {}) { return reviewDueCount(boxFromEvents(events), now); },
  // 次に 覚える 単語：苦手の 箱の 中で 復習の 時期が いちばん 近い 1 つ。
  review_next(events) { const w = reviewNextWord(boxFromEvents(events)); return w ? [{ word: w }] : []; },
  // 間違えやすい単語：2回以上出て 正答率 50% 以下。間違えた回数の多い順に5つ。
  weak_words(events, { limit = 5 } = {}) {
    const byWord = new Map();
    for (const e of quizzes(events)) {
      const w = String(e.data.word || '');
      if (!w) continue;
      const s = byWord.get(w) || { word: w, seen: 0, misses: 0, level: e.data.level ?? '' };
      s.seen += 1; if (!isCorrect(e)) s.misses += 1;
      byWord.set(w, s);
    }
    return [...byWord.values()].filter((s) => s.seen >= 2 && (s.seen - s.misses) / s.seen <= 0.5)
      .map((s) => ({ ...s, accuracy: pct(s.seen - s.misses, s.seen) }))
      .sort((a, b) => b.misses - a.misses || a.word.localeCompare(b.word)).slice(0, limit);
  },
  // いちばん長く続いた連続正解。
  best_streak(events) {
    let best = 0; let run = 0;
    for (const e of quizzes(events)) { run = isCorrect(e) ? run + 1 : 0; if (run > best) best = run; }
    return best;
  },
  // いまのコイン：Roblox の残高の最新値 ＋ まだ Roblox に届いていない Web の増減。
  balance(events, { wallet }) { return wallet ? wallet.balance : null; },
};

// ---- 1つの指標を、1つの期間で -----------------------------------------------------------
export function evaluate(def, events, ctx = {}) {
  const expr = def.expr || {};
  const sel = { event_type: def.event_type || expr.event_type || '', where: expr.where || null };
  switch (def.kind) {
    case 'count': return count(events, sel);
    case 'sum': return sum(events, sel, String(expr.field || ''));
    case 'ratio': {
      const n = expr.num ? count(events, { event_type: expr.num.event_type || sel.event_type, where: expr.num.where || null }) : count(events, sel);
      const d = expr.den ? count(events, { event_type: expr.den.event_type || sel.event_type, where: expr.den.where || null }) : count(events, { event_type: sel.event_type });
      return pct(n, d);
    }
    case 'group': {
      // `by` の値ごとに count / sum / ratio。`labels` で見出しを差し替えられる。
      const by = String(expr.by || '');
      const groups = new Map();
      for (const e of events) {
        if (!matches(e, { event_type: sel.event_type, where: null })) continue;
        const k = String(fieldOf(e, by) ?? '');
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
      }
      const order = Array.isArray(expr.order) ? expr.order.map(String) : null;
      const rows = [...groups.entries()].map(([key, list]) => {
        const label = by === 'world' ? worldLabel(key, expr.labels) : by === 'level' ? levelLabel(key, expr.labels) : (expr.labels?.[key] ?? key);
        if (expr.agg === 'sum') return { key, label, value: sum(list, { where: expr.where || null }, String(expr.field || '')), count: list.length };
        if (expr.agg === 'ratio') {
          const n = count(list, { where: expr.num?.where || expr.where || null });
          const d = count(list, { where: expr.den?.where || null });
          return { key, label, value: pct(n, d), count: d, correct: n };
        }
        return { key, label, value: count(list, { where: expr.where || null }), count: list.length };
      });
      const builtInOrder = by === 'level' ? LEVEL_ORDER : null;
      rows.sort((a, b) => {
        if (order) return (order.indexOf(a.key) + 1 || 999) - (order.indexOf(b.key) + 1 || 999);
        if (builtInOrder) { const ia = builtInOrder.indexOf(a.key.toLowerCase()) + 1 || 999; const ib = builtInOrder.indexOf(b.key.toLowerCase()) + 1 || 999; if (ia !== ib) return ia - ib; }
        return b.count - a.count || a.key.localeCompare(b.key, 'ja');
      });
      return rows;
    }
    case 'custom': {
      const fn = CUSTOM[String(expr.fn || def.key)];
      return fn ? fn(events, { ...ctx, ...expr }) : null;
    }
    default: return null;
  }
}

// ---- 定義の行 ---------------------------------------------------------------------------
// 保存の行（expr_json が文字列、enabled が '1'）→ 計算に使う形。
export function parseMetric(row) {
  let expr = row.expr;
  if (expr === undefined) { try { expr = JSON.parse(row.expr_json || '{}'); } catch { expr = {}; } }
  if (!expr || typeof expr !== 'object') expr = {};
  const enabled = row.enabled === undefined || row.enabled === '' ? true : truthy(row.enabled) || row.enabled === 'TRUE';
  return {
    key: String(row.key || '').trim(), label_ja: String(row.label_ja || row.key || ''), label_en: String(row.label_en || row.key || ''),
    kind: String(row.kind || 'count'), event_type: String(row.event_type || ''), expr, enabled,
    order: num(row.order), unit: String(row.unit || expr.unit || (row.kind === 'ratio' ? 'percent' : 'count')),
  };
}
export function metricToRow(m) {
  return {
    key: m.key, label_ja: m.label_ja, label_en: m.label_en, kind: m.kind, event_type: m.event_type,
    expr_json: typeof m.expr === 'string' ? m.expr : m.expr !== undefined ? JSON.stringify(m.expr || {}) : String(m.expr_json ?? '{}'),
    enabled: m.enabled === false || m.enabled === '0' || m.enabled === 0 ? '0' : '1', order: String(m.order ?? 0), unit: m.unit || '',
  };
}
// 定義の行として通るか。管理ページの保存で使う。
export function validateMetric(row) {
  const m = parseMetric(row);
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(m.key)) return 'key は 英小文字・数字・_（40 文字まで）';
  if (!['count', 'sum', 'ratio', 'group', 'custom'].includes(m.kind)) return 'kind は count / sum / ratio / group / custom';
  if (typeof row.expr_json === 'string' && row.expr_json.trim()) { try { JSON.parse(row.expr_json); } catch { return 'expr は JSON'; } }
  if (m.kind === 'custom' && !CUSTOM[String(m.expr.fn || m.key)]) return `custom の関数がありません: ${m.expr.fn || m.key}`;
  if (m.kind === 'sum' && !m.expr.field) return 'sum には field が要ります';
  if (m.kind === 'group' && !m.expr.by) return 'group には by が要ります';
  if (!['count', 'percent', 'seconds', 'days', 'coins', 'words', 'list', 'table'].includes(m.unit)) return 'unit は count / percent / seconds / days / coins / words / list / table';
  return '';
}

// 最初から入っている指標。管理ページで変えられる（消すこともできる）。
export const SEED_METRICS = [
  { key: 'questions', label_ja: '問題数', label_en: 'Questions', kind: 'count', event_type: 'quiz', expr: { where: { retry: false } }, order: 10, unit: 'count' },
  { key: 'accuracy', label_ja: '正答率', label_en: 'Accuracy', kind: 'ratio', event_type: 'quiz', expr: { num: { where: { retry: false, correct: true } }, den: { where: { retry: false } } }, order: 20, unit: 'percent' },
  { key: 'guess_rate', label_ja: 'あてずっぽう率', label_en: 'Guess rate', kind: 'custom', event_type: '', expr: { fn: 'guess_rate' }, order: 30, unit: 'percent' },
  { key: 'study_seconds', label_ja: '学習時間', label_en: 'Study time', kind: 'sum', event_type: 'session', expr: { field: 'seconds' }, order: 40, unit: 'seconds' },
  { key: 'active_days', label_ja: '来た日', label_en: 'Active days', kind: 'custom', event_type: '', expr: { fn: 'active_days' }, order: 50, unit: 'days' },
  { key: 'streak_days', label_ja: '連続日数', label_en: 'Streak', kind: 'custom', event_type: '', expr: { fn: 'streak_days', periods: ['all'] }, order: 60, unit: 'days' },
  { key: 'words_mastered', label_ja: '覚えた単語', label_en: 'Words mastered', kind: 'custom', event_type: '', expr: { fn: 'words_mastered', periods: ['all'] }, order: 70, unit: 'words' },
  { key: 'best_streak', label_ja: '最長の連続正解', label_en: 'Best streak', kind: 'custom', event_type: '', expr: { fn: 'best_streak' }, order: 80, unit: 'count' },
  { key: 'coins_earned', label_ja: 'かせいだコイン', label_en: 'Coins earned', kind: 'sum', event_type: 'session', expr: { field: 'coinsEarned' }, order: 90, unit: 'coins' },
  { key: 'balance', label_ja: 'いまのコイン', label_en: 'Balance', kind: 'custom', event_type: '', expr: { fn: 'balance', periods: ['all'] }, order: 95, unit: 'coins' },
  { key: 'review_next', label_ja: '次に覚える単語', label_en: 'Next word to learn', kind: 'custom', event_type: '', expr: { fn: 'review_next', periods: ['all'] }, order: 98, unit: 'list' },
  { key: 'review_due', label_ja: '復習待ちの単語数', label_en: 'Words waiting for review', kind: 'custom', event_type: '', expr: { fn: 'review_due', periods: ['all'] }, order: 99, unit: 'words' },
  { key: 'weak_words', label_ja: '間違えやすい単語', label_en: 'Words to review', kind: 'custom', event_type: '', expr: { fn: 'weak_words', limit: 5, periods: ['all'] }, order: 100, unit: 'list' },
  { key: 'by_level', label_ja: 'レベルごとの正答率', label_en: 'Accuracy by level', kind: 'group', event_type: 'quiz', expr: { by: 'level', agg: 'ratio', num: { where: { retry: false, correct: true } }, den: { where: { retry: false } } }, order: 110, unit: 'table' },
  { key: 'by_activity', label_ja: '場所ごとの問題数と正答率', label_en: 'Questions by place', kind: 'group', event_type: 'quiz', expr: { by: 'world', agg: 'ratio', num: { where: { retry: false, correct: true } }, den: { where: { retry: false } } }, order: 115, unit: 'table' },
  { key: 'by_world', label_ja: 'ワールド別の時間', label_en: 'Time by world', kind: 'group', event_type: 'session', expr: { by: 'world', agg: 'sum', field: 'seconds' }, order: 120, unit: 'table' },
].map(metricToRow);
// 前の版の seed の行。保存されている行がこれと同じなら（管理ページで触っていないなら）、新しい seed に差し替える。
export const SEED_PREVIOUS = [
  metricToRow({ key: 'by_level', label_ja: '級ごとの正答率', label_en: 'Accuracy by level', kind: 'group', event_type: 'quiz', expr: { by: 'level', agg: 'ratio', num: { where: { retry: false, correct: true } }, den: { where: { retry: false } }, order: ['5', '4', '3', 'pre2', '2'], labels: { 5: '5級', 4: '4級', 3: '3級', pre2: '準2級', 2: '2級' } }, order: 110, unit: 'table' }),
];

// ---- まとめて --------------------------------------------------------------------------
// 1人ぶん：有効な指標を、今週・先週・累計で。`periods` を持つ指標はその期間だけ。
// 返り値 { metrics: [{...def, values: {week, last, all}}], counts: {week, last, all} }
export function summarize(defs, rows, { now = Date.now(), wallet = null } = {}) {
  const events = rows.map(parseEvent).filter((e) => e.ts > 0).sort((a, b) => a.ts - b.ts);
  const byPeriod = Object.fromEntries(PERIODS.map((p) => [p, events.filter((e) => inRange(e, periodRange(p, now)))]));
  const metrics = defs.map(parseMetric).filter((m) => m.enabled && m.key).sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  const out = metrics.map((m) => {
    const periods = Array.isArray(m.expr.periods) ? m.expr.periods : PERIODS;
    const values = {};
    for (const p of PERIODS) values[p] = periods.includes(p) ? evaluate(m, byPeriod[p], { now, wallet }) : undefined;
    return { ...m, periods, values };
  });
  const last = events.at(-1);
  return {
    metrics: out,
    // 最近の記録（新しい順）。どこで（world）・何を（type・word）・どうだったか。
    recent: events.slice(-30).reverse().map((e) => ({
      ts: e.ts, type: e.type, world: e.world, place: worldLabel(e.world),
      word: e.data.word ?? '', level: e.data.level ?? '', correct: e.type === 'quiz' ? truthy(e.data.correct) : null,
      retry: truthy(e.data.retry), fast: truthy(e.data.fast), seconds: e.type === 'session' ? num(e.data.seconds) : null,
    })),
    counts: Object.fromEntries(PERIODS.map((p) => [p, byPeriod[p].length])),
    lastSeen: last ? last.ts : 0,
    firstSeen: events[0] ? events[0].ts : 0,
  };
}

// 画面に出す形：秒は「分」、% は小数1桁。
export function formatValue(value, unit) {
  if (value === null || value === undefined) return '—';
  if (unit === 'percent') return `${value}%`;
  if (unit === 'seconds') { const min = Math.round(num(value) / 60); return min >= 60 ? `${Math.floor(min / 60)}時間${min % 60}分` : `${min}分`; }
  if (unit === 'days') return `${value}日`;
  if (unit === 'coins') return `${num(value).toLocaleString('ja-JP')} コイン`;
  if (unit === 'words') return `${value} 語`;
  if (Array.isArray(value)) return `${value.length} 件`;
  return `${num(value).toLocaleString('ja-JP')}`;
}
