import { Board, makeGarbage } from './board.js';
import { Piece } from './piece.js';
import { PairQueue } from './queue.js';
import { Rng } from './rng.js';
import {
  COLS,
  ROWS,
  SPAWN_COL,
  SPAWN_ROW,
  DEATH_COL,
  DEATH_ROW,
  UP,
  TIMING,
  MAX_GARBAGE_PER_DROP,
  ALL_CLEAR_SCORE,
  ALL_CLEAR_GARBAGE,
} from './constants.js';

/** Phases the field moves through.  Only FALLING accepts player input. */
export const PHASE = Object.freeze({
  SPAWNING: 'spawning',
  FALLING: 'falling',
  DROPPING: 'dropping',
  POPPING: 'popping',
  GARBAGE: 'garbage',
  GAME_OVER: 'gameover',
});

/** Pairs placed before the fall speed steps up. */
const PIECES_PER_LEVEL = 20;

/**
 * One player's field: the rules engine both the solo modes and the versus CPU
 * run on.
 *
 * `Game` owns the falling pair, gravity, the chain loop, scoring and nuisance.
 * What counts as a clear is delegated entirely to a rule object
 * (`ColorRule` or `WordRule`), which is how U-SPEAK mode reuses the classic
 * game unchanged.
 */
export class Game {
  /**
   * @param {{
   *   rule: object,
   *   seed?: number,
   *   level?: number,
   *   garbage?: boolean,
   *   onEvent?: (event: object) => void,
   * }} options
   */
  constructor({ rule, seed = Date.now(), level = 1, garbage = false, onEvent = null } = {}) {
    this.rule = rule;
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.board = new Board(COLS, ROWS);
    this.onEvent = onEvent;
    this.garbageEnabled = garbage;

    this.generatePair = rule.createPairGenerator(this.rng);
    this.queue = new PairQueue(this.generatePair, 2);

    /** @type {Piece|null} */
    this.piece = null;
    this.phase = PHASE.SPAWNING;
    this.phaseTimer = 0;

    this.startLevel = level;
    this.level = level;
    this.piecesPlaced = 0;
    this.score = 0;
    this.coins = 0;
    this.chain = 0;
    this.maxChain = 0;
    this.allClears = 0;
    /** @type {{word: string, length: number, chain: number, points: number, common: boolean}[]} */
    this.wordLog = [];

    this.softDropping = false;
    this.lockTimer = 0;
    this.lockResets = 0;

    /** Nuisance waiting to fall on this field. */
    this.incomingGarbage = 0;
    /** Nuisance this field has earned but not yet sent. */
    this.outgoingGarbage = 0;
    this.garbageCarry = 0;
    this.allClearBonusPending = false;

    /** Cells mid-animation, read by the renderer. */
    this.popping = [];
    this.falling = [];
    /** Length of the current fall animation, so the renderer can interpolate. */
    this.dropDuration = 0;
    /** The most recent chain step, for the HUD pop-up. */
    this.lastStep = null;

    this.spawn();
  }

  /** @returns {number} cells per second the pair falls at this level. */
  get fallSpeed() {
    return Math.min(1.1 * 1.135 ** (this.level - 1), 18);
  }

  get isOver() {
    return this.phase === PHASE.GAME_OVER;
  }

  /** @returns {boolean} true when the player may move the pair. */
  get acceptsInput() {
    return this.phase === PHASE.FALLING && this.piece !== null;
  }

  emit(event) {
    if (this.onEvent) this.onEvent(event);
  }

  // -- piece lifecycle ------------------------------------------------------

  spawn() {
    const pair = this.queue.take();
    const piece = new Piece(pair.axis, pair.child, {
      x: SPAWN_COL,
      y: SPAWN_ROW,
      orientation: UP,
    });
    // No room to spawn means the stack reached the top: that is the loss.
    if (!piece.fitsAt(this.board, SPAWN_COL, SPAWN_ROW, UP)) {
      this.piece = null;
      this.gameOver('blocked');
      return;
    }
    this.piece = piece;
    this.phase = PHASE.FALLING;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.emit({ type: 'spawn', piece });
  }

  gameOver(reason) {
    if (this.phase === PHASE.GAME_OVER) return;
    this.phase = PHASE.GAME_OVER;
    this.piece = null;
    this.emit({ type: 'gameover', reason, score: this.score, coins: this.coins });
  }

  // -- player input ---------------------------------------------------------

  /** @param {number} direction -1 left, +1 right */
  move(direction) {
    if (!this.acceptsInput) return false;
    if (!this.piece.move(this.board, direction)) return false;
    this.refreshLockDelay();
    this.emit({ type: 'move' });
    return true;
  }

  /** @param {number} direction +1 clockwise, -1 counter-clockwise */
  rotate(direction) {
    if (!this.acceptsInput) return false;
    const result = this.piece.rotate(this.board, direction);
    if (!result) return false;
    if (result === 'quickturn') this.piece.swap();
    this.refreshLockDelay();
    this.emit({ type: 'rotate', kind: result });
    return true;
  }

