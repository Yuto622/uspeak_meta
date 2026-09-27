// つづけてもらうための読み取り — 気づき・去年の同じ月・つづけた月数。
//
// 保護者と先生に見せる数字なので、**しきい値のふるまいを名指しで測る**。
// 「なんとなく出ている」で済ませると、教室から「この子は違う」と言われたときに
// 直せるかどうかが分からない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  keyMinusYears, keyMinusMonth, daysInMonth, lastYear, monthsInARow,
  monthsSinceStart, paceOf, daysAway, noticeFor, noticesFor,
} from '../src/game/retention.js';

// 2026-09-20 12:00 JST に立って測る（月の3分の2が過ぎたところ）。
const NOW = Date.parse('2026-09-20T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const month = (days, answers = days * 8) => ({
  answers, correct: Math.round(answers * 0.7), xp: answers * 6, coins: answers * 4,
  seconds: days * 300, days: Array.from({ length: days }, (_, i) => `x-${i}`),
});
const ago = (n) => new Date(NOW - n * DAY).toISOString();

test('月の引き算は文字列でやる（12月をまたいでも、うるう年でも同じ）', () => {
  assert.equal(keyMinusYears('2026-09'), '2025-09');
  assert.equal(keyMinusMonth('2026-09'), '2026-08');
  assert.equal(keyMinusMonth('2026-01'), '2025-12');
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2024-02'), 29);   // うるう年
  assert.equal(daysInMonth('2026-09'), 30);
  assert.equal(daysInMonth('2026-12'), 31);
});

test('去年の同じ月は、1年たった子にだけ出る', () => {
  assert.equal(lastYear({ '2026-09': month(8) }, { now: NOW }), null, '1年ぶんない子には出さない');
  const r = lastYear({ '2025-09': month(5, 40), '2026-09': month(8) }, { now: NOW });
  assert.equal(r.label, '2025年9月');
  assert.equal(r.days, 5);
  assert.equal(r.answers, 40);
  assert.equal(r.accuracy, 70);
  // 記録はあるが空っぽの月は「無い」と同じ（0日0問を並べても意味がない）。
  assert.equal(lastYear({ '2025-09': month(0, 0) }, { now: NOW }), null);
});

test('つづけた月数は「答えた月」の連続で、今月が空でも切れない', () => {
  const src = { '2026-07': month(4), '2026-08': month(6), '2026-09': month(8) };
  assert.equal(monthsInARow(src, { now: NOW }), 3);
  // 今月まだ何もしていない：**カレンダーの都合で0にしない**。先月から数える。
  delete src['2026-09'];
  assert.equal(monthsInARow(src, { now: NOW }), 2);
  // 途中が抜けていれば、そこで切れる。
  assert.equal(monthsInARow({ '2026-05': month(3), '2026-08': month(6) }, { now: NOW }), 1);
  assert.equal(monthsInARow({}, { now: NOW }), 0);
});

test('在籍の長さは first_seen が本命、無ければ持っている月から', () => {
  assert.equal(monthsSinceStart({}, { firstSeen: new Date(NOW - 200 * DAY).toISOString(), now: NOW }), 6);
  assert.equal(monthsSinceStart({ '2026-06': month(3), '2026-09': month(3) }, { now: NOW }), 3);
  assert.equal(monthsSinceStart({}, { now: NOW }), 0);
});

test('ペースは月の進み具合で日割りする', () => {
  const p = paceOf({ '2026-08': month(9), '2026-09': month(4) }, { now: NOW });
  assert.equal(p.prev, 9);
  assert.equal(p.days, 4);
  assert.ok(Math.abs(p.through - 20 / 30) < 0.01, '9月20日なので3分の2');
  assert.equal(p.expected, 6);                  // 9日 × 2/3
  assert.ok(p.ratio > 0.66 && p.ratio < 0.67);
  // 先月が0日なら比べる相手がいない。割り算にしない。
  assert.equal(paceOf({ '2026-09': month(4) }, { now: NOW }).ratio, null);
});

test('最後にあそんだ日からの日数', () => {
  assert.equal(daysAway(ago(5), { now: NOW }), 5);
  assert.equal(daysAway('', { now: NOW }), null);
  assert.equal(daysAway('こわれた日付', { now: NOW }), null);
});

