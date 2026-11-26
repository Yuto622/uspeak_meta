// かぐ屋の 品ぞろえ（1000 しゅるい いじょう）：形（DESIGNS）× スタイル（STYLES）。ページと 部屋（server/src/game/town.js）が 同じ ここを 読む。
//
// ・前から ある 31 しゅるい（town.json の furniture：chair・bed・pc・bed_canopy …）は **id も 値段も 見た目も そのまま**。
//   子どもの セーブ（props_json・room_json）は その id で 書かれて いる。ここで 足すのは あたらしい 品だけ。
// ・あたらしい 品の id は `<形>-<スタイル>`（れい：`sofa-pink`・`bed_king-royal`・`fridge-dots`）。**あとから かえない**
//   （形や スタイルを 足すのは よい。消す・名前を かえるのは だめ）。
// ・値段＝形の もとの 値段 × スタイルの かけ算（10 コインに まるめる）。買う 判定は 部屋（サーバー）。ページの 値段は 見せるだけ。
// ・大きさ（w × d マス）と ベッドの ねる 高さは 形が 持つ＝どの スタイルの ベッドでも ねられる。
// ・ここは 数と 名前だけ（three.js も DOM も 読まない）。形は furniture-real.js が `shape`（＝形の id）と `style` で 組み立てる。

// うりばの たな（カテゴリ）。
export const FURNITURE_CATEGORIES = [
  { id: 'seat', en: 'Chairs & Sofas', ja: 'いす・ソファ', icon: '🛋' },
  { id: 'table', en: 'Desks & Tables', ja: 'つくえ・テーブル', icon: '🪑' },
  { id: 'bed', en: 'Beds', ja: 'ベッド', icon: '🛏' },
  { id: 'storage', en: 'Storage', ja: 'しゅうのう', icon: '🗄' },
  { id: 'light', en: 'Lights', ja: 'あかり', icon: '💡' },
  { id: 'electric', en: 'Electronics', ja: 'でんき', icon: '📺' },
  { id: 'plant', en: 'Plants', ja: 'しょくぶつ', icon: '🪴' },
  { id: 'toy', en: 'Toys & Music', ja: 'おもちゃ・がっき', icon: '🧸' },
  { id: 'deco', en: 'Decor', ja: 'かざり', icon: '🖼' },
  { id: 'kitchen', en: 'Kitchen & Bath', ja: 'キッチン・おふろ', icon: '🍳' },
];

