// メインの島の ひろば（東の 広場）に いる 人たち（2026-11）。**データだけ**：3D は plaza-walkers.js、場所は main-plaza.js。
// ・id は ずっと 同じ（`plaza_…`）。なかよし度・おうちに よばれる などを 足す ときは この id で おぼえる。
// ・name は なまえ（訳では ない）＝ lang.json には 入れない。画面では isJa() で .ja / .en を えらぶ。
// ・personality は 8 しゅるい（PERSONALITIES の かぎ）。あいさつは せいかくごとに 3〜4 つ（`lines`）。人が じぶんの `lines` を もてば そちらが 先。
// ・ことばは ひらがな 多め＋分かち書き、英語は 7 さいが 読める みじかい 文。
// ・route（歩く 人）：島の 中の 座標の 点を じゅんに めぐる。`face` は そこで 止まった ときに 向く ほう（ラジアン・0 ＝ 南）。`loop:false` は 行って もどる。
//   点は 手で 置いた「あいて いる 地面」。物を 足したら ここも 見なおす（検査：uspeak.rpg.main.blocked で 道を たどる）。
// ・stall（お店の 人）：main-plaza.js の STALLS の id。台の うしろに 立つ。

export const PERSONALITIES = {
  cheerful: { ja: 'げんき', en: 'cheerful', icon: '☀️', lines: [
    { ja: 'やっほー！ きょうも いい てんき！', en: 'Hi! What a nice day!' },
    { ja: 'いっしょに あそぼう！', en: "Let's play together!" },
    { ja: 'ひろばは たのしいよ！', en: 'The plaza is fun!' },
    { ja: 'げんき いっぱい だよ！', en: 'I feel great today!' },
  ] },
  relaxed: { ja: 'のんびり', en: 'relaxed', icon: '🍃', lines: [
    { ja: 'ふう。 かぜが きもちいいね。', en: 'Ah. The wind feels nice.' },
    { ja: 'ゆっくり していってね。', en: 'Take your time here.' },
    { ja: 'ベンチで ひとやすみ しよう。', en: "Let's rest on the bench." },
  ] },
  shy: { ja: 'てれや', en: 'shy', icon: '🌸', lines: [
    { ja: 'あ…… こんにちは。', en: 'Oh... hello.' },
    { ja: 'はなして くれて ありがとう。', en: 'Thank you for talking to me.' },
    { ja: 'また…… きて くれる？', en: 'Will you... come again?' },
  ] },
  bookish: { ja: 'ものしり', en: 'bookish', icon: '📚', lines: [
    { ja: 'とけいだいの はりは せかいの じかん だよ。', en: 'The clock tower shows the world time.' },
    { ja: 'よるに なると おみせは しまるんだ。', en: 'The shops close at night.' },
    { ja: 'しってる？ あさは 7じに はじまるよ。', en: 'Did you know? Morning starts at seven.' },
    { ja: '本を よむと ことばが ふえるよ。', en: 'Reading books gives you new words.' },
  ] },
  foodie: { ja: 'くいしんぼう', en: 'foodie', icon: '🍩', lines: [
    { ja: 'おなか すいたなあ。', en: "I'm so hungry." },
    { ja: 'ドーナツが だいすき なんだ！', en: 'I love donuts!' },
    { ja: 'やたいの りんご、 おいしいよ。', en: 'The apples at the stand are yummy.' },
    { ja: 'いい においが する！', en: 'Something smells good!' },
  ] },
  stylish: { ja: 'おしゃれ', en: 'stylish', icon: '🎀', lines: [
    { ja: 'その ふく、 にあってるね！', en: 'Your outfit looks great!' },
    { ja: 'フリーマーケットで ぼうしを 見つけたの。', en: 'I found a hat at the flea market.' },
    { ja: 'きょうの いろは ピンク！', en: "Today's color is pink!" },
  ] },
  earnest: { ja: 'しっかり', en: 'earnest', icon: '✅', lines: [
    { ja: 'こんにちは。 きょうも がんばろう。', en: "Hello. Let's do our best today." },
    { ja: 'しゅくだいは おわった？', en: 'Did you finish your homework?' },
    { ja: 'やくそくの じかんは まもるよ。', en: 'I am always on time.' },
  ] },
  playful: { ja: 'いたずら', en: 'playful', icon: '😜', lines: [
    { ja: 'へへっ、 びっくり した？', en: 'Hehe, did I surprise you?' },
    { ja: 'おにごっこ しよう！ きみが おに！', en: "Let's play tag! You're it!" },
    { ja: 'ふんすいに とびこんじゃ だめだよ。', en: "Don't jump in the fountain." },
    { ja: 'ひみつの ばしょ、 しってる？', en: 'Do you know a secret place?' },
  ] },
};

