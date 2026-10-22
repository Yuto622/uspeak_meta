// 保護者レポート（LINE 配信）：集計の 定義・日付の 境目・LaTeX の エスケープ・送信（dry-run・きょうだい・ブロック・二重送信なし）・
// 登録（ID トークン・4 人まで）・Webhook・いつ 送るか・止める・実際の 組版（1040×1300）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { weeklyData, monthlyData, masteryTimeline, masteredAt, normalize } from '../src/parent-report/aggregate.js';
import { jstMidnight, weekOf, monthOf, lastWeek, lastMonth, dayKey, HOUR, DAY } from '../src/parent-report/jst.js';
import { weeklyTex, monthlyTex, tex, goalText } from '../src/parent-report/render-tex.js';
import { ReportStore } from '../src/parent-report/store.js';
import { createLine, retryUuid, bundle } from '../src/parent-report/line.js';
import { createParentReports } from '../src/parent-report/service.js';
import { createRobloxSeats, namePrefix } from '../src/parent-report/roblox-seats.js';
import { localTexAvailable, compileTex } from '../src/parent-report/render.js';

const at = (y, m, d, h = 18, mi = 0) => jstMidnight(y, m, d) + h * HOUR + mi * 60000;
let seq = 0;
const quiz = (ts, word, correct, extra = {}, username = 'taro') => ({ id: `q${seq += 1}`, ts, type: 'quiz', world: 'hut', username, place_id: 'roblox', data_json: JSON.stringify({ word, correct, format: 'mc', level: 'Easy', ...extra }) });

// ---- 日付 ----------------------------------------------------------------------------------
test('JST: the week is Monday 0:00 to Sunday 23:59 in Japan, not in UTC', () => {
  const sunLate = at(2026, 10, 11, 23, 59);          // 日曜 23:59 JST ＝ UTC では 日曜 14:59
  const monEarly = at(2026, 10, 12, 0, 0);           // 月曜 0:00 JST ＝ UTC では 日曜 15:00
  assert.equal(weekOf(sunLate).key, '2026-W41');
  assert.equal(weekOf(monEarly).key, '2026-W42');
  assert.equal(dayKey(at(2026, 10, 12, 8, 59)), '2026-10-12');   // 朝 9 時前でも その日
  assert.equal(lastWeek(monEarly).key, '2026-W41');
  assert.equal(monthOf(at(2026, 10, 31, 23, 59)).key, '2026-10');
  assert.equal(monthOf(at(2026, 11, 1, 0, 0)).key, '2026-11');
  assert.equal(lastMonth(at(2026, 11, 2)).key, '2026-10');
  assert.equal(monthOf(at(2026, 2, 10)).days, 28);
});

// ---- 集計 ----------------------------------------------------------------------------------
test('mastered = 3 correct in a row spread over 2+ days; a later miss takes it back', () => {
  const ev = normalize([
    quiz(at(2026, 10, 5), 'cat', true), quiz(at(2026, 10, 5, 19), 'cat', true), quiz(at(2026, 10, 5, 20), 'cat', true),   // 同じ日だけ → まだ
    quiz(at(2026, 10, 5), 'dog', true), quiz(at(2026, 10, 6), 'dog', true), quiz(at(2026, 10, 6, 19), 'dog', true),         // 2 日 → 覚えた
    quiz(at(2026, 10, 5), 'sun', true), quiz(at(2026, 10, 6), 'sun', false), quiz(at(2026, 10, 7), 'sun', true), quiz(at(2026, 10, 8), 'sun', true),
  ]);
  const changes = masteryTimeline(ev);
  assert.deepEqual([...masteredAt(changes, at(2026, 10, 8, 23))].sort(), ['dog']);
  const later = normalize([...ev.map((e) => ({ ...e })), ...[quiz(at(2026, 10, 9), 'dog', false)].map((r) => normalize([r])[0])]);
  assert.deepEqual([...masteredAt(masteryTimeline(later), at(2026, 10, 9, 23))], []);
  // retry と fast は 覚えた にも 数えない。
  const tricky = normalize([quiz(at(2026, 10, 5), 'pen', true), quiz(at(2026, 10, 6), 'pen', true, { retry: true }), quiz(at(2026, 10, 7), 'pen', true, { fast: true })]);
  assert.equal(masteredAt(masteryTimeline(tricky), at(2026, 10, 8)).size, 0);
});

