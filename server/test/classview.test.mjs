// 教室のようす。オーナーが経営の判断に使う数字なので、**分母と分子の取り方**を名指しで測る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { continuation, tenure, classView, classHtml, benchWord, BENCH } from '../src/game/classview.js';
import { sanitizeMonths } from '../src/game/months.js';

const NOW = Date.parse('2026-09-20T03:00:00Z');   // 9月の3分の2
const m = (n = 3) => ({ answers: n * 5, correct: n * 4, days: Array.from({ length: n }, (_, i) => `d${i}`) });
const kid = (name, keys, extra = {}) => ({ name, role: 'student', months: Object.fromEntries(keys.map((k) => [k, m()])), ...extra });

test('継続率は「前の月に来た子のうち、その月にも来た子」', () => {
  const records = [
    kid('A', ['2026-07', '2026-08', '2026-09']),
    kid('B', ['2026-07', '2026-08']),            // 9月まだ
    kid('C', ['2026-07']),                       // 8月に来なかった
    kid('D', ['2026-08', '2026-09']),            // 8月にはじめて来た
    { name: 'T', role: 'teacher', months: { '2026-07': m(), '2026-08': m() } },
    kid('M', ['2026-07', '2026-08'], { moved_to: 'next' }),
  ];
  const c = continuation(records, { now: NOW });
  const aug = c.rows.find((r) => r.key === '2026-08');
  assert.equal(aug.base, 3, '7月に来た A・B・C（先生と引っ越しは数えない）');
  assert.equal(aug.stayed, 2, 'A・B');
  assert.equal(aug.rate, 66.7);
  assert.equal(aug.joined, 1, 'D');
  assert.equal(c.latest.key, '2026-08', '今月（途中）は率に入れない');
  assert.deepEqual(c.current.notYet, ['B'], '先月来ていて今月まだの子は名前で');
  assert.equal(c.current.active, 2);
  assert.equal(c.rows.length, 11);
  assert.equal(c.rows.at(-1).key, '2026-08', '古い月が左、新しい月が右');
});

test('空の月・前の月に誰もいない月は率を出さない', () => {
  const c = continuation([kid('A', ['2026-08'])], { now: NOW });
  assert.equal(c.rows.find((r) => r.key === '2026-08').rate, null);
  assert.equal(c.latest, null);
  assert.equal(c.avg3, null);
});

test('業界平均との比べ方', () => {
  assert.equal(benchWord(98), 'above');
  assert.equal(benchWord(BENCH.high), 'within');
  assert.equal(benchWord(BENCH.low), 'within');
  assert.equal(benchWord(90), 'below');
  assert.equal(benchWord(null), null);
});

test('はじめてからの長さは最近2か月に来た子だけ', () => {
  const day = 24 * 60 * 60 * 1000;
  const t = tenure([
    kid('new', ['2026-09'], { first_seen: new Date(NOW - 20 * day).toISOString() }),
    kid('mid', ['2026-08'], { first_seen: new Date(NOW - 150 * day).toISOString() }),
    kid('old', ['2026-09'], { first_seen: new Date(NOW - 500 * day).toISOString() }),
    kid('gone', ['2026-05'], { first_seen: new Date(NOW - 40 * day).toISOString() }),
  ], { now: NOW });
  assert.deepEqual(t.lt3, ['new']);
  assert.deepEqual(t.lt6, ['mid']);
  assert.deepEqual(t.more, ['old']);
});

test('ページは保存の形（JSON 文字列）からでも組め、名前をエスケープする', () => {
  const records = [
    { name: '<script>x</script>', role: 'student', months_json: JSON.stringify({ '2026-07': m(), '2026-08': m() }), last_seen: new Date(NOW).toISOString() },
    { name: 'B', role: 'student', months_json: JSON.stringify({ '2026-07': m() }), last_seen: new Date(NOW - 40 * 86400000).toISOString() },
  ];
  const v = classView(records, { classCode: 'A&B', now: NOW, sanitizeMonths });
  assert.equal(v.continuation.rows.find((r) => r.key === '2026-08').rate, 50);
  const html = classHtml(v);
  assert.ok(!html.includes('<script>x'), '名前はエスケープ');
  assert.ok(html.includes('A&amp;B'));
  assert.ok(html.includes('利用継続率'));
  assert.ok(html.includes('準会場'));
  assert.ok(!/<script/i.test(html), 'スクリプトは入れない');
});
