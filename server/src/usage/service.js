// 使用履歴の 画面に わたす 中身を 組む（/admin/usage と /teacher/usage が 同じ ものを 使う）。
// 読むのは：使用履歴（usage/store.js）・記録（players：名前・さいごに 来た 日・連続ログイン・months_json・week_hist_json）・
// 宿題・よみもの島・ロードマップの 段階の 記録・Roblox/Web の クイズの 記録（roblox_events）。書かない。
import { overview, studentRow, studentDetail, toCsv, isoJst, RANGES } from './usage.js';
import { usageKey } from './store.js';
import { histOf } from '../game/rankings.js';
import { weekIndex } from '../game/daily.js';

export const CLASS_RE = /^[a-z0-9_-]{1,24}$/;
// 画面からの 入力を たしかめる。だめなら { error }。
export function parseQuery(q = {}, { needName = false } = {}) {
  const days = q.days === undefined || q.days === '' ? 30 : Number(q.days);
  if (!RANGES.includes(days)) return { error: 'days' };
  const cls = String(q.class ?? '').normalize('NFKC').toLowerCase().trim();
  if (cls && !CLASS_RE.test(cls)) return { error: 'class' };
  const clean = (v) => String(v ?? '').normalize('NFKC').trim();
  const name = clean(q.name);
  if (name.length > 40 || /[\p{Cc}\p{Cf}|]/u.test(name)) return { error: 'name' };
  if (needName && (!name || !cls)) return { error: 'name' };
  const search = clean(q.q);
  if (search.length > 40 || /[\p{Cc}\p{Cf}]/u.test(search)) return { error: 'q' };
  return { days, cls, name, q: search.toLowerCase() };
}