test('weekly: days, streak, answers, a fall in answers is just numbers (no ↓), next word from the review box', () => {
  const week = weekOf(at(2026, 10, 6));
  const rows = [];
  for (let i = 0; i < 10; i += 1) rows.push(quiz(at(2026, 9, 29 + (i % 2)), 'apple', true));      // 先週 10 問
  rows.push(quiz(at(2026, 10, 6), 'kitchen', false), quiz(at(2026, 10, 7), 'apple', true), quiz(at(2026, 10, 8), 'apple', true));
  const d = weeklyData(rows, { week, nick: 'たろう' });
  assert.deepEqual(d.days, [false, true, true, true, false, false, false]);
  assert.equal(d.dayCount, 3);
  assert.equal(d.streak, 3);
  assert.equal(d.answers, 3);
  assert.equal(d.prevAnswers, 10);
  assert.ok(d.diff < 0);
  assert.equal(d.next.en, 'kitchen');
  const src = weeklyTex(d);
  assert.ok(!src.includes('↓') && !src.includes('ふえた'), 'a smaller week shows no arrow');
  assert.ok(src.includes('先週 10問'));
  assert.ok(!src.includes('colframe=accent,boxrule=0.9pt'), 'no teacher card unless a teacher chose one');
});

test('monthly: first-answer accuracy only, under 20 says これから, speaking is a count', () => {
  const month = monthOf(at(2026, 10, 10));
  const rows = [];
  for (let i = 0; i < 24; i += 1) rows.push(quiz(at(2026, 10, 1 + (i % 20)), `w${i}`, i % 4 !== 0, { format: 'listen' }));
  for (let i = 0; i < 6; i += 1) rows.push(quiz(at(2026, 10, 3), `w${i}`, true, { format: 'listen', retry: true }));   // やり直し：数えない
  for (let i = 0; i < 4; i += 1) rows.push(quiz(at(2026, 10, 3), `f${i}`, true, { format: 'listen', fast: true }));    // 速すぎ：正解率から外す
  for (let i = 0; i < 14; i += 1) rows.push(quiz(at(2026, 10, 4), `t${i}`, true, { format: 'type' }));
  for (let i = 0; i < 5; i += 1) rows.push({ id: `s${i}`, ts: at(2026, 10, 5), type: 'speak', world: 'conv', username: 'taro', data_json: '{}' });
  const d = monthlyData(rows, { month, nick: 'たろう' });
  assert.equal(d.skills.listen.den, 24);
  assert.equal(d.skills.listen.correct, 18);
  assert.equal(d.skills.listen.enough, true);
  assert.equal(d.skills.write.n, 14);
  assert.equal(d.skills.write.enough, false);
  assert.equal(d.skills.speak.n, 5);
  assert.deepEqual(d.nextStep, { key: 'write', n: 6 });
  const src = monthlyTex(d);
  assert.ok(src.includes('24問中 \\textbf{18問} 正解'));
  assert.ok(src.includes('これから（20問になったらお知らせします）'));
  assert.ok(src.includes('あと6問で'));
  for (const banned of ['順位', 'コイン', 'あてずっぽう']) assert.ok(!src.includes(banned), `no ${banned}`);
});

// ---- LaTeX ---------------------------------------------------------------------------------
test('LaTeX: nicknames, words and comments are escaped; newlines cannot break a paragraph', () => {
  assert.equal(tex('a_b&c%d#e$f{g}h'), 'a\\_b\\&c\\%d\\#e\\$f\\{g\\}h');
  assert.equal(tex('x\\y^z~'), 'x\\textbackslash{}y\\textasciicircum{}z\\textasciitilde{}');
  assert.equal(tex('one\n\ntwo'), 'one two');
  const week = weekOf(at(2026, 10, 6));
  const d = weeklyData([quiz(at(2026, 10, 6), 'a', true)], { week, nick: '}\\end{document}_&', sender: '教室%#', teacher: { text: '50% できた & {すごい}\n\\par' } });
  d.teacherLabel = 'A&B先生';
  const src = weeklyTex(d);
  assert.ok(src.includes('\\}\\textbackslash{}end\\{document\\}\\_\\&さんの英語きろく'));
  assert.ok(src.includes('50\\% できた \\& \\{すごい\\} \\textbackslash{}par'));
  assert.ok(src.includes('A\\&B先生より'));
  assert.ok(src.includes('教室\\%\\#'));
  assert.equal((src.match(/\\begin\{document\}/g) || []).length, 1);
});

