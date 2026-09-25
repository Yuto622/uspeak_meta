// 年度またぎと、クラスぜんぶの CSV。
//
// **記録は `クラス|なまえ` で引いている。** 4月にクラス名が変わると、その子は0から
// 始まってしまう。3年つづけた子の3年分が消えるのは、このサービスがいちばん失っては
// いけないもの。ここで見るのは「引き継げること」と「引き継ぎで壊さないこと」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classCsv, signExport, verifyExport, signReport, verifyReport, reportFor } from '../src/game/report.js';

const child = (name, extra = {}) => ({
  class: '2026', name, role: 'student', level: 7, xp: 20, total_xp: 640,
  correct: 88, attempts: 110, coins: 300, study_ms: 3_600_000, study_days: 12,
  last_seen: '2026-09-20T08:00:00Z',
  months_json: JSON.stringify({ '2026-09': { answers: 30, correct: 24, xp: 300, coins: 90, seconds: 1800, days: ['2026-09-08', '2026-09-20'] } }),
  ...extra,
});
const now = Date.parse('2026-09-25T17:00+09:00');

test('CSV：1人1行、今月ぶんも入る、Excel が読める形', () => {
  const csv = classCsv([child('Ben'), child('Aki')], { now });
  assert.ok(csv.startsWith('﻿'), 'BOM が無いと Excel の日本語版で名前が化ける');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 3, '見出し＋2人');
  assert.ok(lines[0].includes('なまえ') && lines[0].includes('今月きた日'));
  assert.ok(lines[1].startsWith('Aki'), '名前の順に並ぶ');
  const aki = lines[1].split(',');
  assert.equal(aki[1], '7', 'レベル');
  assert.equal(aki[5], '80%', '正答率');
  assert.equal(aki[7], '60', '学習時間は分');
  assert.equal(aki[10], '2', '今月きた日');
  assert.equal(aki[11], '30', '今月の問題');
});

test('CSV：先生の行と、引っ越し済みの行は出さない', () => {
  const rows = classCsv([
    child('Aki'),
    child('Sensei', { role: 'teacher' }),
    child('Moved', { moved_to: '2027' }),
  ], { now }).trim().split('\r\n');
  assert.equal(rows.length, 2, '見出し＋Aki だけ');
  assert.ok(!rows.join('\n').includes('Sensei'));
  assert.ok(!rows.join('\n').includes('Moved'));
});

test('CSV：名前に , や " が入っていても列がずれない', () => {
  const csv = classCsv([child('Aki, "the brave"')], { now });
  const line = csv.trim().split('\r\n')[1];
  assert.ok(line.startsWith('"Aki, ""the brave"""'), line);
  // 引用の中のカンマを数えないで列を数える。
  const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).filter((x) => x !== '');
  assert.equal(cells.length, 14, '列は14のまま');
});

test('クラスぜんぶの署名は、子ども1人ぶんの署名とは別物', () => {
  const secret = 'a-very-long-report-secret-000000';
  // 1人ぶんのトークンを、クラス全員ぶんの口に持っていっても通らない。
  assert.equal(verifyExport(secret, '2026', signReport(secret, '2026', 'Aki')), false);
  // その逆も。
  assert.equal(verifyReport(secret, '2026', 'Aki', signExport(secret, '2026')), false);
  // 正しい組み合わせだけ通る。
  assert.equal(verifyExport(secret, '2026', signExport(secret, '2026')), true);
  // 別のクラスの署名では開けない。
  assert.equal(verifyExport(secret, '2027', signExport(secret, '2026')), false);
});

test('引き継いだ記録は、中身がそのまま', () => {
  // carryover がするのは class を差し替えた複製。レポートの数字が変わらないこと。
  const before = reportFor(child('Aki'), { now });
  const after = reportFor({ ...child('Aki'), class: '2027', moved_from: '2026' }, { now });
  assert.equal(after.classCode, '2027');
  assert.equal(after.totalXp, before.totalXp);
  assert.equal(after.correct, before.correct);
  assert.deepEqual(after.months, before.months, '今月のまとめも そのまま');
});