test('3週間来ていない子は call、2週間は watch', () => {
  const months = { '2026-08': month(8), '2026-09': month(2) };
  const call = noticeFor({ name: 'あ', last_seen: ago(22) }, { now: NOW, months });
  assert.equal(call.level, 'call');
  assert.match(call.why, /22日 来ていません/);
  const watch = noticeFor({ name: 'い', last_seen: ago(15) }, { now: NOW, months });
  assert.equal(watch.level, 'watch');
  // 昨日来た子は、来ていないことでは呼ばれない。
  const fine = noticeFor({ name: 'う', last_seen: ago(1) }, { now: NOW, months: { '2026-08': month(8), '2026-09': month(6) } });
  assert.equal(fine, null);
});

test('沈黙期（はじめて3か月以内）の子は、同じ2週間でも call に上がる', () => {
  const months = { '2026-08': month(6), '2026-09': month(1) };
  const fresh = { name: 'え', last_seen: ago(15), first_seen: new Date(NOW - 40 * DAY).toISOString() };
  const old = { name: 'お', last_seen: ago(15), first_seen: new Date(NOW - 400 * DAY).toISOString() };
  assert.equal(noticeFor(fresh, { now: NOW, months }).level, 'call');
  assert.equal(noticeFor(old, { now: NOW, months }).level, 'watch');
  assert.match(noticeFor(fresh, { now: NOW, months }).why, /はじめて/);
});

test('ペースが落ちた子・伸びた子。月の前半では言わない', () => {
  const slow = { '2026-08': month(12), '2026-09': month(2) };
  const down = noticeFor({ name: 'か', last_seen: ago(3) }, { now: NOW, months: slow });
  assert.equal(down.level, 'watch');
  assert.match(down.why, /ペースが落ちています/);

  const fast = { '2026-08': month(4), '2026-09': month(9) };
  const up = noticeFor({ name: 'き', last_seen: ago(1) }, { now: NOW, months: fast });
  assert.equal(up.level, 'cheer');
  assert.match(up.why, /よく来ています/);

  // 9月3日（月の1割）では、同じ記録でもペースの話をしない。
  const early = Date.parse('2026-09-03T03:00:00Z');
  assert.equal(noticeFor({ name: 'く', last_seen: ago(1) }, { now: early, months: slow }), null);

  // 先月2日しか来ていない子は、比べる相手がいない（ENOUGH=3）。
  const thin = { '2026-08': month(2), '2026-09': month(0, 0) };
  assert.equal(noticeFor({ name: 'け', last_seen: ago(2) }, { now: NOW, months: thin }), null);
});

test('クラスぶんは強い順。先生と引っ越し済みは出さない', () => {
  const rows = noticesFor([
    { name: 'のびた', last_seen: ago(1), months: { '2026-08': month(4), '2026-09': month(9) } },
    { name: 'きえた', last_seen: ago(30), months: { '2026-08': month(8), '2026-09': month(0, 0) } },
    { name: 'すこし', last_seen: ago(15), months: { '2026-08': month(8), '2026-09': month(4) } },
    { name: '先生', role: 'teacher', last_seen: ago(40), months: {} },
    { name: 'ひっこし', last_seen: ago(40), moved_to: 'tree-b', months: {} },
    { name: 'ふつう', last_seen: ago(2), months: { '2026-08': month(8), '2026-09': month(6) } },
  ], { now: NOW });
  assert.deepEqual(rows.map((r) => r.name), ['きえた', 'すこし', 'のびた']);
  assert.deepEqual(rows.map((r) => r.level), ['call', 'watch', 'cheer']);
});

test('多すぎる教室では切る（読まれない一覧は一覧ではない）', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    name: `こ${i}`, last_seen: ago(30 + i), months: { '2026-08': month(8) },
  }));
  assert.equal(noticesFor(many, { now: NOW }).length, 12);
  assert.equal(noticesFor(many, { now: NOW, limit: 3 }).length, 3);
});

test('壊れた記録でも落ちない（保存を手で触られてもレポートは出す）', () => {
  assert.equal(noticeFor({ name: 'x' }, { now: NOW, months: null }), null);
  assert.equal(monthsInARow(null, { now: NOW }), 0);
  assert.equal(lastYear(null, { now: NOW }), null);
  assert.equal(noticesFor(null, { now: NOW }).length, 0);
  assert.equal(noticesFor([null, {}, { name: '' }], { now: NOW }).length, 0);
});