// ---- 送信まわりの 準備 -----------------------------------------------------------------------
function harness({ students = [{ name: 'Taro' }, { name: 'Hana' }], events = [], links = [], roster = [], seats = null, lineOpts = {}, now = at(2026, 10, 12, 19, 5) } = {}) {
  const main = {
    listClass: () => students,
    listRobloxEvents: async ({ username = '', classCode = '', since = 0 } = {}) => events.filter((e) => (!username || e.username === username) && (!classCode || e.class_code === classCode) && (!since || e.ts >= since)),
    listRobloxLinks: async () => links,
    listAllRoster: async () => roster,
  };
  const reports = new ReportStore(null, { log: { warn() {}, info() {} } });
  const verified = new Map();
  const line = createLine({ dryRun: true, log: { info() {}, warn() {} }, loginChannelId: 'x', secret: 'sec', ...lineOpts });
  line.verifyIdToken = async (t) => (verified.has(t) ? { userId: verified.get(t) } : null);
  let renders = 0;
  const renderer = { mode: 'fake', available: async () => true, render: async (src, { kind }) => { renders += 1; return { pdf: Buffer.from('%PDF'), png: kind === 'cards' ? undefined : Buffer.from('png'), thumb: kind === 'cards' ? undefined : Buffer.from('t') }; } };
  const service = createParentReports({
    store: main, seats, reports, roblox: { usernameFor: (c, n) => n.toLowerCase() }, renderer, line, log: { info() {}, warn() {} }, now: () => now,
    baseUrl: 'https://example.test', liffId: 'LIFF', opsUserId: 'Uops', filesDir: mkdtempSync(path.join(tmpdir(), 'pr-')),
  });
  return { service, reports, line, verified, get renders() { return renders; } };
}
const week41 = (u) => [quiz(at(2026, 10, 6), 'apple', true, {}, u), quiz(at(2026, 10, 7), 'apple', true, {}, u), quiz(at(2026, 10, 8), 'apple', true, {}, u)];

test('registration: the ID token is checked on the server, 4 parents per child at most, the token can be remade', async () => {
  const h = harness();
  const t = h.reports.tokenFor('c1', 'taro', 'Taro');
  assert.ok(t.token.length >= 32);
  assert.equal((await h.service.register(t.token, 'forged')).ok, false, 'an unverified id token is refused');
  for (let i = 0; i < 4; i += 1) { h.verified.set(`id${i}`, `U${i}`); assert.equal((await h.service.register(t.token, `id${i}`)).ok, true); }
  h.verified.set('id4', 'U4');
  assert.equal((await h.service.register(t.token, 'id4')).ok, false, 'the fifth parent is refused');
  assert.equal((await h.service.register(t.token, 'id0')).ok, true, 'the same parent again is fine');
  h.reports.regenerateToken('c1', 'taro', 'Taro');
  assert.equal(h.service.linkInfo(t.token), null, 'the old QR stops working');
});

test('webhook: signature is verified; unfollow blocks, follow restores', () => {
  const h = harness();
  const body = Buffer.from(JSON.stringify({ events: [{ type: 'unfollow', source: { userId: 'U1' } }] }));
  const sig = createHmac('sha256', 'sec').update(body).digest('base64');
  assert.equal(h.line.verifySignature(body, sig), true);
  assert.equal(h.line.verifySignature(body, 'bad'), false);
  h.reports.addLink({ classroomId: 'c1', username: 'taro', nickname: 'Taro', lineUserId: 'U1', consentVersion: 'v1' });
  h.service.onWebhookEvents(JSON.parse(body).events);
  assert.equal(h.reports.links({ lineUserId: 'U1' })[0].status, 'blocked');
  h.service.onWebhookEvents([{ type: 'follow', source: { userId: 'U1' } }]);
  assert.equal(h.reports.links({ lineUserId: 'U1' })[0].status, 'active');
});

test('delivery: siblings in one push, blocked parents skipped, a second run sends nothing (no double delivery)', async () => {
  const h = harness({ events: [...week41('taro'), ...week41('hana')] });
  h.reports.saveSettings('c1', { enabled: true, sender_name: 'ツリーベル英会話教室' });
  for (const u of ['taro', 'hana']) h.reports.addLink({ classroomId: 'c1', username: u, nickname: u, lineUserId: 'Umom', consentVersion: 'v1' });
  h.reports.addLink({ classroomId: 'c1', username: 'taro', nickname: 'taro', lineUserId: 'Ublocked', consentVersion: 'v1' });
  h.reports.setLinkStatus({ lineUserId: 'Ublocked' }, 'blocked');
  const r = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)) });
  assert.equal(r.counts.sent, 2);
  assert.equal(r.counts.messages, 1, 'two children, one push');
  const push = h.line.sent.find((p) => p.to === 'Umom');
  assert.equal(push.messages.length, 4);
  assert.equal(push.messages[0].type, 'image');
  assert.ok(push.messages[0].originalContentUrl.startsWith('https://example.test/r/'));
  assert.equal(push.messages[1].template.actions[0].label, 'PDFで見る');
  assert.match(push.messages[1].altText, /3日英語をして3問に答えました/);
  assert.match(push.retryKey, /^[0-9a-f-]{36}$/);
  assert.ok(!h.line.sent.some((p) => p.to === 'Ublocked'));
  const again = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)) });
  assert.equal(again.skipped, 'already ran');
  assert.equal(h.line.sent.filter((p) => p.to === 'Umom').length, 1);
  assert.equal(retryUuid('a', 'b'), retryUuid('a', 'b'));
});

