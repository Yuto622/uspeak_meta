import { UP, DOWN, RIGHT, LEFT } from './constants.js';

/**
 * Plays a board out to a standstill, off to one side of the real game.
 *
 * The engine resolves chains in steps so they can be animated; this does the
 * same work in one go, which is what the CPU player needs to try a move
 * before committing to it.
 *
 * @param {import('./board.js').Board} board mutated in place
 * @param {{findClears: Function, scoreStep: Function}} rule
 * @returns {{chain: number, score: number, cleared: number, words: string[]}}
 */
export function resolveBoard(board, rule) {
  let chain = 0;
  let score = 0;
  let cleared = 0;
  const words = [];

  board.applyGravity();
  for (;;) {
    const groups = rule.findClears(board);
    if (!groups.length) break;
    chain += 1;

    const unique = new Map();
    for (const group of groups) {
      if (group.word) words.push(group.word);
      for (const cell of group.cells) unique.set(cell.y * board.cols + cell.x, cell);
    }
    for (const cell of board.garbageTouching(unique.values())) {
      unique.set(cell.y * board.cols + cell.x, cell);
    }
    const points = [...unique.values()];

    score += rule.scoreStep({
      groups,
      clearedCount: points.length,
      chain,
      board,
    }).score;
    cleared += points.length;

    board.clearCells(points);
    board.applyGravity();
  }

  return { chain, score, cleared, words };
}

/**
 * Every distinct way a pair can be dropped: six columns, four orientations,
 * minus the ones that would hang off the side.
 *
 * @param {number} cols
 * @returns {{x: number, orientation: number}[]}
 */
export function placements(cols) {
  const options = [];
  for (let x = 0; x < cols; x += 1) {
    for (const orientation of [UP, DOWN, RIGHT, LEFT]) {
      if (orientation === RIGHT && x + 1 >= cols) continue;
      if (orientation === LEFT && x - 1 < 0) continue;
      options.push({ x, orientation });
    }
  }
  return options;
}

/**
 * Drops a pair into a board copy the way the engine would.
 *
 * @param {import('./board.js').Board} board
 * @param {{axis: object, child: object}} pair
 * @param {{x: number, orientation: number}} placement
 * @returns {import('./board.js').Board|null} the new board, or null if it
 *   does not fit
 */
export function applyPlacement(board, pair, { x, orientation }) {
  const copy = board.clone();
  if (orientation === UP || orientation === DOWN) {
    const bottom = copy.dropRow(x);
    if (bottom < 0 || bottom + 1 >= copy.rows) return null;
    const lower = orientation === UP ? pair.axis : pair.child;
    const upper = orientation === UP ? pair.child : pair.axis;
    copy.set(x, bottom, lower);
    copy.set(x, bottom + 1, upper);
    return copy;
  }
  const childX = orientation === RIGHT ? x + 1 : x - 1;
  const axisRow = copy.dropRow(x);
  const childRow = copy.dropRow(childX);
  if (axisRow < 0 || childRow < 0) return null;
  copy.set(x, axisRow, pair.axis);
  copy.set(childX, childRow, pair.child);
  return copy;
}
