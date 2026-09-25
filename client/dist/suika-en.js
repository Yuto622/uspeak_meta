// えいご スイカゲーム を 英語で出す（同梱物には いっさい 触らずに）。
//
// **`client/dist/suika/` の中は1バイトも書き換えない。** あそこは無改変で置いてある
// フォルダで、`tests/guests-manifest.mjs` が SHA-256 を照合している。直したくなったら
// それは vendor ではなく fork になる、というのがこのリポジトリの約束
// （`client/CLAUDE.md` の「同梱した外部のゲーム」）。
//
// かわりに **同一オリジンの iframe に外から手を入れる**（`arcade.js` の `settle(doc)`）。
// BLOCKWILD のパレットを間引いているのと同じやり方で、あちらのファイルは無傷のまま。
//
// **単語の日本語は訳さない。** `fruits.js` の `{ en: 'cherry', ja: 'さくらんぼ' }` の
// `ja` は「cherry の意味」そのもので、このゲームが教えている中身。訳すと教材でなくなる。
// ここで英語にするのは **画面の文字（ボタン・見出し・説明・お知らせ）だけ**。

// ミッションの文だけは くだものの名前を英語にする（"Make an apple!" が
// このゲーム自身の説明文にも出てくる、意図された言い回しだから）。
// 11個だけなので、あちらから import せずに ここに持つ（同梱物に依存を作らない）。
const FRUIT_EN = {
  さくらんぼ: 'cherry', いちご: 'strawberry', ぶどう: 'grape', オレンジ: 'orange',
  レモン: 'lemon', りんご: 'apple', なし: 'pear', もも: 'peach',
  パイナップル: 'pineapple', メロン: 'melon', スイカ: 'watermelon',
};
const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