test('delivery: an empty week is skipped when the class says so, otherwise a short text', async () => {
  const h = harness({ events: [] });
  h.reports.saveSettings('c1', { enabled: true, skip_zero_week: true });
  h.reports.addLink({ classroomId: 'c1', username: 'taro', nickname: 'taro', lineUserId: 'Umom', consentVersion: 'v1' });
  const r = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)) });
  assert.equal(r.counts.skipped, 1);
  assert.equal(h.line.sent.length, 0);
  h.reports.saveSettings('c1', { skip_zero_week: false });
  await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)), force: true });
  assert.equal(h.line.sent[0].messages[0].type, 'text');
});

test('bundle(): at most 5 bubbles per push, a child is never split', () => {
  const two = [{}, {}];
  assert.deepEqual(bundle([two, two, two]).map((p) => p.length), [4, 2]);
  assert.deepEqual(bundle([[{}], two, two]).map((p) => p.length), [5]);
});

test('schedule: weekly on the chosen weekday and time (JST), monthly only in the first week, biweekly by parity', () => {
  const h = harness();
  const base = { classroom_id: 'c1', enabled: true, send_weekday: 1, send_time: '19:00', monthly_pdf: false };
  assert.equal(h.service.dueNow({ ...base, frequency: 'weekly' }, at(2026, 10, 12, 18, 59)), null);
  assert.equal(h.service.dueNow({ ...base, frequency: 'weekly' }, at(2026, 10, 12, 19, 0)).period.key, '2026-W41');
  assert.equal(h.service.dueNow({ ...base, frequency: 'weekly' }, at(2026, 10, 13, 19, 0)), null, 'Tuesday');
  assert.equal(h.service.dueNow({ ...base, frequency: 'monthly' }, at(2026, 11, 2, 19, 0)).period.key, '2026-10');
  assert.equal(h.service.dueNow({ ...base, frequency: 'monthly' }, at(2026, 11, 9, 19, 0)), null);
  const w42 = at(2026, 10, 12, 19, 0); const w43 = at(2026, 10, 19, 19, 0);
  const even = h.service.dueNow({ ...base, frequency: 'biweekly', biweekly_parity: 0 }, w42);
  const odd = h.service.dueNow({ ...base, frequency: 'biweekly', biweekly_parity: 0 }, w43);
  assert.ok(Boolean(even) !== Boolean(odd));
  assert.equal(h.service.dueNow({ ...base, enabled: false, frequency: 'weekly' }, w42), null);
  // 月の はじめの 配信には 先月の まとめが 付く。
  assert.equal(h.service.dueNow({ ...base, frequency: 'weekly', monthly_pdf: true }, at(2026, 11, 2, 19, 0)).monthlyFor.key, '2026-10');
});

test('stopping a class: links stopped (purged after 30 days), report URLs dead, no more sends', async () => {
  const h = harness({ events: week41('taro') });
  h.reports.saveSettings('c1', { enabled: true });
  h.reports.addLink({ classroomId: 'c1', username: 'taro', nickname: 'taro', lineUserId: 'Umom', consentVersion: 'v1' });
  await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)) });
  const report = h.reports.reports()[0];
  assert.ok(h.service.fileForRequest(report.access_token, 'png'));
  await h.service.stopClass('c1');
  assert.equal(h.service.fileForRequest(report.access_token, 'png'), null);
  assert.equal(h.reports.links({ status: 'active' }).length, 0);
  assert.equal(h.reports.purge(Date.now() + 31 * DAY), 1);
});

