// 保護者レポートの 配信。**ふだんは 何も しなくても 回り、問題が あるときだけ 運営者に 通知が 来る**。
//
//   1 分ごとの tick：教室ごとの 頻度（毎週・隔週・毎月）・曜日・時刻（JST）が 来たら deliverClass()
//   deliverClass：生徒ごとに 集計 → .tex → PDF・画像 → 保存（推測できない URL）→ 保護者ごとに まとめて push
//                 → deliveries・report_runs に 記録 → 失敗が あれば 運営者に 通知
//   毎日：期限切れの レポートを 消す・止めた 紐づけを 30 日で 消す・データが 届いているか・通数（80%）
//   配信の 翌朝：1 行の まとめ（「今週：62通送信・失敗0・新規登録3・停止0」）
//
// 同じ 教室・同じ 回は 1 度だけ（report_runs）。push は X-Line-Retry-Key つきなので、やりなおしても 二重に 届かない。
import { isTeacherName, namePrefix } from './roblox-seats.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { weeklyData, monthlyData, periodStats, periodRanks } from './aggregate.js';
import { weeklyTex, monthlyTex, qrCardsTex, templateVersion, texts, goalText } from './render-tex.js';
import { childMessages, homeworkText, interviewText, sourceText, roadmapText, homeTip, bundle, retryUuid, mask } from './line.js';
// web と Roblox の 内わけは、ほかの 文が ある 吹き出しの 先頭に だけ 足す（吹き出しの 数を ふやさない：1 回に 5 つまで）。
const withSource = (parts, bs) => (parts.length && sourceText(bs) ? [sourceText(bs), ...parts] : parts);
import { menuAction, menuReply } from './menu.js';
import { newToken } from './store.js';
import { DAY, dayKey, parts, weekOf, lastWeek, monthOf, lastMonth, isoWeekNumber, jaRange } from './jst.js';

export const CONSENT_VERSION = 'v1';
export const MAX_PARENTS_PER_TOKEN = 4;
export const REPORT_DAYS = 60;
const STALE_MS = 24 * 3600 * 1000;

