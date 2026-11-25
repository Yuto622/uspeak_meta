// 島の 住人の 見た目（2026-11：「住民の 見た目も それぞれ 個性的に」）。
// 前は どの 島の どの 人も 同じ 顔・同じ 茶色の かみ・同じ ズボンで、ちがうのは 服の 色だけ だった。
// ・**たね（seed）から 決める**：同じ 人は いつ 見ても・どの 端末でも・外でも 家の 中でも 同じ 見た目（乱数は 使わない）。
// ・服の 色（color）は データの まま＝その 人の しるし。かわるのは はだ・かみの 色と 形・ぼうし・こもの・せの 高さ・ズボン。
// ・箱だけ（`box(x,y,z,w,h,d,color,parent)` を もらう）＝島・家の 中・U-Speak島の どの 作りでも 使える。光も 影も 足さない。
const SKIN = [0xf1c9a2, 0xe8c39a, 0xdba57e, 0xc68d65, 0xa9714d, 0x865738];
const HAIR = [0x2b2622, 0x4a3426, 0x73604b, 0xa9744a, 0xd9b36a, 0xc3c9cb, 0x8a3b2a, 0x39445e];
const PANTS = [0x4a4436, 0x43515c, 0x5b4a3a, 0x2f4270, 0x6b5a7a, 0x3f5a48, 0x7a6a55];
const HAT = [0xd9534f, 0x3f6fd0, 0xf2b04a, 0x2f8f5b, 0xffffff, 0x7a5aa8];
const STYLES = ['short', 'long', 'bob', 'twin', 'bun', 'spiky', 'cap', 'straw', 'beanie', 'bald', 'pony', 'side'];
const EXTRA = ['none', 'glasses', 'scarf', 'apron', 'beard', 'none', 'blush', 'bag', 'bow', 'none'];