test('ops: failures notify the operator; the weekly summary is one line', async () => {
  const h = harness({ events: week41('taro') });
  h.reports.saveSettings('c1', { enabled: true });
  h.reports.addLink({ classroomId: 'c1', username: 'taro', nickname: 'taro', lineUserId: 'Umom', consentVersion: 'v1' });
  h.line.push = async (to, messages) => { h.line.sent.push({ to, messages }); return to === 'Uops' ? { ok: true } : { ok: false, error: '500 boom' }; };
  const r = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)) });
  assert.equal(r.counts.failed, 1);
  assert.ok(h.line.sent.some((p) => p.to === 'Uops' && /失敗 1件/.test(p.messages[0].text)));
  assert.match(h.service.summaryLine(at(2026, 10, 13, 9)), /^今週：\d+通送信・失敗\d+・新規登録\d+・停止\d+$/);
});

test('students: Roblox-only children come from the links table, classCode on events and the roster', async () => {
  const ev = week41('rbx_ken').map((e) => ({ ...e, class_code: 'c1' }));
  const h = harness({
    events: [...ev, { ...week41('rbx_other')[0], class_code: 'c2' }],
    links: [{ username: 'rbx_mia', name: 'Mia', class: 'c1' }, { username: 'rbx_zed', name: 'Zed', class: 'c2' }],
    roster: [{ class: 'c1', name: 'Sora' }, { class: 'c1', name: 'Sensei', teacher: true }, { class: '*', name: 'Anyone' }],
  });
  const list = await h.service.students('c1');
  assert.deepEqual(list.map((s) => s.username).sort(), ['hana', 'rbx_ken', 'rbx_mia', 'sora', 'taro']);
  assert.equal(list.find((s) => s.username === 'rbx_mia').nick, 'Mia');
  h.reports.addLink({ classroomId: 'c1', username: 'rbx_ken', nickname: 'rbx_ken', lineUserId: 'Udad', consentVersion: 'v1' });
  const r = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)) });
  assert.equal(r.counts.sent, 1, 'the Roblox-only child gets a report');
  assert.equal(JSON.parse(h.reports.reports()[0].data_json).zero, false, 'built from the Roblox events');
});

test('students: the Roblox seat sheet places children automatically, including same-pattern accounts', async () => {
  const api = { getValues: async (range) => (range.includes('教室マスタ')
    ? [['code', 'name', 'seats', 'active'], ['1716', 'ツリーベル', '12', 'TRUE'], ['1547', '管理者', '12', 'TRUE'], ['1717', '誠心', '7', 'TRUE']]
    : [['code', 'userId', 'username', 'source'], ['1716', '1', 'Kagurazaka_01', 'whitelist'], ['1716', '2', 'TREEBELL_Toda01', 'whitelist'],
      ['1547', '3', 'Kagurazaka_Teacher', 'whitelist'], ['1717', '4', 'seisin01', 'whitelist']]) };
  const seats = createRobloxSeats({ api, log: { warn() {} } });
  const events = [...week41('Kagurazaka_04'), ...week41('TREEBELL_Toda05'), ...week41('Kagurazaka_Teacher'), ...week41('seisin03'), ...week41('stranger99')];
  const h = harness({ students: [], seats, events });
  assert.deepEqual((await h.service.students('1716')).map((s) => s.username).sort(), ['Kagurazaka_01', 'Kagurazaka_04', 'TREEBELL_Toda01', 'TREEBELL_Toda05']);
  assert.deepEqual((await h.service.students('1717')).map((s) => s.username).sort(), ['seisin01', 'seisin03']);
  assert.deepEqual((await h.service.robloxClassCodes()).sort(), ['1716', '1717'], 'the 管理者 classroom is not offered');
  assert.equal(h.service.classNameOf('1716'), 'ツリーベル');
  assert.equal(namePrefix('Kagurazaka_04'), 'kagurazaka');
  assert.equal(namePrefix('C'), '');
});

test('page: the QR token opens the child\'s own page (no LINE), built on demand; stopping or remaking hides it', async () => {
  const h = harness({ events: week41('taro'), now: at(2026, 10, 13, 10) });
  const t = h.reports.tokenFor('c1', 'taro', 'Taro');
  assert.equal(h.service.isStudentToken(t.token), true);
  const page = await h.service.studentPage(t.token);
  assert.equal(page.nick, 'Taro');
  assert.ok(page.latest?.token, 'the latest week is built when the page is opened');
  assert.equal((await h.service.studentPage(t.token)).latest.token, page.latest.token, 'and reused after that');
  const st = await h.service.classStatus('c1', { withUrl: true });
  assert.equal(st.students.find((s) => s.username === 'taro').url, `https://example.test/r/${t.token}`);
  assert.ok(await h.service.studentMonthly(t.token));
  h.service.stopStudent('c1', 'taro');
  assert.equal((await h.service.studentPage(t.token)).paused, true);
  h.service.stopStudent('c1', 'taro', false);
  h.reports.regenerateToken('c1', 'taro', 'Taro');
  assert.equal(await h.service.studentPage(t.token), null, 'a remade QR retires the old URL');
});

