import { VISIBLE_ROWS, UP } from './constants.js';
import { resolveBoard, placements, applyPlacement } from './simulate.js';
import { PHASE } from './game.js';

/**
 * Weights for the board-shape heuristic.  Tuned by watching the CPU play:
 * it should stack flat and low, avoid burying holes, and keep the spawn
 * column clear.
 */
const WEIGHTS = Object.freeze({
  potential: 900,
  height: 26,
  holes: 170,
  bumpiness: 9,
  spawnColumn: 55,
  wasted: 0.02,
});

/** Difficulty presets: how deep a chain the CPU holds out for, and how fast. */
export const AI_LEVELS = Object.freeze({
  easy: { targetChain: 2, moveInterval: 0.34, lookahead: false, mistakeRate: 0.28 },
  normal: { targetChain: 4, moveInterval: 0.2, lookahead: true, mistakeRate: 0.1 },
  hard: { targetChain: 6, moveInterval: 0.11, lookahead: true, mistakeRate: 0 },
});

/**
 * A CPU player.
 *
 * It drives a `Game` through the same public methods a human's keyboard does:
 * it picks a target column and orientation, then nudges and rotates towards
 * it one input at a time, so its pair moves visibly rather than teleporting.
 */
export class PuyoAi {
  /**
   * @param {import('./game.js').Game} game
   * @param {{level?: keyof AI_LEVELS, rng?: import('./rng.js').Rng}} [options]
   */
  constructor(game, { level = 'normal', rng = null } = {}) {
    this.game = game;
    this.settings = AI_LEVELS[level] || AI_LEVELS.normal;
    this.rng = rng;
    this.plan = null;
    this.timer = 0;
  }

  /** Column heights, holes and bumpiness -- the shape half of the score. */
  static shapeOf(board) {
    const heights = [];
    let holes = 0;
    for (let x = 0; x < board.cols; x += 1) {
      const height = board.columnHeight(x);
      heights.push(height);
      for (let y = 0; y < height; y += 1) {
        if (board.isEmpty(x, y)) holes += 1;
      }
    }
    let bumpiness = 0;
    for (let x = 0; x + 1 < heights.length; x += 1) {
      bumpiness += Math.abs(heights[x] - heights[x + 1]);
    }
    return { heights, holes, bumpiness, maxHeight: Math.max(...heights) };
  }

  /**
   * The best chain this board could set off if one more pair landed well.
   *
   * This is what stops the CPU from cashing in a two-chain the moment it
   * appears: a shape that is one puyo away from a big chain scores highly on
   * its own.
   *
   * @param {import('./board.js').Board} board
   * @param {{axis: object, child: object}} pair the previewed pair
   */
  potentialChain(board, pair) {
    let best = 0;
    for (const placement of placements(board.cols)) {
      const next = applyPlacement(board, pair, placement);
      if (!next) continue;
      const result = resolveBoard(next, this.game.rule);
      if (result.chain > best) best = result.chain;
    }
    return best;
  }

  /**
   * Scores one candidate placement.
   *
   * @returns {number} higher is better
   */
  evaluate(board, chain, score, lookaheadPair) {
    const shape = PuyoAi.shapeOf(board);
    const danger = shape.maxHeight >= VISIBLE_ROWS - 3;
    const target = danger ? 2 : this.settings.targetChain;

    // Big enough to be worth firing: take it, and prefer the bigger one.
    if (chain >= target) return 1e6 + score;

    let value = 0;
    if (lookaheadPair) {
      value += WEIGHTS.potential * this.potentialChain(board, lookaheadPair) ** 1.5;
    }
    value -= WEIGHTS.height * shape.maxHeight ** 1.6;
    value -= WEIGHTS.holes * shape.holes;
    value -= WEIGHTS.bumpiness * shape.bumpiness;
    value -= WEIGHTS.spawnColumn * shape.heights[2];
    // A chain fired below target is points thrown away, but not nothing.
    value += WEIGHTS.wasted * score;
    return value;
  }

  /** Chooses where the current pair should go. */
  decide() {
    const game = this.game;
    if (!game.piece) return null;
    const pair = { axis: game.piece.axis, child: game.piece.child };
    const lookaheadPair = this.settings.lookahead ? game.preview()[0] : null;

    let best = null;
    for (const placement of placements(game.board.cols)) {
      const landed = applyPlacement(game.board, pair, placement);
      if (!landed) continue;
      const outcome = resolveBoard(landed, game.rule);
      const value = this.evaluate(landed, outcome.chain, outcome.score, lookaheadPair);
      if (!best || value > best.value) best = { ...placement, value };
    }

    // A weaker CPU sometimes settles for a merely decent column.
    if (best && this.settings.mistakeRate > 0 && this.rng) {
      if (this.rng.next() < this.settings.mistakeRate) {
        const options = placements(game.board.cols).filter(
          (option) => applyPlacement(game.board, pair, option) !== null,
        );
        if (options.length) return this.rng.pick(options);
      }
    }
    return best;
  }

  /**
   * Steps the CPU.  Call it once per frame alongside `Game#update`.
   * @param {number} dt seconds
   */
  update(dt) {
    const game = this.game;
    if (game.phase !== PHASE.FALLING || !game.piece) {
      this.plan = null;
      return;
    }
    if (!this.plan) {
      this.plan = this.decide() || { x: game.piece.x, orientation: UP };
      this.timer = this.settings.moveInterval;
      return;
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.settings.moveInterval;

    const piece = game.piece;
    if (piece.orientation !== this.plan.orientation) {
      const clockwise = (piece.orientation + 1) % 4 === this.plan.orientation
        || (piece.orientation + 2) % 4 === this.plan.orientation;
      if (!game.rotate(clockwise ? 1 : -1)) game.rotate(clockwise ? -1 : 1);
      return;
    }
    if (piece.x !== this.plan.x) {
      const direction = this.plan.x < piece.x ? -1 : 1;
      if (!game.move(direction)) {
        // Boxed in: re-plan rather than grinding against a wall.
        this.plan = null;
      }
      return;
    }
    game.hardDrop();
    this.plan = null;
  }
}
