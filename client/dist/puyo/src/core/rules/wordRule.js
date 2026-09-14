import { makePuyo } from '../board.js';
import { VISIBLE_ROWS, CELL_PUYO } from '../constants.js';
import { chainPower } from '../score.js';
import { dictionary } from '../wordlist.js';
import { LetterBag, colorForLetter } from '../../data/letters.js';

/** Points a word is worth before chain and simultaneous bonuses. */
export const WORD_BASE = Object.freeze({
  3: 30, 4: 90, 5: 220, 6: 480, 7: 960, 8: 1800,
});

/** U-Speak Coins a word is worth before the chain bonus. */
export const WORD_COINS = Object.freeze({
  3: 1, 4: 2, 5: 4, 6: 8, 7: 14, 8: 24,
});

/** Extra multiplier for a word that is everyday English rather than obscure. */
export const COMMON_WORD_BONUS = 1.2;

/** Points for a nuisance puyo swept up by a word. */
export const GARBAGE_POINTS = 10;

/** Chain multiplier is `1 + chainPower / CHAIN_DIVISOR`: x2 on a 2-chain. */
export const CHAIN_DIVISOR = 8;

/** Each extra word spelled in the same step adds this much multiplier. */
export const SIMULTANEOUS_BONUS = 0.15;

/** Words read across (left to right) and down (top to bottom), as in a crossword. */
export const ACROSS = 'across';
export const DOWN = 'down';

/**
 * Picks the best set of non-overlapping words in one straight line of letters.
 *
 * Scoring the search by the square of each word's length makes the solver
 * prefer one long word over the short ones hiding inside it -- SCHOOL beats
 * taking SCH... nothing, and CATS beats CAT.
 *
 * @param {string} letters the line, already stripped of gaps
 * @param {{minLength: number, maxLength: number, isWord: (word: string) => boolean}} options
 * @returns {{start: number, length: number, word: string}[]} ordered by start
 */
export function bestWordsInRun(letters, { minLength, maxLength, isWord }) {
  const n = letters.length;
  if (n < minLength) return [];

  const value = new Array(n + 1).fill(0);
  /** @type {({from: number, length: number}|null)[]} */
  const choice = new Array(n + 1).fill(null);

  for (let end = 1; end <= n; end += 1) {
    value[end] = value[end - 1];
    choice[end] = null;
    const longest = Math.min(maxLength, end);
    for (let length = minLength; length <= longest; length += 1) {
      const start = end - length;
      const candidate = letters.slice(start, end);
      if (!isWord(candidate)) continue;
      const score = value[start] + length * length;
      if (score > value[end]) {
        value[end] = score;
        choice[end] = { from: start, length };
      }
    }
  }

  const found = [];
  let cursor = n;
  while (cursor > 0) {
    const pick = choice[cursor];
    if (!pick) {
      cursor -= 1;
      continue;
    }
    found.push({
      start: pick.from,
      length: pick.length,
      word: letters.slice(pick.from, cursor),
    });
    cursor = pick.from;
  }
  return found.reverse();
}

/**
 * U-SPEAK mode.
 *
 * The field, the pairs, the gravity and the chains are exactly the classic
 * game's; what changes is why a group pops.  Every puyo carries a letter, and
 * a run of letters pops when it spells an English word -- read left to right
 * across a row, or top to bottom down a column.  Longer words are worth
 * dramatically more, and they pay out in U-Speak Coins.
 */
export class WordRule {
  /**
   * @param {{minWordLength?: number, maxWordLength?: number, dict?: object}} [options]
   */
  constructor({ minWordLength = 3, maxWordLength = dictionary.maxLength, dict = dictionary } = {}) {
    this.id = 'uspeak';
    this.name = 'U-SPEAK';
    this.usesLetters = true;
    this.dict = dict;
    this.minWordLength = Math.max(minWordLength, dict.minLength);
    this.maxWordLength = Math.min(maxWordLength, dict.maxLength);
    this.minGroup = this.minWordLength;
  }

  /** @param {import('../rng.js').Rng} rng */
  createPairGenerator(rng) {
    const bag = new LetterBag(rng);
    const make = () => {
      const letter = bag.next();
      return makePuyo(colorForLetter(letter), letter);
    };
    return () => ({ axis: make(), child: make() });
  }

