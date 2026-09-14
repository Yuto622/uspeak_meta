import {
  COLS,
  ROWS,
  VISIBLE_ROWS,
  HIDDEN_ROW,
  CELL_GARBAGE,
  CELL_PUYO,
  NEIGHBOURS,
} from './constants.js';

let nextCellId = 1;

/**
 * A single occupied square.  Colour drives rendering and classic matching;
 * `letter` is set in U-SPEAK mode and left null in classic mode.
 *
 * @typedef {{ id: number, kind: string, color: number, letter: string|null }} Cell
 */

/**
 * @param {number} color palette index
 * @param {string|null} letter A-Z in U-SPEAK mode
 * @returns {Cell}
 */
export function makePuyo(color, letter = null) {
  return { id: nextCellId++, kind: CELL_PUYO, color, letter };
}

/** @returns {Cell} a nuisance puyo: never connects, never spells anything. */
export function makeGarbage() {
  return { id: nextCellId++, kind: CELL_GARBAGE, color: -1, letter: null };
}

/** Resets id allocation.  Only used by tests that snapshot ids. */
export function resetCellIds() {
  nextCellId = 1;
}

/**
 * The playfield.  Coordinates are (x, y) with x = 0 at the left column and
 * y = 0 at the *bottom* row, so "falling" means y decreasing.
 */
export class Board {
  constructor(cols = COLS, rows = ROWS) {
    this.cols = cols;
    this.rows = rows;
    /** @type {(Cell|null)[]} row-major, index = y * cols + x */
    this.cells = new Array(cols * rows).fill(null);
  }

  /** @returns {boolean} true when (x, y) is inside the array. */
  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  /**
   * True when (x, y) is a square that participates in matching.  The hidden
   * 13th row holds puyos but they never connect or pop.
   */
  isScoringSquare(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < VISIBLE_ROWS;
  }

  /** @returns {Cell|null} */
  get(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.cells[y * this.cols + x];
  }

  /** @param {Cell|null} cell */
  set(x, y, cell) {
    if (!this.inBounds(x, y)) return;
    this.cells[y * this.cols + x] = cell;
  }

  /** True when the square is free for a puyo to occupy. */
  isEmpty(x, y) {
    return this.inBounds(x, y) && this.cells[y * this.cols + x] === null;
  }

  /**
   * True when a falling puyo may occupy (x, y).  Anything below the floor or
   * outside the side walls blocks; anything above the top does not, because a
   * pair spawns partly off-field.
   */
  isFree(x, y) {
    if (x < 0 || x >= this.cols || y < 0) return false;
    if (y >= this.rows) return true;
    return this.cells[y * this.cols + x] === null;
  }

  /** @returns {number} y of the lowest free square in a column, or -1. */
  dropRow(x) {
    for (let y = 0; y < this.rows; y += 1) {
      if (this.isEmpty(x, y)) return y;
    }
    return -1;
  }

  /** @returns {number} number of squares filled in a column. */
  columnHeight(x) {
    for (let y = this.rows - 1; y >= 0; y -= 1) {
      if (!this.isEmpty(x, y)) return y + 1;
    }
    return 0;
  }

  /** @returns {boolean} true when no cell is occupied anywhere. */
  isClear() {
    return this.cells.every((cell) => cell === null);
  }

  /** @returns {number} count of occupied squares. */
  count() {
    let total = 0;
    for (const cell of this.cells) if (cell) total += 1;
    return total;
  }

  /**
   * Settles floating puyos.
   *
   * @returns {{from: {x: number, y: number}, to: {x: number, y: number}, cell: Cell}[]}
   *   every puyo that moved, so the renderer can animate the fall.
   */
  applyGravity() {
    const moves = [];
    for (let x = 0; x < this.cols; x += 1) {
      let write = 0;
      for (let y = 0; y < this.rows; y += 1) {
        const cell = this.get(x, y);
        if (!cell) continue;
        if (y !== write) {
          this.set(x, y, null);
          this.set(x, write, cell);
          moves.push({ from: { x, y }, to: { x, y: write }, cell });
        }
        write += 1;
      }
    }
    return moves;
  }

