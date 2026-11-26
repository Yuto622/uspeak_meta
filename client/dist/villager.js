// 島の 住人の 見た目（2026-11：「住民の 見た目も それぞれ 個性的に」）。
// 前は どの 島の どの 人も 同じ 顔・同じ 茶色の かみ・同じ ズボンで、ちがうのは 服の 色だけ だった。
// ・**たね（seed）から 決める**：同じ 人は いつ 見ても・どの 端末でも・外でも 家の 中でも 同じ 見た目（乱数は 使わない）。
// ・服の 色（color）は データの まま＝その 人の しるし。かわるのは はだ・かみの 色と 形・ぼうし・こもの・せの 高さ・ズボン。
// ・箱だけ（`box(x,y,z,w,h,d,color,parent)` を もらう）＝島・家の 中・U-Speak島の どの 作りでも 使える。光も 影も 足さない。
import { chibiMaker, chibiBody } from './island-cast.js';
import { FEAT } from './avatar-chibi.js';

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

// 2026-11：住人も まるい 2.4 頭身に（島の キャラクター・アバターと 同じ 体＝island-cast.js）。前の 箱の 体は やめた。
// たねから 決まる もの は 前と 同じ 考えかた（はだ・かみの 色と 形・こもの・せの 高さ・ズボン）。服の 色は データの まま。
// `box` は もう 使わない（呼ぶ がわを かえない ために 受けとるだけ）。
const HAIRDO = { short: 'short', long: 'long', bob: 'bob', twin: 'twin', bun: 'bun', spiky: 'spiky', cap: 'short', straw: 'short', beanie: 'short', bald: 'none', pony: 'pony', side: 'curly' };
export function buildVillager(box, g, { color, seed }) {
  const L = villagerLook(seed);
  const add = chibiMaker(g);
  const c = { skin: L.skin, hair: L.hair, style: HAIRDO[L.style] || 'short', top: color, pants: L.pants, accent: L.hat, shoe: 0x4a3b34 };
  chibiBody(add, c, g);
  const st = L.style, ex = L.extra;
  if (st === 'cap') FEAT.cap(add, c, L.hat);
  else if (st === 'straw') { add('C', 0xe6cd86, [0, 2.3, 0], [1.9, 0.06, 1.8]); add('D', 0xe6cd86, [0, 2.3, 0], [1.1, 0.6, 1.04]); add('C', L.hat, [0, 2.37, 0], [1.12, 0.12, 1.06]); }
  else if (st === 'beanie') { add('D', L.hat, [0, 2.08, -0.04], [1.36, 0.86, 1.3]); add('C', 0xffffff, [0, 2.12, -0.04], [1.4, 0.16, 1.34]); add('S', 0xffffff, [0, 2.56, -0.04], [0.28, 0.28, 0.28]); }
  else if (st === 'bald') add('S', L.hair, [0, 1.7, -0.3], [1.16, 0.5, 0.7]);
  if (ex === 'glasses') FEAT.glasses(add, c, 0x26323c);
  else if (ex === 'scarf') FEAT.scarf(add, c, L.hat);
  else if (ex === 'apron') { add('B', 0xfff4e0, [0, 0.86, 0.34], [0.62, 0.74, 0.06]); add('B', 0xe6d9bd, [0, 0.78, 0.38], [0.28, 0.2, 0.03]); }
  else if (ex === 'beard') FEAT.beard(add, c, L.hair);
  else if (ex === 'bag') FEAT.bag(add, c, 0xb89962);
  else if (ex === 'bow') { for (const s of [-1, 1]) add('K', 0xd9534f, [s * 0.16, 1.26, 0.4], [0.24, 0.3, 0.12], [0, 0, s * Math.PI / 2]); add('S', 0xd9534f, [0, 1.26, 0.42], [0.12, 0.12, 0.1]); }
  g.scale.set(L.wide, L.tall, L.wide);
  return g;
}