  /** @param {boolean} active */
  setSoftDrop(active) {
    this.softDropping = active;
  }

  /** Slams the pair down and locks it on the spot. */
  hardDrop() {
    if (!this.acceptsInput) return false;
    const distance = this.piece.dropDistance(this.board);
    this.piece.y = this.piece.row - distance;
    this.lockPiece();
    return true;
  }

  /** Grounded pieces get a grace period, but it cannot be renewed forever. */
  refreshLockDelay() {
    if (this.lockResets >= TIMING.maxLockResets) return;
    if (this.piece && this.piece.isGrounded(this.board)) {
      this.lockTimer = 0;
      this.lockResets += 1;
    }
  }

  // -- simulation -----------------------------------------------------------

  /** @param {number} dt seconds since the previous update */
  update(dt) {
    if (this.phase === PHASE.GAME_OVER) return;
    switch (this.phase) {
      case PHASE.FALLING:
        this.updateFalling(dt);
        break;
      case PHASE.DROPPING:
        this.updateDropping(dt);
        break;
      case PHASE.POPPING:
        this.updatePopping(dt);
        break;
      case PHASE.GARBAGE:
        this.updateGarbage(dt);
        break;
      case PHASE.SPAWNING:
        this.phaseTimer -= dt;
        if (this.phaseTimer <= 0) this.spawn();
        break;
      default:
        break;
    }
    if (this.piece && this.piece.rotationProgress < 1) {
      this.piece.rotationProgress = Math.min(
        1,
        this.piece.rotationProgress + dt / TIMING.rotateTime,
      );
    }
  }

  updateFalling(dt) {
    const piece = this.piece;
    if (!piece) return;
    const speed = this.softDropping ? TIMING.softDropSpeed : this.fallSpeed;
    const floorRow = piece.row - piece.dropDistance(this.board);
    piece.y = Math.max(floorRow, piece.y - speed * dt);

    if (piece.y <= floorRow + 1e-6) {
      piece.y = floorRow;
      this.lockTimer += dt;
      const limit = this.softDropping ? 0.05 : TIMING.lockDelay;
      if (this.lockTimer >= limit) this.lockPiece();
    } else {
      this.lockTimer = 0;
    }
  }

  lockPiece() {
    const piece = this.piece;
    if (!piece) return;
    piece.lockInto(this.board);
    this.piece = null;
    this.piecesPlaced += 1;
    const level = this.startLevel + Math.floor(this.piecesPlaced / PIECES_PER_LEVEL);
    if (level !== this.level) {
      this.level = level;
      this.emit({ type: 'levelup', level });
    }
    this.chain = 0;
    this.emit({ type: 'lock' });
    this.beginSettle();
  }

  /** Runs gravity; animates if anything actually moved. */
  beginSettle() {
    const moves = this.board.applyGravity();
    if (moves.length) {
      this.falling = moves;
      const distance = moves.reduce((max, move) => Math.max(max, move.from.y - move.to.y), 1);
      this.phase = PHASE.DROPPING;
      this.phaseTimer = distance / TIMING.chainDropSpeed + TIMING.chainPause;
      this.dropDuration = this.phaseTimer;
      return;
    }
    this.falling = [];
    this.resolveClears();
  }

  updateDropping(dt) {
    this.phaseTimer -= dt;
    if (this.phaseTimer > 0) return;
    this.falling = [];
    this.resolveClears();
  }

  /** Looks for clears; pops them, or ends the turn if there are none. */
  resolveClears() {
    const groups = this.rule.findClears(this.board);
    if (!groups.length) {
      this.endTurn();
      return;
    }

    this.chain += 1;
    this.maxChain = Math.max(this.maxChain, this.chain);

    const unique = new Map();
    for (const group of groups) {
      for (const cell of group.cells) unique.set(cell.y * this.board.cols + cell.x, cell);
    }
    for (const cell of this.board.garbageTouching(unique.values())) {
      unique.set(cell.y * this.board.cols + cell.x, cell);
    }
    const cleared = [...unique.values()];

    const step = this.rule.scoreStep({
      groups,
      clearedCount: cleared.length,
      chain: this.chain,
      board: this.board,
    });
    this.score += step.score;
    this.coins += step.coins || 0;
    this.lastStep = { ...step, chain: this.chain, groups };

    for (const group of groups) {
      if (!group.word) continue;
      this.wordLog.push({
        word: group.word,
        length: group.size,
        chain: this.chain,
        points: this.rule.baseValue ? this.rule.baseValue(group.word) : 0,
        common: Boolean(group.common),
      });
    }

    if (this.garbageEnabled) {
      const { garbage, carry } = this.rule.garbageFor(step.score, this.garbageCarry);
      this.garbageCarry = carry;
      this.addOutgoing(garbage);
    }

    this.popping = cleared.map((cell) => ({
      ...cell,
      cell: this.board.get(cell.x, cell.y),
    }));
    this.phase = PHASE.POPPING;
    this.phaseTimer = TIMING.popTime;
    this.emit({ type: 'pop', chain: this.chain, groups, step, cleared });
  }

