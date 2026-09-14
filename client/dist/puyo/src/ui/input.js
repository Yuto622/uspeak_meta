import { TIMING } from '../core/constants.js';

/** Default key bindings.  Every action takes more than one key. */
export const DEFAULT_BINDINGS = Object.freeze({
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  softDrop: ['ArrowDown', 'KeyS'],
  hardDrop: ['Space'],
  rotateCw: ['ArrowUp', 'KeyX', 'KeyW'],
  rotateCcw: ['KeyZ', 'ControlLeft', 'ControlRight'],
  pause: ['Escape', 'KeyP'],
});

/**
 * Turns key and touch events into game actions.
 *
 * Sideways movement uses delayed auto-shift: tap to nudge one column, hold to
 * slide.  That, rather than a raw key-repeat, is what makes the pair feel
 * precise.
 */
export class InputController {
  /**
   * @param {{
   *   onMove: (direction: number) => void,
   *   onRotate: (direction: number) => void,
   *   onSoftDrop: (active: boolean) => void,
   *   onHardDrop: () => void,
   *   onPause: () => void,
   * }} handlers
   * @param {object} [bindings]
   */
  constructor(handlers, bindings = DEFAULT_BINDINGS) {
    this.handlers = handlers;
    this.bindings = bindings;
    this.held = new Set();
    this.direction = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.enabled = true;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
  }

  attach(target = window) {
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.target = null;
  }

  /** @param {string} code @returns {string|null} the action a key maps to. */
  actionFor(code) {
    for (const [action, keys] of Object.entries(this.bindings)) {
      if (keys.includes(code)) return action;
    }
    return null;
  }

  onKeyDown(event) {
    const action = this.actionFor(event.code);
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return; // auto-shift is ours to time, not the OS's
    this.press(action);
  }

  onKeyUp(event) {
    const action = this.actionFor(event.code);
    if (!action) return;
    event.preventDefault();
    this.release(action);
  }

  onBlur() {
    for (const action of [...this.held]) this.release(action);
  }

  /** @param {string} action */
  press(action) {
    if (this.held.has(action)) return;
    this.held.add(action);
    if (action === 'pause') {
      this.handlers.onPause();
      return;
    }
    if (!this.enabled) return;
    switch (action) {
      case 'left':
      case 'right': {
        this.direction = action === 'left' ? -1 : 1;
        this.handlers.onMove(this.direction);
        this.dasTimer = TIMING.das;
        this.arrTimer = 0;
        break;
      }
      case 'softDrop':
        this.handlers.onSoftDrop(true);
        break;
      case 'hardDrop':
        this.handlers.onHardDrop();
        break;
      case 'rotateCw':
        this.handlers.onRotate(1);
        break;
      case 'rotateCcw':
        this.handlers.onRotate(-1);
        break;
      default:
        break;
    }
  }

  /** @param {string} action */
  release(action) {
    this.held.delete(action);
    if (action === 'softDrop') this.handlers.onSoftDrop(false);
    if (action === 'left' || action === 'right') {
      const opposite = action === 'left' ? 'right' : 'left';
      if (this.held.has(opposite)) {
        // Falling back to the other held key re-arms the delay, so the pair
        // does not bolt across the field.
        this.direction = opposite === 'left' ? -1 : 1;
        this.dasTimer = TIMING.das;
        this.arrTimer = 0;
      } else {
        this.direction = 0;
      }
    }
  }

  /** Releases everything, e.g. when the game is paused or restarted. */
  reset() {
    this.onBlur();
    this.direction = 0;
  }

  /** @param {number} dt seconds */
  update(dt) {
    if (!this.enabled || this.direction === 0) return;
    if (this.dasTimer > 0) {
      this.dasTimer -= dt;
      if (this.dasTimer > 0) return;
      this.arrTimer = 0;
    }
    this.arrTimer -= dt;
    while (this.arrTimer <= 0) {
      this.handlers.onMove(this.direction);
      this.arrTimer += TIMING.arr;
    }
  }

  /**
   * Wires on-screen buttons for touch.  Each button carries a
   * `data-action` matching a binding name.
   *
   * @param {ParentNode} root
   */
  attachTouchControls(root) {
    for (const button of root.querySelectorAll('[data-action]')) {
      const action = button.dataset.action;
      const down = (event) => {
        event.preventDefault();
        this.press(action);
      };
      const up = (event) => {
        event.preventDefault();
        this.release(action);
      };
      button.addEventListener('pointerdown', down);
      button.addEventListener('pointerup', up);
      button.addEventListener('pointercancel', up);
      button.addEventListener('pointerleave', up);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
    }
  }
}