test('goal: one "next step" line, strongest first', () => {
  const wk = weekOf(at(2026, 10, 6));
  assert.equal(weeklyData([], { week: wk, nick: 'a' }).goal.key, 'start');
  assert.deepEqual(weeklyData([quiz(at(2026, 10, 6), 'apple', true, {}, 'u')], { week: wk, nick: 'a' }).goal, { key: 'days', args: { n: 2 } });
  const many = [];
  for (let d = 6; d <= 9; d += 1) for (let k = 0; k < 8; k += 1) many.push(quiz(at(2026, 10, d, 10, k), 'dog', k % 3 === 0, {}, 'u'));
  assert.equal(weeklyData(many, { week: wk, nick: 'a' }).goal.key, 'slow', 'low accuracy over 20+ answers asks to slow down');
  const d = weeklyData([...week41('u'), quiz(at(2026, 10, 9), 'cat', false, {}, 'u')], { week: wk, nick: 'a' });
  assert.equal(d.goal.key, 'word');
  assert.match(goalText(d), /「cat」/);
  assert.ok(weeklyTex(d).includes('来週の めあて'));
});

test('clap: once a day per child; Roblox players get it through the wallet, Web-only children when they join', async () => {
  const h = harness({ events: week41('taro'), now: at(2026, 10, 13, 10) });
  const t = h.reports.tokenFor('c1', 'taro', 'Taro');
  const tHana = h.reports.tokenFor('c1', 'hana', 'Hana');
  let delivered = 0;
  h.service.clapHub.rooms.add({ classCode: 'c1', deliverClaps: () => { delivered += 1; } });
  assert.equal((await h.service.clap(t.token)).ok, true);
  assert.equal((await h.service.clap(t.token)).already, true, 'the second press today does nothing');
  assert.equal(delivered, 1, 'an open classroom is told at once');
  assert.deepEqual(h.service.clapHub.take('c1', 'TARO').map((c) => c.coins), [10], 'no Roblox here: the Web room adds the coins');
  h.service.clapHub.shown(h.service.clapHub.take('c1', 'taro')[0].id);
  assert.equal(h.service.clapHub.take('c1', 'taro').length, 0);
  assert.equal((await h.service.clap('nope')).ok, false);
  h.service.stopStudent('c1', 'hana');
  assert.equal((await h.service.clap(tHana.token)).ok, false, 'a paused child cannot be clapped');
  const st = await h.service.classStatus('c1', { withUrl: true });
  assert.equal(st.students.find((s) => s.username === 'taro').claps, 1);
  assert.equal((await h.service.studentPage(t.token)).clappedToday, true);
});

test('clap: a child who plays Roblox gets a wallet row the Roblox sync turns into a banner', async () => {
  const h = harness({ events: week41('taro'), now: at(2026, 10, 13, 10) });
  const rows = [];
  // harness の roblox を 差しかえ（有効・記録あり）
  const svc = createParentReports({
    store: { listClass: () => [{ name: 'Taro' }], listRobloxEvents: async ({ username = '' } = {}) => week41('taro').filter((e) => !username || e.username === username) },
    reports: h.reports, roblox: { enabled: true, usernameFor: (c, n) => n.toLowerCase(), balanceOf: async () => null, walletAdd: (u, n, r) => { rows.push({ u, n, r }); return true; } },
    renderer: { render: async () => ({ pdf: Buffer.from('%PDF') }) }, line: h.line, log: { info() {}, warn() {} }, now: () => at(2026, 10, 13, 10), filesDir: mkdtempSync(path.join(tmpdir(), 'pr-')),
  });
  const t = h.reports.tokenFor('c1', 'taro', 'Taro');
  assert.equal((await svc.clap(t.token)).ok, true);
  assert.deepEqual(rows, [{ u: 'taro', n: 10, r: 'clap:parent' }]);
  assert.deepEqual(svc.clapHub.take('c1', 'taro').map((c) => c.coins), [0], 'the Web room only shows the notice (coins arrive with the balance)');
});

