// XP and levels — the spine every other feature hangs off.
//
// The curve is Roblox's, kept exactly so a child who played there does not find their
// progress re-scaled: reaching the next level costs `20 + level * 10`. Level 1 to 2 is
// 30, 2 to 3 is 40, and so on. Total XP is never stored; it is derived from level and
// the XP inside the level, which is what the Roblox sheet sync did and why the two
// always agreed.
//
// Every award goes through grantXp. Nothing else may touch xp or level, so there is one
// place to read when a number on a parent's report is questioned.

export const MAX_LEVEL = 999;

export const xpToNext = (level) => 20 + level * 10;

// Σ(20 + 10k) for k = 1..level-1, plus the XP banked inside the current level.
export function totalXp({ level, xp }) {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level || 1)));
  return 20 * (l - 1) + 5 * (l - 1) * l + Math.max(0, Math.floor(xp || 0));
}

export function blankProgress() {
  return { xp: 0, level: 1, chats: 0 };
}

export function sanitizeProgress(raw) {
  const p = blankProgress();
  if (!raw || typeof raw !== 'object') return p;
  const level = Number(raw.level);
  if (Number.isFinite(level)) p.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const xp = Number(raw.xp);
  // XP inside a level can never exceed what that level costs; a stored value that does
  // is corrupt, and clamping is safer than letting it roll into free levels.
  if (Number.isFinite(xp)) p.xp = Math.max(0, Math.min(xpToNext(p.level) - 1, Math.floor(xp)));
  const chats = Number(raw.chats);
  if (Number.isFinite(chats)) p.chats = Math.max(0, Math.min(1e9, Math.floor(chats)));
  return p;
}

// Adds XP in place and rolls as many levels as it earns. Returns what changed, so the
// caller can tell the child about it without recomputing anything.
export function grantXp(progress, amount) {
  const gained = Math.floor(Number(amount) || 0);
  const from = progress.level;
  if (gained <= 0) {
    return { gained: 0, levels: 0, from, level: progress.level, xp: progress.xp, need: xpToNext(progress.level) };
  }
  progress.xp += gained;
  let levels = 0;
  while (progress.level < MAX_LEVEL && progress.xp >= xpToNext(progress.level)) {
    progress.xp -= xpToNext(progress.level);
    progress.level += 1;
    levels += 1;
  }
  if (progress.level >= MAX_LEVEL) progress.xp = Math.min(progress.xp, xpToNext(MAX_LEVEL) - 1);
  return { gained, levels, from, level: progress.level, xp: progress.xp, need: xpToNext(progress.level) };
}

// The rate card, in one place, because "how much is this worth" is a product decision
// that gets revisited. Roblox's tuning is carried over: speaking is worth the most,
// then quizzes, and coins ride alongside XP where Roblox paid both.
//
// The one deliberate difference is `phrase`. Roblox paid 5 XP per chat message, but that
// was a message a child typed. Ours is a preset phrase behind one tap, which would be
// farmable at that rate, so it pays 1. Raise it here if the classroom wants it louder.
export const REWARDS = {
  missionGoal: { xp: 15, coins: 0 },   // an errand goal met by speaking English
  wordQuiz: { xp: 10, coins: 10 },     // the word huts
  lesson: { xp: 10, coins: 0 },        // the island conversation quests
  fishWord: { xp: 10, coins: 0 },      // the word behind a catch; the fish itself pays
  charDex: { xp: 5, coins: 5 },        // first time meeting a character
  phrase: { xp: 1, coins: 0 },         // a tapped preset phrase
};
