/* =========================================================================
 * fruits.js -- フルーツ(=えいごの ことば)の データ
 * -------------------------------------------------------------------------
 * スイカゲームの しんかの じゅんばん を、小学校ていがくねん でも よめる
 * やさしい えいごたんご に おきかえている。
 *   cherry → strawberry → grape → orange → lemon → apple
 *          → pear → peach → pineapple → melon → watermelon
 * ========================================================================= */
(function (global) {
  'use strict';

  // score は スイカゲームと おなじ「さんかくすう」(1,3,6,10,15,...)
  const FRUITS = [
    { lv: 0,  en: 'cherry',     ja: 'さくらんぼ', emoji: '🍒', r: 16,  score: 1,  c1: '#ff8fa3', c2: '#d6193c', seed: '#fff0f2' },
    { lv: 1,  en: 'strawberry', ja: 'いちご',     emoji: '🍓', r: 22,  score: 3,  c1: '#ff9a8b', c2: '#e02a2a', seed: '#fff2ec' },
    { lv: 2,  en: 'grape',      ja: 'ぶどう',     emoji: '🍇', r: 29,  score: 6,  c1: '#c59bff', c2: '#6a3bb5', seed: '#f3ebff' },
    { lv: 3,  en: 'orange',     ja: 'オレンジ',   emoji: '🍊', r: 36,  score: 10, c1: '#ffc266', c2: '#f08000', seed: '#fff4e0' },
    { lv: 4,  en: 'lemon',      ja: 'レモン',     emoji: '🍋', r: 44,  score: 15, c1: '#ffef8f', c2: '#e8c400', seed: '#fffbe0' },
    { lv: 5,  en: 'apple',      ja: 'りんご',     emoji: '🍎', r: 53,  score: 21, c1: '#ff8a8a', c2: '#c81d25', seed: '#ffeeee' },
    { lv: 6,  en: 'pear',       ja: 'なし',       emoji: '🍐', r: 63,  score: 28, c1: '#d6f08a', c2: '#78a028', seed: '#f4ffe0' },
    { lv: 7,  en: 'peach',      ja: 'もも',       emoji: '🍑', r: 74,  score: 36, c1: '#ffc4c9', c2: '#f2748b', seed: '#fff0f2' },
    { lv: 8,  en: 'pineapple',  ja: 'パイナップル', emoji: '🍍', r: 86, score: 45, c1: '#ffdf7a', c2: '#c99000', seed: '#fff8dd' },
    { lv: 9,  en: 'melon',      ja: 'メロン',     emoji: '🍈', r: 96,  score: 55, c1: '#c8ef9a', c2: '#6aa84f', seed: '#f0ffe2' },
    { lv: 10, en: 'watermelon', ja: 'スイカ',     emoji: '🍉', r: 105, score: 66, c1: '#8fe08f', c2: '#207a33', seed: '#ffecec' }
  ];

  const MAX_LEVEL = FRUITS.length - 1;

  // ドロップで でてくるのは ちいさい 5 しゅるい まで(ほんかの スイカゲームと おなじ)
  const DROPPABLE = [0, 1, 2, 3, 4];
  // でやすさ(ちいさいほど よく でる)
  const DROP_WEIGHT = [30, 26, 20, 14, 10];

  function pickDropLevel() {
    let total = 0;
    for (const w of DROP_WEIGHT) total += w;
    let r = Math.random() * total;
    for (let i = 0; i < DROPPABLE.length; i++) {
      r -= DROP_WEIGHT[i];
      if (r <= 0) return DROPPABLE[i];
    }
    return 0;
  }

  function get(lv) {
    return FRUITS[Math.max(0, Math.min(MAX_LEVEL, lv))];
  }

  /**
   * a か an か。apple / orange は ぼいんで はじまるので "an"。
   * えいごがくしゅうの ゲームなので ここは まちがえられない。
   */
  function article(en) {
    return /^[aeiou]/i.test(en) ? 'an' : 'a';
  }

  /** 「Make an apple!」の ような ぶんを つくる */
  function makeSentence(fruit) {
    return 'Make ' + article(fruit.en) + ' ' + fruit.en + '!';
  }

  /** えいごの つづりを 1もじずつ (フォニックス れんしゅうよう) */
  function letters(en) {
    return en.toUpperCase().split('');
  }

  global.Fruits = {
    LIST: FRUITS,
    MAX_LEVEL: MAX_LEVEL,
    DROPPABLE: DROPPABLE,
    pickDropLevel: pickDropLevel,
    get: get,
    letters: letters,
    article: article,
    makeSentence: makeSentence
  };
})(window);