function hash(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// 島の データの 1 か所（spot）から たねを 作る：なまえ＋id。外（island-kit）と 中（island-interior）が 同じ 関数を 使う。
export const villagerSeed = (def) => `${def?.character || def?.label?.ja || def?.label || ''}:${def?.id || ''}:${def?.name?.ja || def?.name || ''}`;

export function villagerLook(seed) {
  const h = hash(seed); const pick = (arr, shift) => arr[(h >>> shift) % arr.length];
  return { skin: pick(SKIN, 0), hair: pick(HAIR, 3), pants: pick(PANTS, 6), hat: pick(HAT, 9), style: pick(STYLES, 12), extra: pick(EXTRA, 17), tall: 0.9 + ((h >>> 22) % 5) * 0.045, wide: 0.94 + ((h >>> 26) % 4) * 0.04 };
}

export function buildVillager(box, g, { color, seed }) {
  const L = villagerLook(seed); const b = (x, y, z, w, h, d, c) => box(x, y, z, w, h, d, c, g);
  const dark = 0x2b2b28, top = 2.36;
  for (const s of [-1, 1]) { b(s * 0.23, 0.51, 0, 0.33, 0.85, 0.42, L.pants); b(s * 0.23, 0.12, 0.05, 0.36, 0.16, 0.52, 0x35454b); }
  b(0, 1.32, 0, 0.92 * L.wide, 0.92, 0.62, color);
  for (const s of [-1, 1]) { b(s * 0.62 * L.wide, 1.38, 0, 0.3, 0.66, 0.38, color); b(s * 0.62 * L.wide, 0.97, 0, 0.26, 0.2, 0.32, L.skin); }
  b(0, 2.05, 0, 0.78, 0.62, 0.66, L.skin);
  for (const s of [-1, 1]) b(s * 0.19, 2.08, 0.34, 0.1, 0.12, 0.06, dark);
  b(0, 1.9, 0.34, 0.16, 0.04, 0.03, 0x9b655a);
  const st = L.style, hc = L.hair;
  if (st !== 'bald' && st !== 'cap' && st !== 'straw' && st !== 'beanie') b(0, top, -0.03, 0.86, 0.28, 0.74, hc);
  if (st === 'short' || st === 'side') { b(0, 2.2, -0.31, 0.86, 0.3, 0.14, hc); if (st === 'side') b(-0.22, 2.3, 0.3, 0.42, 0.16, 0.14, hc); }
  else if (st === 'long') { b(0, 1.85, -0.34, 0.86, 0.95, 0.16, hc); for (const s of [-1, 1]) b(s * 0.4, 1.95, -0.05, 0.12, 0.7, 0.5, hc); }
  else if (st === 'bob') { b(0, 2.05, -0.34, 0.86, 0.6, 0.14, hc); for (const s of [-1, 1]) b(s * 0.41, 2.08, -0.03, 0.1, 0.5, 0.6, hc); }
  else if (st === 'twin') { for (const s of [-1, 1]) { b(s * 0.52, 1.95, -0.1, 0.24, 0.7, 0.26, hc); b(s * 0.52, 2.26, -0.1, 0.28, 0.1, 0.3, L.hat); } }
  else if (st === 'bun') { b(0, 2.62, -0.12, 0.34, 0.3, 0.34, hc); b(0, 2.2, -0.32, 0.86, 0.3, 0.12, hc); }
  else if (st === 'spiky') { for (let i = 0; i < 5; i += 1) b((i - 2) * 0.17, 2.56 + (i % 2) * 0.06, -0.02 - (i % 2) * 0.1, 0.14, 0.2, 0.16, hc); }
  else if (st === 'pony') { b(0, 2.2, -0.31, 0.86, 0.3, 0.14, hc); b(0, 2.0, -0.48, 0.2, 0.62, 0.2, hc); b(0, 2.32, -0.42, 0.26, 0.1, 0.24, L.hat); }
  else if (st === 'cap') { b(0, top, -0.03, 0.88, 0.26, 0.76, L.hat); b(0, 2.27, 0.44, 0.7, 0.07, 0.3, L.hat); b(0, 2.16, -0.31, 0.84, 0.2, 0.12, hc); }
  else if (st === 'straw') { b(0, 2.34, 0, 1.3, 0.07, 1.2, 0xe2c77a); b(0, 2.48, -0.02, 0.76, 0.26, 0.68, 0xe2c77a); b(0, 2.39, -0.02, 0.79, 0.07, 0.71, L.hat); b(0, 2.16, -0.31, 0.84, 0.22, 0.12, hc); }
  else if (st === 'beanie') { b(0, 2.4, -0.02, 0.86, 0.34, 0.74, L.hat); b(0, 2.27, -0.02, 0.9, 0.1, 0.78, 0xffffff); b(0, 2.63, -0.02, 0.2, 0.16, 0.2, 0xffffff); }
  else if (st === 'bald') { b(0, 2.2, -0.31, 0.84, 0.22, 0.12, hc); for (const s of [-1, 1]) b(s * 0.4, 2.14, -0.05, 0.08, 0.26, 0.4, hc); }
  const ex = L.extra;
  if (ex === 'glasses') { for (const s of [-1, 1]) b(s * 0.19, 2.08, 0.365, 0.22, 0.2, 0.03, 0x26323c); b(0, 2.09, 0.365, 0.1, 0.04, 0.03, 0x26323c); for (const s of [-1, 1]) b(s * 0.19, 2.08, 0.38, 0.14, 0.12, 0.02, 0xcfe8f0); }
  else if (ex === 'scarf') { b(0, 1.76, 0.02, 0.86, 0.16, 0.72, L.hat); b(0.22, 1.5, 0.33, 0.2, 0.46, 0.06, L.hat); }
  else if (ex === 'apron') { b(0, 1.22, 0.32, 0.66, 0.74, 0.04, 0xfff4e0); b(0, 1.1, 0.345, 0.3, 0.2, 0.03, 0xe6d9bd); }
  else if (ex === 'beard') { b(0, 1.84, 0.33, 0.62, 0.22, 0.08, hc); for (const s of [-1, 1]) b(s * 0.33, 1.98, 0.3, 0.1, 0.3, 0.1, hc); }
  else if (ex === 'blush') { for (const s of [-1, 1]) b(s * 0.28, 1.96, 0.335, 0.12, 0.07, 0.02, 0xf2a0a0); }
  else if (ex === 'bag') { b(0, 1.36, -0.4, 0.6, 0.66, 0.22, 0xb89962); for (const s of [-1, 1]) b(s * 0.3, 1.5, 0.32, 0.08, 0.6, 0.04, 0x8d6642); }
  else if (ex === 'bow') { b(0, 1.72, 0.33, 0.12, 0.12, 0.06, 0xd9534f); for (const s of [-1, 1]) b(s * 0.16, 1.72, 0.33, 0.2, 0.18, 0.05, 0xd9534f); }
  g.scale.set(1, L.tall, 1);
  return g;
}
