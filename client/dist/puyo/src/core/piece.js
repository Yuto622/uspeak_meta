import { ORIENTATION_OFFSETS, UP, RIGHT, DOWN, LEFT, SPAWN_COL, SPAWN_ROW } from './constants.js';

/**
 * The controllable pair: an axis puyo the player positions, and a child puyo
 * that orbits it.
 *
 * `y` is fractional while the pair is in the air; `Math.floor(y)` is the row
 * the pair actually occupies for collision purposes.
 */
export class Piece {
  /**
   * @param {import('./board.js').Cell} axis
   * @param {import('./board.js').Cell} child
   */
  constructor(axis, child, { x = SPAWN_COL, y = SPAWN_ROW, orientation = UP } = {}) {
    this.axis = axis;
    this.child = child;
    this.x = x;
    this.y = y;
    this.orientation = orientation;
    /** Visual-only: interpolates the child while a rotation plays out. */
    this.rotationProgress = 1;
    this.rotationFrom = orientation;
  }

  /** Integer row the pair collides on. */
  get row() {
    return Math.floor(this.y);
  }

  /** @returns {{x: number, y: number}} child square for a given state. */
  static childOf(x, row, orientation) {
    const offset = ORIENTATION_OFFSETS[orientation];
    return { x: x + offset.x, y: row + offset.y };
  }

  /** @returns {{x: number, y: number}} the child's current square. */
  childCell() {
    return Piece.childOf(this.x, this.row, this.orientation);
  }

  /** @returns {{x: number, y: number}[]} both squares, axis first. */
  cells() {
    return [{ x: this.x, y: this.row }, this.childCell()];
  }

  /**
   * True when the pair can sit at this position without overlapping anything.
   * @param {import('./board.js').Board} board
   */
  static fits(board, x, row, orientation) {
    const child = Piece.childOf(x, row, orientation);
    return board.isFree(x, row) && board.isFree(child.x, child.y);
  }

  /** @param {import('./board.js').Board} board */
  fitsAt(board, x = this.x, row = this.row, orientation = this.orientation) {
    return Piece.fits(board, x, row, orientation);
  }

  /**
   * Shifts the pair sideways.
   * @param {import('./board.js').Board} board
   * @param {number} direction -1 or +1
   * @returns {boolean} whether the move happened
   */
  move(board, direction) {
    if (!this.fitsAt(board, this.x + direction, this.row, this.orientation)) return false;
    this.x += direction;
    return true;
  }

  /**
   * Rotates, applying the kicks the real game uses:
   *  - into a side wall or a stack: shove the pair the other way
   *  - into the floor: lift the pair one row (floor kick)
   *  - both sides blocked: quick turn, a 180 degree flip in place
   *
   * @param {import('./board.js').Board} board
   * @param {number} direction +1 clockwise, -1 counter-clockwise
   * @returns {'rotate'|'kick'|'quickturn'|null} what happened, or null
   */
  rotate(board, direction) {
    const from = this.orientation;
    const target = (from + (direction > 0 ? 1 : 3)) % 4;
    const row = this.row;

    if (Piece.fits(board, this.x, row, target)) {
      this.#applyRotation(target);
      return 'rotate';
    }

    // Kick away from whatever the child would have rotated into.
    const kicks = {
      [RIGHT]: { dx: -1, dy: 0 },
      [LEFT]: { dx: 1, dy: 0 },
      [DOWN]: { dx: 0, dy: 1 },
      [UP]: { dx: 0, dy: -1 },
    };
    const kick = kicks[target];
    if (kick && Piece.fits(board, this.x + kick.dx, row + kick.dy, target)) {
      this.x += kick.dx;
      this.y += kick.dy;
      this.#applyRotation(target);
      return 'kick';
    }

    // Quick turn: standing upright in a one-wide gap, a rotation flips the
    // pair end over end without needing the squares beside it.
    if ((from === UP || from === DOWN) && this.#sidesBlocked(board, row)) {
      const flipped = from === UP ? DOWN : UP;
      const newRow = from === UP ? row + 1 : row - 1;
      if (Piece.fits(board, this.x, newRow, flipped)) {
        this.y += from === UP ? 1 : -1;
        this.#applyRotation(flipped);
        return 'quickturn';
      }
    }

    return null;
  }

  /** True when both squares beside the axis are walls or occupied. */
  #sidesBlocked(board, row) {
    return !board.isFree(this.x - 1, row) && !board.isFree(this.x + 1, row);
  }

  #applyRotation(orientation) {
    this.rotationFrom = this.orientation;
    this.orientation = orientation;
    this.rotationProgress = 0;
  }

  /** Swaps which puyo is the axis, as the 180 flip does visually. */
  swap() {
    const { axis } = this;
    this.axis = this.child;
    this.child = axis;
  }

  /**
   * How far the pair can fall before something stops it.
   * @param {import('./board.js').Board} board
   * @returns {number} rows
   */
  dropDistance(board) {
    let distance = 0;
    while (Piece.fits(board, this.x, this.row - distance - 1, this.orientation)) {
      distance += 1;
    }
    return distance;
  }

  /** True when the pair is resting on the floor or another puyo. */
  isGrounded(board) {
    return !Piece.fits(board, this.x, this.row - 1, this.orientation);
  }

  /**
   * Writes both puyos into the board.  They may end up floating (a sideways
   * pair half-hanging off a stack); `Board#applyGravity` settles that.
   *
   * @param {import('./board.js').Board} board
   * @returns {{x: number, y: number}[]} the squares written to
   */
  lockInto(board) {
    const [axisCell, childCell] = this.cells();
    const written = [];
    // Place the lower puyo first so a vertical pair cannot overwrite itself.
    const placements = axisCell.y <= childCell.y
      ? [{ at: axisCell, cell: this.axis }, { at: childCell, cell: this.child }]
      : [{ at: childCell, cell: this.child }, { at: axisCell, cell: this.axis }];
    for (const { at, cell } of placements) {
      if (!board.inBounds(at.x, at.y)) continue;
      board.set(at.x, at.y, cell);
      written.push(at);
    }
    return written;
  }
}