const fmt = (s, a = {}) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (a[k] ?? ''));
const hhmm = (s) => { const [h, m] = String(s || '19:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function createParentReports({
  store, roster = null, seats = null, reports, roblox = null, homework = null, roadmap = null, renderer, line, log = console, now = Date.now,
  baseUrl = process.env.REPORT_BASE_URL || '', liffId = process.env.LIFF_ID || '', opsUserId = process.env.OPS_LINE_USER_ID || '',
  filesDir = '',
}) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const urlFor = (token, variant = '') => `${base}/r/${token}${variant}`;
  const fileFor = (token, ext) => path.join(filesDir, `${token}.${ext}`);
  let ticking = false;

  // ---- 生徒 -------------------------------------------------------------------------------
  // 教室の 生徒＝Web の 記録 ＋ Roblox の 紐づけ表（この 教室の 行）＋ Roblox の 記録（classCode 付き）＋ 名簿。
  // Roblox だけで 遊ぶ 子も のる（記録は Roblox の アカウント名で 集まるので、レポートも その 名前で 作る）。
  let rosterCache = { at: 0, rows: [] };
  async function rosterRows() {
    const src = roster || store;
    if (!src || (rosterCache.at && now() - rosterCache.at < 60 * 1000)) return rosterCache.rows;
    try {
      const rows = (typeof src.listAllRoster === 'function' ? await src.listAllRoster() : typeof src.listAll === 'function' ? await src.listAll() : []) || [];
      rosterCache = { at: now(), rows };
    } catch (err) { log.warn?.('[parent-report] roster could not be read:', err.message); rosterCache.at = now(); }
    return rosterCache.rows;
  }
  async function students(classCode) {
    const seen = new Map();   // username（小文字）→ { username, nick }
    const add = (username, nick) => {
      const u = String(username || '').trim();
      if (u && !seen.has(u.toLowerCase())) seen.set(u.toLowerCase(), { username: u, nick: String(nick || u) });
    };
    const userOf = (name) => (roblox?.usernameFor ? roblox.usernameFor(classCode, name) : name);
    let records = [];
    try { records = store.listClass?.(classCode) || []; } catch (err) { log.warn?.('[parent-report] listClass failed:', err.message); }
    for (const r of records) if (r?.name && r.role !== 'teacher') add(userOf(r.name), r.name);
    for (const r of await rosterRows()) if (r?.name && !r.teacher && r.class === classCode) add(userOf(r.name), r.name);
    try {
      for (const l of (await store.listRobloxLinks?.()) || []) if (l?.username && l.class === classCode) add(l.username, l.name || l.username);
      for (const e of (await store.listRobloxEvents?.({ classCode })) || []) if (e?.username) add(e.username, roblox?.childFor?.(e.username)?.name || e.username);
    } catch (err) { log.warn?.('[parent-report] roblox students failed:', err.message); }
    // Roblox の アカウント管理シート（座席）：この 教室の 席の 子 ＋ 同じ 名前の 型で 遊んでいる 子。
    if (seats) {
      try {
        await seatClasses();
        const all = (await seats.seats()).filter((x) => !isTeacherName(x.username));
        for (const x of all) if (x.code === classCode) add(x.username, roblox?.childFor?.(x.username)?.name || x.username);
        const byPrefix = new Map();
        for (const x of all) { const pre = namePrefix(x.username); if (pre) byPrefix.set(pre, (byPrefix.get(pre) || new Set()).add(x.code)); }
        const seated = new Set(all.map((x) => x.username.toLowerCase()));
        const played = new Set(((await store.listRobloxEvents?.()) || []).map((e) => e?.username).filter(Boolean));
        for (const u of played) {
          if (seated.has(u.toLowerCase()) || isTeacherName(u)) continue;
          const codes = byPrefix.get(namePrefix(u));
          if (codes && codes.size === 1 && codes.has(classCode)) add(u, roblox?.childFor?.(u)?.name || u);
        }
      } catch (err) { log.warn?.('[parent-report] seat students failed:', err.message); }
    }
    return [...seen.values()];
  }
  // 教室マスタの 名前（レポートの 教室名の 既定）。「管理者」の 教室は 保護者レポートに 出さない。
  const seatNames = new Map();
  async function seatClasses() {
    if (!seats) return [];
    const list = (await seats.classes()).filter((c) => !/管理者/.test(c.name));
    for (const c of list) seatNames.set(c.code, c.name);
    return list;
  }
  const senderOf = (s, code) => s.sender_name || seatNames.get(code) || code;
  // /admin の 教室一覧に 出す、Roblox 側で 分かる 教室（紐づけ表・記録の classCode）。
  async function robloxClassCodes() {
    const out = new Set();
    try { for (const c of await seatClasses()) out.add(c.code); } catch { /* シートが 読めなくても よい */ }
    try {
      for (const l of (await store.listRobloxLinks?.()) || []) if (l?.class && l.class !== '*') out.add(String(l.class));
      for (const e of (await store.listRobloxEvents?.()) || []) if (e?.class_code) out.add(String(e.class_code));
    } catch { /* なくても よい */ }
    return [...out];
  }
  const eventsFor = async (username) => (await store.listRobloxEvents?.({ username })) || [];

  // ---- データと レポート -------------------------------------------------------------------
  // クラスの 順位（その 期間・その 教室の 子どうし）。1 回の 配信で 子の 数だけ よばれるので 教室・期間ごとに 1 回だけ 数える。
  const rankCache = new Map();
  async function classStats(classCode, period) {
    const key = `${classCode}|${period.start}|${period.end}`;
    const hit = rankCache.get(key);
    if (hit && now() - hit.at < 10 * 60 * 1000) return hit.all;
    const all = [];
    for (const st of await students(classCode)) all.push({ username: st.username, stats: periodStats(await eventsFor(st.username), period) });
    rankCache.set(key, { at: now(), all });
    if (rankCache.size > 200) rankCache.delete(rankCache.keys().next().value);
    return all;
  }

  async function dataFor(classCode, student, kind, period) {
    const s = reports.settings(classCode);
    const teacher = reports.comment(classCode, student.username, period.key);
    const rows = await eventsFor(student.username);
    const opts = { nick: student.nick, sender: senderOf(s, classCode), teacher: teacher ? { text: teacher.text } : null };
    const d = kind === 'monthly' ? monthlyData(rows, { month: period, ...opts }) : weeklyData(rows, { week: period, ...opts });
    d.teacherLabel = s.teacher_label || '先生';
    try { d.ranks = periodRanks(await classStats(classCode, period), student.username); } catch (err) { log.warn?.('[parent-report] ranks failed:', err.message); d.ranks = []; }
    // 宿題（web の しゅくだい島）。宿題の 記録は web の 名前で もって いるので、Roblox の 名前なら web の 名前に もどす。
    try {
      const webName = roblox?.childFor?.(student.username)?.name || student.nick || student.username;
      const hw = homework?.periodSummary?.(classCode, webName, period);
      d.homework = hw && hw.total ? hw : null;
    } catch (err) { log.warn?.('[parent-report] homework failed:', err.message); d.homework = null; }
    // ロードマップ（いまの 段階・次まで・英検の 見込み）。見るだけ（ここでは 段階を 上げない）。
    try {
      const webName = roblox?.childFor?.(student.username)?.name || student.nick || student.username;
      d.roadmap = roadmap ? await roadmap.view(classCode, webName, { username: student.username, rows, advance: false }) : null;
    } catch (err) { log.warn?.('[parent-report] roadmap failed:', err.message); d.roadmap = null; }
    return d;
  }

  async function saveFiles(token, out) {
    await fs.mkdir(filesDir, { recursive: true });
    await fs.writeFile(fileFor(token, 'pdf'), out.pdf);
    if (out.png) await fs.writeFile(fileFor(token, 'png'), out.png);
    if (out.thumb) await fs.writeFile(fileFor(token, 'thumb.png'), out.thumb);
  }

  // その 回の レポートを 作る（もう あれば それを 使う）。
  async function buildReport(classCode, student, kind, period, { force = false } = {}) {
    if (!force) {
      const have = reports.findReport({ username: student.username, kind, periodKey: period.key });
      if (have && have.classroom_id === classCode) return { report: have, data: JSON.parse(have.data_json || '{}') };
    }
    const data = await dataFor(classCode, student, kind, period);
    const source = kind === 'monthly' ? monthlyTex(data) : weeklyTex(data);
    const out = await renderer.render(source, { kind, name: `${kind}-${period.key}` });
    const token = newToken();
    await saveFiles(token, out);
    const report = reports.addReport({
      student_username: student.username, classroom_id: classCode, kind, period_key: period.key, data_json: JSON.stringify(data),
      access_token: token, pdf_url: urlFor(token), png_url: out.png ? urlFor(token, '.png') : '', thumb_url: out.thumb ? urlFor(token, '/thumb.png') : '',
      template_version: templateVersion(), expires_at: new Date(now() + REPORT_DAYS * DAY).toISOString(), revoked_at: '',
    });
    return { report, data };
  }

  // プレビュー（/class・/admin）：保存しない。「見本」の 印つき。
  async function preview(classCode, username, kind = 'weekly') {
    const student = (await students(classCode)).find((s) => s.username === username) || { username, nick: username };
    const period = kind === 'monthly' ? lastMonth(now()) : upcomingWeek(classCode);
    const data = await dataFor(classCode, student, kind, period);
    const source = kind === 'monthly' ? monthlyTex(data, { preview: true }) : weeklyTex(data, { preview: true });
    return renderer.render(source, { kind, name: `preview-${kind}` });
  }
  // 次の 配信で 載る 週（いま 進んでいる 週は まだ 終わっていないので、ふつうは 先週）。
  function upcomingWeek() { return lastWeek(now()); }

  async function qrCards(classCode) {
    const s = reports.settings(classCode);
    const cards = (await students(classCode)).map((st) => {
      const t = reports.tokenFor(classCode, st.username, st.nick, { now: now() });
      // QR は 1 つ：お子さまの ページ（LINE なしで 見られる）。LINE で 受け取る ボタンは その ページに ある。
      return { nick: st.nick, url: urlFor(t.token) };
    });
    const out = await renderer.render(qrCardsTex({ classroom: senderOf(s, classCode), cards }), { kind: 'cards', name: `cards-${classCode}` });
    return out.pdf;
  }

  // ---- 配信 -------------------------------------------------------------------------------
  // 教室 1 つの 1 回ぶん。opts.testTo＝運営者の LINE に だけ 送る（テスト送信）。opts.only＝この 生徒だけ。
  // おうちで できる こと は 文の 吹き出しの さいごに 足す（吹き出しを ふやすと きょうだいの まとめが 5 を こえて push が ふえる）。
  const withTip = (body, tip) => (body && tip ? `${body}\n\n${tip}` : body);
  const MONTH_GAP = 27 * DAY;
  function wantsNow(link, kind) {
    const pref = link.pref || 'class';
    if (pref === 'stop') return false;
    if (pref === 'monthly' && kind === 'weekly') return !link.last_sent_at || now() - Date.parse(link.last_sent_at) >= MONTH_GAP;
    return true;
  }

  async function deliverClass(classCode, { kind = 'weekly', period = null, testTo = '', only = '', monthlyFor = null, force = false } = {}) {
    const s = reports.settings(classCode);
    const T = texts();
    const periodNow = period || (kind === 'monthly' ? lastMonth(now()) : lastWeek(now()));
    const runKey = `${classCode}|${kind}|${periodNow.key}${testTo ? '|test' : ''}`;
    if (!testTo && !force && reports.runs({ classroom_id: classCode, run_key: runKey }).some((r) => r.finished_at)) return { skipped: 'already ran' };
    const run = reports.addRun({ classroom_id: classCode, run_key: runKey, kind, period_key: periodNow.key, test: !!testTo });
    const counts = { generated: 0, sent: 0, failed: 0, skipped: 0, blocked: 0, messages: 0 };
    const paused = new Set(s.paused_students || []);
    const groups = new Map();     // line_user_id -> [{ messages, reportIds }]
    const errors = [];

    for (const student of await students(classCode)) {
      if (only && student.username !== only) continue;
      if (!testTo && paused.has(student.username)) continue;
      // 保護者が LINE の メニューで えらんだ とどく 回数（menu.js）：とめる＝送らない、月に 1 回＝前に とどいてから 27 日 たつまで 送らない。
      const links = testTo ? [{ line_user_id: testTo }] : reports.links({ classroomId: classCode, username: student.username, status: 'active' }).filter((l) => wantsNow(l, kind));
      if (!links.length) continue;
      try {
        const { report, data } = await buildReport(classCode, student, kind, periodNow, { force: !!testTo });
        counts.generated += 1;
        let messages;
        // テスト送信は 記録が 0 の 週でも 画像を 送る（見た目を たしかめる ため）。
        if (data.zero && kind === 'weekly' && !testTo) {
          if (s.skip_zero_week) {
            for (const l of links) reports.addDelivery({ report_id: report.id, run_id: run.id, line_user_id: l.line_user_id, status: 'skipped', error: 'zero week' });
            counts.skipped += links.length;
            continue;
          }
          messages = [{ type: 'text', text: fmt(T.weekly.zeroText, { nick: student.nick, range: data.range }).slice(0, 500) }];
        } else {
          let monthlyPdf = '';
          if (monthlyFor) {
            try { monthlyPdf = (await buildReport(classCode, student, 'monthly', monthlyFor)).report.pdf_url; counts.generated += 1; } catch (err) { errors.push(`${student.nick}（月）: ${err.message}`); }
          }
          const alt = kind === 'monthly'
            ? `${student.nick}さん：${data.month}月は${data.dayCount}日英語をしました`
            : fmt(T.weekly.altText, { nick: student.nick, days: data.dayCount, answers: data.answers });
          const best = (data.ranks || [])[0];
          const altRank = best ? `（クラスで ${best.ja} ${best.rank}位）` : '';
          const altHw = data.homework ? `・宿題 ${data.homework.done}/${data.homework.total} おわり` : '';
          messages = childMessages({ nick: student.nick, range: data.range, sender: senderOf(s, classCode), png: report.png_url, thumb: report.thumb_url, pdf: report.pdf_url, monthlyPdf, altText: alt + altRank + altHw, homework: withTip(withSource([roadmapText(data.roadmap), interviewText(data.interview), homeworkText(data.homework, { nick: student.nick, range: data.range })].filter(Boolean), data.bySource).join('\n\n'), kind === 'weekly' ? homeTip(data) : '') });
        }
        for (const l of links) {
          if (!groups.has(l.line_user_id)) groups.set(l.line_user_id, []);
          groups.get(l.line_user_id).push({ messages, reportId: report.id });
        }
      } catch (err) {
        counts.failed += links.length;
        errors.push(`${student.nick}: ${err.message}`);
        for (const l of links) reports.addDelivery({ report_id: '', run_id: run.id, line_user_id: l.line_user_id, status: 'failed', error: `render: ${String(err.message).slice(0, 200)}`, retry_key: '' });
      }
    }

    // 保護者ごとに まとめて 送る（きょうだいは 1 回に 5 吹き出しまで）。
    for (const [to, items] of groups) {
      const pushes = bundle(items.map((it) => it.messages));
      let k = 0; let offset = 0;
      for (const msgs of pushes) {
        const covered = []; let n = 0;
        while (offset < items.length && n + items[offset].messages.length <= msgs.length) { n += items[offset].messages.length; covered.push(items[offset]); offset += 1; }
        // テストは 毎回 ちがう キー（同じ週に 2 回 ためすと、LINE が 409＝受付済み を 返して 何も 届かないため）。
        const retryKey = retryUuid(runKey, to, String(k), ...(testTo ? [String(now())] : []));
        k += 1;
        const res = await line.push(to, msgs, { retryKey });
        const status = res.ok ? 'sent' : res.permanent ? 'blocked' : 'failed';
        for (const it of covered) reports.addDelivery({ report_id: it.reportId, run_id: run.id, line_user_id: to, status, error: res.ok ? '' : String(res.error || '').slice(0, 200), retry_key: retryKey });
        if (res.ok) { counts.sent += covered.length; counts.messages += 1; if (!testTo) reports.noteSent(to, new Date(now()).toISOString()); } else if (res.permanent) {
          counts.blocked += covered.length;
          if (testTo) errors.push(`LINE が 受けつけませんでした：${res.error}`);
          // ブロック・存在しない 相手：次から 送らない。
          if (!testTo && (res.status === 400 || res.status === 403 || res.status === 404)) reports.setLinkStatus({ lineUserId: to }, 'blocked');
        } else { counts.failed += covered.length; errors.push(`送信 ${mask(to)}: ${res.error}`); }
      }
    }
    reports.finishRun(run.id, counts);
    log.info?.(`[parent-report] ${runKey}: ${JSON.stringify(counts)}`);
    if (!testTo && (counts.failed > 0 || errors.length)) await notifyOps(`⚠ 保護者レポート：${senderOf(s, classCode)}（${periodNow.key}）で 失敗 ${counts.failed}件。\n${errors.slice(0, 3).join('\n')}`);
    return { run: run.id, counts, errors };
  }

  // 失敗分だけ もう一度（/admin）。
  async function resend(deliveryId) {
    const d = reports.deliveries({ id: deliveryId })[0];
    if (!d) return { ok: false, error: 'not found' };
    const report = reports.reportById(d.report_id);
    if (!report) return { ok: false, error: 'no report' };
    const s = reports.settings(report.classroom_id);
    const data = JSON.parse(report.data_json || '{}');
    const messages = childMessages({ nick: data.nick, range: data.range, sender: senderOf(s, report.classroom_id), png: report.png_url, thumb: report.thumb_url, pdf: report.pdf_url, altText: `${data.nick}さんの英語きろく` });
    const res = await line.push(d.line_user_id, messages, { retryKey: retryUuid('resend', d.id) });
    reports.updateDelivery(d.id, { status: res.ok ? 'sent' : 'failed', error: res.ok ? '' : String(res.error || ''), resent_at: new Date(now()).toISOString() });
    return { ok: res.ok, error: res.error };
  }

  // ---- いつ 送るか -------------------------------------------------------------------------
  // その 教室が いま 送る 回か。{ kind, period, monthlyFor } か null。
  function dueNow(s, at = now()) {
    if (!s.enabled) return null;
    const p = parts(at);
    if (p.wd !== Number(s.send_weekday) || p.hh * 60 + p.mm < hhmm(s.send_time)) return null;
    const firstOfMonth = p.d <= 7;     // その 月で はじめての その 曜日
    if (s.frequency === 'monthly') return firstOfMonth ? { kind: 'monthly', period: lastMonth(at) } : null;
    if (s.frequency === 'biweekly') {
      const thisWeek = isoWeekNumber(weekOf(at).key);
      if ((thisWeek % 2) !== (Number(s.biweekly_parity) || 0)) return null;
    }
    // 月の はじめの 配信で、先月の まとめ（PDF）を ボタンで 足す。
    const lm = lastMonth(at);
    const monthlyFor = s.monthly_pdf && !reports.runs({ classroom_id: s.classroom_id }).some((r) => r.finished_at && !r.test && r.monthly_key === lm.key) ? lm : null;
    return { kind: 'weekly', period: lastWeek(at), monthlyFor };
  }

  async function tick(at = now()) {
    if (ticking) return;
    ticking = true;
    try {
      if (reports.meta.enabled !== false) {
        for (const s of reports.allSettings()) {
          const due = dueNow(s, at);
          if (!due) continue;
          const runKey = `${s.classroom_id}|${due.kind}|${due.period.key}`;
          if (reports.runs({ classroom_id: s.classroom_id, run_key: runKey }).length) continue;
          const result = await deliverClass(s.classroom_id, due);
          if (due.monthlyFor && result.run) { const r = reports.runs({ id: result.run })[0]; if (r) { r.monthly_key = due.monthlyFor.key; reports.touch(); } }
        }
      }
      await housekeeping(at);
    } catch (err) {
      log.warn?.('[parent-report] tick failed:', err.message);
    } finally { ticking = false; }
  }

  // ---- 毎日の 片づけと 見張り -----------------------------------------------------------------
  const noticeOnce = (key) => { const n = reports.meta.notices || {}; if (n[key]) return false; reports.setMeta({ notices: { ...n, [key]: new Date(now()).toISOString() } }); return true; };

  async function housekeeping(at) {
    const p = parts(at);
    const day = `${p.y}-${p.m}-${p.d}`;
    // 03:00 すぎ：期限切れの レポートの ファイルを 消す・止めた 紐づけを 30 日で 消す。
    if (p.hh >= 3 && noticeOnce(`clean:${day}`)) {
      const gone = reports.dropReports((r) => Date.parse(r.expires_at) <= at || (r.revoked_at && Date.parse(r.revoked_at) + DAY <= at));
      for (const r of gone) await removeFiles(r.access_token);
      reports.purge(at);
    }
    const anyOn = reports.allSettings().some((s) => s.enabled);
    if (!anyOn) return;
    // 09:00 すぎ：Roblox からの 記録が 24 時間 ゼロ・通数が 上限の 80%。
    if (p.hh >= 9 && noticeOnce(`watch:${day}`)) {
      try {
        const recent = (await store.listRobloxEvents?.({ since: at - STALE_MS })) || [];
        const fromRoblox = recent.filter((e) => e.place_id !== 'web');
        if (!fromRoblox.length) await notifyOps('⚠ Roblox からの 学習記録（roblox_events）が 24時間 届いていません。');
      } catch (err) { log.warn?.('[parent-report] stale check failed:', err.message); }
      const q = await line.quota();
      if (q.limit && q.used / q.limit >= 0.8 && noticeOnce(`quota:${p.y}-${p.m}`)) await notifyOps(`⚠ LINE の 今月の 送信数が ${q.used}／${q.limit}通（${Math.round((q.used / q.limit) * 100)}%）です。`);
    }
    // 08:30 すぎ：前の 日に 配信が あって、6 日 以上 まとめを 出していなければ、1 行の まとめ。
    if (p.hh * 60 + p.mm >= 510) {
      const last = Date.parse(reports.meta.summary_at || 0) || 0;
      const ranYesterday = reports.runs().some((r) => !r.test && r.finished_at && at - Date.parse(r.finished_at) < DAY);
      if (ranYesterday && at - last >= 6 * DAY) {
        reports.setMeta({ summary_at: new Date(at).toISOString() });
        await notifyOps(summaryLine(at));
      }
    }
  }
  function summaryLine(at) {
    const since = at - 7 * DAY;
    const recent = reports.deliveries().filter((d) => Date.parse(d.sent_at) >= since);
    const sent = recent.filter((d) => d.status === 'sent').length;
    const failed = recent.filter((d) => d.status === 'failed').length;
    const fresh = reports.links().filter((l) => Date.parse(l.created_at) >= since).length;
    const stopped = reports.links().filter((l) => (l.status === 'stopped' || l.status === 'blocked') && Date.parse(l.updated_at || l.consented_at || 0) >= since).length;
    return `今週：${sent}通送信・失敗${failed}・新規登録${fresh}・停止${stopped}`;
  }

  async function notifyOps(text) {
    if (!opsUserId) { log.warn?.(`[parent-report] (no OPS_LINE_USER_ID) ${text}`); return; }
    const res = await line.push(opsUserId, [{ type: 'text', text: String(text).slice(0, 1000) }]);
    if (!res.ok) log.warn?.(`[parent-report] ops notice failed: ${res.error}`);
  }
  async function removeFiles(token) {
    for (const ext of ['pdf', 'png', 'thumb.png']) await fs.rm(fileFor(token, ext), { force: true }).catch(() => {});
  }

  // ---- 消す（個人情報の 削除）-------------------------------------------------------------
  async function eraseStudent(classCode, username) {
    const r = reports.eraseStudent(classCode, username);
    for (const token of r.tokens) await removeFiles(token);
    await reports.flush?.();
    const { tokens, ...counts } = r;
    return counts;
  }

  // ---- 止める ----------------------------------------------------------------------------
  async function stopClass(classCode) {
    reports.saveSettings(classCode, { enabled: false, stopped_at: new Date(now()).toISOString() });
    const n = reports.setLinkStatus({ classroomId: classCode }, 'stopped', { purgeAfterDays: 30 });
    reports.revokeReports((r) => r.classroom_id === classCode);
    for (const r of reports.reports({ classroom_id: classCode })) await removeFiles(r.access_token);
    for (const t of reports.data.link_tokens) if (t.classroom_id === classCode && !t.revoked_at) t.revoked_at = new Date(now()).toISOString();
    reports.touch();
    return n;
  }
  function stopStudent(classCode, username, stop = true) {
    const s = reports.settings(classCode);
    const set = new Set(s.paused_students || []);
    if (stop) set.add(username); else set.delete(username);
    reports.saveSettings(classCode, { paused_students: [...set] });
    return [...set];
  }

  // ---- 見る（/r/:token）--------------------------------------------------------------------
  function fileForRequest(token, variant) {
    const r = reports.reportByToken(token);
    if (!r || r.revoked_at || Date.parse(r.expires_at) <= now()) return null;
    const s = reports.settings(r.classroom_id);
    if (s.stopped_at && !s.enabled) return null;
    if (variant === 'png') return r.png_url ? { file: fileFor(token, 'png'), type: 'image/png' } : null;
    if (variant === 'thumb') return r.thumb_url ? { file: fileFor(token, 'thumb.png'), type: 'image/png' } : null;
    return { file: fileFor(token, 'pdf'), type: 'application/pdf' };
  }

  // ---- お子さまごとの 専用URL（LINE なし）-----------------------------------------------------
  // QR カードと 同じ 合言葉で /r/<合言葉> を ひらくと、その 子の 最新の 週の レポート（なければ その場で 作る）と
  // これまでの 週・1か月の まとめが 見られる。QR を 作り直すと 前の URL は 使えなくなる。生徒の 配信を 止めると 見られない。
  const pageUrl = (classCode, st) => urlFor(reports.tokenFor(classCode, st.username, st.nick, { now: now() }).token);
  // ゲームの 右の 列「おうちの ひとの LINE」：その 子の ページ（QR カードと 同じ URL。LINE で 受け取る ボタンは その ページに ある）。
  const childLink = (classCode, username, nick) => (classCode && username ? pageUrl(classCode, { username, nick: nick || username }) : '');
  const isStudentToken = (token) => !!reports.findToken(token, now());
  const viewable = (r) => r && !r.revoked_at && Date.parse(r.expires_at) > now();
  async function studentPage(token) {
    const t = reports.findToken(token, now());
    if (!t) return null;
    const s = reports.settings(t.classroom_id);
    const base0 = { nick: t.nickname, classroom: senderOf(s, t.classroom_id) };
    if ((s.paused_students || []).includes(t.student_username)) return { ...base0, paused: true };
    const student = { username: t.student_username, nick: t.nickname };
    let latest = null; let error = '';
    try { latest = (await buildReport(t.classroom_id, student, 'weekly', lastWeek(now()))).report; } catch (err) { error = err.message; log.warn?.('[parent-report] page build failed:', err.message); }
    const rangeOf = (r) => { try { return JSON.parse(r.data_json || '{}').range || r.period_key; } catch { return r.period_key; } };
    const past = reports.reports({ student_username: t.student_username, classroom_id: t.classroom_id, kind: 'weekly' })
      .filter((r) => viewable(r) && r.access_token !== latest?.access_token)
      .sort((a, b) => b.period_key.localeCompare(a.period_key))
      .filter((r, i, a) => a.findIndex((x) => x.period_key === r.period_key) === i)
      .slice(0, 8)
      .map((r) => ({ range: rangeOf(r), token: r.access_token }));
    const clappedToday = reports.claps({ classroom_id: t.classroom_id, student_username: t.student_username, day: dayKey(now()) }).length > 0;
    let goal = '';
    try { goal = goalText(JSON.parse(latest?.data_json || '{}')); } catch { /* なくても よい */ }
    return { ...base0, clappedToday, goal, lineUrl: liffId && !line.dryRun ? `https://liff.line.me/${liffId}?t=${token}` : '', latest: latest ? { token: latest.access_token, range: rangeOf(latest), png: !!latest.png_url } : null, past, error };
  }
  // 1か月の まとめ（先月）。押されたときに 作る。
  async function studentMonthly(token) {
    const t = reports.findToken(token, now());
    if (!t) return null;
    const s = reports.settings(t.classroom_id);
    if ((s.paused_students || []).includes(t.student_username)) return null;
    return (await buildReport(t.classroom_id, { username: t.student_username, nick: t.nickname }, 'monthly', lastMonth(now()))).report.access_token;
  }

  // ---- 👏 見たよ（保護者 → ゲームの 中の 子ども）-----------------------------------------------
  // 1 日 1 回（子ども 1 人に つき・家族の だれが 押しても）。コインを 少し と「おうちの人から 👏」の お知らせ。
  // Roblox で 遊ぶ 子：コインの 行（wallet）に のせる → Roblox の 同期で 足され、バナーが 出る（Web も 同じ 残高）。
  // Web だけの 子：つぎに Web に 入った とき（いま 入って いれば すぐ）に ClassRoom が コインと お知らせを 出す。
  const CLAP_COINS = 10;
  const clapRooms = new Set();
  async function playsRoblox(username) {
    if (!roblox?.enabled) return false;
    try { return !!(await roblox.balanceOf?.(username)) || ((await store.listRobloxEvents?.({ username })) || []).length > 0; } catch { return false; }
  }
  async function clap(token) {
    const t = reports.findToken(token, now());
    if (!t) return { ok: false, error: 'not found' };
    const s = reports.settings(t.classroom_id);
    if ((s.paused_students || []).includes(t.student_username)) return { ok: false, error: 'paused' };
    const day = dayKey(now());
    if (reports.claps({ classroom_id: t.classroom_id, student_username: t.student_username, day }).length) return { ok: true, already: true };
    let robloxGiven = false;
    if (await playsRoblox(t.student_username)) {
      robloxGiven = roblox.walletAdd(t.student_username, CLAP_COINS, 'clap:parent');
      if (robloxGiven) roblox.pushBalance?.(t.student_username)?.catch?.(() => {});
    }
    const c = reports.addClap({ classroom_id: t.classroom_id, student_username: t.student_username, nick: t.nickname, day, at: new Date(now()).toISOString(), coins: CLAP_COINS, roblox_given: robloxGiven });
    for (const room of clapRooms) if (room.classCode === t.classroom_id) { try { room.deliverClaps?.(); } catch (err) { log.warn?.('[parent-report] clap delivery failed:', err.message); } }
    return { ok: true, id: c.id };
  }
  // ClassRoom から：この 子の まだ 見せていない 👏（Web で コインを 足す ものは coins>0 で 返す）。
  const clapHub = {
    rooms: clapRooms,
    take(classCode, username) {
      const u = String(username || '').toLowerCase();
      return reports.claps({ classroom_id: classCode, web_shown: false }).filter((c) => c.student_username.toLowerCase() === u)
        .map((c) => ({ id: c.id, coins: c.roblox_given ? 0 : c.coins }));
    },
    shown(id) { reports.updateClap(id, { web_shown: true, web_shown_at: new Date(now()).toISOString() }); },
  };
  const clapsThisWeek = (classCode, username) => {
    const wk = weekOf(now());
    return reports.claps({ classroom_id: classCode, student_username: username }).filter((c) => { const at = Date.parse(c.at); return at >= wk.start && at <= wk.end; }).length;
  };

  // ---- 登録（QR → LIFF）--------------------------------------------------------------------
  function linkInfo(token) {
    const t = reports.findToken(token, now());
    if (!t) return null;
    const s = reports.settings(t.classroom_id);
    return { nickname: t.nickname, classroom: senderOf(s, t.classroom_id), consentVersion: CONSENT_VERSION };
  }
  async function register(token, idToken) {
    const t = reports.findToken(token, now());
    if (!t) return { ok: false, error: 'このQRコードは使えません。教室にお問い合わせください。' };
    const who = await line.verifyIdToken(idToken);
    if (!who) return { ok: false, error: 'LINEの確認ができませんでした。もう一度ひらいてください。' };
    const existing = reports.links({ classroomId: t.classroom_id, username: t.student_username }).filter((l) => l.status !== 'stopped');
    const already = existing.some((l) => l.line_user_id === who.userId);
    if (!already && existing.length >= MAX_PARENTS_PER_TOKEN) return { ok: false, error: '登録できる人数（4人）に達しています。教室にお問い合わせください。' };
    reports.addLink({ classroomId: t.classroom_id, username: t.student_username, nickname: t.nickname, lineUserId: who.userId, consentVersion: CONSENT_VERSION });
    if (!already) { t.used_count = (t.used_count || 0) + 1; reports.touch(); }
    log.info?.(`[parent-report] linked ${mask(who.userId)} to a student of ${t.classroom_id}`);
    return { ok: true, nickname: t.nickname };
  }

  // Webhook（follow / unfollow）。
  function onWebhookEvents(events) {
    for (const e of events || []) {
      const uid = e?.source?.userId;
      if (!uid) continue;
      // 運営者が 自分の ユーザー ID を 知る ため（LINE Developers に メールで ログインしていると「Your user ID」が 出ない）：
      // 友だち追加・メッセージを した 人の ID を 7 日・5 人まで 覚え、/admin/reports に だけ 出す。
      if (e.type === 'follow' || e.type === 'message') {
        const at = now();
        const recent = (reports.meta.recent_contacts || []).filter((c) => c.id !== uid && at - Date.parse(c.at) < 7 * DAY);
        recent.unshift({ id: uid, type: e.type, at: new Date(at).toISOString() });
        reports.setMeta({ recent_contacts: recent.slice(0, 5) });
      }
      // 下の メニュー（リッチメニューの postback）と、同じ ことばの メッセージ。返事は Reply API＝無料。
      const action = menuAction(e);
      if (action && e.replyToken) answerMenu(uid, action, e.replyToken).catch((err) => log.warn?.('[line] menu failed:', err.message));
      if (e.type === 'unfollow') reports.setLinkStatus({ lineUserId: uid, status: 'active' }, 'blocked');
      if (e.type === 'follow') reports.setLinkStatus({ lineUserId: uid, status: 'blocked' }, 'active');
    }
  }

  // メニューの 返事に いる 中身を あつめて、menu.js が 文に する。
  async function answerMenu(uid, action, replyToken) {
    const links = reports.links({ lineUserId: uid, status: 'active' });
    const kids = [];
    for (const l of links) {
      if (kids.some((k) => k.classCode === l.classroom_id && k.username === l.student_username)) continue;
      const s = reports.settings(l.classroom_id);
      const paused = (s.paused_students || []).includes(l.student_username);
      const st = { username: l.student_username, nick: l.nickname || l.student_username };
      const webName = roblox?.childFor?.(st.username)?.name || st.nick || st.username;
      const kid = { classCode: l.classroom_id, username: st.username, nick: st.nick, paused, frequency: s.frequency || 'weekly' };
      if (!paused) {
        if (action.kind === 'report') {
          const latest = reports.reports({ student_username: st.username, classroom_id: l.classroom_id, kind: 'weekly' })
            .filter((r) => !r.revoked_at && Date.parse(r.expires_at) > now()).sort((a, b) => b.period_key.localeCompare(a.period_key))[0];
          let range = '';
          try { range = JSON.parse(latest?.data_json || '{}').range || ''; } catch { /* なくても よい */ }
          kid.report = latest ? { png: latest.png_url, thumb: latest.thumb_url, pdf: latest.pdf_url, range } : null;
          try { kid.page = base ? pageUrl(l.classroom_id, st) : ''; } catch { kid.page = ''; }
        }
        if (action.kind === 'homework' || action.kind === 'home') { try { kid.homework = homework?.listFor?.(l.classroom_id, webName) || []; } catch { kid.homework = []; } }
        if (action.kind === 'roadmap') { try { kid.page = base ? pageUrl(l.classroom_id, st) : ''; } catch { kid.page = ''; } }
        if (action.kind === 'roadmap' || action.kind === 'home') {
          try { kid.roadmap = roadmap ? await roadmap.view(l.classroom_id, webName, { username: st.username, rows: await eventsFor(st.username), advance: false }) : null; } catch { kid.roadmap = null; }
        }
      }
      kids.push(kid);
    }
    if (action.kind === 'pref' && links.length) {
      for (const l of links) { l.pref = action.pref; l.updated_at = new Date(now()).toISOString(); }
      reports.touch();
    }
    const pref = links[0]?.pref || 'class';
    const messages = menuReply(action, { kids, pref, registered: links.length > 0 });
    const res = await line.reply(replyToken, messages);
    if (!res.ok) log.warn?.(`[line] reply to ${mask(uid)} failed: ${res.error}`);
    return res;
  }

  // ---- 画面用の まとめ ---------------------------------------------------------------------
  async function classStatus(classCode, { withUrl = false } = {}) {
    const list = await students(classCode);
    const s = reports.settings(classCode);
    const paused = new Set(s.paused_students || []);
    const rows = list.map((st) => {
      const links = reports.links({ classroomId: classCode, username: st.username });
      return {
        username: st.username, nick: st.nick, paused: paused.has(st.username),
        parents: links.filter((l) => l.status === 'active').length, blocked: links.filter((l) => l.status === 'blocked').length,
        // 保護者が LINE の メニューで えらんだ とどく 回数（月に 1 回だけ・とめる の 人数）。
        monthly: links.filter((l) => l.status === 'active' && l.pref === 'monthly').length, stoppedByParent: links.filter((l) => l.status === 'active' && l.pref === 'stop').length,
        ...(withUrl ? { url: pageUrl(classCode, st), claps: clapsThisWeek(classCode, st.username) } : {}),
      };
    });
    const registered = rows.filter((r) => r.parents > 0).length;
    const lastRun = reports.runs({ classroom_id: classCode }).filter((r) => !r.test).slice(-1)[0] || null;
    return { settings: s, students: rows, registered, total: rows.length, lastRun: lastRun ? { ...lastRun, counts: JSON.parse(lastRun.counts_json || '{}') } : null };
  }
  // 先生の ひとことの 締め切り：次の 配信の 前日 23:59（JST）。
  function nextSend(classCode, from = now()) {
    const s = reports.settings(classCode);
    if (!s.enabled) return null;
    for (let i = 0; i < 60; i += 1) {
      const day = from + i * DAY;
      const p = parts(day);
      const at = Date.UTC(p.y, p.m - 1, p.d) - 9 * 3600 * 1000 + hhmm(s.send_time) * 60000;
      if (at <= from) continue;
      if (dueNow(s, at + 60000)) {
        const due = dueNow(s, at + 60000);
        return { at, kind: due.kind, periodKey: due.period.key, range: jaRange(due.period), deadline: at - hhmm(s.send_time) * 60000 - 60000 };
      }
    }
    return null;
  }

  return {
    students, buildReport, preview, qrCards, deliverClass, resend, dueNow, tick, housekeeping, summaryLine, notifyOps,
    stopClass, stopStudent, eraseStudent, fileForRequest, linkInfo, register, onWebhookEvents, classStatus, nextSend, robloxClassCodes, isStudentToken, studentPage, studentMonthly, clap, clapHub, childLink, classNameOf: (code) => seatNames.get(code) || '', seatStatus: async () => (seats ? seats.status() : null),
    start(intervalMs = 60000) { const t = setInterval(() => tick(), intervalMs); t.unref?.(); return t; },
  };
}
