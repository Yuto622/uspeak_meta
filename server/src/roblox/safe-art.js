// Roblox に 上げる 絵の あんぜん フィルター。Web の 絵は かえない（ここは Roblox に 送る 前だけ）。
//
// Roblox は 画像を 1 まいずつ 審査する（Community Standards）。子ども向けの 場で ひっかかりやすい もの・アカウントに 傷が つく
// ものは、**かわりの 絵に かえる か、その 絵から 外す**。きめるのは 下の 表（1 か所）。表を かえたら SAFE_VERSION を 上げる
//（絵の しるしが かわって、かわった 絵だけ 上げなおす）。
//   ・おさけ・たばこ           → ほかの びん／外す
//   ・はもの・ぶき・ばくはつ物  → 台所の どうぐ・まき／外す
//   ・ち・どくろ・おはか・くすり・ちゅうしゃ → 外す
//   ・じっさいの 宗教の たてもの・しるし → ふつうの たてもの／外す
//   ・お札・カード（本物の お金）  → コイン
//   ・かけごと                 → 外す
//   ・はだかに 見える もの・下着・水着・くちびる・トイレ → 外す
//   ・下品な しぐさ             → 外す
// のこす もの（Roblox で ふつうに 使われて いる もの）：火・ばくはつの 絵（💥）・おばけ・かぼちゃ・くもの す・けいさつ・コイン・お金の ふくろ・
// おこった 顔・なく 顔。人の 絵（people.js）は いつも 服を きて いる。
export const SAFE_VERSION = 1;

const SWAP = {
  '🍾': '🫙', '🍺': '🥤', '🍻': '🥤', '🍷': '🧃', '🥂': '🥤', '🍸': '🧃', '🍹': '🧃', '🍶': '🥤', '🥃': '🥤',
  '🔪': '🍽️', '🪓': '🪵', '🗡️': '', '⚔️': '', '🔫': '', '🏹': '', '💣': '', '🧨': '', '🪚': '', '⛏️': '🪣',
  '🚬': '', '💉': '', '💊': '', '🩸': '', '☠️': '', '💀': '', '⚰️': '', '🪦': '',
  '🛕': '🏛️', '🕌': '🏛️', '⛪': '🏛️', '🕍': '🏛️', '⛩️': '🏛️', '✝️': '', '☪️': '', '🕉️': '', '☸️': '', '✡️': '', '🛐': '', '📿': '', '🙏': '', '👼': '', '😇': '',
  '💵': '🪙', '💴': '🪙', '💶': '🪙', '💷': '🪙', '💳': '🪙', '💸': '🪙',
  '🎰': '', '🃏': '',
  '🛀': '', '🚿': '', '🛁': '', '🩲': '', '👙': '', '🩱': '', '💋': '', '👄': '', '🚽': '', '🖕': '', '🤮': '', '💩': '',
};
const norm = (e) => String(e || '');
const swapOf = (e) => (Object.prototype.hasOwnProperty.call(SWAP, e) ? SWAP[e] : (Object.prototype.hasOwnProperty.call(SWAP, `${e}️`) ? SWAP[`${e}️`] : (Object.prototype.hasOwnProperty.call(SWAP, e.replace(/️/g, '')) ? SWAP[e.replace(/️/g, '')] : undefined)));

// 場面 → Roblox に 送って よい 場面（かえた・外した ものの 一覧つき）。人も 物も 1 つも のこらない ときは、もとの 背景だけに なる。
export function robloxScene(scene) {
  const changes = [];
  const items = [];
  for (const it of Array.isArray(scene?.items) ? scene.items : []) {
    const e = norm(it?.e); const to = swapOf(e);
    if (to === undefined) { items.push(it); continue; }
    changes.push({ from: e, to });
    if (to) items.push({ ...it, e: to });
  }
  return { scene: { ...scene, items }, changes };
}
// 1 冊の なかで かえる もの（管理ページ・ドライラン用）：[{ n（0＝表紙）, from, to }]
export function robloxChanges(book) {
  const out = [];
  [book.cover, ...book.pages.map((p) => p.scene)].forEach((sc, n) => { for (const c of robloxScene(sc).changes) out.push({ n, ...c }); });
  return out;
}
export const SAFE_TABLE = Object.freeze({ ...SWAP });
