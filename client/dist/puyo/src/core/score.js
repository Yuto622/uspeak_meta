/**
 * Puyo Puyo Tsu scoring.
 *
 *   step score = (10 x puyos cleared) x multiplier
 *   multiplier = chain power + colour bonus + sum of group bonuses
 *
 * The multiplier is clamped to [1, 999]: a single-group first chain has a
 * multiplier of 0 before clamping, which is why a 4-puyo pop is worth 40.
 */

/** Chain power by chain number (index 0 is the 1st chain). */
export const CHAIN_POWER = Object.freeze([
  0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416,
  448, 480, 512, 544, 576, 608, 640, 672,
]);

/** Bonus for clearing several colours in one step, by colour count. */
export const COLOR_BONUS = Object.freeze([0, 0, 3, 6, 12, 24]);

/** Bonus for an oversized group, by group size. */
export const GROUP_BONUS = Object.freeze({
  4: 0, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6, 10: 7,
});
/** Every group of 11 or more scores this. */
export const GROUP_BONUS_MAX = 10;

export const MULTIPLIER_MIN = 1;
export const MULTIPLIER_MAX = 999;

/** @param {number} chain 1-based chain number */
export function chainPower(chain) {
  if (chain <= 0) return 0;
  const index = Math.min(chain - 1, CHAIN_POWER.length - 1);
  const base = CHAIN_POWER[index];
  if (chain - 1 < CHAIN_POWER.length) return base;
  // Beyond the table the real game keeps adding 32 per chain.
  return base + (chain - CHAIN_POWER.length) * 32;
}

/** @param {number} colors distinct colours cleared this step */
export function colorBonus(colors) {
  if (colors <= 1) return 0;
  return COLOR_BONUS[Math.min(colors, COLOR_BONUS.length - 1)];
}

/** @param {number} size puyos in one group */
export function groupBonus(size) {
  if (size < 4) return 0;
  if (size >= 11) return GROUP_BONUS_MAX;
  return GROUP_BONUS[size];
}

/**
 * Scores one step of a chain.
 *
 * @param {{ size: number, color: number }[]} groups groups popped this step
 * @param {number} chain 1-based chain number
 * @param {number} clearedCount puyos removed, garbage included
 * @returns {{ score: number, multiplier: number, cleared: number }}
 */
export function scoreStep(groups, chain, clearedCount) {
  const colors = new Set(groups.map((group) => group.color)).size;
  const bonus = groups.reduce((total, group) => total + groupBonus(group.size), 0);
  const raw = chainPower(chain) + colorBonus(colors) + bonus;
  const multiplier = Math.min(MULTIPLIER_MAX, Math.max(MULTIPLIER_MIN, raw));
  return { score: 10 * clearedCount * multiplier, multiplier, cleared: clearedCount };
}

/**
 * Converts chain score into nuisance puyos, carrying the remainder like the
 * real game does so nothing is lost to rounding.
 *
 * @param {number} score points earned
 * @param {number} carry leftover points from earlier steps
 * @param {number} rate points per garbage puyo
 */
export function scoreToGarbage(score, carry = 0, rate = 70) {
  const total = score + carry;
  const garbage = Math.floor(total / rate);
  return { garbage, carry: total - garbage * rate };
}
