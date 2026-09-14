/**
 * Letter supply for U-SPEAK mode.
 *
 * Weights are the letter frequencies of common 3-6 letter English words with
 * the vowels nudged up, so a random handful is usually spellable.  Q is left
 * out of the bag by default: without a U beside it, a Q is a dead square for
 * the rest of the game.
 */

/** @type {Readonly<Record<string, number>>} relative weight per letter */
export const LETTER_WEIGHTS = Object.freeze({
  E: 110, A: 85, S: 78, I: 72, O: 70, R: 62, T: 62, N: 52, L: 48, D: 44,
  U: 42, C: 34, H: 30, P: 28, M: 26, G: 24, B: 22, Y: 22, F: 18, W: 18,
  K: 16, V: 10, X: 4, J: 4, Z: 4, Q: 0,
});

export const VOWELS = Object.freeze(new Set(['A', 'E', 'I', 'O', 'U']));

/**
 * Which palette colour each letter is drawn in.  Grouping letters by family
 * keeps the field readable as a puyo field rather than as alphabet soup.
 */
export const LETTER_GROUPS = Object.freeze([
  'AEIOU',   // 0 vowels
  'TNSR',    // 1 the workhorse consonants
  'LDCMH',   // 2
  'GBPFWY',  // 3
  'JKVXZQ',  // 4
]);

const colorByLetter = new Map();
LETTER_GROUPS.forEach((letters, index) => {
  for (const letter of letters) colorByLetter.set(letter, index);
});

/** @param {string} letter @returns {number} palette index 0-4 */
export function colorForLetter(letter) {
  return colorByLetter.get(letter.toUpperCase()) ?? 4;
}

/** @param {string} letter */
export function isVowel(letter) {
  return VOWELS.has(letter.toUpperCase());
}

/**
 * Draws letters at the weighted frequencies above, with one safety valve:
 * after a run of consonants it forces a vowel, so the field cannot lock up
 * into something unspellable.
 */
export class LetterBag {
  /**
   * @param {import('../core/rng.js').Rng} rng
   * @param {{weights?: Record<string, number>, vowelGap?: number}} [options]
   *   vowelGap: force a vowel once this many consonants have come out in a row
   */
  constructor(rng, { weights = LETTER_WEIGHTS, vowelGap = 4 } = {}) {
    this.rng = rng;
    this.vowelGap = vowelGap;
    this.consonantRun = 0;

    this.letters = [];
    this.cumulative = [];
    this.vowelLetters = [];
    this.vowelCumulative = [];
    let total = 0;
    let vowelTotal = 0;
    for (const [letter, weight] of Object.entries(weights)) {
      if (weight <= 0) continue;
      total += weight;
      this.letters.push(letter);
      this.cumulative.push(total);
      if (isVowel(letter)) {
        vowelTotal += weight;
        this.vowelLetters.push(letter);
        this.vowelCumulative.push(vowelTotal);
      }
    }
    this.total = total;
    this.vowelTotal = vowelTotal;
  }

  #sample(letters, cumulative, total) {
    const roll = this.rng.next() * total;
    for (let i = 0; i < cumulative.length; i += 1) {
      if (roll < cumulative[i]) return letters[i];
    }
    return letters[letters.length - 1];
  }

  /** @returns {string} the next letter, A-Z. */
  next() {
    let letter;
    if (this.consonantRun >= this.vowelGap) {
      letter = this.#sample(this.vowelLetters, this.vowelCumulative, this.vowelTotal);
    } else {
      letter = this.#sample(this.letters, this.cumulative, this.total);
    }
    if (isVowel(letter)) this.consonantRun = 0;
    else this.consonantRun += 1;
    return letter;
  }
}