  /**
   * Reads a straight line of squares out of the board.
   *
   * A gap or a nuisance puyo breaks the line into separate runs, because a
   * word cannot read through a hole.
   *
   * @param {import('../board.js').Board} board
   * @param {{x: number, y: number}[]} path squares in reading order
   * @returns {{letters: string, offset: number}[]} letters are lower-cased to
   *   match the dictionary; the UI upper-cases them again for display
   */
  static runsAlong(board, path) {
    const runs = [];
    let letters = '';
    let offset = 0;
    path.forEach((point, index) => {
      const cell = board.get(point.x, point.y);
      const letter = cell && cell.kind === CELL_PUYO && cell.letter
        ? cell.letter.toLowerCase()
        : null;
      if (letter) {
        if (!letters) offset = index;
        letters += letter;
        return;
      }
      if (letters.length) runs.push({ letters, offset });
      letters = '';
    });
    if (letters.length) runs.push({ letters, offset });
    return runs;
  }

  /**
   * Every word currently spelled on the board.
   *
   * A square may belong to one across word and one down word at the same
   * time; it still only pops once, but both words score.
   *
   * @param {import('../board.js').Board} board
   * @returns {{cells: {x: number, y: number}[], word: string, color: number,
   *            size: number, direction: string, common: boolean}[]}
   */
  findClears(board) {
    const options = {
      minLength: this.minWordLength,
      maxLength: this.maxWordLength,
      isWord: (word) => this.dict.has(word),
    };
    const groups = [];

    const collect = (path, direction) => {
      for (const run of WordRule.runsAlong(board, path)) {
        for (const hit of bestWordsInRun(run.letters, options)) {
          const cells = [];
          for (let i = 0; i < hit.length; i += 1) {
            cells.push(path[run.offset + hit.start + i]);
          }
          groups.push({
            cells,
            word: hit.word,
            direction,
            size: hit.length,
            color: board.get(cells[0].x, cells[0].y)?.color ?? 0,
            common: this.dict.isCommon(hit.word),
          });
        }
      }
    };

    for (let y = 0; y < VISIBLE_ROWS; y += 1) {
      const path = [];
      for (let x = 0; x < board.cols; x += 1) path.push({ x, y });
      collect(path, ACROSS);
    }
    for (let x = 0; x < board.cols; x += 1) {
      const path = [];
      for (let y = VISIBLE_ROWS - 1; y >= 0; y -= 1) path.push({ x, y });
      collect(path, DOWN);
    }

    return groups;
  }

  /** @param {string} word @returns {number} points before any multiplier. */
  baseValue(word) {
    const base = WORD_BASE[word.length] ?? WORD_BASE[8] * (word.length - 7);
    return this.dict.isCommon(word) ? Math.round(base * COMMON_WORD_BONUS) : base;
  }

  /** @param {string} word @returns {number} coins before any multiplier. */
  coinValue(word) {
    return WORD_COINS[word.length] ?? WORD_COINS[8] + (word.length - 8) * 10;
  }

  /**
   * Chains pay off the same way they do in the original: the deeper the
   * chain, the bigger the multiplier.  Spelling several words in one step
   * stacks on top of that.
   *
   * @param {{groups: object[], clearedCount: number, chain: number}} step
   */
  scoreStep({ groups, clearedCount, chain }) {
    const words = groups.map((group) => group.word);
    const letterCount = groups.reduce((total, group) => total + group.size, 0);
    const garbageCleared = Math.max(0, clearedCount - letterCount);

    const base = groups.reduce((total, group) => total + this.baseValue(group.word), 0);
    // Deliberately steeper than the simultaneous bonus below, so that -- as in
    // the original -- setting up a chain beats spelling the same words at once.
    const chainMultiplier = 1 + chainPower(chain) / CHAIN_DIVISOR;
    const simultaneousMultiplier = 1 + SIMULTANEOUS_BONUS * Math.max(0, groups.length - 1);
    const multiplier = chainMultiplier * simultaneousMultiplier;

    const score = Math.round(base * multiplier) + garbageCleared * GARBAGE_POINTS;
    const coinBase = groups.reduce((total, group) => total + this.coinValue(group.word), 0);
    const coins = Math.max(coinBase, Math.round(coinBase * multiplier));

    const longest = words.reduce((best, word) => (word.length > best.length ? word : best), '');
    return {
      score,
      coins,
      multiplier: Number(multiplier.toFixed(2)),
      words,
      label: longest ? longest.toUpperCase() : `${chain} CHAIN`,
    };
  }

  /** U-SPEAK is a solo mode, so a chain sends no nuisance. */
  garbageFor() {
    return { garbage: 0, carry: 0 };
  }
}
