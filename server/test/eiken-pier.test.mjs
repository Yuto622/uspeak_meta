// メインの島の 英検の つり場：級ごとの 問題（問題DB → なければ eiken-bank）・ことば・記録の 級。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PIERS, preparePier, setPierQuestions, pierStock, pierInfo, PierError } from '../src/game/eiken-pier.js';
import { FW, answer } from '../src/game/fishworld.js';
import { gradeOfEvent } from '../src/game/roadmap.js';

test('6 つの つり場が main_island.json と 部屋の 両方に ある', () => {
  const spots = JSON.parse(readFileSync(new URL('../../client/dist/main_island.json', import.meta.url), 'utf8')).island.spots.filter((s) => s.kind === 'eiken_pier');
  assert.deepEqual(spots.map((s) => s.id).sort(), PIERS.map((p) => p.id).sort());
  for (const p of PIERS) assert.ok(FW.spotById.get(p.id), `${p.id} is a fishing spot of the room`);
  assert.equal(pierInfo('pier_g3').grade, '英検3級');
});

test('問題：英検の 形と ことばを まぜる。答えは ページに 出ない 形で、判定は つり島と 同じ', () => {
  let form = 0; let word = 0;
  for (let i = 0; i < 60; i += 1) {
    const q = preparePier('pier_g5');
    assert.equal(q.grade, 'g5');
    assert.equal(q.zone, 1);
    if (q.eiken) form += 1; else word += 1;
    assert.equal(answer(q, q.fmt.answer).correct, true);
  }
  assert.ok(form > 5 && word > 5, `${form} / ${word}`);
  // 準2・2級は ことばだけ（問題DB が 空の とき）、準1級は 問題DB に 入れるまで「じゅんび ちゅう」
  assert.equal(preparePier('pier_g2').eiken, false);
  assert.throws(() => preparePier('pier_gp1'), PierError);
});

test('問題DB の その級の よむ 問題が 入ると そちらを 出す（長すぎる 文・答えの ない 選択肢は のぞく）', () => {
  const n = setPierQuestions([
    { id: 'Q1', grade: '準1級以上', skill: 'reading', question: 'The project was ( ) because of the storm.', choices: ['postponed', 'polished', 'pronounced', 'protected'], answer: 'postponed' },
    { id: 'Q2', grade: '準1級以上', skill: 'reading', question: 'x'.repeat(300), choices: ['a', 'b'], answer: 'a' },
    { id: 'Q3', grade: '準1級以上', skill: 'reading', question: 'Pick one.', choices: ['a', 'b'], answer: 'c' },
    { id: 'Q4', grade: '準1級以上', skill: 'listening', question: 'What?', choices: ['a', 'b'], answer: 'a' },
  ]);
  assert.equal(n.gp1, 1);
  assert.equal(pierStock('pier_gp1').fromQbank, true);
  const q = preparePier('pier_gp1');
  assert.equal(q.eiken, true);
  assert.equal(q.qbank, 'Q1');
  assert.equal(q.word, 'postponed', 'a one-word answer also counts toward the roadmap words');
  setPierQuestions([]);
});

test('記録の 級：つり場の 答えは その つり場の 級に 数える（ロードマップ・合格見込み）', () => {
  assert.equal(gradeOfEvent({ world: 'fishing', data: { zone: 3, grade: 'gp2', word: 'opportunity' } }), 'gp2');
});
