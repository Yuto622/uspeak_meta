import { makePuyo } from '../board.js';
import { VISIBLE_ROWS } from '../constants.js';
import { scoreStep, scoreToGarbage } from '../score.js';

/** Puyos of the same colour pop once this many touch. */
export const MIN_GROUP = 4;

/** How many colours the palette offers.  A match uses a subset of these. */
export const PALETTE_SIZE = 5;

/**
 * Classic Puyo Puyo: connect four of a colour and they pop.
 *
 * This is the baseline the U-SPEAK rule is built on -- both plug into the
 * same `Game`, which knows nothing about colours or words.
 */
export class ColorRule {
  /**
   * @param {{colorCount?: number, minGroup?: number}} [options]
   */
  constructor({ colorCount = 4, minGroup = MIN_GROUP } = {}) {
    this.id = 'classic';
    this.name = 'CLASSIC';
    this.colorCount = Math.min(Math.max(colorCount, 3), PALETTE_SIZE);
    this.minGroup = minGroup;
    this.usesLetters = false;
  }

  /**
   * Builds the colour sequence.
   *
   * Like the original, colours come from a shuffled pool rather than
   * independent rolls, so you never get a punishing run of one colour, and
   * the opening pairs are held to three colours to keep the start fair.
   *
   * @param {import('../rng.js').Rng} rng
   */
  createPairGenerator(rng) {
    const palette = rng.shuffle([...Array(PALETTE_SIZE).keys()]).slice(0, this.colorCount);
    const openingColors = palette.slice(0, Math.min(3, palette.length));
    const poolSize = 256;
    let pool = [];
    let cursor = 0;
    let issued = 0;

    const refill = () => {
      pool = [];
      const per = Math.floor(poolSize / palette.length);
      for (const color of palette) {
        for (let i = 0; i < per; i += 1) pool.push(color);
      }
      while (pool.length < poolSize) pool.push(rng.pick(palette));
      rng.shuffle(pool);
      cursor = 0;
    };
    refill();

    const draw = () => {
      if (cursor >= pool.length) refill();
      const color = pool[cursor];
      cursor += 1;
      return color;
    };

    return () => {
      // First three pairs: three colours only.
      const pick = issued < 3 ? () => rng.pick(openingColors) : draw;
      issued += 1;
      return { axis: makePuyo(pick()), child: makePuyo(pick()) };
    };
  }

  /**
   * Finds every group of `minGroup` or more touching puyos of one colour.
   *
   * @param {import('../board.js').Board} board
   * @returns {{cells: {x: number, y: number}[], color: number, size: number}[]}
   */
  findClears(board) {
    const seen = new Set();
    const groups = [];
    for (let y = 0; y < VISIBLE_ROWS; y += 1) {
      for (let x = 0; x < board.cols; x += 1) {
        if (seen.has(y * board.cols + x)) continue;
        const cell = board.get(x, y);
        if (!cell) continue;
        const group = board.connectedGroup(x, y, seen);
        if (group.length >= this.minGroup) {
          groups.push({ cells: group, color: cell.color, size: group.length });
        }
      }
    }
    return groups;
  }

  /**
   * @param {{groups: object[], clearedCount: number, chain: number}} step
   * @returns {{score: number, coins: number, multiplier: number, label: string}}
   */
  scoreStep({ groups, clearedCount, chain }) {
    const result = scoreStep(groups, chain, clearedCount);
    return {
      score: result.score,
      coins: 0,
      multiplier: result.multiplier,
      label: `${chain} CHAIN`,
    };
  }

  /** Chain score becomes nuisance for the opponent at the Tsu rate. */
  garbageFor(score, carry) {
    return scoreToGarbage(score, carry);
  }
}
