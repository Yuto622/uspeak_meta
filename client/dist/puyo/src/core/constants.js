/**
 * Field geometry and timing, matching Puyo Puyo Tsu as closely as a
 * from-scratch reimplementation reasonably can.
 */

/** Columns in the field. */
export const COLS = 6;
/** Rows the player can see and score in. */
export const VISIBLE_ROWS = 12;
/**
 * Total rows in the array.  Row index 12 is the "13th row": a puyo may rest
 * there, but it never connects and never pops -- same as the real game.
 */
export const ROWS = 13;
/** Row index of the hidden 13th row. */
export const HIDDEN_ROW = VISIBLE_ROWS;

/** Column a new pair spawns in (3rd column, 0-indexed). */
export const SPAWN_COL = 2;
/** Row the axis puyo spawns on.  The child sits one row above, off-field. */
export const SPAWN_ROW = HIDDEN_ROW;
/**
 * The death square.  In Tsu the game ends when the 3rd column of the top
 * visible row is occupied once the board has settled.
 */
export const DEATH_COL = SPAWN_COL;
export const DEATH_ROW = VISIBLE_ROWS - 1;

/** Cell kinds. */
export const CELL_PUYO = 'puyo';
export const CELL_GARBAGE = 'garbage';

/** Orientations: which side of the axis the child puyo sits on. */
export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;

/** @type {ReadonlyArray<{x: number, y: number}>} child offset per orientation */
export const ORIENTATION_OFFSETS = Object.freeze([
  Object.freeze({ x: 0, y: 1 }), // UP
  Object.freeze({ x: 1, y: 0 }), // RIGHT
  Object.freeze({ x: 0, y: -1 }), // DOWN
  Object.freeze({ x: -1, y: 0 }), // LEFT
]);

/** 4-neighbourhood, used for connectivity and for garbage splash. */
export const NEIGHBOURS = Object.freeze([
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: 0, y: -1 }),
]);

/** Timing, in seconds. */
export const TIMING = Object.freeze({
  /** Grounded time before a piece locks.  Refreshed by moving or rotating. */
  lockDelay: 0.5,
  /** Hard cap on lock-delay refreshes, so a piece cannot be stalled forever. */
  maxLockResets: 8,
  /** How long a rotation animation takes. */
  rotateTime: 0.06,
  /** Delayed auto-shift: hold time before a held direction repeats. */
  das: 0.16,
  /** Auto-repeat rate once DAS has charged. */
  arr: 0.035,
  /** Soft drop speed, in cells per second. */
  softDropSpeed: 26,
  /** Rows per second that popped puyos fall while a chain resolves. */
  chainDropSpeed: 32,
  /** How long popped puyos flash before they vanish. */
  popTime: 0.42,
  /** Pause between a group vanishing and the next chain step. */
  chainPause: 0.14,
  /** Pause before the next pair spawns. */
  spawnDelay: 0.1,
});

/** Points of chain score that buy one garbage puyo. */
export const GARBAGE_RATE = 70;
/** Maximum garbage puyos dropped in a single turn (5 rows of 6). */
export const MAX_GARBAGE_PER_DROP = COLS * 5;
/**
 * Score awarded for clearing the whole field.  This is a solo-play bonus: it
 * is deliberately kept out of the garbage conversion, because in Tsu an all
 * clear attacks through the +30 nuisance below, not through its score.
 */
export const ALL_CLEAR_SCORE = 2100;
/** Garbage an all clear adds to your next attack, as in Tsu. */
export const ALL_CLEAR_GARBAGE = 30;
