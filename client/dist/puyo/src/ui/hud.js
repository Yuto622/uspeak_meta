import { colorAt } from './theme.js';
import { CELL_GARBAGE } from '../core/constants.js';
import { dictionary } from '../core/wordlist.js';

/** How long a chain or word banner stays up. */
const POPUP_TIME = 1100;
/** Most recent words kept in the side panel. */
const WORD_LOG_LIMIT = 10;

/** @param {number} value @returns {string} thousands-separated */
function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US');
}

/** Glosses come from a generated data file, but they still land in innerHTML. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

/**
 * Builds the little coloured circle used in the NEXT panel.
 * @param {import('../core/board.js').Cell} cell
 * @param {boolean} showLetters
 */
function chipFor(cell, showLetters) {
  const chip = document.createElement('div');
  chip.className = 'puyo-chip';
  const palette = cell.kind === CELL_GARBAGE ? colorAt(-1) : colorAt(cell.color);
  chip.style.background = `radial-gradient(circle at 34% 30%, ${palette.light}, ${palette.base} 58%, ${palette.dark})`;
  if (showLetters && cell.letter) chip.textContent = cell.letter;
  return chip;
}

/**
 * The DOM around one field: score, next pairs, chain banners, word log.
 *
 * The renderer owns the canvas; this owns everything outside it.
 */
export class Hud {
  /**
   * @param {HTMLElement} root the `.player` section
   * @param {{showLetters?: boolean}} [options]
   */
  constructor(root, { showLetters = false } = {}) {
    this.root = root;
    this.showLetters = showLetters;
    this.fields = {};
    for (const element of root.querySelectorAll('[data-field]')) {
      this.fields[element.dataset.field] = element;
    }
    this.displayedScore = 0;
    this.popupTimers = new Map();
    this.wordLog = [];
  }

  /** Shows or hides the bits that only make sense in one mode. */
  applyMode(mode) {
    for (const element of this.root.querySelectorAll('[data-only]')) {
      element.hidden = element.dataset.only !== mode;
    }
  }

  /** @param {HTMLElement|undefined} element */
  static setText(element, text) {
    if (element && element.textContent !== text) element.textContent = text;
  }

  /**
   * Rolls the score towards its true value instead of snapping, which makes a
   * chain feel like it is paying out.
   *
   * @param {import('../core/game.js').Game} game
   * @param {number} dt
   */
  update(game, dt) {
    const stats = game.stats();
    const gap = stats.score - this.displayedScore;
    if (gap !== 0) {
      const step = Math.max(1, Math.abs(gap) * Math.min(1, dt * 9));
      this.displayedScore += Math.sign(gap) * Math.min(Math.abs(gap), step);
      if (Math.abs(stats.score - this.displayedScore) < 1) this.displayedScore = stats.score;
    }

    Hud.setText(this.fields.score, formatNumber(this.displayedScore));
    Hud.setText(this.fields.maxChain, String(stats.maxChain));
    Hud.setText(this.fields.level, String(stats.level));
    Hud.setText(this.fields.coins, formatNumber(stats.coins));
    this.updateGarbage(stats.incoming);
    this.updateNext(game);
  }

  updateGarbage(incoming) {
    const box = this.fields.garbage;
    if (!box) return;
    box.hidden = incoming <= 0;
    if (incoming <= 0) return;
    // Rocks, stars and moons, the way the real game bundles nuisance.
    const rocks = [];
    let left = incoming;
    for (const [size, glyph] of [[30, '🌑'], [6, '⭐'], [1, '●']]) {
      while (left >= size) {
        rocks.push(glyph);
        left -= size;
      }
    }
    Hud.setText(this.fields.garbageRocks, rocks.join(''));
  }

  /** @param {import('../core/game.js').Game} game */
  updateNext(game) {
    const host = this.fields.next;
    if (!host) return;
    const preview = game.preview();
    const signature = preview
      .map((pair) => `${pair.axis.id}:${pair.child.id}`)
      .join('|');
    if (signature === this.nextSignature) return;
    this.nextSignature = signature;

    host.replaceChildren();
    preview.forEach((pair, index) => {
      const group = document.createElement('div');
      group.className = index === 0 ? 'pair' : 'pair pair--small';
      group.append(chipFor(pair.child, this.showLetters), chipFor(pair.axis, this.showLetters));
      host.append(group);
    });
  }

  /** @param {string} name field key @param {string} html */
  flash(name, html) {
    const element = this.fields[name];
    if (!element) return;
    element.innerHTML = html;
    element.hidden = false;
    // Restart the entrance animation even if the banner was already up.
    element.style.animation = 'none';
    void element.offsetWidth;
    element.style.animation = '';
    clearTimeout(this.popupTimers.get(name));
    this.popupTimers.set(
      name,
      setTimeout(() => {
        element.hidden = true;
      }, POPUP_TIME),
    );
  }

  /** @param {number} chain */
  showChain(chain) {
    if (chain < 2) return;
    this.flash('chainPopup', `${chain} CHAIN!`);
  }

  /**
   * @param {{words: string[], score: number, coins: number}} step
   */
  showWords(step) {
    if (!step.words || !step.words.length) return;
    const longest = step.words.reduce((best, word) => (word.length > best.length ? word : best), '');
    const extra = step.words.length > 1 ? ` +${step.words.length - 1}` : '';
    const japanese = dictionary.translate(longest);
    const meaning = japanese ? `<em>${escapeHtml(japanese)}</em>` : '';
    this.flash(
      'wordPopup',
      `${escapeHtml(longest)}${extra}${meaning}`
        + `<small>+${formatNumber(step.score)} &nbsp; ${step.coins} COINS</small>`,
    );
  }

  showAllClear() {
    this.flash('allClearPopup', 'ALL CLEAR!');
  }

  /** @param {{word: string, length: number, common: boolean}} entry */
  addWord(entry, points) {
    const list = this.fields.wordLog;
    if (!list) return;
    this.wordLog.unshift({ ...entry, points, japanese: dictionary.translate(entry.word) });
    this.wordLog.length = Math.min(this.wordLog.length, WORD_LOG_LIMIT);
    list.replaceChildren();
    for (const item of this.wordLog) {
      const row = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'wordlog__head';
      const word = document.createElement('span');
      word.className = item.common ? 'w common' : 'w';
      word.textContent = item.word;
      const value = document.createElement('span');
      value.className = 'p';
      value.textContent = `+${formatNumber(item.points)}`;
      head.append(word, value);
      row.append(head);
      if (item.japanese) {
        const meaning = document.createElement('div');
        meaning.className = 'wordlog__jp';
        meaning.textContent = item.japanese;
        row.append(meaning);
      }
      list.append(row);
    }
  }

  /** Clears the panel between games. */
  reset() {
    this.displayedScore = 0;
    this.wordLog = [];
    this.nextSignature = null;
    if (this.fields.wordLog) this.fields.wordLog.replaceChildren();
    for (const name of ['chainPopup', 'wordPopup', 'allClearPopup']) {
      const element = this.fields[name];
      if (element) element.hidden = true;
      clearTimeout(this.popupTimers.get(name));
    }
  }
}