// 形。role＝スタイルの どの 色が その 形の「主な 色」に なるか（fabric＝ぬの／wood＝わく／main＝ぬった 本体／keep＝color の まま）。
// soft＝わくの ない ぬのの 形：1 は 木と きんぞくの スタイルで、2 は きんぞくの スタイルで、ぬのを その 色に する（れい：きんの くま）。
// base＝もとの 値段。前から ある 形は town.json と 同じ w・d・h・ベッドの 数（かえたら server/test が 落ちる）。
export const FURNITURE_DESIGNS = [
  // ---- 前から ある 形（スタイルちがいを 足す）----
  { id: 'chair', en: 'chair', ja: 'いす', cat: 'seat', w: 1, d: 1, h: 1, base: 50, role: 'wood' },
  { id: 'rug', soft: 1, en: 'rug', ja: 'ラグ', cat: 'deco', w: 2, d: 2, h: 0.08, base: 60, role: 'fabric' },
  { id: 'table', en: 'table', ja: 'テーブル', cat: 'table', w: 2, d: 1, h: 0.8, base: 120, role: 'wood' },
  { id: 'shelf', en: 'bookshelf', ja: 'ほんだな', cat: 'storage', w: 2, d: 1, h: 2, base: 180, role: 'wood' },
  { id: 'lamp', en: 'lamp', ja: 'ランプ', cat: 'light', w: 1, d: 1, h: 1.9, base: 150, role: 'fabric' },
  { id: 'clock', en: 'clock', ja: 'とけい', cat: 'deco', w: 1, d: 1, h: 1.8, base: 200, role: 'keep', color: 0xd9d2be },
  { id: 'sofa', en: 'sofa', ja: 'ソファ', cat: 'seat', w: 3, d: 1, h: 0.9, base: 300, role: 'fabric' },
  { id: 'tv', en: 'television', ja: 'テレビ', cat: 'electric', w: 2, d: 1, h: 1.2, base: 400, role: 'keep', color: 0x3b4148 },
  { id: 'bed', en: 'bed', ja: 'ベッド', cat: 'bed', w: 2, d: 3, h: 0.7, base: 500, role: 'fabric', bed: true, sleepY: 0.78, sleepZ: 0.8 },
  { id: 'piano', en: 'piano', ja: 'ピアノ', cat: 'toy', w: 2, d: 1, h: 1.2, base: 800, role: 'main' },
  { id: 'pc', en: 'computer desk', ja: 'パソコンの つくえ', cat: 'electric', w: 2, d: 1, h: 1.4, base: 350, role: 'wood' },
  { id: 'cushion', soft: 1, en: 'cushion', ja: 'クッション', cat: 'seat', w: 1, d: 1, h: 0.5, base: 60, role: 'fabric' },
  { id: 'sidetable', en: 'side table', ja: 'サイドテーブル', cat: 'table', w: 1, d: 1, h: 0.7, base: 110, role: 'wood' },
  { id: 'teddy', soft: 1, en: 'teddy bear', ja: 'くまの ぬいぐるみ', cat: 'toy', w: 1, d: 1, h: 0.85, base: 160, role: 'fabric' },
  { id: 'beanbag', soft: 1, en: 'bean bag', ja: 'ビーズクッション', cat: 'seat', w: 1, d: 1, h: 0.65, base: 200, role: 'fabric' },
  { id: 'floorlamp', en: 'floor lamp', ja: 'スタンドライト', cat: 'light', w: 1, d: 1, h: 2.0, base: 220, role: 'fabric' },
  { id: 'armchair', en: 'armchair', ja: 'アームチェア', cat: 'seat', w: 1, d: 1, h: 1.0, base: 260, role: 'fabric' },
  { id: 'toybox', en: 'toy box', ja: 'おもちゃばこ', cat: 'toy', w: 2, d: 1, h: 1.2, base: 280, role: 'main' },
  { id: 'starlight', en: 'star light', ja: 'ほしの ライト', cat: 'light', w: 1, d: 1, h: 1.4, base: 320, role: 'glow' },
  { id: 'curtain', en: 'curtain', ja: 'カーテン', cat: 'deco', w: 2, d: 1, h: 2.4, base: 350, role: 'fabric' },
  { id: 'mirror', en: 'mirror', ja: 'かがみ', cat: 'deco', w: 1, d: 1, h: 1.8, base: 380, role: 'wood' },
  { id: 'dresser', en: 'dresser', ja: 'ドレッサー', cat: 'storage', w: 2, d: 1, h: 2.0, base: 650, role: 'wood' },
  { id: 'wardrobe', en: 'wardrobe', ja: 'ようふくだんす', cat: 'storage', w: 2, d: 1, h: 2.3, base: 700, role: 'wood' },
  { id: 'fishtank', en: 'fish tank', ja: 'すいそう', cat: 'deco', w: 2, d: 1, h: 1.5, base: 900, role: 'wood' },
  { id: 'bed_bunk', en: 'bunk bed', ja: 'にだん ベッド', cat: 'bed', w: 2, d: 3, h: 2.0, base: 900, role: 'fabric', bed: true, sleepY: 1.82, sleepZ: 0.8 },
  { id: 'bed_princess', en: 'princess bed', ja: 'プリンセス ベッド', cat: 'bed', w: 2, d: 3, h: 1.8, base: 1200, role: 'fabric', bed: true, sleepY: 1.03, sleepZ: 0.8 },
  { id: 'bed_canopy', en: 'canopy bed', ja: 'てんがいつき ベッド', cat: 'bed', w: 2, d: 3, h: 2.4, base: 1800, role: 'fabric', bed: true, sleepY: 0.98, sleepZ: 0.8 },
  { id: 'bed_king', en: 'king bed', ja: 'キング ベッド', cat: 'bed', w: 3, d: 3, h: 1.6, base: 3000, role: 'fabric', bed: true, sleepY: 1.09, sleepZ: 0.95 },
  // ---- 2026-11 の おわり：あたらしい 形 22 ----
  { id: 'desk', en: 'desk', ja: 'べんきょうづくえ', cat: 'table', w: 2, d: 1, h: 1.3, base: 240, role: 'wood' },
  { id: 'officechair', en: 'office chair', ja: 'キャスターの いす', cat: 'seat', w: 1, d: 1, h: 1.15, base: 180, role: 'fabric' },
  { id: 'stool', en: 'stool', ja: 'スツール', cat: 'seat', w: 1, d: 1, h: 0.5, base: 40, role: 'fabric' },
  { id: 'bench', en: 'bench', ja: 'ベンチ', cat: 'seat', w: 2, d: 1, h: 0.9, base: 140, role: 'wood' },
  { id: 'coffeetable', en: 'coffee table', ja: 'ローテーブル', cat: 'table', w: 2, d: 1, h: 0.55, base: 130, role: 'wood' },
  { id: 'drawers', en: 'chest of drawers', ja: 'たんす', cat: 'storage', w: 2, d: 1, h: 1.25, base: 320, role: 'wood' },
  { id: 'cabinet', en: 'cabinet', ja: 'かざりだな', cat: 'storage', w: 1, d: 1, h: 2.0, base: 420, role: 'wood' },
  { id: 'fridge', en: 'fridge', ja: 'れいぞうこ', cat: 'kitchen', w: 1, d: 1, h: 1.9, base: 600, role: 'main' },
  { id: 'kitchen', en: 'kitchen', ja: 'キッチン', cat: 'kitchen', w: 2, d: 1, h: 1.9, base: 750, role: 'main' },
  { id: 'bathtub', en: 'bathtub', ja: 'おふろ', cat: 'kitchen', w: 2, d: 1, h: 0.85, base: 850, role: 'main' },
  { id: 'washer', en: 'washing machine', ja: 'せんたくき', cat: 'kitchen', w: 1, d: 1, h: 1.0, base: 480, role: 'main' },
  { id: 'bed_loft', en: 'loft bed', ja: 'ロフト ベッド', cat: 'bed', w: 2, d: 3, h: 2.2, base: 1400, role: 'fabric', bed: true, sleepY: 1.9, sleepZ: 0.8 },
  { id: 'tent', soft: 2, en: 'tent', ja: 'テント', cat: 'toy', w: 2, d: 2, h: 1.9, base: 450, role: 'fabric' },
  { id: 'rockinghorse', en: 'rocking horse', ja: 'もくば', cat: 'toy', w: 1, d: 2, h: 1.1, base: 380, role: 'wood' },
  { id: 'dollhouse', en: 'doll house', ja: 'ドールハウス', cat: 'toy', w: 2, d: 1, h: 1.5, base: 520, role: 'main' },
  { id: 'guitar', en: 'guitar', ja: 'ギター', cat: 'toy', w: 1, d: 1, h: 1.45, base: 360, role: 'main' },
  { id: 'drum', en: 'drum set', ja: 'ドラム', cat: 'toy', w: 2, d: 2, h: 1.2, base: 700, role: 'main' },
  { id: 'cattower', soft: 2, en: 'cat tower', ja: 'キャットタワー', cat: 'toy', w: 1, d: 1, h: 2.0, base: 400, role: 'fabric' },
  { id: 'fireplace', en: 'fireplace', ja: 'だんろ', cat: 'light', w: 2, d: 1, h: 1.5, base: 950, role: 'wood' },
  { id: 'arcade', en: 'arcade game', ja: 'ゲームき', cat: 'electric', w: 1, d: 1, h: 1.9, base: 1100, role: 'main' },
  { id: 'screen', en: 'folding screen', ja: 'ついたて', cat: 'deco', w: 2, d: 1, h: 1.8, base: 300, role: 'fabric' },
  { id: 'roundrug', soft: 1, en: 'round rug', ja: 'まるい ラグ', cat: 'deco', w: 2, d: 2, h: 0.06, base: 90, role: 'fabric' },
];