  /**
   * Flood-fills the group of same-coloured puyos touching (x, y).
   *
   * Garbage never joins a group, and the hidden row is excluded, both as in
   * the real game.
   *
   * @returns {{x: number, y: number}[]}
   */
  connectedGroup(x, y, seen = new Set()) {
    const origin = this.get(x, y);
    if (!origin || origin.kind !== CELL_PUYO) return [];
    if (!this.isScoringSquare(x, y)) return [];

    const group = [];
    const stack = [{ x, y }];
    seen.add(y * this.cols + x);
    while (stack.length) {
      const point = stack.pop();
      group.push(point);
      for (const step of NEIGHBOURS) {
        const nx = point.x + step.x;
        const ny = point.y + step.y;
        const key = ny * this.cols + nx;
        if (seen.has(key)) continue;
        if (!this.isScoringSquare(nx, ny)) continue;
        const cell = this.get(nx, ny);
        if (!cell || cell.kind !== CELL_PUYO || cell.color !== origin.color) continue;
        seen.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
    return group;
  }

  /**
   * Expands a set of popping squares to include the garbage puyos touching
   * them -- nuisance clears when something pops next to it.
   *
   * @param {Iterable<{x: number, y: number}>} points
   * @returns {{x: number, y: number}[]} the garbage squares to clear too
   */
  garbageTouching(points) {
    const found = new Map();
    for (const point of points) {
      for (const step of NEIGHBOURS) {
        const nx = point.x + step.x;
        const ny = point.y + step.y;
        if (!this.isScoringSquare(nx, ny)) continue;
        const cell = this.get(nx, ny);
        if (!cell || cell.kind !== CELL_GARBAGE) continue;
        found.set(ny * this.cols + nx, { x: nx, y: ny });
      }
    }
    return [...found.values()];
  }

  /** Empties the given squares. */
  clearCells(points) {
    for (const { x, y } of points) this.set(x, y, null);
  }

  /** Empties the whole field. */
  reset() {
    this.cells.fill(null);
  }

  /**
   * Copies the field.  Cell objects are shared rather than duplicated: they
   * are never mutated once placed, only moved or removed.
   *
   * @returns {Board}
   */
  clone() {
    const copy = new Board(this.cols, this.rows);
    copy.cells = this.cells.slice();
    return copy;
  }

  /**
   * Reads the field back as one string per row, top row first.  Used by the
   * tests and by the debug overlay.
   *
   * @param {(cell: Cell|null) => string} [format]
   */
  toStrings(format) {
    const render = format || ((cell) => {
      if (!cell) return '.';
      if (cell.kind === CELL_GARBAGE) return 'X';
      if (cell.letter) return cell.letter;
      return String(cell.color);
    });
    const lines = [];
    for (let y = this.rows - 1; y >= 0; y -= 1) {
      let line = '';
      for (let x = 0; x < this.cols; x += 1) line += render(this.get(x, y));
      lines.push(line);
    }
    return lines;
  }

  /**
   * Builds a board from `toStrings` output.  `.` is empty, `X` is garbage,
   * digits are colours and letters are U-SPEAK puyos.
   *
   * A block shorter than the field is anchored to the floor, so a test can
   * describe just the bottom few rows.
   *
   * @param {string[]} lines top row first
   */
  static fromStrings(lines, { cols = COLS, rows = ROWS } = {}) {
    const board = new Board(cols, rows);
    lines.forEach((line, index) => {
      const row = lines.length - 1 - index;
      if (row >= rows) return;
      for (let x = 0; x < line.length && x < cols; x += 1) {
        const char = line[x];
        if (char === '.' || char === ' ') continue;
        if (char === 'X') board.set(x, row, makeGarbage());
        else if (/[0-9]/.test(char)) board.set(x, row, makePuyo(Number(char)));
        else board.set(x, row, makePuyo(0, char.toUpperCase()));
      }
    });
    return board;
  }
}

export { COLS, ROWS, VISIBLE_ROWS, HIDDEN_ROW };
