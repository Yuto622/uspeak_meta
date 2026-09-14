// ブロック屋 で買ったものを、BLOCKWILD の何にするか。
//
// まちづくり島のブロック屋は U-Speak コインでブロックを売る（値段も持ち物もサーバーが
// 持っている＝`server/src/game/town.js`）。BLOCKWILD は別のゲームで、ブロックを数字の id
// で持っている。その2つを突き合わせる表がこれ。**対応表はここにしかない。**
//
// 表は「ブロック屋の id → BLOCKWILD の id」。ブロック屋に品を足したら、ここにも足すこと。
// 足し忘れたものは BLOCKWILD に出てこない（クラッシュはしない）。
export const SHOP_TO_BLOCKWILD = {
  wood: 7,      // PLANKS  — ブロック屋では 0 コイン。最初から全員が持っている1つ
  stone: 3,     // STONE
  brick: 8,     // BRICK
  glass: 9,     // GLASS
  grass: 1,     // GRASS
  sand: 4,      // SAND
  snow: 11,     // SNOW
  lamp: 14,     // LANTERN
  flower: 34,   // ROSE
  water: 17,    // WATER
};

// 買った物のリスト（ブロック屋の id）から、BLOCKWILD で出してよい id の集合を作る。
export function allowedIds(ownedShopIds) {
  const out = new Set();
  for (const id of ownedShopIds || []) {
    const mapped = SHOP_TO_BLOCKWILD[id];
    if (mapped !== undefined) out.add(mapped);
  }
  return out;
}

// 逆引き。BLOCKWILD の id が、ブロック屋のどの品だったか（説明文に使う）。
export const BLOCKWILD_TO_SHOP = Object.fromEntries(
  Object.entries(SHOP_TO_BLOCKWILD).map(([shop, id]) => [id, shop]),
);
