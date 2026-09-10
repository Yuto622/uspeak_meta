// The calendar layer: the day boundary, the streak, the weekly board and the season.
// Every one of these is a rule about time, so every test here fixes the clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayIndex, weekIndex, daysLeftInWeek, claimLogin, blankLogin, sanitizeLogin,
  sanitizeWeek, addWeekXp, blankWeek, seasonFor, LOGIN_REWARDS, CYCLE, RESET_HOUR_JST,
} from '../src/game/daily.js';

// A moment written in Japan time, which is the only time this layer thinks in.
const jst = (iso) => Date.parse(`${iso}+09:00`);

test('the day turns at noon in Japan, not at midnight', () => {
  assert.equal(RESET_HOUR_JST, 12);
  // A morning lesson and the afternoon that follows it are the same day...
  assert.equal(dayIndex(jst('2026-04-20T08:00:00')), dayIndex(jst('2026-04-20T11:59:59')));
  // ...and noon starts the next one.
  assert.equal(dayIndex(jst('2026-04-20T12:00:00')), dayIndex(jst('2026-04-20T11:59:59')) + 1);
  // Midnight, where a naive boundary would sit, changes nothing.
  assert.equal(dayIndex(jst('2026-04-20T12:00:00')), dayIndex(jst('2026-04-21T00:00:00')));
});

test('the streak counts consecutive days and pays the cycle in order', () => {
  const login = blankLogin();
  const day1 = claimLogin(login, jst('2026-04-20T13:00:00'));
  assert.deepEqual(day1, { day: 1, streak: 1, coins: LOGIN_REWARDS[0] });
  // Twice in one day pays once.
  assert.equal(claimLogin(login, jst('2026-04-20T20:00:00')), null);
  // Still the same day at 11:59 the next morning, before the noon reset.
  assert.equal(claimLogin(login, jst('2026-04-21T11:59:00')), null);
  const day2 = claimLogin(login, jst('2026-04-21T12:30:00'));
  assert.deepEqual(day2, { day: 2, streak: 2, coins: LOGIN_REWARDS[1] });
});

test('a missed day starts the run over, and a full run wraps to day 1', () => {
  const login = blankLogin();
  let last = null;
  for (let i = 0; i < CYCLE; i += 1) last = claimLogin(login, jst('2026-04-20T13:00:00') + i * 86400000);
  assert.deepEqual(last, { day: CYCLE, streak: CYCLE, coins: LOGIN_REWARDS[CYCLE - 1] });
  // The eighth day in a row is day 1 of the next cycle, but the streak keeps counting.
  const wrapped = claimLogin(login, jst('2026-04-20T13:00:00') + CYCLE * 86400000);
  assert.deepEqual(wrapped, { day: 1, streak: CYCLE + 1, coins: LOGIN_REWARDS[0] });
  // Skip a day and the run is broken: back to day 1 with a streak of 1.
  const broken = claimLogin(login, jst('2026-04-20T13:00:00') + (CYCLE + 3) * 86400000);
  assert.deepEqual(broken, { day: 1, streak: 1, coins: LOGIN_REWARDS[0] });
});

test('a stored login is not trusted further than it can be checked', () => {
  assert.deepEqual(sanitizeLogin(null), { day: 0, streak: 0 });
  assert.deepEqual(sanitizeLogin({ day: '  ', streak: -4 }), { day: 0, streak: 0 });
  assert.deepEqual(sanitizeLogin({ day: 20705.9, streak: 1e12 }), { day: 20705, streak: 100000 });
});

test("last week's total is not this week's", () => {
  const now = jst('2026-04-20T13:00:00');
  const key = weekIndex(now);
  assert.deepEqual(sanitizeWeek({ key, xp: 40 }, now), { key, xp: 40 });
  assert.deepEqual(sanitizeWeek({ key: key - 1, xp: 9999 }, now), { key, xp: 0 });
  assert.deepEqual(sanitizeWeek({ key, xp: 'lots' }, now), { key, xp: 0 });
});

test('the weekly total rolls over on its own when the week turns', () => {
  const now = jst('2026-04-20T13:00:00');
  const week = blankWeek(now);
  addWeekXp(week, 10, now);
  addWeekXp(week, 5, now);
  assert.equal(week.xp, 15);
  // Nothing resets it explicitly; the next week simply is not the same key.
  const later = now + 8 * 86400000;
  addWeekXp(week, 7, later);
  assert.deepEqual(week, { key: weekIndex(later), xp: 7 });
  // Negatives and rubbish never move the total.
  addWeekXp(week, -100, later); addWeekXp(week, undefined, later);
  assert.equal(week.xp, 7);
});

test('a week is seven days long and counts down to its end', () => {
  const now = jst('2026-04-20T13:00:00');
  const left = daysLeftInWeek(now);
  assert.ok(left >= 1 && left <= 7, `daysLeft=${left}`);
  // Every day up to the last one is still this week; the day after it is the next.
  assert.equal(weekIndex(now + (left - 1) * 86400000), weekIndex(now));
  assert.equal(daysLeftInWeek(now + (left - 1) * 86400000), 1);
  assert.equal(weekIndex(now + left * 86400000), weekIndex(now) + 1);
  assert.equal(daysLeftInWeek(now + left * 86400000), 7);
});

test('the season follows the Japanese month', () => {
  assert.equal(seasonFor(jst('2026-03-01T09:00:00')).id, 'spring');
  assert.equal(seasonFor(jst('2026-05-31T23:00:00')).id, 'spring');
  assert.equal(seasonFor(jst('2026-07-15T12:00:00')).id, 'summer');
  assert.equal(seasonFor(jst('2026-10-01T00:00:00')).id, 'autumn');
  assert.equal(seasonFor(jst('2026-12-31T23:59:00')).id, 'winter');
  assert.equal(seasonFor(jst('2026-02-01T00:00:00')).id, 'winter');
  // The boundary is JST: 8am UTC on the 1st of March is already March in Japan.
  assert.equal(seasonFor(Date.parse('2026-02-28T16:00:00Z')).id, 'spring');
});