// スタイル（色＋素材＋もよう）。group：wood＝木の しゅるい／fabric＝ぬの／metal＝きんぞく／theme＝テーマの セット。
// wood＝わくの 色、wk＝わくの 素材（wood 木目／paint ぬり／metal きんぞく）、fab＝ぬのの 地の 色、pat＝もよう、pat2・pat3＝もようの 色、
// pop＝さし色の ぬの、metal＝かなぐ、main＝ぬった 本体（れいぞうこ・ピアノ）の 色、mk＝本体の 素材（wood／paint／metal／pattern＝もようを ぬる）。
// mult＝値段の かけ算。sw＝お店の えらぶ ボタンの 色（CSS）。
export const FURNITURE_STYLES = [
  { id: 'pine', group: 'wood', en: 'pine', ja: 'パインの', mult: 1, wood: 0xe8cc96, wk: 'wood', fab: 0x9cbf8a, pat: 'plain', pop: 0xe58f6a, metal: 0xd4a84a, main: 0xe8cc96, mk: 'wood', sw: '#e8cc96' },
  { id: 'oak', group: 'wood', en: 'oak', ja: 'オークの', mult: 1.1, wood: 0xc79c62, wk: 'wood', fab: 0xe6d6b8, pat: 'plain', pop: 0x6fae8e, metal: 0xd4a84a, main: 0xc79c62, mk: 'wood', sw: '#c79c62' },
  { id: 'white', group: 'wood', en: 'white', ja: 'しろい', mult: 1.2, wood: 0xf6f2ea, wk: 'paint', fab: 0xb4cbe0, pat: 'plain', pop: 0xffb066, metal: 0xcfd6dc, main: 0xf6f2ea, mk: 'paint', sw: '#f6f2ea' },
  { id: 'black', group: 'wood', en: 'black', ja: 'くろい', mult: 1.3, wood: 0x2e2e33, wk: 'paint', fab: 0x8d9299, pat: 'plain', pop: 0xe27a2d, metal: 0xcfd6dc, main: 0x2e2e33, mk: 'paint', sw: '#2e2e33' },
  { id: 'cherry', group: 'wood', en: 'cherry wood', ja: 'チェリーの', mult: 1.4, wood: 0x9b4a30, wk: 'wood', fab: 0xeadcc0, pat: 'plain', pop: 0x8a1f2a, metal: 0xd4a84a, main: 0x9b4a30, mk: 'wood', sw: '#9b4a30' },
  { id: 'walnut', group: 'wood', en: 'walnut', ja: 'ウォールナットの', mult: 1.5, wood: 0x6a452e, wk: 'wood', fab: 0xc98f58, pat: 'plain', pop: 0xf1e3c4, metal: 0xd4a84a, main: 0x6a452e, mk: 'wood', sw: '#6a452e' },
  { id: 'red', group: 'fabric', en: 'red', ja: 'あかい', mult: 1.3, wood: 0x7a5236, wk: 'wood', fab: 0xd6453b, pat: 'plain', pop: 0xf7d774, metal: 0xd4a84a, main: 0xd6453b, mk: 'paint', sw: '#d6453b' },
  { id: 'blue', group: 'fabric', en: 'blue', ja: 'あおい', mult: 1.3, wood: 0xf6f2ea, wk: 'paint', fab: 0x3f78c9, pat: 'plain', pop: 0xf7d774, metal: 0xcfd6dc, main: 0x3f78c9, mk: 'paint', sw: '#3f78c9' },
  { id: 'stripe', group: 'fabric', en: 'striped', ja: 'しましまの', mult: 1.6, wood: 0xf6f2ea, wk: 'paint', fab: 0x2f4f8f, pat: 'stripe', pat2: 0xfbf7ee, pop: 0xe2463c, metal: 0xd4a84a, main: 0x2f4f8f, mk: 'pattern', sw: 'repeating-linear-gradient(90deg,#2f4f8f 0 5px,#fbf7ee 5px 10px)' },
  { id: 'check', group: 'fabric', en: 'checked', ja: 'チェックの', mult: 1.6, wood: 0xe8cc96, wk: 'wood', fab: 0xd6453b, pat: 'check', pat2: 0xfffaf0, pop: 0xf7d774, metal: 0xd4a84a, main: 0xd6453b, mk: 'pattern', sw: 'conic-gradient(#d6453b 25%,#fffaf0 0 50%,#d6453b 0 75%,#f2a9a2 0) 0 0/12px 12px' },
  { id: 'dots', group: 'fabric', en: 'polka dot', ja: 'みずたまの', mult: 1.7, wood: 0xf6f2ea, wk: 'paint', fab: 0x55b2e6, pat: 'dot', pat2: 0xffffff, pop: 0xffd23f, metal: 0xcfd6dc, main: 0x55b2e6, mk: 'pattern', sw: 'radial-gradient(circle,#fff 0 3px,#55b2e6 3.5px) 0 0/11px 11px' },
  { id: 'denim', group: 'fabric', en: 'denim', ja: 'デニムの', mult: 1.8, wood: 0xc79c62, wk: 'wood', fab: 0x44679c, pat: 'denim', pat2: 0xe2a04a, pop: 0xe2a04a, metal: 0xc8794a, main: 0x44679c, mk: 'pattern', sw: 'repeating-linear-gradient(45deg,#44679c 0 3px,#5479ad 3px 5px)' },
  { id: 'floral', group: 'fabric', en: 'flower', ja: 'はながらの', mult: 1.9, wood: 0xfbf3e4, wk: 'paint', fab: 0xfbeede, pat: 'floral', pat2: 0xee6f96, pat3: 0x6fae6a, pop: 0x8fc79a, metal: 0xd4a84a, main: 0xfbeede, mk: 'pattern', sw: 'radial-gradient(circle,#f7d774 0 2px,#ee6f96 2.5px 5px,#fbeede 5.5px) 0 0/14px 14px' },
  { id: 'mint', group: 'theme', en: 'mint', ja: 'ミントの', mult: 2, wood: 0xfffdf6, wk: 'paint', fab: 0x86dcbc, pat: 'star', pat2: 0xffffff, pop: 0xffb066, metal: 0xcfd6dc, main: 0x86dcbc, mk: 'pattern', sw: '#86dcbc' },
  { id: 'pink', group: 'theme', en: 'pink', ja: 'ピンクの', mult: 2.2, wood: 0xfffaf5, wk: 'paint', fab: 0xf78fb3, pat: 'heart', pat2: 0xfff4f8, pop: 0xf7d774, metal: 0xe6ab9c, main: 0xf78fb3, mk: 'pattern', sw: '#f78fb3' },
  { id: 'sea', group: 'theme', en: 'sea', ja: 'うみの', mult: 2.3, wood: 0xddd2bd, wk: 'wood', fab: 0x2b8cc4, pat: 'wave', pat2: 0xeaf8ff, pop: 0xf1e3c4, metal: 0xcfd6dc, main: 0x2b8cc4, mk: 'pattern', sw: 'linear-gradient(#2b8cc4 0 50%,#7fd0ee 50%)' },
  { id: 'forest', group: 'theme', en: 'forest', ja: 'もりの', mult: 2.3, wood: 0x5a4630, wk: 'wood', fab: 0x3f7f4f, pat: 'leaf', pat2: 0x9bd07a, pop: 0xc98a4b, metal: 0xd4a84a, main: 0x3f7f4f, mk: 'pattern', sw: 'linear-gradient(135deg,#3f7f4f 0 55%,#9bd07a 55%)' },
  { id: 'velvet', group: 'fabric', en: 'velvet', ja: 'ビロードの', mult: 2.4, wood: 0x3a2a26, wk: 'wood', fab: 0x7d1f3f, pat: 'velvet', pop: 0xd4a84a, metal: 0xd4a84a, main: 0x7d1f3f, mk: 'paint', sw: 'linear-gradient(135deg,#a02c55,#5c142c)' },
  { id: 'mono', group: 'theme', en: 'black and white', ja: 'しろくろの', mult: 2.5, wood: 0x232326, wk: 'paint', fab: 0xfafafa, pat: 'checker', pat2: 0x1c1c1f, pop: 0xe2463c, metal: 0xcfd6dc, main: 0xfafafa, mk: 'pattern', sw: 'conic-gradient(#1c1c1f 25%,#fafafa 0 50%,#1c1c1f 0 75%,#fafafa 0) 0 0/12px 12px' },
  { id: 'candy', group: 'theme', en: 'candy', ja: 'キャンディの', mult: 2.6, wood: 0xffb3d1, wk: 'paint', fab: 0xfffaf5, pat: 'candy', pat2: 0xff7fb0, pat3: 0x7fdcc0, pop: 0x8ff0c8, metal: 0xf1ce76, main: 0xfffaf5, mk: 'pattern', sw: 'repeating-linear-gradient(45deg,#ff7fb0 0 4px,#fffaf5 4px 8px,#7fdcc0 8px 12px,#fffaf5 12px 16px,#f7d774 16px 20px,#fffaf5 20px 24px)' },
  { id: 'silver', group: 'metal', en: 'silver', ja: 'ぎんの', mult: 3, wood: 0xcfd6dc, wk: 'metal', fab: 0xa9b8c9, pat: 'plain', pop: 0x53b8b8, metal: 0xe3ecf2, main: 0xcfd6dc, mk: 'metal', sw: 'linear-gradient(135deg,#f4f8fb,#aab4bd 60%,#e3ecf2)' },
  { id: 'rosegold', group: 'metal', en: 'rose gold', ja: 'ローズゴールドの', mult: 3.5, wood: 0xe6ab9c, wk: 'metal', fab: 0xf9d9d4, pat: 'plain', pop: 0xfffaf3, metal: 0xf0c4b8, main: 0xe6ab9c, mk: 'metal', sw: 'linear-gradient(135deg,#f9d9d0,#d98f80 60%,#f0c4b8)' },
  { id: 'gold', group: 'metal', en: 'gold', ja: 'きんの', mult: 4, wood: 0xe2b84f, wk: 'metal', fab: 0xfbf3df, pat: 'plain', pop: 0xb8862b, metal: 0xf1ce76, main: 0xe2b84f, mk: 'metal', sw: 'linear-gradient(135deg,#fff1b8,#c99a2e 60%,#f1ce76)' },
  { id: 'royal', group: 'theme', en: 'royal', ja: 'おうさまの', mult: 5, wood: 0xe2b84f, wk: 'metal', fab: 0x2c3f9e, pat: 'royal', pat2: 0xf1ce76, pop: 0xb0202a, metal: 0xf1ce76, main: 0x2c3f9e, mk: 'pattern', sw: 'radial-gradient(circle,#f1ce76 0 2px,#2c3f9e 2.5px) 0 0/10px 10px' },
];