  updatePopping(dt) {
    this.phaseTimer -= dt;
    if (this.phaseTimer > 0) return;
    this.board.clearCells(this.popping);
    this.popping = [];
    if (this.board.isClear()) {
      this.allClears += 1;
      this.score += ALL_CLEAR_SCORE;
      if (this.garbageEnabled) this.allClearBonusPending = true;
      this.emit({ type: 'allclear', count: this.allClears });
    }
    this.beginSettle();
  }

  /** Chain is over: settle nuisance, then bring in the next pair. */
  endTurn() {
    if (this.chain > 0) {
      // Cancel first, then hand over what is left: a chain has to be able to
      // wipe out nuisance that arrived while it was still resolving, which is
      // the whole point of offsetting.
      this.cancelIncoming();
      this.emit({ type: 'chainend', chain: this.chain });
    }

    if (this.board.get(DEATH_COL, DEATH_ROW)) {
      this.gameOver('topout');
      return;
    }

    if (this.incomingGarbage > 0) {
      this.dropGarbage();
      return;
    }
    this.phase = PHASE.SPAWNING;
    this.phaseTimer = TIMING.spawnDelay;
  }

  // -- nuisance -------------------------------------------------------------

  /** Earned nuisance, plus the all-clear bonus when one is owed. */
  addOutgoing(amount) {
    if (amount <= 0) return;
    let total = amount;
    if (this.allClearBonusPending) {
      total += ALL_CLEAR_GARBAGE;
      this.allClearBonusPending = false;
    }
    this.outgoingGarbage += total;
  }

  /**
   * Spends this field's unsent nuisance on cancelling whatever is queued to
   * fall on it.
   *
   * @returns {number} how much was cancelled
   */
  cancelIncoming() {
    const offset = Math.min(this.outgoingGarbage, this.incomingGarbage);
    this.outgoingGarbage -= offset;
    this.incomingGarbage -= offset;
    return offset;
  }

  /**
   * Takes nuisance sent by the opponent, cancelling it against anything this
   * field is holding -- the offsetting rule from versus play.
   *
   * @param {number} amount
   * @returns {number} how much actually landed on this field
   */
  receiveGarbage(amount) {
    if (amount <= 0) return 0;
    const offset = Math.min(this.outgoingGarbage, amount);
    this.outgoingGarbage -= offset;
    const landed = amount - offset;
    this.incomingGarbage += landed;
    return landed;
  }

  /** @returns {number} nuisance to hand the opponent, clearing the buffer. */
  flushOutgoing() {
    const amount = this.outgoingGarbage;
    this.outgoingGarbage = 0;
    return amount;
  }

  /** Rains up to five rows of nuisance, full rows first then a ragged one. */
  dropGarbage() {
    const amount = Math.min(this.incomingGarbage, MAX_GARBAGE_PER_DROP);
    this.incomingGarbage -= amount;

    const perColumn = new Array(this.board.cols).fill(Math.floor(amount / this.board.cols));
    let remainder = amount % this.board.cols;
    const columns = this.rng.shuffle([...Array(this.board.cols).keys()]);
    for (let i = 0; i < remainder; i += 1) perColumn[columns[i]] += 1;

    let placed = 0;
    for (let x = 0; x < this.board.cols; x += 1) {
      for (let i = 0; i < perColumn[x]; i += 1) {
        const y = this.board.dropRow(x);
        if (y < 0) break;
        this.board.set(x, y, makeGarbage());
        placed += 1;
      }
    }

    this.emit({ type: 'garbage', amount: placed });
    this.phase = PHASE.GARBAGE;
    this.phaseTimer = 0.22;
  }

  updateGarbage(dt) {
    this.phaseTimer -= dt;
    if (this.phaseTimer > 0) return;
    this.board.applyGravity();
    if (this.board.get(DEATH_COL, DEATH_ROW)) {
      this.gameOver('buried');
      return;
    }
    this.phase = PHASE.SPAWNING;
    this.phaseTimer = TIMING.spawnDelay;
  }

  // -- read-only views ------------------------------------------------------

  /** @returns {object[]} the upcoming pairs for the preview panel. */
  preview() {
    return this.queue.preview();
  }

  /** @returns {object} everything the HUD needs. */
  stats() {
    return {
      score: this.score,
      coins: this.coins,
      chain: this.chain,
      maxChain: this.maxChain,
      level: this.level,
      allClears: this.allClears,
      pieces: this.piecesPlaced,
      words: this.wordLog.length,
      incoming: this.incomingGarbage,
      outgoing: this.outgoingGarbage,
    };
  }
}
