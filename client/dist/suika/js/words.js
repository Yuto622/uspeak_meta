/* =========================================================================
 * words.js -- 20 ジャンル × 11 ことば の データ
 * -------------------------------------------------------------------------
 * スイカゲームの「しんかの じゅんばん」は 11 だんかい。
 * その 11 だんかいを、20 この ジャンルで さしかえられる ように している。
 *
 *   おおきさ(はんけい)と スコアは ぜんジャンル きょうつう なので、
 *   ゲームバランスは ジャンルを かえても かわらない。
 *   ジャンルごとに かわるのは「ことば・え・いろ」だけ。
 *
 * ならびは できるだけ「じっさいに ちいさい → 大きい」に して、
 * しんかが しぜんに かんじられる ように している。
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ------------------------- きょうつうの おおきさ ------------------------- */
  // score は スイカゲームと おなじ「さんかくすう」(1,3,6,10,...)
  const SIZES = [
    { r: 16,  score: 1  },
    { r: 22,  score: 3  },
    { r: 29,  score: 6  },
    { r: 36,  score: 10 },
    { r: 44,  score: 15 },
    { r: 53,  score: 21 },
    { r: 63,  score: 28 },
    { r: 74,  score: 36 },
    { r: 86,  score: 45 },
    { r: 96,  score: 55 },
    { r: 105, score: 66 }
  ];

  /* ------------------------------ いろ ------------------------------ */
  const PALETTE = {
    red:    ['#ff8a8a', '#c81d25'],
    pink:   ['#ffb3c6', '#e0518a'],
    orange: ['#ffc266', '#f08000'],
    yellow: ['#ffef8f', '#e0bb00'],
    cream:  ['#ffe6bb', '#d69a34'],
    lime:   ['#ddf58f', '#82b524'],
    green:  ['#a9e79a', '#41963f'],
    teal:   ['#9fe6d8', '#249d85'],
    sky:    ['#bde6ff', '#3ea8e0'],
    blue:   ['#9cc8ff', '#2b6fc7'],
    navy:   ['#9aa8e6', '#3b4aa0'],
    purple: ['#c59bff', '#6a3bb5'],
    brown:  ['#d9b08c', '#8b5a2b'],
    gray:   ['#dcdcdc', '#787878'],
    white:  ['#ffffff', '#bdbdbd'],
    black:  ['#8a8a8a', '#2b2b2b']
  };

  /* ------------------------------ ジャンル ------------------------------
   * [ えいご, にほんご, え, いろ, かぞえかた? ]
   *   かぞえかた: 'u' = かぞえられない (sushi, rice) → 「Make sushi!」
   *               'p' = いつも ふくすう (scissors, pants) → 「Make scissors!」
   *               't' = the が つく もの (the sun)  → 「Make the sun!」
   *               なし = ふつうの めいし → 「Make a cat!」「Make an apple!」
   * article: 'auto'(きほん) / 'none' = ジャンル ぜんぶ かんしを つけない
   * ------------------------------------------------------------------ */
  const GENRES = [
    { id: 'fruit', ja: 'くだもの', en: 'Fruits', icon: '🍉', items: [
      ['cherry', 'さくらんぼ', '🍒', 'pink'],
      ['strawberry', 'いちご', '🍓', 'red'],
      ['grape', 'ぶどう', '🍇', 'purple'],
      ['orange', 'オレンジ', '🍊', 'orange'],
      ['lemon', 'レモン', '🍋', 'yellow'],
      ['apple', 'りんご', '🍎', 'red'],
      ['pear', 'なし', '🍐', 'lime'],
      ['peach', 'もも', '🍑', 'pink'],
      ['pineapple', 'パイナップル', '🍍', 'cream'],
      ['melon', 'メロン', '🍈', 'green'],
      ['watermelon', 'スイカ', '🍉', 'green']
    ]},
    { id: 'animal', ja: 'どうぶつ', en: 'Animals', icon: '🐘', items: [
      ['mouse', 'ねずみ', '🐭', 'gray'],
      ['frog', 'かえる', '🐸', 'lime'],
      ['cat', 'ねこ', '🐱', 'cream'],
      ['rabbit', 'うさぎ', '🐰', 'white'],
      ['dog', 'いぬ', '🐶', 'brown'],
      ['pig', 'ぶた', '🐷', 'pink'],
      ['sheep', 'ひつじ', '🐑', 'white'],
      ['horse', 'うま', '🐴', 'brown'],
      ['cow', 'うし', '🐮', 'white'],
      ['lion', 'ライオン', '🦁', 'cream'],
      ['elephant', 'ぞう', '🐘', 'gray']
    ]},
    { id: 'vehicle', ja: 'のりもの', en: 'Vehicles', icon: '🚌', items: [
      ['bike', 'じてんしゃ', '🚲', 'teal'],
      ['boat', 'ボート', '⛵', 'sky'],
      ['car', 'くるま', '🚗', 'red'],
      ['taxi', 'タクシー', '🚕', 'yellow'],
      ['bus', 'バス', '🚌', 'orange'],
      ['truck', 'トラック', '🚚', 'navy'],
      ['tractor', 'トラクター', '🚜', 'green'],
      ['train', 'でんしゃ', '🚂', 'gray'],
      ['ship', 'ふね', '🚢', 'blue'],
      ['plane', 'ひこうき', '✈️', 'sky'],
      ['rocket', 'ロケット', '🚀', 'purple']
    ]},
    { id: 'sea', ja: 'うみのいきもの', en: 'Sea animals', icon: '🐋', items: [
      ['shell', 'かい', '🐚', 'cream'],
      ['crab', 'かに', '🦀', 'red'],
      ['fish', 'さかな', '🐟', 'blue'],
      ['squid', 'いか', '🦑', 'pink'],
      ['octopus', 'たこ', '🐙', 'red'],
      ['turtle', 'かめ', '🐢', 'green'],
      ['penguin', 'ペンギン', '🐧', 'navy'],
      ['seal', 'アザラシ', '🦭', 'gray'],
      ['dolphin', 'イルカ', '🐬', 'sky'],
      ['shark', 'サメ', '🦈', 'blue'],
      ['whale', 'クジラ', '🐋', 'navy']
    ]},
    { id: 'insect', ja: 'むし', en: 'Insects', icon: '🦋', items: [
      ['ant', 'あり', '🐜', 'black'],
      ['fly', 'はえ', '🪰', 'gray'],
      ['bee', 'はち', '🐝', 'yellow'],
      ['ladybug', 'てんとうむし', '🐞', 'red'],
      ['worm', 'みみず', '🪱', 'pink'],
      ['snail', 'かたつむり', '🐌', 'brown'],
      ['spider', 'くも', '🕷️', 'black'],
      ['cricket', 'こおろぎ', '🦗', 'lime'],
      ['scorpion', 'さそり', '🦂', 'brown'],
      ['butterfly', 'ちょう', '🦋', 'purple'],
      ['beetle', 'かぶとむし', '🪲', 'navy']
    ]},
    { id: 'vegetable', ja: 'やさい', en: 'Vegetables', icon: '🥕', items: [
      ['pea', 'まめ', '🫛', 'lime'],
      ['garlic', 'にんにく', '🧄', 'white', 'u'],
      ['mushroom', 'きのこ', '🍄', 'red'],
      ['tomato', 'トマト', '🍅', 'red'],
      ['onion', 'たまねぎ', '🧅', 'cream'],
      ['carrot', 'にんじん', '🥕', 'orange'],
      ['potato', 'じゃがいも', '🥔', 'brown'],
      ['cucumber', 'きゅうり', '🥒', 'green'],
      ['eggplant', 'なす', '🍆', 'purple'],
      ['corn', 'とうもろこし', '🌽', 'yellow', 'u'],
      ['pumpkin', 'かぼちゃ', '🎃', 'orange']
    ]},
    { id: 'food', ja: 'たべもの', en: 'Food', icon: '🍕', items: [
      ['egg', 'たまご', '🥚', 'white'],
      ['cheese', 'チーズ', '🧀', 'yellow', 'u'],
      ['sushi', 'おすし', '🍣', 'red', 'u'],
      ['bread', 'パン', '🍞', 'cream', 'u'],
      ['rice', 'ごはん', '🍚', 'white', 'u'],
      ['taco', 'タコス', '🌮', 'orange'],
      ['sandwich', 'サンドイッチ', '🥪', 'cream'],
      ['hamburger', 'ハンバーガー', '🍔', 'brown'],
      ['noodles', 'ラーメン', '🍜', 'cream', 'p'],
      ['curry', 'カレー', '🍛', 'orange', 'u'],
      ['pizza', 'ピザ', '🍕', 'red']
    ]},
    { id: 'sweets', ja: 'おかし', en: 'Sweets', icon: '🍰', items: [
      ['candy', 'あめ', '🍬', 'pink', 'u'],
      ['chocolate', 'チョコレート', '🍫', 'brown', 'u'],
      ['cookie', 'クッキー', '🍪', 'brown'],
      ['lollipop', 'ペロペロキャンディ', '🍭', 'pink'],
      ['doughnut', 'ドーナツ', '🍩', 'cream'],
      ['pudding', 'プリン', '🍮', 'yellow', 'u'],
      ['cupcake', 'カップケーキ', '🧁', 'pink'],
      ['popcorn', 'ポップコーン', '🍿', 'cream', 'u'],
      ['pie', 'パイ', '🥧', 'cream'],
      ['ice cream', 'アイスクリーム', '🍨', 'sky', 'u'],
      ['cake', 'ケーキ', '🍰', 'pink']
    ]},
    { id: 'plant', ja: 'しょくぶつ', en: 'Plants', icon: '🌻', items: [
      ['sprout', 'め', '🌱', 'lime'],
      ['leaf', 'は', '🍃', 'green'],
      ['clover', 'クローバー', '🍀', 'green'],
      ['flower', 'はな', '🌸', 'pink'],
      ['tulip', 'チューリップ', '🌷', 'red'],
      ['rose', 'バラ', '🌹', 'red'],
      ['sunflower', 'ひまわり', '🌻', 'yellow'],
      ['cactus', 'サボテン', '🌵', 'green'],
      ['bamboo', 'たけ', '🎋', 'lime', 'u'],
      ['tree', 'き', '🌳', 'green'],
      ['palm tree', 'ヤシのき', '🌴', 'teal']
    ]},
    { id: 'sport', ja: 'スポーツ', en: 'Sports', icon: '⚽', article: 'none', items: [
      ['table tennis', 'たっきゅう', '🏓', 'red'],
      ['badminton', 'バドミントン', '🏸', 'white'],
      ['baseball', 'やきゅう', '⚾', 'white'],
      ['tennis', 'テニス', '🎾', 'lime'],
      ['bowling', 'ボウリング', '🎳', 'navy'],
      ['rugby', 'ラグビー', '🏉', 'brown'],
      ['football', 'アメフト', '🏈', 'brown'],
      ['soccer', 'サッカー', '⚽', 'white'],
      ['volleyball', 'バレーボール', '🏐', 'cream'],
      ['basketball', 'バスケットボール', '🏀', 'orange'],
      ['swimming', 'すいえい', '🏊', 'sky']
    ]},
    { id: 'music', ja: 'がっき', en: 'Instruments', icon: '🎹', items: [
      ['bell', 'ベル', '🔔', 'yellow'],
      ['flute', 'フルート', '🪈', 'gray'],
      ['horn', 'ホルン', '📯', 'yellow'],
      ['violin', 'バイオリン', '🎻', 'brown'],
      ['banjo', 'バンジョー', '🪕', 'cream'],
      ['trumpet', 'トランペット', '🎺', 'yellow'],
      ['saxophone', 'サックス', '🎷', 'cream'],
      ['guitar', 'ギター', '🎸', 'brown'],
      ['accordion', 'アコーディオン', '🪗', 'red'],
      ['drum', 'ドラム', '🥁', 'red'],
      ['piano', 'ピアノ', '🎹', 'black']
    ]},
    { id: 'body', ja: 'からだ', en: 'Body', icon: '👀', items: [
      ['tooth', 'は', '🦷', 'white'],
      ['eye', 'め', '👁️', 'sky'],
      ['nose', 'はな', '👃', 'cream'],
      ['ear', 'みみ', '👂', 'cream'],
      ['mouth', 'くち', '👄', 'red'],
      ['tongue', 'した', '👅', 'pink'],
      ['hand', 'て', '✋', 'cream'],
      ['foot', 'あし', '🦶', 'cream'],
      ['arm', 'うで', '💪', 'cream'],
      ['heart', 'しんぞう', '🫀', 'red'],
      ['brain', 'のう', '🧠', 'pink']
    ]},
    { id: 'color', ja: 'いろ', en: 'Colors', icon: '🌈', article: 'none', items: [
      ['white', 'しろ', '⚪', 'white'],
      ['black', 'くろ', '⚫', 'black'],
      ['red', 'あか', '🔴', 'red'],
      ['blue', 'あお', '🔵', 'blue'],
      ['yellow', 'きいろ', '🟡', 'yellow'],
      ['green', 'みどり', '🟢', 'green'],
      ['orange', 'オレンジ', '🟠', 'orange'],
      ['purple', 'むらさき', '🟣', 'purple'],
      ['brown', 'ちゃいろ', '🟤', 'brown'],
      ['pink', 'ピンク', '💗', 'pink'],
      ['rainbow', 'にじ', '🌈', 'sky']
    ]},
    { id: 'number', ja: 'かず', en: 'Numbers', icon: '🔢', article: 'none', items: [
      ['zero', 'ゼロ', '0️⃣', 'gray'],
      ['one', 'いち', '1️⃣', 'red'],
      ['two', 'に', '2️⃣', 'orange'],
      ['three', 'さん', '3️⃣', 'yellow'],
      ['four', 'し', '4️⃣', 'lime'],
      ['five', 'ご', '5️⃣', 'green'],
      ['six', 'ろく', '6️⃣', 'teal'],
      ['seven', 'なな', '7️⃣', 'sky'],
      ['eight', 'はち', '8️⃣', 'blue'],
      ['nine', 'きゅう', '9️⃣', 'purple'],
      ['ten', 'じゅう', '🔟', 'pink']
    ]},
    { id: 'weather', ja: 'てんき', en: 'Weather', icon: '⛅', items: [
      ['drop', 'しずく', '💧', 'sky'],
      ['snow', 'ゆき', '❄️', 'white', 'u'],
      ['wind', 'かぜ', '🌬️', 'teal', 'u'],
      ['rain', 'あめ', '🌧️', 'blue', 'u'],
      ['cloud', 'くも', '☁️', 'white'],
      ['fog', 'きり', '🌫️', 'gray', 'u'],
      ['lightning', 'かみなり', '⚡', 'yellow', 'u'],
      ['snowman', 'ゆきだるま', '⛄', 'white'],
      ['rainbow', 'にじ', '🌈', 'purple'],
      ['storm', 'あらし', '⛈️', 'navy'],
      ['sun', 'たいよう', '☀️', 'orange', 't']
    ]},
    { id: 'space', ja: 'うちゅう', en: 'Space', icon: '🪐', items: [
      ['star', 'ほし', '⭐', 'yellow'],
      ['comet', 'すいせい', '☄️', 'orange'],
      ['moon', 'つき', '🌙', 'cream', 't'],
      ['alien', 'うちゅうじん', '👽', 'lime'],
      ['satellite', 'じんこうえいせい', '🛰️', 'gray'],
      ['rocket', 'ロケット', '🚀', 'red'],
      ['UFO', 'ユーフォー', '🛸', 'teal'],
      ['earth', 'ちきゅう', '🌍', 'blue', 't'],
      ['planet', 'わくせい', '🪐', 'cream'],
      ['sun', 'たいよう', '☀️', 'orange', 't'],
      ['galaxy', 'ぎんが', '🌌', 'purple']
    ]},
    { id: 'school', ja: 'がっこう', en: 'School', icon: '🎒', items: [
      ['pencil', 'えんぴつ', '✏️', 'yellow'],
      ['pen', 'ペン', '🖊️', 'navy'],
      ['crayon', 'クレヨン', '🖍️', 'red'],
      ['ruler', 'ものさし', '📏', 'cream'],
      ['scissors', 'はさみ', '✂️', 'gray', 'p'],
      ['notebook', 'ノート', '📓', 'orange'],
      ['book', 'ほん', '📚', 'blue'],
      ['clock', 'とけい', '🕐', 'white'],
      ['computer', 'コンピューター', '💻', 'gray'],
      ['bag', 'かばん', '🎒', 'red'],
      ['chair', 'いす', '🪑', 'brown']
    ]},
    { id: 'clothes', ja: 'ようふく', en: 'Clothes', icon: '👕', items: [
      ['glasses', 'めがね', '👓', 'gray', 'p'],
      ['socks', 'くつした', '🧦', 'sky', 'p'],
      ['gloves', 'てぶくろ', '🧤', 'red', 'p'],
      ['cap', 'ぼうし', '🧢', 'navy'],
      ['scarf', 'マフラー', '🧣', 'red'],
      ['tie', 'ネクタイ', '👔', 'navy'],
      ['shoes', 'くつ', '👟', 'white', 'p'],
      ['boots', 'ブーツ', '👢', 'brown', 'p'],
      ['shirt', 'シャツ', '👕', 'sky'],
      ['pants', 'ズボン', '👖', 'blue', 'p'],
      ['coat', 'コート', '🧥', 'brown']
    ]},
    { id: 'bird', ja: 'とり', en: 'Birds', icon: '🦅', items: [
      ['chick', 'ひよこ', '🐣', 'yellow'],
      ['bird', 'とり', '🐦', 'sky'],
      ['dove', 'はと', '🕊️', 'white'],
      ['parrot', 'オウム', '🦜', 'red'],
      ['duck', 'アヒル', '🦆', 'cream'],
      ['owl', 'フクロウ', '🦉', 'brown'],
      ['chicken', 'ニワトリ', '🐔', 'white'],
      ['penguin', 'ペンギン', '🐧', 'navy'],
      ['eagle', 'ワシ', '🦅', 'brown'],
      ['swan', 'ハクチョウ', '🦢', 'white'],
      ['peacock', 'クジャク', '🦚', 'teal']
    ]},
    { id: 'tool', ja: 'どうぐ', en: 'Tools', icon: '🔨', items: [
      ['pin', 'ピン', '📌', 'red'],
      ['key', 'かぎ', '🔑', 'yellow'],
      ['screw', 'ねじ', '🔩', 'gray'],
      ['scissors', 'はさみ', '✂️', 'gray', 'p'],
      ['brush', 'ふで', '🖌️', 'brown'],
      ['hammer', 'ハンマー', '🔨', 'brown'],
      ['wrench', 'スパナ', '🔧', 'gray'],
      ['screwdriver', 'ドライバー', '🪛', 'navy'],
      ['saw', 'のこぎり', '🪚', 'cream'],
      ['axe', 'おの', '🪓', 'brown'],
      ['ladder', 'はしご', '🪜', 'cream']
    ]}
  ];

  // つづりが ぼいん字でも はつおんが しいんの ことば
  const ARTICLE_EXCEPTION = { 'UFO': 'a' };

  const MAX_LEVEL = SIZES.length - 1;

  // ドロップで でてくるのは ちいさい 5 しゅるい まで(スイカゲームと おなじ)
  const DROPPABLE = [0, 1, 2, 3, 4];
  const DROP_WEIGHT = [30, 26, 20, 14, 10];

  /** ジャンルの なま データ を、ゲームで つかう かたちに くみたてる */
  function build(genre) {
    return genre.items.map(function (it, lv) {
      const pal = PALETTE[it[3]] || PALETTE.gray;
      return {
        lv: lv,
        en: it[0],
        ja: it[1],
        emoji: it[2],
        r: SIZES[lv].r,
        score: SIZES[lv].score,
        c1: pal[0],
        c2: pal[1],
        count: it[4] || null   // 'u'=かぞえられない / 'p'=ふくすう / null=ふつう
      };
    });
  }

  const Words = {
    GENRES: GENRES,
    MAX_LEVEL: MAX_LEVEL,
    DROPPABLE: DROPPABLE,
    genre: null,
    LIST: [],

    /** ジャンルを きりかえる。id が ない ときは さいしょの ジャンル */
    setGenre: function (id) {
      const g = GENRES.find(function (x) { return x.id === id; }) || GENRES[0];
      this.genre = g;
      this.LIST = build(g);
      return g;
    },

    get: function (lv) {
      return this.LIST[Math.max(0, Math.min(MAX_LEVEL, lv))];
    },

    pickDropLevel: function () {
      let total = 0;
      for (const w of DROP_WEIGHT) total += w;
      let r = Math.random() * total;
      for (let i = 0; i < DROPPABLE.length; i++) {
        r -= DROP_WEIGHT[i];
        if (r <= 0) return DROPPABLE[i];
      }
      return 0;
    },

    /** つづりを 1もじずつ (フォニックス れんしゅうよう) */
    letters: function (en) {
      return en.toUpperCase().replace(/ /g, '').split('');
    },

    /**
     * a か an か。apple / orange / eye は ぼいんで はじまるので "an"。
     * ただし つづりが ぼいんでも「ユー」と よむ UFO は "a UFO"。
     * えいごがくしゅうの ゲームなので ここは まちがえられない。
     */
    article: function (en) {
      if (ARTICLE_EXCEPTION[en]) return ARTICLE_EXCEPTION[en];
      return /^[aeiou]/i.test(en) ? 'an' : 'a';
    },

    /**
     * 「Make an apple!」の ような ぶんを つくる。
     *   ・いろ/かず/てんき/スポーツ ジャンル → かんし なし「Make red!」
     *   ・かぞえられない ことば(sushi, rice) → かんし なし「Make sushi!」
     *   ・いつも ふくすうの ことば(scissors) → かんし なし「Make scissors!」
     *   ・それ いがい → 「Make a dog!」「Make an apple!」
     */
    makeSentence: function (item) {
      const g = this.genre;
      if (g && g.article === 'none') return 'Make ' + item.en + '!';
      if (item.count === 't') return 'Make the ' + item.en + '!';
      if (item.count) return 'Make ' + item.en + '!';
      return 'Make ' + this.article(item.en) + ' ' + item.en + '!';
    },

    /**
     * さいごの レベル どうしが ぶつかった ときの セリフ。
     * ふくすう形は ことばに よって ふきそくなので、
     * 「Double watermelon!」と かたちを かえずに つかう。
     */
    bonusCheer: function (item) {
      return 'Amazing! Double ' + item.en + '!';
    }
  };

  Words.setGenre(GENRES[0].id);
  global.Words = Words;
})(window);