export const STYLE_GROUPS = [
  { id: 'classic', en: 'Classic', ja: 'クラシック' },
  { id: 'wood', en: 'Wood', ja: 'き' },
  { id: 'fabric', en: 'Fabric', ja: 'ぬの・もよう' },
  { id: 'theme', en: 'Themes', ja: 'テーマ' },
  { id: 'metal', en: 'Metal', ja: 'きんぞく' },
];

const DESIGN_BY_ID = new Map(FURNITURE_DESIGNS.map((d) => [d.id, d]));
const STYLE_BY_ID = new Map(FURNITURE_STYLES.map((s) => [s.id, s]));
export const designById = (id) => DESIGN_BY_ID.get(id) || null;
export const styleById = (id) => STYLE_BY_ID.get(id) || null;

const round10 = (n) => Math.max(10, Math.round(n / 10) * 10);
// その 形の「主な 色」（カードの 絵が かけない ときの 四角・手に もつ わくの 色にも なる）。
export function styleColor(design, style) {
  const soft = design.soft || 0;
  if (style.group === 'metal' ? soft >= 1 : style.group === 'wood' && soft === 1) return style.wood;
  if (design.role === 'fabric' || design.role === 'glow') return style.fab;
  if (design.role === 'wood') return style.wood;
  if (design.role === 'main') return style.main;
  return design.color;
}

