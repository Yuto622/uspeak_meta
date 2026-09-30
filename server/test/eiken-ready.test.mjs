// 英検の目安と準会場の数え上げ。先生が「この子に勧めるか」を決める材料なので、
// **しきい値の境目**と、**級ごとに見る技能が違うこと**を名指しで測る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blankReady, sanitizeReady, recordEiken, statOf, gradeStatus, readinessOf, classExamPlan,
  WINDOW, MIN_N, JUNKAIJO_MIN,
} from '../src/game/eiken-ready.js';

const bits = (right, total) => '1'.repeat(right) + '0'.repeat(total - right);
const child = (name, grades) => {
  const ready = blankReady();
  for (const [g, skills] of Object.entries(grades)) Object.assign(ready[g], skills);
  return { name, role: 'student', eiken_json: JSON.stringify(ready) };
};

test('やさしい判定の○は数えず、見るのは直近20問だけ', () => {
  const r = blankReady();
  assert.equal(recordEiken(r, 'g5', 'reading', true, 'easy'), false);
  assert.equal(r.g5.reading, '');
  for (let i = 0; i < 30; i += 1) recordEiken(r, 'g5', 'reading', i >= 10, 'normal');
  assert.equal(r.g5.reading.length, WINDOW);
  assert.equal(statOf(r.g5.reading).acc, 100, '昔の10問の失敗は窓の外');
  assert.equal(recordEiken(r, 'g9', 'reading', true), false, '知らない級は数えない');
});

test('8問答えるまでは判断しない（2問中2問を100%と言わない）', () => {
  assert.equal(statOf('11').ok, false);
  assert.equal(statOf(bits(6, MIN_N)).ok, true, '8問中6問＝75%で届く');
  assert.equal(statOf(bits(5, MIN_N)).ok, false, '8問中5問＝63%はあと一歩');
  assert.equal(statOf(bits(5, MIN_N)).near, true);
});

test('5級・4級は読む・聞くだけで決まる（書く・話すが弱くても下げない）', () => {
  const r = blankReady();
  r.g5.reading = bits(8, 10); r.g5.listening = bits(7, 10);
  r.g5.writing = bits(1, 10); r.g5.speaking = '';
  const s = gradeStatus(r, 'g5');
  assert.equal(s.status, 'ready');
  assert.equal(s.school, '中学1年生くらい');
  assert.deepEqual(s.skills.map((x) => x.skill), ['reading', 'listening']);
});

test('3級は書くも一次に入り、話すは二次として別に出す', () => {
  const r = blankReady();
  r.g3.reading = bits(9, 10); r.g3.listening = bits(8, 10); r.g3.writing = bits(4, 10);
  const s = gradeStatus(r, 'g3');
  assert.equal(s.status, 'close', '1技能だけ届いていない＝あと一歩');
  assert.deepEqual(s.missing, ['かく']);
  assert.equal(s.second[0].skill, 'speaking');
  r.g3.writing = bits(8, 10);
  assert.equal(gradeStatus(r, 'g3').status, 'ready');
});

test('届いたいちばん上の級と、次にめざす級', () => {
  const r = blankReady();
  r.g5.reading = bits(9, 10); r.g5.listening = bits(9, 10);
  r.g4.reading = bits(3, 4);
  const x = readinessOf(r);
  assert.equal(x.best, 'g5');
  assert.equal(x.aim, 'g4');
  assert.equal(readinessOf(blankReady()).practised, false);
  assert.equal(readinessOf(blankReady()).aim, 'g5', 'まだ何もしていない子は5級から');
});

test('壊れた保存は空から', () => {
  assert.deepEqual(sanitizeReady('x'), blankReady());
  assert.equal(sanitizeReady({ g5: { reading: '10a1x0'.repeat(9) } }).g5.reading.length, WINDOW);
  assert.equal(sanitizeReady({ g5: { reading: '1x0' } }).g5.reading, '10');
});

test('準会場：1人は1つの級にだけ数え、10人から開ける', () => {
  const ready5 = { g5: { reading: bits(9, 10), listening: bits(9, 10) } };
  const close4 = { g5: ready5.g5, g4: { reading: bits(9, 10), listening: bits(5, 10) } };
  const records = [
    ...Array.from({ length: 7 }, (_, i) => child(`r${i}`, ready5)),
    child('c1', close4),
    child('c2', { g5: { reading: bits(9, 10), listening: bits(5, 10) } }),
    child('c3', { g5: { reading: bits(9, 10), listening: bits(5, 10) } }),
    child('c4', { g5: { reading: bits(9, 10), listening: bits(5, 10) } }),
    { name: 'teacher', role: 'teacher', eiken_json: JSON.stringify({ g5: ready5.g5 }) },
    { ...child('moved', ready5), moved_to: '2027-A' },
  ];
  const plan = classExamPlan(records);
  assert.equal(plan.readyTotal, 8, 'r0〜r6 と c1（5級に届いている）');
  assert.deepEqual(plan.byGrade.g4.close, ['c1']);
  assert.deepEqual(plan.byGrade.g5.close, ['c2', 'c3', 'c4']);
  assert.equal(plan.closeTotal, 3, 'c1 は届いた子として数え済みなので見込みに二重に入れない');
  assert.equal(plan.outlook, 11);
  assert.equal(plan.open, false);
  assert.equal(plan.likely, true);
  assert.equal(plan.short, JUNKAIJO_MIN - 8);
});
