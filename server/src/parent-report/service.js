// 保護者レポートの 配信。**ふだんは 何も しなくても 回り、問題が あるときだけ 運営者に 通知が 来る**。
//
//   1 分ごとの tick：教室ごとの 頻度（毎週・隔週・毎月）・曜日・時刻（JST）が 来たら deliverClass()
//   deliverClass：生徒ごとに 集計 → .tex → PDF・画像 → 保存（推測できない URL）→ 保護者ごとに まとめて push
//                 → deliveries・report_runs に 記録 → 失敗が あれば 運営者に 通知
//   毎日：期限切れの レポートを 消す・止めた 紐づけを 30 日で 消す・データが 届いているか・通数（80%）
//   配信の 翌朝：1 行の まとめ（「今週：62通送信・失敗0・新規登録3・停止0」）
//
// 同じ 教室・同じ 回は 1 度だけ（report_runs）。push は X-Line-Retry-Key つきなので、やりなおしても 二重に 届かない。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { weeklyData, monthlyData } from './aggregate.js';
import { weeklyTex, monthlyTex, qrCardsTex, templateVersion, texts } from './render-tex.js';
import { childMessages, bundle, retryUuid, mask } from './line.js';
import { newToken } from './store.js';
import { DAY, parts, weekOf, lastWeek, monthOf, lastMonth, isoWeekNumber, jaRange } from './jst.js';

export const CONSENT_VERSION = 'v1';
export const MAX_PARENTS_PER_TOKEN = 4;
export const REPORT_DAYS = 60;
const STALE_MS = 24 * 3600 * 1000;

