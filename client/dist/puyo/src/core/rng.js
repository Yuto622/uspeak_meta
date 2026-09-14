/**
 * Small, fast, seedable PRNG (mulberry32).
 *
 * The whole game is deterministic given a seed, which is what makes the
 * engine tests in tests/ reproducible and lets a replay be described by a
 * single number.
 */
export class Rng {
  /** @param {number} seed */
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** @returns {number} float in [0, 1) */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @returns {number} integer in [0, max) */
  int(max) {
    return Math.floor(this.next() * max);
  }

  /** @template T @param {T[]} items @returns {T} */
  pick(items) {
    return items[this.int(items.length)];
  }

  /** Fisher-Yates, in place. @template T @param {T[]} items @returns {T[]} */
  shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}