// あたらしい 品（形 × スタイル）。town.json の furniture と 同じ 形の きろく＋ design・style・cat。
export const GENERATED_FURNITURE = FURNITURE_DESIGNS.flatMap((d) => FURNITURE_STYLES.map((s) => ({
  id: `${d.id}-${s.id}`,
  word: `${s.en} ${d.en}`,
  ja: `${s.ja} ${d.ja}`,
  price: round10(d.base * s.mult),
  color: styleColor(d, s),
  w: d.w, d: d.d, h: d.h,
  shape: d.id, design: d.id, style: s.id, cat: d.cat,
  ...(d.bed ? { bed: true, sleepY: d.sleepY, sleepZ: d.sleepZ } : {}),
})));

// 前から ある 31 しゅるいの たな（形の 表に ない もの＝うえき・木・かびん）。
const LEGACY_CAT = { plant: 'plant', tree: 'plant', vase: 'plant' };

// 品ぞろえ ぜんぶ：前からの 品（town.json の furniture・そのまま）＋ あたらしい 品。前からの 品には たな（cat）と 形（design）を そえるだけ。
export function fullFurniture(legacy = []) {
  const seen = new Set();
  const out = [];
  for (const f of legacy) {
    if (!f || seen.has(f.id)) continue;
    seen.add(f.id);
    const design = DESIGN_BY_ID.get(f.shape);
    out.push({ ...f, design: f.shape, style: '', cat: design?.cat || LEGACY_CAT[f.shape] || 'deco' });
  }
  for (const f of GENERATED_FURNITURE) if (!seen.has(f.id)) { seen.add(f.id); out.push({ ...f }); }
  return out;
}
