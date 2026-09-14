/**
 * Persistence: the coin bank, high scores, the word book, and the settings
 * chosen on the title screen.
 *
 * Every read is defensive.  Private browsing, a cleared profile or a corrupt
 * value must not take the game down with it, so a failure just means starting
 * from defaults.
 */

const KEY = 'puyo-uspeak/v1';

/** @returns {object} the shape a fresh profile starts in. */
function defaults() {
  return {
    coins: 0,
    best: { classic: 0, uspeak: 0, versus: 0 },
    bestChain: { classic: 0, uspeak: 0, versus: 0 },
    wins: 0,
    losses: 0,
    /** word -> how many times it has been spelled */
    wordBook: {},
    settings: {
      level: 1,
      minWordLength: 3,
      ghost: true,
      ai: 'normal',
      sound: true,
    },
  };
}

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const base = defaults();
    return {
      ...base,
      ...parsed,
      best: { ...base.best, ...(parsed.best || {}) },
      bestChain: { ...base.bestChain, ...(parsed.bestChain || {}) },
      wordBook: parsed.wordBook && typeof parsed.wordBook === 'object' ? parsed.wordBook : {},
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return defaults();
  }
}

function write(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable or full: the session still plays, it just will not
    // be remembered.
  }
}

/** The player's saved profile. */
export const profile = {
  /** @returns {object} a copy of everything stored. */
  load() {
    return read();
  },

  /** @param {object} settings title-screen choices */
  saveSettings(settings) {
    const state = read();
    state.settings = { ...state.settings, ...settings };
    write(state);
    return state.settings;
  },

  /**
   * Banks the result of one game.
   *
   * @param {{mode: string, score: number, coins: number, maxChain: number,
   *          words: {word: string}[], won?: boolean|null}} result
   * @returns {{coins: number, newWords: string[], isBest: boolean}}
   */
  record({ mode, score, coins, maxChain, words = [], won = null }) {
    const state = read();
    state.coins += coins;

    const isBest = score > (state.best[mode] ?? 0);
    if (isBest) state.best[mode] = score;
    if (maxChain > (state.bestChain[mode] ?? 0)) state.bestChain[mode] = maxChain;
    if (won === true) state.wins += 1;
    if (won === false) state.losses += 1;

    const newWords = [];
    for (const entry of words) {
      const word = entry.word.toLowerCase();
      if (!state.wordBook[word]) newWords.push(word);
      state.wordBook[word] = (state.wordBook[word] || 0) + 1;
    }

    write(state);
    return { coins: state.coins, newWords, isBest };
  },

  /** @returns {string[]} every word ever spelled, longest first. */
  wordBook() {
    const book = read().wordBook;
    return Object.keys(book).sort((a, b) => b.length - a.length || a.localeCompare(b));
  },

  /** @returns {number} total banked U-Speak Coins. */
  coins() {
    return read().coins;
  },

  /** Wipes the profile.  The menu asks before calling this. */
  clear() {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // nothing to do
    }
  },
};