// ---- 本物の 組版 -----------------------------------------------------------------------------
test('compiles: the weekly image is exactly 1040×1300 and the thumbnail is small', { skip: !(await localTexAvailable()) && 'no xelatex here' }, async () => {
  const d = weeklyData(week41('taro'), { week: weekOf(at(2026, 10, 6)), nick: 'た_ろう&', sender: '教室' });
  const out = await compileTex(weeklyTex(d), { kind: 'weekly' });
  assert.equal(out.pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal(out.png.readUInt32BE(16), 1040);
  assert.equal(out.png.readUInt32BE(20), 1300);
  assert.ok(out.thumb.length < 1024 * 1024);
  const m = await compileTex(monthlyTex(monthlyData(week41('taro'), { month: monthOf(at(2026, 10, 6)), nick: 'たろう' })), { kind: 'monthly' });
  assert.equal(m.png.readUInt32BE(16), 1040);
});

// ---- LINE の 下の メニュー（返事は Reply＝無料）と 保護者の とどく 回数 ------------------------------
test('menu: ボタンと 同じ ことばの メッセージだけに こたえる（長い 相談には こたえない）', async () => {
  const { menuAction, menuReply, RICH_MENU } = await import('../src/parent-report/menu.js');
  assert.deepEqual(menuAction({ type: 'postback', postback: { data: 'menu=homework' } }), { kind: 'homework' });
  assert.deepEqual(menuAction({ type: 'postback', postback: { data: 'menu=pref' } }), { kind: 'ask-pref' });
  assert.deepEqual(menuAction({ type: 'postback', postback: { data: 'menu=pref&set=stop' } }), { kind: 'pref', pref: 'stop' });
  assert.deepEqual(menuAction({ type: 'postback', postback: { data: 'menu=pref&set=daily' } }), { kind: 'ask-pref' }, 'ふやす えらびは ない（えらびなおしの 画面に もどる）');
  assert.deepEqual(menuAction({ type: 'message', message: { type: 'text', text: '宿題' } }), { kind: 'homework' });
  assert.equal(menuAction({ type: 'message', message: { type: 'text', text: '来週の 授業を おやすみ したいのですが、宿題は どうなりますか' } }), null);
  assert.equal(RICH_MENU.areas.length, 6);
  // ぜんぶの ボタンが 画像の 中に おさまり、すきまも かさなりも ない（面積の 合計 ＝ 画像）。
  assert.ok(RICH_MENU.areas.every(({ bounds: b }) => b.x >= 0 && b.y >= 0 && b.x + b.width <= RICH_MENU.size.width && b.y + b.height <= RICH_MENU.size.height));
  assert.equal(RICH_MENU.areas.reduce((n, a) => n + a.bounds.width * a.bounds.height, 0), RICH_MENU.size.width * RICH_MENU.size.height);
  assert.deepEqual(menuAction({ type: 'postback', postback: { data: 'menu=game' } }), { kind: 'game' });
  const game = menuReply({ kind: 'game' }, { registered: false })[0];
  const gj = JSON.stringify(game.contents);
  assert.equal(game.type, 'flex', '登録が なくても あそびかたは 出す');
  assert.ok(/iphone-fullscreen-guide\.pdf/.test(gj) && /add-to-home-safari\.mp4/.test(gj) && /openExternalBrowser=1/.test(gj), 'PDF・動画・Safari で ひらく');
  assert.ok(RICH_MENU.areas.some((a) => a.action.data === 'menu=pref'), '回数を かえる ボタンは かならず ある');
  assert.deepEqual(menuAction({ type: 'postback', postback: { data: 'menu=home' } }), { kind: 'home' });
  const home = menuReply({ kind: 'home' }, { registered: true, kids: [{ nick: 'かい', roadmap: { words: { next: ['apple', 'dog', '<b>'] } } }] })[0].text;
  assert.match(home, /「apple」「dog」/); assert.doesNotMatch(home, /<b>/);
  const { roadmapOf } = await import('../src/game/roadmap.js');
  const card = menuReply({ kind: 'roadmap' }, { registered: true, kids: [{ nick: 'かい', roadmap: roadmapOf([], { now: Date.now() }), page: 'https://example.com/r' }] })[0];
  assert.equal(card.type, 'flex'); assert.ok(card.altText.length <= 400 && card.altText.includes('かいさん'));
  const json = JSON.stringify(card.contents);
  assert.ok(json.includes('はじめの ことば') && json.includes('たんご') && json.includes('英検5級') && json.includes('https://example.com/r'));
  assert.ok(json.length < 30000, 'Flex は 30KB まで');
  assert.match(menuReply({ kind: 'report' }, { registered: false })[0].text, /QR/);
});

test('menu: 下の ボタンで さいしんの レポート・宿題・とどく 回数。返事は reply（push の 通数に ならない）', async () => {
  const h = harness({ events: week41('taro') });
  h.reports.saveSettings('c1', { enabled: true });
  h.reports.addLink({ classroomId: 'c1', username: 'taro', nickname: 'Taro', lineUserId: 'Umom', consentVersion: 'v1' });
  await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)) });
  const pushes = h.line.sent.filter((p) => !p.reply).length;
  const ask = async (data) => {
    h.service.onWebhookEvents([{ type: 'postback', replyToken: `rt-${data}`, source: { userId: 'Umom' }, postback: { data } }]);
    for (let i = 0; i < 50 && !h.line.sent.some((p) => p.replyToken === `rt-${data}`); i += 1) await new Promise((r) => setTimeout(r, 10));
    return h.line.sent.find((p) => p.replyToken === `rt-${data}`).messages;
  };
  const rep = await ask('menu=report');
  assert.equal(rep[0].type, 'image');
  assert.match(rep[1].text, /Taroさんの さいしんの レポート/);
  assert.match(rep[1].text, /https:\/\/example\.test\/r\//);
  assert.match((await ask('menu=homework'))[0].text, /宿題は ありません|宿題/);
  const pref = await ask('menu=pref');
  assert.match(pref[0].text, /教室の 設定どおり/);
  assert.equal(pref[0].quickReply.items.length, 3);
  assert.match((await ask('menu=pref&set=stop'))[0].text, /とめました/);
  assert.equal(h.reports.links({ lineUserId: 'Umom' })[0].pref, 'stop');
  assert.equal(h.line.sent.filter((p) => !p.reply).length, pushes, 'メニューの 返事で push は ふえない');
  // とめた 人には 次の 週 送らない。月に 1 回は 27 日 たつまで 送らない。
  const r = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)), force: true });
  assert.equal(r.counts.sent, 0);
  await ask('menu=pref&set=monthly');
  const r2 = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)), force: true });
  assert.equal(r2.counts.sent, 0, 'さいごに とどいてから 27 日 たって いない');
  h.reports.links({ lineUserId: 'Umom' })[0].last_sent_at = new Date(at(2026, 9, 1)).toISOString();
  const r3 = await h.service.deliverClass('c1', { period: weekOf(at(2026, 10, 6)), force: true });
  assert.equal(r3.counts.sent, 1);
});