const fmt = (s, a = {}) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (a[k] ?? ''));
const hhmm = (s) => { const [h, m] = String(s || '19:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function createParentReports({
  store, reports, roblox = null, renderer, line, log = console, now = Date.now,
  baseUrl = process.env.REPORT_BASE_URL || '', liffId = process.env.LIFF_ID || '', opsUserId = process.env.OPS_LINE_USER_ID || '',
  filesDir = '',
}) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const urlFor = (token, variant = '') => `${base}/r/${token}${variant}`;
  const fileFor = (token, ext) => path.join(filesDir, `${token}.${ext}`);
  let ticking = false;

  // ---- 生徒 -------------------------------------------------------------------------------
  function students(classCode) {
    let records = [];
    try { records = store.listClass?.(classCode) || []; } catch (err) { log.warn?.('[parent-report] listClass failed:', err.message); }
    const seen = new Map();
    for (const r of records) {
      if (!r?.name || r.role === 'teacher') continue;
      const username = roblox?.usernameFor ? roblox.usernameFor(classCode, r.name) : r.name;
      if (!seen.has(username)) seen.set(username, { username, nick: r.name });
    }
    return [...seen.values()];
  }
  const eventsFor = async (username) => (await store.listRobloxEvents?.({ username })) || [];

  // ---- データと レポート -------------------------------------------------------------------
  async function dataFor(classCode, student, kind, period) {
    const s = reports.settings(classCode);
    const teacher = reports.comment(classCode, student.username, period.key);
    const rows = await eventsFor(student.username);
    const opts = { nick: student.nick, sender: s.sender_name || classCode, teacher: teacher ? { text: teacher.text } : null };
    const d = kind === 'monthly' ? monthlyData(rows, { month: period, ...opts }) : weeklyData(rows, { week: period, ...opts });
    d.teacherLabel = s.teacher_label || '先生';
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
    const student = students(classCode).find((s) => s.username === username) || { username, nick: username };
    const period = kind === 'monthly' ? lastMonth(now()) : upcomingWeek(classCode);
    const data = await dataFor(classCode, student, kind, period);
    const source = kind === 'monthly' ? monthlyTex(data, { preview: true }) : weeklyTex(data, { preview: true });
    return renderer.render(source, { kind, name: `preview-${kind}` });
  }
  // 次の 配信で 載る 週（いま 進んでいる 週は まだ 終わっていないので、ふつうは 先週）。
  function upcomingWeek() { return lastWeek(now()); }

  async function qrCards(classCode) {
    const s = reports.settings(classCode);
    const cards = students(classCode).map((st) => {
      const t = reports.tokenFor(classCode, st.username, st.nick, { now: now() });
      return { nick: st.nick, url: `https://liff.line.me/${liffId}?t=${t.token}` };
    });
    const out = await renderer.render(qrCardsTex({ classroom: s.sender_name || classCode, cards }), { kind: 'cards', name: `cards-${classCode}` });
    return out.pdf;
  }

  // ---- 配信 -------------------------------------------------------------------------------
  // 教室 1 つの 1 回ぶん。opts.testTo＝運営者の LINE に だけ 送る（テスト送信）。opts.only＝この 生徒だけ。
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

    for (const student of students(classCode)) {
      if (only && student.username !== only) continue;
      if (!testTo && paused.has(student.username)) continue;
      const links = testTo ? [{ line_user_id: testTo }] : reports.links({ classroomId: classCode, username: student.username, status: 'active' });
      if (!links.length) continue;
      try {
        const { report, data } = await buildReport(classCode, student, kind, periodNow, { force: !!testTo });
        counts.generated += 1;
        let messages;
        if (data.zero && kind === 'weekly') {
          if (s.skip_zero_week && !testTo) {
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
          messages = childMessages({ nick: student.nick, range: data.range, sender: s.sender_name || classCode, png: report.png_url, thumb: report.thumb_url, pdf: report.pdf_url, monthlyPdf, altText: alt });
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
        const retryKey = retryUuid(runKey, to, String(k));
        k += 1;
        const res = await line.push(to, msgs, { retryKey });
        const status = res.ok ? 'sent' : res.permanent ? 'blocked' : 'failed';
        for (const it of covered) reports.addDelivery({ report_id: it.reportId, run_id: run.id, line_user_id: to, status, error: res.ok ? '' : String(res.error || '').slice(0, 200), retry_key: retryKey });
        if (res.ok) { counts.sent += covered.length; counts.messages += 1; } else if (res.permanent) {
          counts.blocked += covered.length;
          // ブロック・存在しない 相手：次から 送らない。
          if (!testTo && (res.status === 400 || res.status === 403 || res.status === 404)) reports.setLinkStatus({ lineUserId: to }, 'blocked');
        } else { counts.failed += covered.length; errors.push(`送信 ${mask(to)}: ${res.error}`); }
      }
    }
    reports.finishRun(run.id, counts);
    log.info?.(`[parent-report] ${runKey}: ${JSON.stringify(counts)}`);
    if (!testTo && (counts.failed > 0 || errors.length)) await notifyOps(`⚠ 保護者レポート：${s.sender_name || classCode}（${periodNow.key}）で 失敗 ${counts.failed}件。\n${errors.slice(0, 3).join('\n')}`);
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
    const messages = childMessages({ nick: data.nick, range: data.range, sender: s.sender_name || report.classroom_id, png: report.png_url, thumb: report.thumb_url, pdf: report.pdf_url, altText: `${data.nick}さんの英語きろく` });
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

  // ---- 登録（QR → LIFF）--------------------------------------------------------------------
  function linkInfo(token) {
    const t = reports.findToken(token, now());
    if (!t) return null;
    const s = reports.settings(t.classroom_id);
    return { nickname: t.nickname, classroom: s.sender_name || t.classroom_id, consentVersion: CONSENT_VERSION };
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
      if (e.type === 'unfollow') reports.setLinkStatus({ lineUserId: uid, status: 'active' }, 'blocked');
      if (e.type === 'follow') reports.setLinkStatus({ lineUserId: uid, status: 'blocked' }, 'active');
    }
  }

  // ---- 画面用の まとめ ---------------------------------------------------------------------
  function classStatus(classCode) {
    const list = students(classCode);
    const s = reports.settings(classCode);
    const paused = new Set(s.paused_students || []);
    const rows = list.map((st) => {
      const links = reports.links({ classroomId: classCode, username: st.username });
      return {
        username: st.username, nick: st.nick, paused: paused.has(st.username),
        parents: links.filter((l) => l.status === 'active').length, blocked: links.filter((l) => l.status === 'blocked').length,
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
    stopClass, stopStudent, fileForRequest, linkInfo, register, onWebhookEvents, classStatus, nextSend,
    start(intervalMs = 60000) { const t = setInterval(() => tick(), intervalMs); t.unref?.(); return t; },
  };
}