const S = Math.PI;       // 南（+z）を 向く ＝ 0、北を 向く ＝ π
export const PLAZA_NPCS = [
  // ---- 歩く 人（8 人）----
  { id: 'plaza_mika', name: { ja: 'みか', en: 'Mika' }, personality: 'cheerful', color: 0xf2994a, speed: 2.1,
    route: [{ x: 61, z: 11 }, { x: 76.5, z: 11 }, { x: 76.5, z: 21.8 }, { x: 61, z: 21.8 }] },
  { id: 'plaza_sota', name: { ja: 'そうた', en: 'Sota' }, personality: 'playful', color: 0x4fae6b, speed: 2.4,
    route: [{ x: 66.5, z: 13 }, { x: 66.5, z: 19.3 }, { x: 75, z: 19.3 }, { x: 75, z: 13 }] },
  { id: 'plaza_hana', name: { ja: 'はな', en: 'Hana' }, personality: 'stylish', color: 0xe86fa0, speed: 1.6, loop: false,
    route: [{ x: 59.8, z: 23.2, face: 0 }, { x: 64.3, z: 23.2, face: 0 }, { x: 68.8, z: 23.2, face: 0 }, { x: 73.2, z: 23.2, face: 0 }, { x: 77.7, z: 23.2, face: 0 }, { x: 82.2, z: 23.2, face: 0 }] },
  { id: 'plaza_ken', name: { ja: 'けん', en: 'Ken' }, personality: 'bookish', color: 0x3d6fb0, speed: 1.7,
    route: [{ x: 71, z: 10.4, face: S }, { x: 64.6, z: 9.2 }, { x: 60.2, z: 13.4 }, { x: 65.5, z: 11.8 }] },
  { id: 'plaza_yui', name: { ja: 'ゆい', en: 'Yui' }, personality: 'shy', color: 0xb48cff, speed: 1.4,
    route: [{ x: 59.2, z: 8.2 }, { x: 59.2, z: 20.2 }, { x: 63, z: 17.6 }, { x: 63, z: 9.6 }] },
  { id: 'plaza_gen', name: { ja: 'げん', en: 'Gen' }, personality: 'relaxed', color: 0x7a9a5a, speed: 1.2,
    route: [{ x: 77.8, z: 9.4 }, { x: 77.8, z: 21.4 }, { x: 74.8, z: 12.2 }] },
  // 大通りを 歩く 2 人。
  { id: 'plaza_daichi', name: { ja: 'だいち', en: 'Daichi' }, personality: 'foodie', color: 0xd9483b, speed: 1.9,
    route: [{ x: 55, z: 17.4 }, { x: 40, z: 17.4, face: 0 }, { x: 26, z: 17.4, face: 0 }, { x: 26, z: 14.7 }, { x: 40, z: 14.7 }, { x: 55, z: 14.7 }] },
  { id: 'plaza_riko', name: { ja: 'りこ', en: 'Riko' }, personality: 'earnest', color: 0x2f9e8f, speed: 2.0,
    route: [{ x: 47, z: 15.2 }, { x: 60, z: 15.6 }, { x: 67.4, z: 16 }, { x: 60, z: 16.9 }, { x: 47, z: 16.9 }] },
  // ---- フリーマーケットの お店の 人（6 人・台の うしろ）----
  { id: 'plaza_tae', name: { ja: 'たえ', en: 'Tae' }, personality: 'foodie', color: 0xe0a526, stall: 'fruit',
    lines: [{ ja: 'いらっしゃい！ あまい くだもの だよ。', en: 'Welcome! Sweet fruit for you.' }, { ja: 'この りんごは とれたて だよ。', en: 'These apples are fresh.' }, { ja: 'おやつに クッキーは どう？', en: 'How about a cookie for a snack?' }] },
  { id: 'plaza_nobu', name: { ja: 'のぶ', en: 'Nobu' }, personality: 'stylish', color: 0x6b4c9c, stall: 'hats',
    lines: [{ ja: 'ぼうし いろいろ あるよ。', en: 'I have many kinds of hats.' }, { ja: 'この ぼうし、 きみに にあいそう。', en: 'This hat would look good on you.' }, { ja: 'ふるい けど まだ きれい だよ。', en: 'It is old but still nice.' }] },
  { id: 'plaza_sakura', name: { ja: 'さくら', en: 'Sakura' }, personality: 'cheerful', color: 0xf08fb0, stall: 'toys',
    lines: [{ ja: 'つみきで なにを つくる？', en: 'What will you build with blocks?' }, { ja: 'ちいさい ころの おもちゃ なの。', en: 'These were my toys when I was little.' }, { ja: '見て いって ね！', en: 'Come and take a look!' }] },
  { id: 'plaza_leo', name: { ja: 'レオ', en: 'Leo' }, personality: 'relaxed', color: 0x5a7fb0, stall: 'furniture',
    lines: [{ ja: 'この いすは すわり やすいよ。', en: 'This chair is nice to sit on.' }, { ja: 'ゆっくり 見て いって。', en: 'Take your time and look.' }, { ja: 'ランプは よるに きれい だよ。', en: 'The lamp looks pretty at night.' }] },
  { id: 'plaza_mari', name: { ja: 'まり', en: 'Mari' }, personality: 'bookish', color: 0x2f8f5b, stall: 'books',
    lines: [{ ja: 'えほんが たくさん あるよ。', en: 'I have lots of picture books.' }, { ja: 'この 本は わたしの おきにいり。', en: 'This book is my favorite.' }, { ja: 'よんだ 本を つぎの 人へ。', en: 'A book I read goes to the next reader.' }] },
  { id: 'plaza_tom', name: { ja: 'トム', en: 'Tom' }, personality: 'playful', color: 0xc8553d, stall: 'music',
    lines: [{ ja: 'ギターを ひいて みる？', en: 'Want to try the guitar?' }, { ja: 'カメラで ハイ、チーズ！', en: 'Say cheese for the camera!' }, { ja: 'たからものが 見つかる かもよ。', en: 'You may find a treasure here.' }] },
];

// その 人の あいさつ（じぶんの lines → せいかくの lines）。
export const linesOf = (npc) => (npc?.lines?.length ? npc.lines : PERSONALITIES[npc?.personality]?.lines) || [];
