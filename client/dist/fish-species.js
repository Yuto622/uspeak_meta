// 池・川・海の さかな — **この表が唯一の定義元**。
//
// 写真は `assets/fish/<id>.jpg`（渡された1024pxの絵を 320px に落としたもの）。
// `fishing-data.js` がこの表を 100匹の枠に割りあて、名前と写真を決める。
//
// **JSON ではなく JS にしてあるのは、サーバーも import するから。** `server/src/game/`
// の judge / economy / fish-moves が `fishing-data.js` を同期で読むので、途中に
// fetch を挟めない（wardrobe.json のように「両側が自分で読む」形にもできるが、
// この表は値段も判定も持たないので、素の配列がいちばん素直）。
//
// **あとから足すときは、写真を assets/fish に置いて ここに1行足すだけ。**
//   zone : pond（池・英検5級と4級）/ river（川・3級）/ sea（海・準2級と2級）
//   tier : 0 コモン → 4 レジェンド。どのレア度の枠に入りやすいかの目安。
//   item : 「さかなではないもの」（ながぐつ・ボトルメール・たからばこ・きんかい・
//          にんぎょの うろこ）。**1つの釣り場で1回しか出さない**ので、印をつけてある。
//          印がないと、しゅるいの少ない池では たからばこ ばかり かかる。
//          zone: 'any' は どの釣り場でも かかるもの。
export const SPECIES = [
  { id: 'medaka', ja: 'メダカ', en: 'Medaka', zone: 'pond', tier: 0 },
  { id: 'boot', ja: 'ながぐつ', en: 'Old Boot', zone: 'any', tier: 0, item: true },
  { id: 'pearl', ja: 'しんじゅ貝', en: 'Pearl Shell', zone: 'sea', tier: 2 },
  { id: 'dugong', ja: 'ジュゴン', en: 'Dugong', zone: 'sea', tier: 2 },
  { id: 'lionfish', ja: 'ミノカサゴ', en: 'Lionfish', zone: 'sea', tier: 1 },
  { id: 'koi', ja: 'コイ', en: 'Koi Carp', zone: 'pond', tier: 1 },
  { id: 'orca', ja: 'シャチ', en: 'Orca', zone: 'sea', tier: 4 },
  { id: 'anemone', ja: 'イソギンチャク', en: 'Anemone Home', zone: 'sea', tier: 1 },
  { id: 'whaleshark', ja: 'ジンベエザメ', en: 'Whale Shark', zone: 'sea', tier: 4 },
  { id: 'betta', ja: 'ベタ', en: 'Betta', zone: 'pond', tier: 1 },
  { id: 'bluetang', ja: 'ナンヨウハギ', en: 'Blue Tang', zone: 'sea', tier: 1 },
  { id: 'tuna', ja: 'クロマグロ', en: 'Bluefin Tuna', zone: 'sea', tier: 3 },
  { id: 'bluegill', ja: 'ブルーギル', en: 'Bluegill', zone: 'pond', tier: 0 },
  { id: 'clown1', ja: 'カクレクマノミ', en: 'Clownfish', zone: 'sea', tier: 0 },
  { id: 'goldbar', ja: 'きんかい', en: 'Gold Bar', zone: 'sea', tier: 3, item: true },
  { id: 'bottle1', ja: 'ボトルメール', en: 'Message Bottle', zone: 'any', tier: 1, item: true },
  { id: 'coel1', ja: 'シーラカンス', en: 'Coelacanth', zone: 'sea', tier: 4 },
  { id: 'coel2', ja: 'シーラカンス', en: 'Coelacanth', zone: 'sea', tier: 4 },
  { id: 'whoopie1', ja: 'ウーピーフィッシュ', en: 'Whoopie Fish', zone: 'pond', tier: 4 },
  { id: 'whoopie2', ja: 'ウーピーフィッシュ', en: 'Whoopie Fish', zone: 'river', tier: 4 },
  { id: 'chest1', ja: 'たからばこ', en: 'Treasure Chest', zone: 'any', tier: 3, item: true },
  { id: 'nushi', ja: 'みずうみの ぬし', en: 'Lake Guardian', zone: 'pond', tier: 4 },
  { id: 'squid', ja: 'ダイオウイカ', en: 'Giant Squid', zone: 'sea', tier: 2 },
  { id: 'hotaruika', ja: 'ホタルイカ', en: 'Firefly Squid', zone: 'sea', tier: 2 },
  { id: 'ugui', ja: 'ウグイ', en: 'Dace', zone: 'river', tier: 0 },
  { id: 'mendako', ja: 'メンダコ', en: 'Flapjack Octopus', zone: 'sea', tier: 2 },
  { id: 'tobiuo', ja: 'トビウオ', en: 'Flying Fish', zone: 'sea', tier: 1 },
  { id: 'shark', ja: 'サメ', en: 'Shark', zone: 'sea', tier: 3 },
  { id: 'frog', ja: 'カエル', en: 'Frog', zone: 'pond', tier: 0 },
  { id: 'manatee', ja: 'マナティ', en: 'Manatee', zone: 'sea', tier: 2 },
  { id: 'marlin', ja: 'カジキ', en: 'Marlin', zone: 'sea', tier: 3 },
  { id: 'scale', ja: 'にんぎょの うろこ', en: 'Mermaid Scale', zone: 'sea', tier: 2, item: true },
  { id: 'starfish', ja: 'ヒトデ', en: 'Starfish', zone: 'sea', tier: 0 },
  { id: 'orca2', ja: 'シャチ', en: 'Orca', zone: 'sea', tier: 4 },
  { id: 'penguin2', ja: 'ペンギン', en: 'Penguin', zone: 'sea', tier: 1 },
  { id: 'fugu1', ja: 'フグ', en: 'Pufferfish', zone: 'sea', tier: 1 },
  { id: 'fugu2', ja: 'フグ', en: 'Pufferfish', zone: 'sea', tier: 1 },
  { id: 'nijimasu2', ja: 'にじの マス', en: 'Rainbow Trout', zone: 'river', tier: 4 },
  { id: 'nijimasu', ja: 'ニジマス', en: 'Rainbow Trout', zone: 'river', tier: 1 },
  { id: 'crab', ja: 'カニ', en: 'Crab', zone: 'sea', tier: 0 },
  { id: 'zarigani', ja: 'ザリガニ', en: 'Crayfish', zone: 'pond', tier: 0 },
  { id: 'tai1', ja: 'タイ', en: 'Sea Bream', zone: 'sea', tier: 2 },
  { id: 'tai2', ja: 'タイ', en: 'Sea Bream', zone: 'sea', tier: 2 },
  { id: 'tsunodashi', ja: 'ツノダシ', en: 'Angelfish', zone: 'sea', tier: 1 },
  { id: 'anko1', ja: 'チョウチンアンコウ', en: 'Anglerfish', zone: 'sea', tier: 2 },
  { id: 'anko2', ja: 'チョウチンアンコウ', en: 'Anglerfish', zone: 'sea', tier: 2 },
  { id: 'bass', ja: 'ブラックバス', en: 'Bass', zone: 'pond', tier: 1 },
  { id: 'katsuo1', ja: 'カツオ', en: 'Bonito', zone: 'sea', tier: 1 },
  { id: 'namazu', ja: 'ナマズ', en: 'Catfish', zone: 'river', tier: 1 },
  { id: 'clown2', ja: 'クマノミ', en: 'Clownfish', zone: 'sea', tier: 0 },
  { id: 'sanma', ja: 'サンマ', en: 'Pacific Saury', zone: 'sea', tier: 0 },
  { id: 'hirame', ja: 'ヒラメ', en: 'Flatfish', zone: 'sea', tier: 1 },
  { id: 'iwashi', ja: 'イワシ', en: 'Sardine', zone: 'sea', tier: 0 },
  { id: 'funa', ja: 'フナ', en: 'Crucian Carp', zone: 'pond', tier: 0 },
  { id: 'discus', ja: 'ディスカス', en: 'Discus', zone: 'pond', tier: 2 },
  { id: 'iruka1', ja: 'イルカ', en: 'Dolphin', zone: 'sea', tier: 3 },
  { id: 'iruka2', ja: 'イルカ', en: 'Dolphin', zone: 'sea', tier: 3 },
  { id: 'unagi', ja: 'ウナギ', en: 'Eel', zone: 'river', tier: 2 },
  { id: 'sakuramasu', ja: 'サクラマス', en: 'Masu Trout', zone: 'river', tier: 1 },
  { id: 'utsubo', ja: 'ウツボ', en: 'Moray Eel', zone: 'sea', tier: 2 },
  { id: 'tetra', ja: 'ネオンテトラ', en: 'Neon Tetra', zone: 'pond', tier: 0 },
  { id: 'ryugu', ja: 'リュウグウノツカイ', en: 'Oarfish', zone: 'sea', tier: 4 },
  { id: 'sake', ja: 'サケ', en: 'Salmon', zone: 'river', tier: 2 },
  { id: 'katsuo2', ja: 'カツオ', en: 'Bonito', zone: 'sea', tier: 1 },
  { id: 'gold1', ja: 'こがねの さかな', en: 'Golden Fish', zone: 'river', tier: 4 },
  { id: 'gold2', ja: 'こがねの さかな', en: 'Golden Fish', zone: 'sea', tier: 4 },
  { id: 'chinanago1', ja: 'チンアナゴ', en: 'Garden Eel', zone: 'sea', tier: 0 },
  { id: 'chinanago2', ja: 'チンアナゴ', en: 'Garden Eel', zone: 'sea', tier: 0 },
  { id: 'penguin1', ja: 'ペンギン', en: 'Penguin', zone: 'sea', tier: 1 },
];

export const SPECIES_BY_ID = Object.assign(Object.create(null),
  Object.fromEntries(SPECIES.map((s) => [s.id, s])));
