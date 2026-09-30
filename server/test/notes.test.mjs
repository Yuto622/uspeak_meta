// 先生のメモと声かけ。**保護者に出るかどうか**（share）と、**声かけの結果の数え方**を測る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText, sanitizeNotes, addNote, removeNote, sharedNotes, lastCall, callOutcome, classCallOutcomes,
  MAX_NOTES, MAX_TEXT, FOLLOW_DAYS,
} from '../src/game/notes.js';

const NOW = Date.parse('2026-09-20T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

test('書いた文字は変えず、制御文字と長すぎる分だけ落とす', () => {
  assert.equal(cleanText('  <b>がんばった</b>\u0000‮  '), '<b>がんばった</b>');
  assert.equal(cleanText('a\n\n\n\nb'), 'a\n\nb');
  assert.equal(cleanText('あ'.repeat(900)).length, MAX_TEXT);
});

test('所見は既定で保護者に出さない。share を付けたものだけ、新しい順に3つ', () => {
  const notes = [];
  addNote(notes, { text: '発音がよい', now: NOW - 4 * DAY });
  addNote(notes, { text: 'ご家庭でも音読を', share: true, now: NOW - 3 * DAY });
  addNote(notes, { text: '二つ目', share: true, now: NOW - 2 * DAY });
  addNote(notes, { text: '三つ目', share: true, now: NOW - 1 * DAY });
  addNote(notes, { text: '四つ目', share: true, now: NOW });
  assert.equal(addNote(notes, { text: '   ' }), null, '空の所見は残さない');
  assert.deepEqual(sharedNotes(notes).map((n) => n.text), ['四つ目', '三つ目', '二つ目']);
  assert.ok(!sharedNotes(notes, 10).some((n) => n.text === '発音がよい'));
  // 声かけに share は付かない（保護者に「声をかけました」とは出さない）。
  const call = addNote(notes, { kind: 'call', text: '25日 来ていません', share: true, now: NOW });
  assert.equal(call.share, false);
  assert.equal(lastCall(notes).id, call.id);
  assert.equal(removeNote(notes, call.id), true);
  assert.equal(lastCall(notes), null);
});

test('多すぎたら古いほうから落とし、壊れた保存は捨てる', () => {
  const notes = [];
  for (let i = 0; i < MAX_NOTES + 5; i += 1) addNote(notes, { text: `n${i}`, now: NOW + i });
  assert.equal(notes.length, MAX_NOTES);
  assert.equal(notes[0].text, 'n5');
  assert.deepEqual(sanitizeNotes('x'), []);
  assert.deepEqual(sanitizeNotes([{ kind: 'nope', at: new Date(NOW).toISOString(), text: 'a' }, { kind: 'note', at: 'bad', text: 'a' }]), []);
  const back = sanitizeNotes(JSON.stringify(notes));
  assert.equal(back.length, MAX_NOTES);
  assert.equal(back.at(-1).text, `n${MAX_NOTES + 4}`);
});

test('声かけの結果：翌日から14日のうちに来たら「戻った」', () => {
  const at = new Date(Date.parse('2026-09-01T03:00:00Z')).toISOString();
  const months = { '2026-09': { days: ['2026-09-01', '2026-09-05'] } };
  assert.deepEqual(callOutcome({ at }, months, { now: NOW }), { result: 'back', after: 4 });
  // 声をかけた当日の分は数えない（その日にもう来ていた子を「戻った」にしない）。
  assert.equal(callOutcome({ at }, { '2026-09': { days: ['2026-09-01'] } }, { now: NOW }).result, 'away');
  // まだ14日たっていない。
  const recent = new Date(NOW - 3 * DAY).toISOString();
  assert.equal(callOutcome({ at: recent }, {}, { now: NOW }).result, 'waiting');
  // 月をまたいでも数える。
  const late = new Date(Date.parse('2026-08-28T03:00:00Z')).toISOString();
  assert.equal(callOutcome({ at: late }, { '2026-09': { days: ['2026-09-03'] } }, { now: NOW }).after, 6);
  assert.equal(FOLLOW_DAYS, 14);
});

test('教室のまとめは、先生と引っ越した記録と、古い声かけを入れない', () => {
  const call = (daysAgo) => ({ id: `c${daysAgo}`, kind: 'call', at: new Date(NOW - daysAgo * DAY).toISOString(), text: 'x' });
  const records = [
    { name: 'A', notes: [call(20)], months: { '2026-09': { days: ['2026-09-05'] } } },
    { name: 'B', notes: [call(20)], months: {} },
    { name: 'C', notes: [call(2)], months: {} },
    { name: 'D', notes: [call(200)], months: {} },
    { name: 'T', role: 'teacher', notes: [call(20)] },
    { name: 'M', moved_to: 'x', notes: [call(20)] },
  ];
  const r = classCallOutcomes(records, { now: NOW });
  assert.equal(r.total, 3);
  assert.equal(r.back, 1);
  assert.equal(r.away, 1);
  assert.equal(r.waiting, 1);
});