export function createUsageService({ usage, store, homework = null, reading = null, roadmapStore = null, roblox = null, now = Date.now, log = console }) {
  const records = (cls = '') => {
    const codes = cls ? [cls] : (store.listClassCodes?.() || []);
    const out = [];
    for (const c of codes) { try { for (const r of store.listClass?.(c) || []) if (r?.name && r.role !== 'teacher') out.push(r); } catch (err) { log.warn?.('[usage] listClass failed:', err.message); } }
    return out;
  };
  const inClass = (st, cls) => !cls || String(st.c).toLowerCase() === cls;
  const classes = () => [...new Set([...(store.listClassCodes?.() || []), ...usage.list().map((s) => String(s.c).toLowerCase())].filter(Boolean))].sort();

  function rows({ days, cls = '', q = '', allowed = null }) {
    const ok = (c) => (!allowed || allowed.includes(String(c).toLowerCase())) && (!cls || String(c).toLowerCase() === cls);
    const recs = new Map(); for (const r of records(cls)) if (ok(r.class)) recs.set(usageKey(r.class, r.name), r);
    const seen = new Set(); const out = [];
    for (const st of usage.list()) {
      if (!ok(st.c)) continue;
      seen.add(st.key); out.push(studentRow(st, recs.get(st.key), { days, now: now() }));
    }
    for (const [k, r] of recs) if (!seen.has(k)) out.push(studentRow(null, r, { days, now: now() }));
    return out.filter((r) => !q || String(r.name).toLowerCase().includes(q)).sort((a, b) => b.lastSeen - a.lastSeen || String(a.name).localeCompare(b.name, 'ja'));
  }

  return {
    classes,
    overview({ days, cls = '', allowed = null }) {
      const list = usage.list().filter((st) => inClass(st, cls) && (!allowed || allowed.includes(String(st.c).toLowerCase())));
      return { ...overview(list, { days, now: now() }), students: list.length, classes: allowed || classes() };
    },
    rows,
    rowsCsv(opts) {
      const header = ['クラス', '名前', '最後に来た日時', '今週の分', '今月の分', '期間の分（接続）', '期間の分（学習中）', '利用日数', '回答', '正答率(%)', '連続ログイン', 'レベル', '月ごとの記録から(≈)'];
      return toCsv(header, rows(opts).map((r) => [r.class, r.name, isoJst(r.lastSeen), r.weekMin, r.monthMin, r.onMin, r.actMin, r.activeDays, r.answers, r.accuracy ?? '', r.streak, r.level, r.approx ? '≈' : '']));
    },
    async student({ cls, name, days }) {
      let record = null;
      try { record = await store.loadPlayer(cls, name); } catch (err) { log.warn?.('[usage] loadPlayer failed:', err.message); }
      const st = usage.peek(cls, name);
      if (!st && !record) return null;
      const detail = studentDetail(st, record, { days, now: now() });
      const week = weekIndex(now());
      const hist = histOf(record);
      const weeks = Array.from({ length: 12 }, (_, i) => ({ ago: 11 - i, xp: hist[week - (11 - i)] || 0 }));
      let quiz = [];
      try {
        const username = roblox?.usernameFor ? roblox.usernameFor(cls, name) : name;
        const since = Date.parse(`${detail.from}T00:00:00+09:00`);
        const evs = (await store.listRobloxEvents?.({ username, since })) || [];
        const by = new Map();
        for (const e of evs) {
          if (e.type !== 'quiz') continue;
          let d = {}; try { d = typeof e.data_json === 'string' ? JSON.parse(e.data_json || '{}') : (e.data || {}); } catch { d = {}; }
          const src = String(e.source || d.source || (e.place_id ? 'roblox' : 'web')) === 'web' ? 'web' : 'roblox';
          const k = `${src}:${String(e.world || 'other').slice(0, 24)}`;
          const c = by.get(k) || { source: src, world: String(e.world || 'other').slice(0, 24), n: 0, right: 0 };
          c.n += 1; if (d.correct === true) c.right += 1; by.set(k, c);
        }
        quiz = [...by.values()].sort((a, b) => b.n - a.n);
      } catch (err) { log.warn?.('[usage] quiz events failed:', err.message); }
      let hw = [];
      try { hw = (homework?.listFor?.(cls, name) || []).map((h) => ({ title: String(h.title || h.bookTitleJa || h.bookTitle || '').slice(0, 60), due: h.due || '', done: !!h.done, doneAt: h.doneAt || 0, answered: h.answered || 0, total: h.total || 0, score: h.score || 0, overdue: !!h.overdue })); } catch (err) { log.warn?.('[usage] homework failed:', err.message); }
      let rd = null;
      try { const s = reading?.summaryOf?.(cls, name); if (s) rd = { books: s.books, words: s.words, started: s.started, stars: s.stars, quizAvg: s.quizAvg, aloudBooks: s.aloudBooks, last: s.last ? { title: s.last.title, at: s.last.at, done: s.last.done } : null }; } catch (err) { log.warn?.('[usage] reading failed:', err.message); }
      let rm = null;
      try { const s = roadmapStore?.stateOf?.(cls, name); if (s) rm = { stage: s.stage, since: s.since || 0, history: (s.history || []).map((h) => ({ from: h.from, to: h.to, at: h.at, by: h.by || '' })) }; } catch (err) { log.warn?.('[usage] roadmap failed:', err.message); }
      return {
        ok: true, class: st?.c || record?.class || cls, name: st?.n || record?.name || name,
        profile: record ? {
          level: Number(record.level) || 0, totalXp: Number(record.total_xp) || 0, coins: Number(record.coins) || 0,
          studyMin: Math.round((Number(record.study_ms) || 0) / 60000), studyDays: Number(record.study_days) || 0, streak: Number(record.login_streak) || 0,
          correct: Number(record.correct) || 0, attempts: Number(record.attempts) || 0,
          firstSeen: Date.parse(record.first_seen || '') || 0, lastSeen: Date.parse(record.last_seen || '') || 0,
        } : null,
        ...detail, weeks, quiz, homework: hw, reading: rd, roadmap: rm,
      };
    },
    dailyCsv(detail) {
      const header = ['日付', '接続(分)', '学習中(分)', '入った回数', '正解', '不正解', 'XP', 'もらったコイン', 'AI', 'チャット', '買いもの'];
      return toCsv(header, detail.daily.map((d) => [d.day, d.onMin, d.actMin, d.logins, d.r, d.w, d.xp, d.coin, d.ai, d.ch, d.buy]));
    },
  };
}