test('おうちで できる こと：復習の 時期の ことば・宿題で まちがえた ことばを 1 行に', async () => {
  const { homeTip } = await import('../src/parent-report/line.js');
  assert.match(homeTip({ next: { en: 'apple' }, homework: { missed: ['red', 'apple'] } }), /「apple」「red」/);
  assert.match(homeTip({ zero: true }), /きいて みて/);
  assert.match(homeTip({}), /おしえて もらって/);
});

test('LINE の 下の メニュー：起動で まだ ない ときだけ 作って 全員の 既定に、2 回目は 何も しない', async () => {
  const { ensureRichMenu } = await import('../src/parent-report/richmenu-setup.js');
  const { RICH_MENU } = await import('../src/parent-report/menu.js');
  let def = ''; const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, text: async () => (body ? JSON.stringify(body) : '') });
  const fetchImpl = async (url, o) => {
    calls.push(`${o.method} ${url.replace(/^https:\/\/[^/]+/, '')}`);
    if (url.endsWith('/richmenu/list')) return res(200, { richmenus: def ? [{ richMenuId: def, name: RICH_MENU.name }] : [{ richMenuId: 'old', name: 'uspeak-parent-v0' }, { richMenuId: 'keep', name: 'other' }] });
    if (url.endsWith('/user/all/richmenu') && o.method === 'GET') return def ? res(200, { richMenuId: def }) : res(404, { message: 'no default' });
    if (o.method === 'POST' && url.endsWith('/v2/bot/richmenu')) return res(200, { richMenuId: 'new1' });
    if (o.method === 'POST' && url.includes('/user/all/richmenu/')) { def = 'new1'; return res(200); }
    return res(200);
  };
  assert.equal((await ensureRichMenu({ token: '', fetchImpl })).ok, false, '鍵が ない ときは 何も しない');
  const first = await ensureRichMenu({ token: 't', fetchImpl, log: {} });
  assert.equal(first.created, true);
  assert.ok(calls.includes('DELETE /v2/bot/richmenu/old') && !calls.includes('DELETE /v2/bot/richmenu/keep'), '消すのは 前の uspeak-parent-v* だけ');
  assert.ok(calls.includes('POST /v2/bot/user/all/richmenu/new1'));
  calls.length = 0;
  assert.equal((await ensureRichMenu({ token: 't', fetchImpl, log: {} })).already, true);
  assert.equal(calls.length, 2, '2 回目は 見るだけ');
});