// そのまま置き換える文。**左が画面に出ている日本語そのもの。**
export const WORDS = {
  'えいご スイカゲーム 🍉 - あそんで おぼえる えいごたんご': 'Suika Eigo 🍉 — play and learn English words',
  'えいご スイカゲーム': 'Suika Eigo',
  'つくって あそんで おぼえる えいごたんご 🍉': 'Build, play and learn English words 🍉',
  '🎲 ジャンル：': '🎲 Theme:',
  '🔊 おと オン': '🔊 Sound on',
  '🔇 おと オフ': '🔇 Sound off',
  '📖 ずかん': '📖 Book',
  '❓ あそびかた': '❓ How to play',
  スコア: 'Score',
  さいこう: 'Best',
  '⭐ スター': '⭐ Stars',
  'つぎの ことば': 'Next word',
  '🎯 ミッション': '🎯 Mission',
  'できた！ ⭐': 'Done! ⭐',
  'えいご レベル': 'English level',
  'ミッション たっせい と あたらしい ことばで ⭐ が たまるよ': 'Finish missions and find new words to collect ⭐',
  'おなじ ものを くっつけると': 'Join two of the same and',
  'つぎの ものに しんか！': 'they grow into the next one!',
  'えいごの ことば': 'The English word',
  'も いっしょに おぼえよう。': 'comes with it — learn them together.',
  'ぜんぶで 20 しゅるい・タップで えらぶ': '20 kinds in all · tap to choose',
  '▶ スタート': '▶ Start',
  'タップ / クリック で おとす': 'Tap or click to drop',
  '← → キーで うごかして スペースで おとす': 'Move with ← → and drop with space',
  'おしまい！': 'Game over!',
  'おぼえた ことば': 'Words you learned',
  'きょう おぼえた えいご（タップで はつおん）': "Today's English (tap to hear it)",
  '🔁 もういちど あそぶ': '🔁 Play again',
  'おなじ ものを くっつけよう！': 'Join two of the same!',
  きく: 'Listen',
  つづり: 'Spelling',
  'しんかの じゅんばん': 'How they grow',
  'タップ すると えいごが きこえるよ': 'Tap one to hear the English',
  '🎲 ジャンルを えらぼう': '🎲 Choose a theme',
  ぜんぶで: 'All',
  '20 しゅるい': '20 kinds',
  '。えらぶと あたらしい ゲームが はじまるよ。': '. Choosing one starts a new game.',
  'ずかんと さいこうてんは ジャンルごとに のこります。': 'Your book and best score are kept for each theme.',
  とじる: 'Close',
  'の ずかん': ' book',
  'あつめた ことば：': 'Words collected:',
  'カードを タップ すると はつおんが きけるよ': 'Tap a card to hear how it sounds',
  'ジャンルを えらぶ': 'Choose a theme',
  'くだもの・どうぶつ・のりもの・うちゅう…': 'Fruit, animals, vehicles, space…',
  'から えらべるよ。「🎲 ジャンル」を おしてね。': 'Press 🎲 Theme to pick one.',
  'ものを おとす': 'Drop things',
  'ゲームばんを タップ（クリック）すると、その ばしょに おちるよ。': 'Tap (or click) the board and it drops there.',
  'おなじ ものを くっつける': 'Join the same two',
  'おなじ ものが ふれると、ひとつ 大きい ものに しんか！ そのとき': 'When two of the same touch, they grow into a bigger one — and',
  'が でて、こえで よんでくれるよ。': 'appears, and is read out loud.',
  'さいごの ひとつを めざそう': 'Reach the last one',
  'いちばん ちいさい ものから はじめて、11 だんかいで さいごの ものに なるよ。': 'Start from the smallest; eleven steps later you reach the last one.',
  ミッション: 'Missions',
  '「Make an apple!」の ミッションを クリア すると ⭐ が もらえるよ。': 'Clear a mission like "Make an apple!" to earn ⭐.',
  'きを つけて！': 'Watch out!',
  'てんせんの ラインより 上に 2びょう いると おしまい。': 'Two seconds above the dotted line and the game is over.',
  '※ はつおんは パソコンや スマホの おんせい きのうを つかって います。おとが でない ときは 「🔊 おと オン」 を おして ためしてね。': '※ The pronunciation uses your device’s own voice. If you hear nothing, press 🔊 Sound on and try again.',
  // 属性（title / aria-label）
  'つづりを きく': 'Hear the spelling',
  'はつおんを きく': 'Hear it said',
  よみあげる: 'Read aloud',
  'スイカゲームの ゲームばん': 'The Suika game board',
  // ジャンルの名前。**これは教える単語ではなく、その入れ物の名前**（カテゴリ）なので訳す。
  // 英語はあちらの `words.js` が最初から持っているものと同じ。
  'くだもの': 'Fruits',
  'どうぶつ': 'Animals',
  'のりもの': 'Vehicles',
  'うみのいきもの': 'Sea animals',
  'むし': 'Insects',
  'やさい': 'Vegetables',
  'たべもの': 'Food',
  'おかし': 'Sweets',
  'しょくぶつ': 'Plants',
  'スポーツ': 'Sports',
  'がっき': 'Instruments',
  'からだ': 'Body',
  'いろ': 'Colors',
  'かず': 'Numbers',
  'てんき': 'Weather',
  'うちゅう': 'Space',
  'がっこう': 'School',
  'ようふく': 'Clothes',
  'とり': 'Birds',
  'どうぐ': 'Tools',
  // game.js / quiz.js が あとから 書くもの
  'まだ つくって いないよ': 'Not made yet',
  'ミッション +100': 'Mission +100',
  'あぶない！ ここを こえないで': "Careful! Don't go above this",
  'ここを こえたら おわり': 'Above this line, the game ends',
  'つぎは おなじ ものを くっつけて えいごを おぼえよう！': 'Next time, join the same ones and learn the English!',
  'きいて えらぼう！': 'Listen and choose!',
  'なんの ことばか きこえるかな？': 'Which word do you hear?',
  'えいごで かくと どれ？': 'Which one is it in English?',
  'この え の えいごを えらぼう': 'Choose the English for this picture',
  'さいしょの もじは？': 'What is the first letter?',
  'きこえた ことばの さいしょの アルファベットは どれ？': 'Which letter does the word start with?',
  'おしい！ もういちど きいてみよう 🎧': 'So close! Have another listen 🎧',
  'せいかい！ ⭐': 'Correct! ⭐',
  'こたえは こちら': 'Here is the answer',
};

// 組み立てられる文。**あとから JavaScript が作るので、丸ごとの一致では拾えない。**
export const RULES = [
  [/^(.+?) を つくろう！$/u, (m) => {
    const en = FRUIT_EN[m[1].trim()];
    return en ? `Make ${article(en)} ${en}!` : `Make ${m[1]}!`;
  }],
  [/^レベル\s*(\d+)$/u, (m) => `Level ${m[1]}`],
  [/^レベル\s*$/u, () => 'Level '],
];

const JA = /[぀-ゟ゠-ヿ㐀-鿿]/;

export function toEnglish(text) {
  const t = String(text ?? '');
  const key = t.trim();
  if (!key || !JA.test(key)) return null;
  if (WORDS[key]) return t.replace(key, WORDS[key]);
  for (const [re, make] of RULES) {
    const m = key.match(re);
    if (m) return t.replace(key, make(m));
  }
  return null;
}
