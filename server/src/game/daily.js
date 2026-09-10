// Daily login, the weekly board, and the season — the parts of the world that run on a
// calendar rather than on what a child does.
//
// Ported from Roblox's DailyLogin, WeeklyRank and SeasonManager. Every boundary here is
// Japan time, because that is when the classes are.

const JST_OFFSET_SEC = 9 * 3600;
export const RESET_HOUR_JST = 12;      // Roblox: RESET_HOUR_JST - noon, not midnight,
                                       // so a lesson never straddles the day boundary.
export const LOGIN_REWARDS = [100, 150, 200, 250, 300, 350, 400];
export const CYCLE = LOGIN_REWARDS.length;

// Which day a moment belongs to, counting from noon JST.
export const dayIndex = (now = Date.now()) =>
  Math.floor((Math.floor(now / 1000) + JST_OFFSET_SEC - RESET_HOUR_JST * 3600) / 86400);

// Which week, counting Monday-ish blocks of seven JST days. The exact epoch does not
// matter; that it is stable and shared does.
export const weekIndex = (now = Date.now()) =>
  Math.floor(Math.floor((Math.floor(now / 1000) + JST_OFFSET_SEC) / 86400) / 7);

export function daysLeftInWeek(now = Date.now()) {
  const day = Math.floor((Math.floor(now / 1000) + JST_OFFSET_SEC) / 86400);
  return 7 - (day % 7);
}

export function blankLogin() {
  return { day: 0, streak: 0 };
}

export function sanitizeLogin(raw) {
  const l = blankLogin();
  if (!raw || typeof raw !== 'object') return l;
  const day = Number(raw.day);
  const streak = Number(raw.streak);
  if (Number.isFinite(day) && day > 0) l.day = Math.floor(day);
  if (Number.isFinite(streak) && streak > 0) l.streak = Math.min(100000, Math.floor(streak));
  return l;
}

// Roblox's rule exactly: yesterday continues the run, anything older starts it over, and
// the same day pays nothing. Returns null when there is nothing to claim.
export function claimLogin(login, now = Date.now()) {
  const today = dayIndex(now);
  if (login.day === today) return null;
  login.streak = login.day === today - 1 ? login.streak + 1 : 1;
  login.day = today;
  const dayInCycle = ((login.streak - 1) % CYCLE) + 1;
  return { day: dayInCycle, streak: login.streak, coins: LOGIN_REWARDS[dayInCycle - 1] };
}

export function blankWeek(now = Date.now()) {
  return { key: weekIndex(now), xp: 0 };
}

export function sanitizeWeek(raw, now = Date.now()) {
  const w = blankWeek(now);
  if (!raw || typeof raw !== 'object') return w;
  const key = Number(raw.key);
  const xp = Number(raw.xp);
  // A total from a week that has ended is not this week's total.
  if (Number.isFinite(key) && Math.floor(key) === w.key && Number.isFinite(xp) && xp > 0) {
    w.xp = Math.min(1e9, Math.floor(xp));
  }
  return w;
}

// Adds to this week's total, rolling over on its own when the week turns.
export function addWeekXp(week, amount, now = Date.now()) {
  const key = weekIndex(now);
  if (week.key !== key) { week.key = key; week.xp = 0; }
  week.xp = Math.min(1e9, week.xp + Math.max(0, Math.floor(amount || 0)));
  return week;
}

export const SEASONS = {
  spring: { id: 'spring', ja: 'はる', en: 'Spring', emoji: '🌸' },
  summer: { id: 'summer', ja: 'なつ', en: 'Summer', emoji: '🌻' },
  autumn: { id: 'autumn', ja: 'あき', en: 'Autumn', emoji: '🍁' },
  winter: { id: 'winter', ja: 'ふゆ', en: 'Winter', emoji: '⛄' },
};

// Roblox: 3-5 spring, 6-8 summer, 9-11 autumn, 12-2 winter, by the JST month.
export function seasonFor(now = Date.now()) {
  const jst = new Date(now + JST_OFFSET_SEC * 1000);
  const month = jst.getUTCMonth() + 1;
  if (month >= 3 && month <= 5) return SEASONS.spring;
  if (month >= 6 && month <= 8) return SEASONS.summer;
  if (month >= 9 && month <= 11) return SEASONS.autumn;
  return SEASONS.winter;
}
