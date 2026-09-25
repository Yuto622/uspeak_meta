// 月ごとの学習記録。**ここを間違えると保護者に嘘の数字が出る**ので、境目を厚く見る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthKey, dayKey, bump, sanitizeMonths, trimMonths, recentMonths, KEEP_MONTHS } from '../src/game/months.js';

// JST の時刻を UTC のミリ秒にする（テストの意図を読めるように）。
const jst = (s) => Date.parse(`${s}+09:00`);

test('月の切れ目は日本時間。UTC で切ると朝のレッスンが前の月に落ちる', () => {
  // **8月1日の朝9時（JST）は UTC では 8月1日 0時**。ここは両方 8月。
  assert.equal(monthKey(jst('2026-08-01T09:00')), '2026-08');
  // **8月1日の朝0時5分（JST）は UTC では 7月31日 15時5分**。UTC で切ると7月になる。
  assert.equal(monthKey(jst('2026-08-01T00:05')), '2026-08');
  assert.equal(dayKey(jst('2026-08-01T00:05')), '2026-08-01');
  // 月末も同じ。7月31日 23時59分（JST）は7月のまま。
  assert.equal(monthKey(jst('2026-07-31T23:59')), '2026-07');
  assert.equal(dayKey(jst('2026-07-31T23:59')), '2026-07-31');
  // 年をまたぐところ。
  assert.equal(monthKey(jst('2027-01-01T00:30')), '2027-01');
  assert.equal(monthKey(jst('2026-12-31T23:30')), '2026-12');
});

test('答えるたびに足され、同じ日に何回きても「1日」', () => {
  const m = {};
  const t = (s) => ({ now: jst(s), day: true });
  bump(m, { answers: 1, correct: 1, xp: 10 }, t('2026-09-16T17:00'));
  bump(m, { answers: 1, correct: 0, xp: 0 }, t('2026-09-16T17:05'));
  bump(m, { answers: 1, correct: 1, xp: 10 }, t('2026-09-18T17:00'));
  assert.deepEqual(m['2026-09'], { answers: 3, correct: 2, xp: 20, coins: 0, seconds: 0, days: ['2026-09-16', '2026-09-18'] });
});

test('コインと学習時間は 日を数えない（答えていない子を「きた日」にしない）', () => {
  const m = {};
  bump(m, { seconds: 1 }, { now: jst('2026-09-16T17:00') });
  bump(m, { coins: 40 }, { now: jst('2026-09-16T17:00') });
  assert.equal(m['2026-09'].days.length, 0);
  assert.equal(m['2026-09'].seconds, 1);
  assert.equal(m['2026-09'].coins, 40);
});

test('壊れた保存は捨てて空から。レポート全体が出ないほうが悪い', () => {
  assert.deepEqual(sanitizeMonths('not json'), {});
  assert.deepEqual(sanitizeMonths(null), {});
  assert.deepEqual(sanitizeMonths([1, 2]), {});
  assert.deepEqual(sanitizeMonths({ 'nonsense': { answers: 5 } }), {});
  assert.deepEqual(sanitizeMonths({ '2026-13': { answers: 5 } }), {}, '13月は無い');
  // 数でないもの・負の数は 0 に。
  const out = sanitizeMonths({ '2026-09': { answers: 'x', correct: -4, xp: 1.9, coins: null, seconds: 30, days: 'nope' } });
  assert.deepEqual(out['2026-09'], { answers: 0, correct: 0, xp: 1, coins: 0, seconds: 30, days: [] });
  // 正解が回答数を超える保存は信じない。
  const lying = sanitizeMonths({ '2026-09': { answers: 3, correct: 99 } });
  assert.equal(lying['2026-09'].correct, 3);
  // ほかの月の日付が混ざっていたら落とす。
  const mixed = sanitizeMonths({ '2026-09': { days: ['2026-09-01', '2026-08-30', '2026-09-01'] } });
  assert.deepEqual(mixed['2026-09'].days, ['2026-09-01'], '重複も ほかの月も 落とす');
  // 文字列でも読める（保存はこの形）。
  assert.equal(sanitizeMonths(JSON.stringify({ '2026-09': { answers: 7 } }))['2026-09'].answers, 7);
});

test('古い月から落ちる。去年の同じ月とは並べられる', () => {
  const m = {};
  for (let i = 0; i < 20; i += 1) {
    const month = String((i % 12) + 1).padStart(2, '0');
    m[`${2025 + Math.floor(i / 12)}-${month}`] = { answers: 1, correct: 0, xp: 0, coins: 0, seconds: 0, days: [] };
  }
  trimMonths(m);
  assert.equal(Object.keys(m).length, KEEP_MONTHS);
  assert.ok(KEEP_MONTHS >= 13, '4月に「去年の4月」と並べるには13か月要る');
  // 残ったのは新しいほう。
  const keys = Object.keys(m).sort();
  assert.ok(keys[keys.length - 1] > keys[0]);
});

test('レポートに渡す形：新しい月が先、何もしていない月は出さない', () => {
  const m = {};
  bump(m, { answers: 4, correct: 3, xp: 40 }, { now: jst('2026-09-16T17:00'), day: true });
  bump(m, { answers: 10, correct: 5, xp: 90 }, { now: jst('2026-08-10T17:00'), day: true });
  m['2026-07'] = { answers: 0, correct: 0, xp: 0, coins: 0, seconds: 0, days: [] };  // 何もしていない月
  const out = recentMonths(m, 6, { now: jst('2026-09-25T10:00') });
  assert.deepEqual(out.map((x) => x.key), ['2026-09', '2026-08'], '空の月は出さない');
  assert.equal(out[0].current, true);
  assert.equal(out[1].current, false);
  assert.equal(out[0].label, '2026年9月');
  assert.equal(out[0].accuracy, 75);
  assert.equal(out[1].accuracy, 50);
  assert.equal(out[0].days, 1);
});

test('やっていない月の正答率は 0% ではなく「まだ無い」', () => {
  const m = { '2026-09': { answers: 0, correct: 0, xp: 0, coins: 0, seconds: 600, days: [] } };
  const out = recentMonths(m, 6, { now: jst('2026-09-25T10:00') });
  assert.equal(out.length, 1, '時間だけでも「やった月」ではある');
  assert.equal(out[0].accuracy, null);
  assert.equal(out[0].minutes, 10);
});
