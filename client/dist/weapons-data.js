// ぶきや（メインの島）の 品ぞろえ 100：形 10 しゅるい × 素材 10 だん。
// ここは 形の 定義だけ（値段・名前・色）。買う 判定は サーバー（server/src/game/economy.js が fishing-data.js の ITEMS を 読む）。
// 前から ある 6 本（wood-sword など）は id と 値段を そのまま のこす（子どもの セーブが その id で 書かれている）＝
// 表の その マスには 前の 1 本が 入る（LEGACY）。見た目だけの もちもの：釣りの でやすさや 英語の むずかしさは かわらない。
export const WEAPON_STYLES = [
  { id: 'sword', en: 'Sword', ja: 'けん', icon: '🗡️', mult: 1 },
  { id: 'katana', en: 'Katana', ja: 'かたな', icon: '⚔️', mult: 1.1 },
  { id: 'bow', en: 'Bow', ja: 'ゆみ', icon: '🏹', mult: 1.15 },
  { id: 'spear', en: 'Spear', ja: 'やり', icon: '🔱', mult: 1.05 },
  { id: 'trident', en: 'Trident', ja: 'トライデント', icon: '🔱', mult: 1.25 },
  { id: 'staff', en: 'Staff', ja: 'つえ', icon: '🪄', mult: 1.3 },
  { id: 'wand', en: 'Wand', ja: 'まほうの ぼう', icon: '✨', mult: 0.9 },
  { id: 'hammer', en: 'Hammer', ja: 'ハンマー', icon: '🔨', mult: 1.2 },
  { id: 'shield', en: 'Shield', ja: 'たて', icon: '🛡️', mult: 1.0 },
  { id: 'boomerang', en: 'Boomerang', ja: 'ブーメラン', icon: '🪃', mult: 0.85 },
];
// だん（素材）。glow は 光る つよさ（上の だんほど 光る）。
export const WEAPON_TIERS = [
  { id: 'wood', en: 'Wooden', ja: 'きの', color: 0xa98a5e, accent: 0x6f5435, price: 60, glow: 0 },
  { id: 'stone', en: 'Stone', ja: 'いしの', color: 0x9a9a92, accent: 0x6c6c66, price: 100, glow: 0 },
  { id: 'copper', en: 'Copper', ja: 'どうの', color: 0xc8794a, accent: 0x8a4f2c, price: 150, glow: 0 },
  { id: 'iron', en: 'Iron', ja: 'てつの', color: 0xbacfd8, accent: 0x6d7b84, price: 230, glow: 0 },
  { id: 'silver', en: 'Silver', ja: 'ぎんの', color: 0xe3ecf2, accent: 0x53b8b8, price: 340, glow: 0.05 },
  { id: 'gold', en: 'Golden', ja: 'きんの', color: 0xf1ce76, accent: 0xb8862b, price: 500, glow: 0.12 },
  { id: 'crystal', en: 'Crystal', ja: 'すいしょうの', color: 0xaa90d2, accent: 0xe8dcff, price: 720, glow: 0.35 },
  { id: 'fire', en: 'Fire', ja: 'ほのおの', color: 0xff6a3d, accent: 0xffd23a, price: 1000, glow: 0.55 },
  { id: 'ice', en: 'Ice', ja: 'こおりの', color: 0x8fe3ff, accent: 0xffffff, price: 1300, glow: 0.5 },
  { id: 'star', en: 'Star', ja: 'ほしの', color: 0xfff1a8, accent: 0xff8be4, price: 1800, glow: 0.8 },
];
// 前から ある 6 本 → 表の マス（形:素材）。
const LEGACY = {
  'sword:wood': 'wood-sword', 'sword:iron': 'steel-sword', 'sword:star': 'sunblade',
  'bow:wood': 'bow', 'trident:silver': 'trident', 'staff:crystal': 'staff',
};
const round10 = (n) => Math.round(n / 10) * 10;

// 新しい 94 本（前の 6 本の マスは とばす）。ITEMS の 形（kind: 'weapon'）。
export const NEW_WEAPONS = WEAPON_STYLES.flatMap((st) => WEAPON_TIERS.map((ti, t) => {
  if (LEGACY[`${st.id}:${ti.id}`]) return null;
  return {
    id: `w-${ti.id}-${st.id}`, kind: 'weapon', style: st.id, tier: t, material: ti.id,
    name: `${ti.ja} ${st.ja}`, en: `${ti.en} ${st.en}`, ja: `${ti.ja} ${st.ja}`,
    price: round10(ti.price * st.mult), color: ti.color, accent: ti.accent, glow: ti.glow,
    description: `${ti.en} ${st.en}`,
  };
}).filter(Boolean));

// 前の 6 本に 表の 情報（形・だん・英語の 名前）を そえる（値段と id は かえない）。
export function legacyWeaponInfo(id) {
  for (const [key, legacyId] of Object.entries(LEGACY)) {
    if (legacyId !== id) continue;
    const [style, material] = key.split(':');
    const st = WEAPON_STYLES.find((s) => s.id === style); const t = WEAPON_TIERS.findIndex((x) => x.id === material); const ti = WEAPON_TIERS[t];
    return { tier: t, material, en: `${ti.en} ${st.en}`, ja: `${ti.ja} ${st.ja}`, glow: ti.glow, accent: ti.accent };
  }
  return null;
}
