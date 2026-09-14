import { VISIBLE_ROWS, CELL_GARBAGE, NEIGHBOURS, TIMING } from '../core/constants.js';
import { PHASE } from '../core/game.js';
import { colorAt } from './theme.js';

/** Fraction of a cell the hidden 13th row peeks out by. */
const HIDDEN_STRIP = 0.45;

/**
 * Draws one player's field.
 *
 * Everything the renderer needs it reads off the `Game` each frame -- the
 * board, the falling pair, and whichever animation the engine is in the
 * middle of.  It never mutates game state.
 */
export class FieldRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../core/game.js').Game} game
   * @param {{showGhost?: boolean, showLetters?: boolean}} [options]
   */
  constructor(canvas, game, { showGhost = true, showLetters = false } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.game = game;
    this.showGhost = showGhost;
    this.showLetters = showLetters;
    this.cell = 32;
    this.shake = 0;
    this.resize();
  }

  /** Re-reads the element size and scales the backing store for the display. */
  resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth || this.canvas.width;
    const cols = this.game.board.cols;
    this.cell = width / cols;
    const height = this.cell * (VISIBLE_ROWS + HIDDEN_STRIP);
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;
  }

  /** Kicks off a screen shake, used when a big chain lands. */
  bump(strength = 1) {
    this.shake = Math.min(1.5, this.shake + strength);
  }

  /** @returns {number} canvas x of a column's left edge. */
  screenX(x) {
    return x * this.cell;
  }

  /** @returns {number} canvas y of a row's top edge. */
  screenY(y) {
    return (VISIBLE_ROWS - 1 - y + HIDDEN_STRIP) * this.cell;
  }

  /** @param {number} dt seconds, for the shake decay */
  draw(dt = 0) {
    const ctx = this.context;
    this.shake = Math.max(0, this.shake - dt * 4);

    ctx.save();
    if (this.shake > 0) {
      const amount = this.shake * this.cell * 0.12;
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }

    this.drawBackground();
    this.drawSettled();
    this.drawPiece();
    this.drawHiddenRowVeil();
    if (this.game.isOver) this.drawGameOverVeil();
    ctx.restore();
  }

  drawBackground() {
    const ctx = this.context;
    ctx.clearRect(-20, -20, this.width + 40, this.height + 40);

    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#0f1424');
    gradient.addColorStop(1, '#151b30');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 1; x < this.game.board.cols; x += 1) {
      ctx.beginPath();
      ctx.moveTo(Math.round(this.screenX(x)) + 0.5, 0);
      ctx.lineTo(Math.round(this.screenX(x)) + 0.5, this.height);
      ctx.stroke();
    }
    for (let y = 0; y < VISIBLE_ROWS; y += 1) {
      const py = Math.round(this.screenY(y)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(this.width, py);
      ctx.stroke();
    }

    // The column the next pair drops into, so the death square is obvious.
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(this.screenX(2), 0, this.cell, this.height);
  }

  /**
   * Draws every settled puyo, offset if the engine is mid-fall, and flashing
   * if it is mid-pop.
   */
  drawSettled() {
    const game = this.game;
    const board = game.board;

    /** @type {Map<number, {dx: number, dy: number}>} */
    const offsets = new Map();
    if (game.phase === PHASE.DROPPING && game.dropDuration > 0) {
      const progress = 1 - Math.max(0, game.phaseTimer) / game.dropDuration;
      const eased = Math.min(1, progress * progress * (3 - 2 * progress));
      for (const move of game.falling) {
        offsets.set(move.to.y * board.cols + move.to.x, {
          dx: 0,
          dy: (move.from.y - move.to.y) * (1 - eased) * this.cell,
        });
      }
    }

    const popping = new Map();
    if (game.phase === PHASE.POPPING) {
      const progress = 1 - Math.max(0, game.phaseTimer) / TIMING.popTime;
      for (const point of game.popping) popping.set(point.y * board.cols + point.x, progress);
    }

    for (let y = 0; y < board.rows; y += 1) {
      for (let x = 0; x < board.cols; x += 1) {
        const cell = board.get(x, y);
        if (!cell) continue;
        const key = y * board.cols + x;
        const offset = offsets.get(key);
        const pop = popping.get(key);
        this.drawCell(cell, x, y, {
          dy: offset ? -offset.dy : 0,
          pop,
          connect: !this.showLetters,
        });
      }
    }
  }

  /** The falling pair, plus its landing ghost. */
  drawPiece() {
    const piece = this.game.piece;
    if (!piece) return;

    if (this.showGhost) {
      const distance = piece.dropDistance(this.game.board);
      if (distance > 0) {
        const ghostRow = piece.row - distance;
        const child = piece.childCell();
        this.drawGhost(piece.x, ghostRow);
        this.drawGhost(child.x, child.y - distance);
      }
    }

    // Interpolate the child while a rotation is playing out, so the pair
    // swings around the axis instead of snapping.
    const { rotationProgress } = piece;
    const axisX = this.screenX(piece.x);
    const axisY = this.screenY(piece.row) - (piece.y - piece.row) * this.cell;

    const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    let angle = angles[piece.orientation];
    if (rotationProgress < 1) {
      const from = angles[piece.rotationFrom];
      let delta = angle - from;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      angle = from + delta * rotationProgress;
    }
    const childX = axisX + Math.cos(angle) * this.cell;
    const childY = axisY + Math.sin(angle) * this.cell;

    this.paintPuyo(piece.axis, axisX, axisY);
    this.paintPuyo(piece.child, childX, childY);
  }

  /** A dashed outline of where the pair will land if dropped now. */
  drawGhost(x, y) {
    const ctx = this.context;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.strokeStyle = '#7f8fc0';
    ctx.lineWidth = Math.max(1, this.cell * 0.05);
    ctx.setLineDash([this.cell * 0.14, this.cell * 0.12]);
    const pad = this.cell * 0.18;
    ctx.beginPath();
    ctx.arc(
      this.screenX(x) + this.cell / 2,
      this.screenY(y) + this.cell / 2,
      this.cell / 2 - pad,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }

  /** Fades the sliver of the hidden 13th row so it reads as out of play. */
  drawHiddenRowVeil() {
    const ctx = this.context;
    const height = this.cell * HIDDEN_STRIP;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(10,13,24,0.95)');
    gradient.addColorStop(1, 'rgba(10,13,24,0.25)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height + 0.5);
    ctx.lineTo(this.width, height + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawGameOverVeil() {
    const ctx = this.context;
    ctx.fillStyle = 'rgba(8,10,20,0.68)';
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * @param {import('../core/board.js').Cell} cell
   * @param {{dy?: number, pop?: number, connect?: boolean}} [options]
   */
  drawCell(cell, x, y, { dy = 0, pop, connect = true } = {}) {
    const px = this.screenX(x);
    const py = this.screenY(y) + dy;
    if (connect && cell.kind !== CELL_GARBAGE) this.paintConnections(cell, x, y, px, py);
    this.paintPuyo(cell, px, py, pop);
  }

  /**
   * Bridges same-coloured neighbours so a group reads as one blob, the way
   * the original game draws connected puyos.
   */
  paintConnections(cell, x, y, px, py) {
    const board = this.game.board;
    if (!board.isScoringSquare(x, y)) return;
    const ctx = this.context;
    const palette = colorAt(cell.color);
    const thickness = this.cell * 0.42;
    ctx.fillStyle = palette.base;
    for (const step of NEIGHBOURS) {
      const nx = x + step.x;
      const ny = y + step.y;
      if (!board.isScoringSquare(nx, ny)) continue;
      const other = board.get(nx, ny);
      if (!other || other.kind === CELL_GARBAGE || other.color !== cell.color) continue;
      const cx = px + this.cell / 2;
      const cy = py + this.cell / 2;
      if (step.x !== 0) {
        const left = step.x > 0 ? cx : cx - this.cell / 2;
        ctx.fillRect(left, cy - thickness / 2, this.cell / 2, thickness);
      } else {
        const top = step.y > 0 ? cy - this.cell / 2 : cy;
        ctx.fillRect(cx - thickness / 2, top, thickness, this.cell / 2);
      }
    }
  }

  /**
   * @param {import('../core/board.js').Cell} cell
   * @param {number} px canvas x of the cell's left edge
   * @param {number} py canvas y of the cell's top edge
   * @param {number} [pop] 0-1 progress through the pop animation
   */
  paintPuyo(cell, px, py, pop) {
    const ctx = this.context;
    const size = this.cell;
    const palette = cell.kind === CELL_GARBAGE ? colorAt(-1) : colorAt(cell.color);
    const cx = px + size / 2;
    const cy = py + size / 2;
    let radius = size / 2 - size * 0.07;

    ctx.save();
    if (pop !== undefined) {
      // Flash, then shrink away.
      const flash = Math.sin(pop * Math.PI * 6) > 0;
      ctx.globalAlpha = 1 - pop * 0.6;
      radius *= 1 + pop * 0.25 - pop * pop * 1.1;
      if (radius <= 0.5) {
        ctx.restore();
        return;
      }
      if (flash) ctx.globalCompositeOperation = 'lighter';
    }

    const gradient = ctx.createRadialGradient(
      cx - radius * 0.35,
      cy - radius * 0.4,
      radius * 0.1,
      cx,
      cy,
      radius,
    );
    gradient.addColorStop(0, palette.light);
    gradient.addColorStop(0.55, palette.base);
    gradient.addColorStop(1, palette.dark);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    if (cell.kind === CELL_GARBAGE) {
      this.paintGarbageFace(cx, cy, radius, palette);
    } else if (this.showLetters && cell.letter) {
      this.paintLetter(cell.letter, cx, cy, radius, palette);
    } else {
      this.paintEyes(cx, cy, radius, palette);
    }

    // Specular highlight, last so it sits on top of the face.
    ctx.beginPath();
    ctx.ellipse(
      cx - radius * 0.34,
      cy - radius * 0.46,
      radius * 0.26,
      radius * 0.17,
      -0.5,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();
  }

  paintEyes(cx, cy, radius, palette) {
    const ctx = this.context;
    const spread = radius * 0.36;
    const eye = radius * 0.26;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * spread, cy - radius * 0.04, eye, eye * 1.15, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + side * spread + side * eye * 0.15, cy, eye * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = palette.ink;
      ctx.fill();
    }
  }

  paintLetter(letter, cx, cy, radius, palette) {
    const ctx = this.context;
    ctx.save();
    ctx.font = `700 ${radius * 1.15}px "Trebuchet MS", "Hiragino Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = radius * 0.22;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = palette.ink;
    ctx.strokeText(letter, cx, cy + radius * 0.04);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(letter, cx, cy + radius * 0.04);
    ctx.restore();
  }

  paintGarbageFace(cx, cy, radius, palette) {
    const ctx = this.context;
    ctx.save();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(1.5, radius * 0.16);
    ctx.lineCap = 'round';
    const arm = radius * 0.4;
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * arm, cy - Math.sin(angle) * arm);
      ctx.lineTo(cx + Math.cos(angle) * arm, cy + Math.sin(angle) * arm);
      ctx.stroke();
    }
    ctx.restore();
  }
}
