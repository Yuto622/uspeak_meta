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
import { weeklyTex, monthlyTex, tex } from '../src/parent-report/render-tex.js';
import { ReportStore } from '../src/parent-report/store.js';
import { createLine, retryUuid, bundle } from '../src/parent-report/line.js';
import { createParentReports } from '../src/parent-report/service.js';
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
function harness({ students = [{ name: 'Taro' }, { name: 'Hana' }], events = [], lineOpts = {}, now = at(2026, 10, 12, 19, 5) } = {}) {
  const main = {
    listClass: () => students,
    listRobloxEvents: async ({ username = '', since = 0 } = {}) => events.filter((e) => (!username || e.username === username) && (!since || e.ts >= since)),
  };
  const reports = new ReportStore(null, { log: { warn() {}, info() {} } });
  const verified = new Map();
  const line = createLine({ dryRun: true, log: { info() {}, warn() {} }, loginChannelId: 'x', secret: 'sec', ...lineOpts });
  line.verifyIdToken = async (t) => (verified.has(t) ? { userId: verified.get(t) } : null);
  let renders = 0;
  const renderer = { mode: 'fake', available: async () => true, render: async (src, { kind }) => { renders += 1; return { pdf: Buffer.from('%PDF'), png: kind === 'cards' ? undefined : Buffer.from('png'), thumb: kind === 'cards' ? undefined : Buffer.from('t') }; } };
  const service = createParentReports({
    store: main, reports, roblox: { usernameFor: (c, n) => n.toLowerCase() }, renderer, line, log: { info() {}, warn() {} }, now: () => now,
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
