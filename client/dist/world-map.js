// せかいの ちず（えの ちず／2026-11：「島と島、橋で繋いだじゃん。全体の地図こんな雰囲気で作って」）。
//
// テーマパークの ガイドマップの ような「え」の ちず。しまの ちず（world-picker.js）の 中の「🗺 ちず」。
// ・**ぜんぶ SVG を JavaScript で かく**（え・写真・WebGL は つかわない）。ちかづけても くっきり。
// ・島の 位置は rpg-data.js の HUBS / REGIONS の x, z、橋は bridges-data.js の LINKS の from / to（世界の 座標の まま）。
//   SVG の 1 ＝ 世界の 1。北（z が 小さい ほう）が 上。島を うごかしたら ちずも 自然に うごく。
// ・**下絵（海・島・木・建物・橋・名前の 札）は 1 回だけ 作って とっておく**（`baseSvg()` の 文字 → `mount` で 1 回だけ DOM に）。
//   ひらく たびに かきなおすのは「いま ここ」・🔒・まだの 雲・押せる 島（`live`）だけ。とじて いる 間は 何も うごかない。
// ・**どこへ とべるか・何が ひらいて いるかは rpg.js が 決める**（`state` と `onPick` は world-picker.js から そのまま）。
// ・島の 名前は rpg-data.js が 定義元（`en` から「Island」を おとす・`yomi`／`name`）。辞書には 入れない（translate="no"）。
// ・メインの島の 中の 場所（ビルの まち・プラネタリウム・ひろば・としょかん…）の 位置は main_island.json / main-plaza.js /
//   main-city.js の 島の 中の 座標を 写した もの（下の MAIN_*）。島の 中を うごかしたら ここも なおす。
import { HUBS, REGIONS } from './rpg-data.js';
import { LINKS } from './bridges-data.js';

// ── 小さな 道具 ────────────────────────────────────────────────
const f = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return `#${((c[0] << 16) | (c[1] << 8) | c[2]).toString(16).padStart(6, '0')}`;
}
const dark = (c, t) => mix(c, '#000000', t);
const light = (c, t) => mix(c, '#ffffff', t);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seedOf = (id) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const INK = '#2b2118';   // えの ふちどり（こげ茶）

// 島の 名前（world-picker.js の title と 同じ きまり）：「Fishing Island」→「Fishing」、ぜんぶ 大文字は 読みやすく。
export function shortName(r) {
  const en = String(r.en || r.name);
  const short = r.hub ? en.replace(/\s+Island$/i, '') : en;
  return short === short.toUpperCase() && short.length > 3 ? short.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : short;
}

// ── 島の ならびと 番号 ─────────────────────────────────────────
// 番号は 右上の リストと 赤い まるが 同じ。メインの島が 1、U-Speak島が 2、あとは HUBS → REGIONS の 順。
export const MAP_ISLANDS = (() => {
  const hubs = [...HUBS].sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : a.id === 'willow' ? -1 : b.id === 'willow' ? 1 : 0));
  return [...hubs, ...REGIONS].map((r, i) => ({ ...r, num: i + 1, ...sizeOf(r) }));
})();
function sizeOf(r) {   // 島の 大きさ（半分の はば）。検査の 歩ける わくと ほぼ 同じ（tests/regression.mjs の fp）。
  if (r.id === 'willow') return { rx: 27, rz: 21 };
  if (r.id === 'park') return { rx: 34, rz: 30 };
  if (r.id === 'main') return { rx: 54, rz: 43 };
  return r.hub ? { rx: 31, rz: 27 } : { rx: 33, rz: 29 };
}
const BY_ID = Object.fromEntries(MAP_ISLANDS.map((r) => [r.id, r]));

// 島の 色（くさ）。ぼうけんの ちいきは biome の 色、島は あたたかい みどりを すこしずつ かえる。
const GRASS = { snow: '#e8f2f4', desert: '#e8c77e', canyon: '#d39a5e', reef: '#7fcf9c', ruins: '#a7b79a', moon: '#8f9fc4', sky: '#d7e7b5', storm: '#87a98b', forest: '#4f9a55', grass: '#8cc85e' };
const grassOf = (r) => (r.biome ? GRASS[r.biome] || hex(r.color) : ['#86c45a', '#7dbd55', '#92ca60', '#79b956', '#8fc65f'][seedOf(r.id) % 5]);
// 札の 色（world-picker.js の LOOK と 同じ 色あい）。
const BANNER = {
  willow: '#3f9a62', park: '#e27a2d', errand: '#d69a1c', school: '#3f7fd0', arena: '#c8573e', pet: '#e2a224', ride: '#3f75c8', town: '#5f9e43',
  eiken5: '#3e9a5a', eiken4: '#d67a1c', eiken3: '#3a64aa', eikenp2: '#cf5a30', eiken2: '#2a6e64', eikenp1: '#4f6aa8', eiken1: '#b0862a', talk: '#2c98bb',
  conv: '#d4587f', wear: '#c0569a', mini: '#e0662d', homework: '#cf6a2e', reading: '#4f7a3c', abc: '#d49a00', farm: '#7aa83a',
  land: '#26909f', fishworld: '#2d8fc4', main: '#e27a2d',
};
const bannerOf = (r) => BANNER[r.id] || dark(hex(r.color ?? 0x5aae78), 0.25);

// ── 島の かたち ───────────────────────────────────────────────
// まるみの ある 四角（superellipse）に 波を のせて、なめらかな 線（Catmull-Rom → ベジェ）に する。
function blob(cx, cz, rx, rz, seed, { power = 2.6, wob = 0.07, n = 40 } = {}) {
  const R = rng(seed), ph = [R() * 6.3, R() * 6.3, R() * 6.3], pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const k = 1 + wob * (Math.sin(a * 3 + ph[0]) * 0.6 + Math.sin(a * 5 + ph[1]) * 0.3 + Math.sin(a * 8 + ph[2]) * 0.18);
    const e = 2 / power;
    pts.push([cx + rx * k * Math.sign(c) * Math.abs(c) ** e, cz + rz * k * Math.sign(s) * Math.abs(s) ** e]);
  }
  return smooth(pts);
}
function smooth(p) {
  const n = p.length; let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + 'Z';
}
const inBlob = (r, x, z, k = 1) => (Math.abs((x - r.x) / (r.rx * k)) ** 2.6 + Math.abs((z - r.z) / (r.rz * k)) ** 2.6) <= 1;

// メインの島：もとの 角まるの 四角（54×43・power 4）＋ つき出した 土地（main-plaza.js の PLAZA.annex と also）。島の 中の 座標。
export const MX = -26, MZ = -79;
export const MAIN_RECTS = [
  { x0: 52, x1: 88, z0: -30, z1: 33, r: 7 }, { x0: 12, x1: 72, z0: -47, z1: -26, r: 7 },
  { x0: -78, x1: -40, z0: -74, z1: -1, r: 9 }, { x0: -78, x1: -14, z0: -74, z1: -40, r: 9 },   // ビルの まち（main-city.js の CITY.rects）
  { x0: -64, x1: -44, z0: 20, z1: 40, r: 6 }, { x0: -70, x1: -48, z0: -2, z1: 31, r: 8 },
];
export const MAIN_BAY = { x0: -16, x1: 22, z0: 25 };   // main_island.json の bay（さんばしの 入り江）
const inMain = (x, z) => {
  const lx = x - MX, lz = z - MZ;
  if (MAIN_RECTS.some((a) => lx >= a.x0 && lx <= a.x1 && lz >= a.z0 && lz <= a.z1)) return true;
  return (lx / 54) ** 4 + (lz / 43) ** 4 <= 1;
};
function mainShape() {
  const sq = blob(MX, MZ, 54, 43, 7, { power: 4, wob: 0.015, n: 56 });
  const rects = MAIN_RECTS.map((a) => `<rect x="${MX + a.x0}" y="${MZ + a.z0}" width="${a.x1 - a.x0}" height="${a.z1 - a.z0}" rx="${a.r}"/>`).join('');
  return `<path d="${sq}"/>${rects}`;
}

// ── 木（defs に 1 回 かいて <use> で ならべる）────────────────
const TREE_DEFS = `
<g id="wt-a"><ellipse cx="1" cy="2.7" rx="3.6" ry="1.4" fill="#0b3b26" fill-opacity=".28"/><circle cy="-.6" r="3.3" fill="#2e7f3c" stroke="${INK}" stroke-width=".35"/><circle cx="-1.1" cy="-1.9" r="1.7" fill="#58b14f"/><circle cx="-1.6" cy="-2.5" r=".7" fill="#9ad66b"/></g>
<g id="wt-b"><ellipse cx="1" cy="2.7" rx="3.6" ry="1.4" fill="#0b3b26" fill-opacity=".28"/><circle cy="-.6" r="3.3" fill="#3f9a3d" stroke="${INK}" stroke-width=".35"/><circle cx="-1.1" cy="-1.9" r="1.7" fill="#76c450"/><circle cx="-1.6" cy="-2.5" r=".7" fill="#b9e27a"/></g>
<g id="wt-c"><ellipse cx="1" cy="2.7" rx="3.6" ry="1.4" fill="#0b3b26" fill-opacity=".28"/><circle cy="-.6" r="3.3" fill="#24683a" stroke="${INK}" stroke-width=".35"/><circle cx="-1.1" cy="-1.9" r="1.7" fill="#3e9450"/><circle cx="-1.6" cy="-2.5" r=".7" fill="#73c070"/></g>
<g id="wt-pine"><ellipse cx="1" cy="2.4" rx="2.6" ry="1.1" fill="#0b3b26" fill-opacity=".28"/><rect x="-.45" y="0" width=".9" height="2" fill="#6b3f1c"/><path d="M0-6.4 3 -1.4H-3Z M0-4.2 3.4 .8H-3.4Z" fill="#256b45" stroke="${INK}" stroke-width=".35" stroke-linejoin="round"/><path d="M0-6.4-1.4-2.6H.2Z" fill="#4c9a64"/></g>
<g id="wt-snow"><ellipse cx="1" cy="2.4" rx="2.6" ry="1.1" fill="#3a5a6a" opacity=".22"/><rect x="-.45" y="0" width=".9" height="2" fill="#6b3f1c"/><path d="M0-6.4 3 -1.4H-3Z M0-4.2 3.4 .8H-3.4Z" fill="#2f6f62" stroke="${INK}" stroke-width=".35" stroke-linejoin="round"/><path d="M0-6.4 1.5-3.9 .4-4.3-.6-3.7-1.5-3.9Z M-3.4 .8-2.3-.8-1-.1.2-.9 1.4 0 2.4-.9 3.4 .8Z" fill="#fff"/></g>
<g id="wt-palm"><ellipse cx="1.4" cy="2.4" rx="2.6" ry="1" fill="#0b3b26" fill-opacity=".25"/><path d="M0 2.2C.4 0 .2-2 .9-4" stroke="#8a5a2b" stroke-width=".9" fill="none" stroke-linecap="round"/><path d="M.9-4C-1.8-5.2-3.4-3.8-3.8-2.4-2-3.6-.6-3.6.9-4ZM.9-4C3.4-5.4 5-4 5.2-2.6 3.4-3.8 2.2-3.8.9-4ZM.9-4C-.4-6.4-2.4-6.6-3.2-6 -1.4-5.6-.4-5 .9-4ZM.9-4C2.4-6.6 4.4-6.6 5-5.8 3.2-5.4 2.2-5 .9-4Z" fill="#3c9a48" stroke="${INK}" stroke-width=".3" stroke-linejoin="round"/></g>
<g id="wt-pink"><ellipse cx="1" cy="2.7" rx="3.6" ry="1.4" fill="#0b3b26" fill-opacity=".26"/><circle cy="-.6" r="3.2" fill="#e88aa8" stroke="${INK}" stroke-width=".35"/><circle cx="-1.1" cy="-1.9" r="1.6" fill="#f7b8cb"/><circle cx="-1.5" cy="-2.5" r=".6" fill="#fff0f5"/></g>
<g id="wt-gold"><ellipse cx="1" cy="2.7" rx="3.6" ry="1.4" fill="#0b3b26" fill-opacity=".26"/><circle cy="-.6" r="3.2" fill="#d9822b" stroke="${INK}" stroke-width=".35"/><circle cx="-1.1" cy="-1.9" r="1.6" fill="#f2b04a"/><circle cx="-1.5" cy="-2.5" r=".6" fill="#ffe0a0"/></g>
<g id="wt-bush"><circle cx="-1.2" cy=".2" r="1.5" fill="#3f9a3d" stroke="${INK}" stroke-width=".3"/><circle cx="1.1" cy=".2" r="1.4" fill="#2e7f3c" stroke="${INK}" stroke-width=".3"/><circle cy="-.8" r="1.5" fill="#58b14f" stroke="${INK}" stroke-width=".3"/></g>
<g id="wt-flower"><circle r=".55" fill="#ffd84a"/><circle cx="1.3" cy=".5" r=".5" fill="#ff7a8a"/><circle cx="-1.1" cy=".7" r=".5" fill="#fff"/></g>`;
const TREE_KIND = { snow: ['wt-snow', 'wt-snow', 'wt-pine'], desert: ['wt-palm', 'wt-palm', 'wt-bush'], reef: ['wt-palm', 'wt-a', 'wt-palm'], canyon: ['wt-gold', 'wt-bush', 'wt-gold'], moon: ['wt-pink', 'wt-c', 'wt-pink'],
  sky: ['wt-pink', 'wt-b', 'wt-a'], forest: ['wt-pine', 'wt-c', 'wt-pine', 'wt-a'], storm: ['wt-pine', 'wt-c', 'wt-bush'], ruins: ['wt-c', 'wt-bush', 'wt-a'], grass: ['wt-a', 'wt-b', 'wt-b', 'wt-pink'] };
const treesFor = (r) => TREE_KIND[r.biome] || (r.id === 'pet' || r.id === 'wear' ? ['wt-a', 'wt-b', 'wt-pink'] : r.id === 'fishworld' || r.id === 'land' ? ['wt-a', 'wt-palm', 'wt-b'] : ['wt-a', 'wt-b', 'wt-c', 'wt-b']);

// ── 建物の 部品（ななめ上から 見た かたち：おくゆきは 右上へ）──────
const DX = 0.55, DY = -0.45;
const S = (w) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"`;
// box(x, y, w, h, d, c)：前の かべの 下の まんなかが (x, y)。
function box(x, y, w, h, d, c, { top = true, sw = 0.4 } = {}) {
  const l = x - w / 2, r = x + w / 2, t = y - h, ox = d * DX, oy = d * DY;
  return `<path d="M${f(r)} ${f(y)}L${f(r + ox)} ${f(y + oy)}L${f(r + ox)} ${f(t + oy)}L${f(r)} ${f(t)}Z" fill="${dark(c, 0.28)}" ${S(sw)}/>`
    + (top ? `<path d="M${f(l)} ${f(t)}L${f(r)} ${f(t)}L${f(r + ox)} ${f(t + oy)}L${f(l + ox)} ${f(t + oy)}Z" fill="${light(c, 0.22)}" ${S(sw)}/>` : '')
    + `<rect x="${f(l)}" y="${f(t)}" width="${f(w)}" height="${f(h)}" fill="${c}" ${S(sw)}/>`;
}
// 三角の やね（前に 三角の かべ、右へ やねの 面）。
function gable(x, y, w, d, rh, wall, roof, ov = 0.6) {
  const l = x - w / 2 - ov, r = x + w / 2 + ov, ox = d * DX, oy = d * DY;
  return `<path d="M${f(x)} ${f(y - rh)}L${f(r)} ${f(y)}L${f(r + ox)} ${f(y + oy)}L${f(x + ox)} ${f(y - rh + oy)}Z" fill="${roof}" ${S(0.4)}/>`
    + `<path d="M${f(l)} ${f(y)}L${f(x)} ${f(y - rh)}L${f(r)} ${f(y)}Z" fill="${wall}" ${S(0.4)}/>`
    + `<path d="M${f(l)} ${f(y)}L${f(x)} ${f(y - rh)}" stroke="${dark(roof, 0.15)}" stroke-width="1.1" stroke-linecap="round" fill="none"/>`
    + `<path d="M${f(x)} ${f(y - rh)}L${f(r)} ${f(y)}" stroke="${dark(roof, 0.15)}" stroke-width="1.1" stroke-linecap="round" fill="none"/>`;
}
function house(x, y, w, h, d, wall, roof, { door = true, win = 2, rh = null } = {}) {
  let s = `<ellipse cx="${f(x + d * 0.4)}" cy="${f(y + 0.6)}" rx="${f(w * 0.75 + d * 0.3)}" ry="${f(1.2 + d * 0.15)}" fill="#0b3b26" fill-opacity=".25"/>`;
  s += box(x, y, w, h, d, wall, { top: false });
  s += gable(x, y - h, w, d, rh ?? w * 0.5, light(wall, 0.12), roof);
  if (door) s += `<rect x="${f(x - w * 0.12)}" y="${f(y - h * 0.55)}" width="${f(w * 0.24)}" height="${f(h * 0.55)}" rx=".3" fill="#7a4a22" ${S(0.3)}/>`;
  for (let i = 0; i < win; i++) { const wx = x + (i === 0 ? -w * 0.33 : w * 0.33) - w * 0.09; s += `<rect x="${f(wx)}" y="${f(y - h * 0.75)}" width="${f(w * 0.18)}" height="${f(h * 0.26)}" fill="#bfe8ff" ${S(0.3)}/>`; }
  return s;
}
const flag = (x, y, h, c) => `<path d="M${f(x)} ${f(y)}V${f(y - h)}" stroke="${INK}" stroke-width=".45"/><path d="M${f(x)} ${f(y - h)}l${f(h * 0.45)} ${f(h * 0.13)}-${f(h * 0.45)} ${f(h * 0.13)}Z" fill="${c}" ${S(0.3)}/>`;
const circle = (x, y, r, c, sw = 0.4) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${c}" ${S(sw)}/>`;
const txt = (x, y, s, size, c = '#fff', w = 800) => `<text x="${f(x)}" y="${f(y)}" font-size="${size}" font-weight="${w}" fill="${c}" text-anchor="middle" dominant-baseline="central" class="wm-ink">${s}</text>`;
const shadow = (x, y, rx, ry = rx * 0.35) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="#0b3b26" fill-opacity=".25"/>`;
const columns = (x, y, w, h, n, c) => { let s = ''; for (let i = 0; i < n; i++) { const cx = x - w / 2 + (w / (n - 1)) * i; s += `<rect x="${f(cx - 0.55)}" y="${f(y - h)}" width="1.1" height="${f(h)}" fill="${c}" ${S(0.25)}/>`; } return s; };

// ── 島ごとの しるしの 絵（まんなか (0,0)・はば およそ 30）──────────
// それぞれ その 島の 中身から：つりの いけ・学校・アリーナ・英検の 館・カートの コース・かんらんしゃ・牛小屋…
function hall(badge, c) {   // 英検の 島：はしらの ある 館 ＋ 級の まるい しるし
  return shadow(1, 4, 14) + box(0, 3, 22, 9, 8, '#f4ead2') + columns(0, 2.6, 18, 7.6, 6, '#fffaf0')
    + `<path d="M-12.4-6 0-12.6 12.4-6Z" fill="${light(c, 0.1)}" ${S(0.4)}/><path d="M12.4-6 16.8-9.6 4.4-16.2 0-12.6Z" fill="${dark(c, 0.15)}" ${S(0.4)}/>`
    + `<rect x="-3" y="-1.6" width="6" height="4.6" fill="#7a4a22" ${S(0.3)}/>`
    + circle(10, -14, 5.2, c, 0.5) + circle(10, -14, 4, light(c, 0.15), 0.25) + `<g class="wm-badge">${badge}</g>`;
}
const LANDMARK = {
  willow: () => shadow(0, 4, 14) + house(-7, 3, 9, 6, 6, '#fff4d6', '#e27a2d') + house(6, 4, 7, 5, 5, '#f7e2b8', '#3f9a62')
    + `<path d="M14-3V-14" stroke="${INK}" stroke-width=".6"/>` + `<g transform="translate(14 -14)"><path d="M0 0L-6-2-6 2Z M0 0 2-6-2-6Z M0 0 6 2 6-2Z M0 0-2 6 2 6Z" fill="#fff" ${S(0.3)}/></g>` + circle(14, -14, 1.1, '#e27a2d')
    + flag(-14, 4, 10, '#ffb066') + txt(-11.4, -3.8, 'START', 1.6, '#1b3a2f'),
  park: () => {   // かんらんしゃ ＋ サーカスの テント ＋ コースターの レール
    let s = shadow(2, 6, 17);
    s += `<path d="M-16 6C-12-10-4-12 0-4S10 4 16-8" stroke="#d9483b" stroke-width="1.4" fill="none"/><path d="M-16 6C-12-10-4-12 0-4S10 4 16-8" stroke="#fff" stroke-width=".5" stroke-dasharray="1 1" fill="none"/>`;
    s += `<g transform="translate(-4 -6)"><circle r="10" fill="none" stroke="#ffffff" stroke-width="1.4"/><circle r="10" fill="none" stroke="${INK}" stroke-width=".35"/>`;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; s += `<path d="M0 0L${f(Math.cos(a) * 10)} ${f(Math.sin(a) * 10)}" stroke="#e8e0cc" stroke-width=".4"/>`; s += circle(Math.cos(a) * 10, Math.sin(a) * 10 + 1, 1.5, ['#e27a2d', '#ffd84a', '#4fa3d9', '#e05a8a', '#8ff0c8'][i % 5], 0.3); }
    s += `<circle r="1.4" fill="#ffd84a" ${S(0.3)}/><path d="M-5 12L0 0 5 12Z" fill="none" stroke="${INK}" stroke-width=".7"/></g>`;
    s += `<g transform="translate(10 6)"><path d="M-7 0-5.6-6 0-11 5.6-6 7 0Z" fill="#fff4d6" ${S(0.4)}/><path d="M-5.6-6 0-11 0 0-2.8 0Z M2.8 0 0 0 0-11 5.6-6Z" fill="#d9483b" opacity=".9"/><path d="M0-11V-14" stroke="${INK}" stroke-width=".4"/><path d="M0-14l2.4.7-2.4.7Z" fill="#ffd84a"/></g>`;
    return s;
  },
  errand: () => shadow(0, 5, 16) + ['#e27a2d', '#3f9a62', '#d9483b'].map((c, i) => {
    const x = -10 + i * 10; return box(x, 4, 8, 7, 5, '#fff4d6') + `<path d="M${x - 4.6} -3h9.2l-.6 2.4h-8Z" fill="${c}" ${S(0.3)}/><path d="M${x - 2.8} -3v2.4M${x} -3v2.4M${x + 2.8} -3v2.4" stroke="#fff" stroke-width="1"/>` + `<rect x="${x - 2}" y="0" width="4" height="4" fill="#bfe8ff" ${S(0.25)}/>`;
  }).join('') + `<rect x="-3" y="-13" width="6" height="4" rx=".6" fill="#ffd84a" ${S(0.3)}/><path d="M0-9v4" stroke="${INK}" stroke-width=".5"/>`,
  school: () => shadow(0, 5, 16) + box(0, 4, 24, 9, 7, '#f2d2a2') + gable(0, -5, 8, 7, 4, '#fff4d6', '#c8573e')
    + box(0, -5, 6, 7, 5, '#f2d2a2') + gable(0, -12, 6, 5, 4, '#fff4d6', '#c8573e') + circle(0, -8.6, 1.6, '#fff', 0.3)
    + [-8, -4, 4, 8].map((x) => `<rect x="${x - 1.2}" y="-2.5" width="2.4" height="3" fill="#bfe8ff" ${S(0.25)}/>`).join('') + `<rect x="-1.6" y="0" width="3.2" height="4" fill="#7a4a22" ${S(0.25)}/>` + flag(14, 4, 12, '#3f7fd0'),
  arena: () => {
    let s = shadow(0, 6, 17, 5) + `<ellipse cx="0" cy="0" rx="16" ry="8.5" fill="#d8b98a" ${S(0.4)}/><ellipse cx="0" cy="-3" rx="16" ry="8.5" fill="#efd8b0" ${S(0.4)}/><ellipse cx="0" cy="-3" rx="10.5" ry="5" fill="#c6a46c" ${S(0.35)}/><ellipse cx="0" cy="-2.6" rx="8" ry="3.6" fill="#e9c98c"/>`;
    for (let i = 0; i < 9; i++) { const x = -13 + i * 3.25; s += `<path d="M${f(x)} ${f(3.4 - Math.abs(x) * 0.12)}v-2.6a1 1 0 0 1 2 0v2.6" fill="#8a6a40" opacity=".7"/>`; }
    return s + flag(-14, -6, 9, '#c8573e') + flag(14, -6, 9, '#ffd84a') + `<path d="M-3-4 3 0M3-4-3 0" stroke="#5a6a78" stroke-width="1" stroke-linecap="round"/>`;
  },
  pet: () => shadow(0, 5, 15) + house(-6, 4, 9, 6, 6, '#f2b04a', '#d9483b', { win: 0 }) + `<path d="M-8 4a2 2 0 0 1 4 0" fill="#3a2a1a"/>`
    + `<g transform="translate(8 -2)">${circle(0, 0, 3.2, '#fff4d6')}${circle(-2.6, -3.4, 1.3, '#fff4d6')}${circle(0, -4.4, 1.3, '#fff4d6')}${circle(2.6, -3.4, 1.3, '#fff4d6')}</g>`
    + `<path d="M-14 8h28" stroke="#fff4d6" stroke-width="1"/>` + [-12, -6, 0, 6, 12].map((x) => `<path d="M${x} 9.5v-4" stroke="#fff4d6" stroke-width="1"/>`).join('') + circle(12, 2, 2, '#ffe08a') + circle(12.2, 1.5, .7, '#e27a2d', 0.1),
  ride: () => { // カートの コース（だ円の 道 ＋ チェッカーの スタート）
    let s = `<ellipse cx="0" cy="1" rx="18" ry="10" fill="#0b3b26" fill-opacity=".2"/><ellipse cx="0" cy="0" rx="17" ry="9.5" fill="#5f6b73" ${S(0.4)}/><ellipse cx="0" cy="0" rx="11.6" ry="4.6" fill="#7dc35a" ${S(0.4)}/><ellipse cx="0" cy="0" rx="14.3" ry="7" fill="none" stroke="#fff" stroke-width=".5" stroke-dasharray="2 1.6"/>`;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) s += `<rect x="${f(-1.5 + j * 1.5)}" y="${f(4.6 + i * 0.82)}" width="1.5" height=".82" fill="${(i + j) % 2 ? '#fff' : '#222'}"/>`;
    return s + circle(-9, 5.6, 1.3, '#e27a2d') + circle(7, -6.4, 1.3, '#3f75c8') + `<path d="M0-5V-14" stroke="${INK}" stroke-width=".5"/><path d="M0-14h5v3H0Z" fill="#fff" ${S(0.3)}/><path d="M0-14h1.25v1.5H0Zm2.5 0h1.25v1.5H2.5Zm-1.25 1.5h1.25V-11H1.25Zm2.5 0H5V-11H3.75Z" fill="#222"/>`;
  },
  town: () => shadow(0, 5, 16) + house(-9, 4, 7, 5, 5, '#f4e2c0', '#3f75c8') + house(0, 5, 7, 6, 5, '#ffd9a8', '#d9483b') + house(9, 4, 7, 5, 5, '#e8f2d0', '#3f9a62')
    + `<path d="M13 4V-16H-2" stroke="#e2a224" stroke-width="1.2" fill="none"/><path d="M13-16l2 2" stroke="#e2a224" stroke-width="1.2"/><path d="M-1-16v6" stroke="${INK}" stroke-width=".35"/>` + box(-1, -8, 3, 2.4, 2, '#e27a2d'),
  eiken5: () => hall(txt(10, -14, '5', 6), '#3e9a5a'), eiken4: () => hall(txt(10, -14, '4', 6), '#d67a1c'), eiken3: () => hall(txt(10, -14, '3', 6), '#3a64aa'),
  eikenp2: () => hall(`<text x="10" y="-14" font-size="3.6" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" class="wm-ink"><tspan class="ja">準2</tspan><tspan class="en">P2</tspan></text>`, '#cf5a30'),
  eiken2: () => hall(txt(10, -14, '2', 6), '#2a6e64'),
  eikenp1: () => hall(`<text x="10" y="-14" font-size="3.6" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" class="wm-ink"><tspan class="ja">準1</tspan><tspan class="en">P1</tspan></text>`, '#4f6aa8'),
  eiken1: () => hall(`<path d="M7-12.4 6.6-16.4 8.4-14.6 10-17 11.6-14.6 13.4-16.4 13-12.4Z" fill="#ffd84a" ${S(0.3)}/>`, '#b0862a'),
  talk: () => shadow(0, 6, 15) + `<path d="M-13-12h13a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-7l-4 3.4V-1h-2a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z" fill="#fff" ${S(0.5)}/><path d="M2-5h11a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-1v3.4L8 5H2a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z" fill="#8ff0c8" ${S(0.5)}/>`
    + circle(-10, -6.5, .9, '#2c98bb', 0) + circle(-6.5, -6.5, .9, '#2c98bb', 0) + circle(-3, -6.5, .9, '#2c98bb', 0) + `<path d="M3 0h9" stroke="#1b3a2f" stroke-width="1" stroke-linecap="round"/>`
    + box(-6, 8, 7, 1.4, 2.4, '#c98a4b') + box(7, 9, 7, 1.4, 2.4, '#c98a4b'),
  conv: () => shadow(0, 5, 15) + house(-3, 4, 14, 8, 7, '#ffe3ea', '#d4587f') + `<path d="M5-18h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-4l-3 3v-3H5a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z" fill="#fff" ${S(0.45)}/>`
    + txt(10, -13, 'Hi!', 3.4, '#d4587f', 900) + `<g transform="translate(-14 2)"><rect x="-1.2" y="-6" width="2.4" height="4" rx="1.2" fill="#5a6a78" ${S(0.3)}/><path d="M0-2v5M-2 3h4" stroke="${INK}" stroke-width=".5"/></g>`,
  wear: () => shadow(0, 5, 15) + box(0, 4, 20, 9, 6, '#fde4f0') + `<path d="M-11-5h22l-1.2 3h-19.6Z" fill="#c0569a" ${S(0.3)}/><path d="M-7.4-5v3M-3.7-5v3M0-5v3M3.7-5v3M7.4-5v3" stroke="#fff" stroke-width="1.2"/>`
    + `<rect x="-8" y="-1" width="6" height="5" fill="#bfe8ff" ${S(0.25)}/><rect x="2" y="-1" width="6" height="5" fill="#bfe8ff" ${S(0.25)}/>`
    + `<g transform="translate(0 -12)"><path d="M-5-3-2-4.4a2 2 0 0 0 4 0L5-3 6.4 0 4 1V5H-4V1L-6.4 0Z" fill="#ffb066" ${S(0.4)}/></g>`,
  mini: () => shadow(0, 5, 15) + box(-5, 4, 12, 10, 6, '#ffe08a') + `<rect x="-9" y="-4" width="8" height="5" rx=".6" fill="#1b3a2f" ${S(0.3)}/><rect x="-8" y="-3" width="6" height="3" fill="#8ff0c8"/>`
    + `<g transform="translate(9 -2)"><rect x="-6" y="-3" width="12" height="6" rx="3" fill="#e0662d" ${S(0.4)}/>${circle(-3, 0, 1.2, '#fff', 0.2)}${circle(3, -1, .9, '#ffd84a', 0.2)}${circle(4.6, .8, .9, '#8ff0c8', 0.2)}</g>`
    + box(10, 10, 3.4, 3.4, 2.4, '#3f9a62') + box(13.6, 10, 3.4, 3.4, 2.4, '#3f75c8') + box(11.8, 6.6, 3.4, 3.4, 2.4, '#d9483b'),
  farm: () => shadow(0, 6, 16) + [0, 1, 2, 3].map((i) => `<path d="M-16 ${9 + i * 1.6}h13" stroke="${i % 2 ? '#7ab648' : '#a5733e'}" stroke-width="1.2"/>`).join('')
    + box(2, 5, 13, 8, 7, '#c8473b') + gable(2, -3, 13, 7, 6, '#d65a4c', '#7a3a2a', 0.8) + `<path d="M-2 5v-5h8v5M-2 0l8 5M6 0-2 5" stroke="#fff" stroke-width=".8" fill="none"/>`
    + `<rect x="11.5" y="-10" width="4.6" height="15" fill="#e8e0d0" ${S(0.4)}/><path d="M11.5-10a2.3 2.3 0 0 1 4.6 0Z" fill="#7a8a96" ${S(0.4)}/>`
    + `<g transform="translate(-10 2)"><ellipse rx="2.6" ry="1.6" fill="#fff" ${S(0.3)}/><circle cx="-2.4" cy="-1" r="1" fill="#fff" ${S(0.3)}/><circle cx=".6" cy="-.2" r=".6" fill="#222"/></g>`,
  land: () => shadow(0, 5, 15) + [[-12, -6], [-3, -9], [6, -6]].map(([x, y]) => `<path d="M${x} ${y}h7l3 -3h-7Z" fill="#c9e59a" stroke="#fff" stroke-width=".5" stroke-dasharray="1 .6"/>`).join('')
    + house(-2, 5, 12, 7, 6, '#e9f6f6', '#26909f') + `<rect x="-6" y="-8" width="8" height="2.6" rx=".5" fill="#fff4d6" ${S(0.3)}/>` + flag(10, 6, 12, '#ffb066') + flag(-12, 6, 9, '#8ff0c8'),
  reading: () => shadow(0, 5, 16) + box(0, 4, 20, 8, 7, '#efe4cf') + columns(0, 3.6, 16, 6.8, 5, '#fffaf0') + `<path d="M-11.4-4 0-10 11.4-4Z" fill="#4f7a3c" ${S(0.4)}/><path d="M11.4-4 15.2-7.2 3.8-13.2 0-10Z" fill="#3a5f2c" ${S(0.4)}/>`
    + `<g transform="translate(0 -17)"><path d="M0 1C-3-.6-6-.6-8.4.4V-6.4C-6-7.4-3-7.4 0-5.6Z" fill="#fff" ${S(0.4)}/><path d="M0 1C3-.6 6-.6 8.4.4V-6.4C6-7.4 3-7.4 0-5.6Z" fill="#fff4d6" ${S(0.4)}/><path d="M-6.4-4.4c1.6-.5 3.2-.5 4.6.3M-6.4-2.6c1.6-.5 3.2-.5 4.6.3M1.8-4.1c1.4-.8 3-.8 4.6-.3" stroke="#7a8a96" stroke-width=".35" fill="none"/></g>`,
  abc: () => shadow(0, 6, 15) + box(-8, 6, 8, 8, 6, '#e0566a') + box(2, 6, 8, 8, 6, '#3f9a62') + box(-3, -2, 8, 8, 6, '#3f75c8')
    + txt(-8, 2, 'A', 5.2) + txt(2, 2, 'B', 5.2) + txt(-3, -6, 'C', 5.2) + box(12, 6, 5, 5, 4, '#ffd84a') + txt(12, 3.5, 'D', 3.2, '#1b3a2f'),
  homework: () => shadow(0, 5, 15) + house(-4, 4, 13, 8, 7, '#fff4d6', '#cf6a2e')
    + `<g transform="translate(11 -2) rotate(28)"><rect x="-1.6" y="-11" width="3.2" height="16" fill="#ffd84a" ${S(0.4)}/><rect x="-1.6" y="-11" width="3.2" height="2.4" fill="#ff8fa0" ${S(0.3)}/><path d="M-1.6 5 0 9 1.6 5Z" fill="#f2d2a2" ${S(0.3)}/><path d="M-.5 7.8 0 9 .5 7.8Z" fill="#333"/></g>`
    + `<rect x="-16" y="4" width="7" height="5" fill="#fff" ${S(0.3)}/><path d="M-15 5.5h5M-15 7h4" stroke="#7a8a96" stroke-width=".4"/>`,
  fishworld: () => shadow(0, 6, 16) + `<ellipse cx="-4" cy="2" rx="11" ry="6.5" fill="#4fb9e0" ${S(0.4)}/><ellipse cx="-5" cy="1" rx="7" ry="3.4" fill="#8fd8f0"/>`
    + `<path d="M5 3C9 6 12 6 16 9" stroke="#4fb9e0" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    + `<g transform="translate(-6 1)"><path d="M-2.4 0C-1 -1.6 1.6-1.6 2.6 0 1.6 1.6-1 1.6-2.4 0ZM2.6 0 4 -1.2V1.2Z" fill="#e27a2d" ${S(0.25)}/></g>`
    + `<path d="M3-4 10-14" stroke="#7a4a22" stroke-width=".7"/><path d="M10-14C11-9 6-5 3 0" stroke="#fff" stroke-width=".25" fill="none"/>`
    + `<rect x="10" y="-12" width="4.4" height="13" fill="#fff" ${S(0.4)}/><rect x="10" y="-8" width="4.4" height="2" fill="#d9483b"/><rect x="10" y="-3" width="4.4" height="2" fill="#d9483b"/><path d="M9.4-12h5.6l-2.8-3.4Z" fill="#d9483b" ${S(0.35)}/>${circle(12.2, -13.4, .8, '#ffd84a', 0.2)}`,
  main: () => '',
  // ぼうけんの ちいき
  meadow: () => shadow(0, 5, 13) + `<path d="M-16 4C-10-2-4-3 0 2" fill="none" stroke="#f0ce78" stroke-width="2.4" stroke-linecap="round"/>`
    + ['#e0566a', '#ffd84a', '#3f75c8', '#3f9a62', '#e27a2d'].map((c, i) => `<path d="M-12-10a14 14 0 0 1 24 0" fill="none" stroke="${c}" stroke-width="1.1" transform="translate(0 ${-i * 1.1})"/>`).join('')
    + `<path d="M4 6V-4" stroke="#7a4a22" stroke-width="1"/><path d="M4-4h8l1.4 1.6L12-1H4Z" fill="#f2d2a2" ${S(0.35)}/>` + [[-8, 7], [-4, 9], [8, 9], [12, 6], [-12, 8]].map(([x, y]) => `<use href="#wt-flower" transform="translate(${x} ${y}) scale(1.4)"/>`).join(''),
  forest: () => `<use href="#wt-c" transform="translate(0 2) scale(3.6)"/><use href="#wt-pine" transform="translate(-11 6) scale(1.6)"/><use href="#wt-pine" transform="translate(11 7) scale(1.5)"/>` + circle(-3, -6, 1, '#ffe08a', 0) + circle(4, -9, .8, '#c6f7a0', 0) + circle(2, -2, .9, '#ffe08a', 0),
  reef: () => shadow(0, 5, 14) + `<ellipse cx="0" cy="2" rx="12" ry="6" fill="#57c7d8" ${S(0.35)}/>`
    + [[-6, 2, '#ff7a8a'], [5, 3, '#ffb066']].map(([x, y, c]) => `<path d="M${x} ${y}v-6m0 3-3-3m3 2 3-4" stroke="${c}" stroke-width="1.3" stroke-linecap="round" fill="none"/>`).join('')
    + `<path d="M0-2-3-10 0-16 3-10Z" fill="#c6eee1" ${S(0.4)}/><path d="M0-16 3-10 0-2Z" fill="#8fd8e8"/><path d="M8-4 6-10 8-13 10-10Z" fill="#c6eee1" ${S(0.35)}/>`,
  canyon: () => shadow(0, 6, 16) + box(-6, 6, 12, 10, 7, '#c8683e') + box(8, 6, 8, 14, 6, '#d9824a') + box(-12, 8, 6, 5, 4, '#b85a34')
    + `<path d="M-12-4h12M2-8h12" stroke="#f0bc78" stroke-width=".7"/>`,
  snow: () => shadow(0, 6, 16) + `<path d="M-17 6-6-14 4 6Z" fill="#a9c9d8" ${S(0.45)}/><path d="M-6-14-9.4-7.8-7-8.6-5.2-7.2-3-8.6-6-14Z" fill="#fff"/><path d="M-3 6 7-10 17 6Z" fill="#c5dce6" ${S(0.45)}/><path d="M7-10 4.2-5.4 6-6 7.6-5 9.6-5.6Z" fill="#fff"/>`,
  storm: () => `<path d="M-14 6C-10-2-4-4 0 2 4-6 10-4 14 6Z" fill="#6f8f72" ${S(0.45)}/>` + `<g transform="translate(0 -12)">${circle(-5, 0, 4.6, '#8a98ad')}${circle(1, -2, 5.6, '#9aa8bd')}${circle(7, 0, 4.2, '#8a98ad')}<rect x="-8" y="0" width="18" height="3.4" fill="#8a98ad"/></g>`
    + `<path d="M1-7-2-1h3L-1 5 5-3H2L4-7Z" fill="#ffd84a" ${S(0.35)}/>`,
  desert: () => shadow(0, 6, 15) + `<path d="M-17 7C-11 1-5 1 0 7Z M-2 7C4 2 10 2 16 7Z" fill="#e0b060" ${S(0.35)}/><path d="M-4 4 4-10 12 4Z" fill="#f0cf86" ${S(0.45)}/><path d="M4-10 12 4H6Z" fill="#c99a50"/>`
    + `<ellipse cx="-11" cy="0" rx="4" ry="1.6" fill="#57c7d8" ${S(0.3)}/><use href="#wt-palm" transform="translate(-13 -1) scale(1.2)"/>`,
  ruins: () => shadow(0, 6, 15) + `<path d="M-8 4V-10a8 8 0 0 1 16 0V4H4V-9a4 4 0 0 0-8 0V4Z" fill="#c9c6b8" ${S(0.45)}/>` + box(-13, 6, 3, 9, 2.4, '#d6d2c4') + box(13, 6, 3, 5, 2.4, '#d6d2c4') + box(9, 7, 4, 1.6, 3, '#b2ada0')
    + circle(0, -12, 2.2, '#b2d8bd', 0.35),
  moon: () => shadow(0, 6, 14) + `<path d="M3-18a8 8 0 1 0 6 13 6.4 6.4 0 1 1-6-13Z" fill="#ffe8a0" ${S(0.45)}/>` + `<path d="M-14 6h28" stroke="#c9b7e8" stroke-width="1.6"/>`
    + [[-10, 1], [0, 2], [10, 1]].map(([x, y]) => `<path d="M${x} ${y + 5}V${y - 3}" stroke="${INK}" stroke-width=".4"/>${circle(x, y - 4, 1.8, '#ffd84a', 0.3)}`).join(''),
  sky: () => `<g>${circle(-9, 6, 5, '#fff')}${circle(0, 4, 7, '#fff')}${circle(10, 6, 5, '#fff')}</g>` + box(0, 2, 12, 8, 5, '#fff4d6') + columns(0, 1.6, 10, 7, 4, '#fffaf0') + `<path d="M-7-6 0-11 7-6Z" fill="#f2b04a" ${S(0.4)}/>`
    + `<path d="M-7-8C-12-12-16-10-18-6-14-8-11-7-7-6Z M7-8C12-12 16-10 18-6 14-8 11-7 7-6Z" fill="#fff" ${S(0.4)}/>`,
};

// ── メインの島：まちの 中（島の 中の 座標 → 世界）───────────────
const MW = (x, z) => [MX + x, MZ + z];
export const MAIN_ROADS = [   // main_island.json の island.roads ＋ ビルの まちの 道（main-city.js）
  [[-66, 16], [58, 16]], [[-6, -36], [-6, 16]], [[-6, -31.5], [68, -31.5]], [[-59.5, 35.6], [-18.5, 35.6]], [[-18.5, 16], [-18.5, 36.9]], [[-40, -13.5], [-6, -13.5]],
  [[58, 16], [84, 16]], [[-63, -72], [-63, 14]], [[-46, -72], [-46, -2]], [[-30, -72], [-30, -42]], [[-76, -13.5], [-40, -13.5]], [[-76, -31], [-40, -31]], [[-76, -49], [-16, -49]],
];
// 中の 場所の 名前（ちかづけた ときだけ 出る）。どちらの 言語も ここに 書く（島の 中の 名前・辞書に 入れない）。
const MAIN_PLACES = [
  { x: -58, z: -36, en: 'Downtown', ja: 'ビルの まち' }, { x: -28, z: -17, en: 'Planetarium', ja: 'プラネタリウム' },
  { x: 71, z: 31, en: 'Plaza', ja: 'ひろば' }, { x: 79, z: -2, en: 'Clock Tower', ja: 'とけいだい' }, { x: 70, z: -26, en: 'Library', ja: 'としょかん' },
  { x: -40, z: 41, en: 'Shops Street', ja: 'おみせの とおり' }, { x: -57, z: 25, en: "Yupi's Room", ja: 'ゆぴちゃんの へや' }, { x: -62, z: 4, en: 'Bike Shop', ja: 'じてんしゃや' },
  { x: 31, z: 46, en: 'Boat Dock', ja: 'ふなつきば' }, { x: 31, z: -44, en: 'Word Houses', ja: 'えいたんご ハウス' }, { x: 28, z: 26.5, en: 'Food Stalls', ja: 'やたい' },
  { x: -12, z: 9, en: 'Gates', ja: 'ゲート' }, { x: 4, z: 50, en: 'Fishing Piers', ja: 'つりば' }, { x: -37, z: 4, en: 'Talk Shops', ja: 'えいかいわの おみせ' },
];
function mainTown() {
  let s = '';
  // 道（こげ茶の ふち → クリームの 道 → まんなかの 点線）
  const road = () => MAIN_ROADS.map(([[x0, z0], [x1, z1]]) => { const [a, b] = MW(x0, z0), [c2, d] = MW(x1, z1); return `<path d="M${a} ${b}L${c2} ${d}"/>`; }).join('');
  s += `<g fill="none" stroke-linecap="round"><g stroke="#c8a46a" stroke-width="5.6">${road()}</g><g stroke="#fbeccb" stroke-width="4">${road()}</g><g stroke="#e4c48d" stroke-width=".4" stroke-dasharray="1.6 1.6">${road()}</g></g>`;
  // ビルの まち：たかい ビル（ガラスの 青・まどの すじ）
  const towers = [[-71, -62, 14], [-55, -62, 20], [-38, -58, 12], [-22, -60, 16], [-71, -42, 18], [-55, -41, 24], [-71, -22, 12], [-55, -22, 16], [-55, -5, 10], [-71, -5, 8], [-38, -42, 10]];
  const glass = ['#7fb8d8', '#9cc8e0', '#6aa2c6', '#a9d2e6'];
  towers.forEach(([x, z, h], i) => {
    const [wx, wz] = MW(x, z), c = glass[i % 4], w = 8.5, d = 6;
    s += box(wx, wz + 4, w, h, d, c);
    for (let k = 2; k < h - 1; k += 2.2) s += `<path d="M${f(wx - w / 2 + 0.8)} ${f(wz + 4 - k)}h${f(w - 1.6)}" stroke="#fff" stroke-width=".55" opacity=".75"/>`;
    s += `<path d="M${f(wx - w / 2 + 2)} ${f(wz + 4 - h + 0.6)}v${f(h - 1.2)}" stroke="#ffffff" stroke-width=".8" opacity=".45"/>`;
  });
  // プラネタリウム（まるい やね）
  { const [x, z] = MW(-28, -24.6); s += shadow(x + 1, z + 4, 10, 3) + box(x, z + 4, 16, 3, 9, '#e9e4f0') + `<path d="M${f(x - 7.6)} ${f(z + 1)}a7.6 7 0 0 1 15.2 0Z" fill="#cfd8e6" ${S(0.45)}/><path d="M${f(x - 7.6)} ${f(z + 1)}a7.6 7 0 0 1 15.2 0" fill="none" stroke="#fff" stroke-width=".6" stroke-dasharray="1.2 1"/><path d="M${f(x - 3)} ${f(z - 4)}l.6 1.2 1.3.2-1 .9.3 1.3-1.2-.6-1.2.6.3-1.3-1-.9 1.3-.2Z" fill="#ffd84a"/>`; }
  // ひろば：まるい 石だたみ・ふんすい・時計台・フリーマーケット
  { const [x, z] = MW(71, 16); s += `<ellipse cx="${x}" cy="${z}" rx="14" ry="12" fill="#efd9b0" ${S(0.4)}/><ellipse cx="${x}" cy="${z}" rx="9" ry="7.6" fill="none" stroke="#d9bd8c" stroke-width="1"/>`
    + `<ellipse cx="${x}" cy="${z}" rx="4.2" ry="3" fill="#4fb9e0" ${S(0.4)}/><path d="M${x} ${z}v-4" stroke="#bfe8ff" stroke-width="1.2" stroke-linecap="round"/>${circle(x, z - 4.4, 1, '#e6f8ff', 0.2)}`;
    for (let i = 0; i < 6; i++) { const sx = MX + 59.8 + i * 4.5, sz = MZ + 25.6; s += box(sx, sz + 1, 3.4, 1.6, 2, '#c98a4b') + `<path d="M${f(sx - 2)} ${f(sz - 1.6)}h4l-.5 1.2h-3Z" fill="${['#d9483b', '#e27a2d', '#f2b630', '#3f75c8', '#2f8f5b', '#c8553d'][i]}" ${S(0.25)}/>`; } }
  { const [x, z] = MW(79, 6.5); s += shadow(x + 1, z + 1, 4) + box(x, z + 1, 4, 16, 3.4, '#f4e6c8') + `<path d="M${f(x - 2.6)} ${f(z - 15)}L${x} ${f(z - 20)}L${f(x + 2.6)} ${f(z - 15)}Z" fill="#e27a2d" ${S(0.4)}/>`
    + circle(x, z - 12, 1.6, '#fff', 0.35) + `<path d="M${x} ${f(z - 12)}v-1.1M${x} ${f(z - 12)}h.8" stroke="${INK}" stroke-width=".3"/>`; }
  // としょかん（はしらの ある 大きな 建物）
  { const [x, z] = MW(70, -14); s += shadow(x + 1, z + 6, 16, 3.4) + box(x, z + 6, 26, 7, 8, '#efe4cf') + columns(x, z + 5.6, 22, 6, 8, '#fffaf0') + `<path d="M${f(x - 14)} ${f(z - 1)}L${x} ${f(z - 6)}L${f(x + 14)} ${f(z - 1)}Z" fill="#3f9a62" ${S(0.4)}/><path d="M${f(x + 14)} ${f(z - 1)}L${f(x + 18.4)} ${f(z - 4.6)}L${f(x + 4.4)} ${f(z - 9.6)}L${x} ${f(z - 6)}Z" fill="#2f7a4c" ${S(0.4)}/>`; }
  // 英単語ハウス 3 けん・ぶきや
  [[20, -35, '#4fae6b'], [31, -35, '#e0a52c'], [42, -35, '#3f6fb8'], [53, -35, '#7a8a96']].forEach(([x, z, c]) => { const [wx, wz] = MW(x, z); s += house(wx, wz + 3, 6.4, 4.6, 4.6, '#fff4d6', c, { win: 1 }); });
  // 大通りの お店（屋台・ふくや・ブロックや・いえの おみせ・かいとりや）
  [[17.5, 21, '#e0566a'], [28, 21, '#f2b04a'], [38.5, 21, '#4fb9e0']].forEach(([x, z, c]) => { const [wx, wz] = MW(x, z); s += box(wx, wz + 2.4, 5, 2.6, 3, '#fff4d6') + `<path d="M${f(wx - 3)} ${f(wz - 0.4)}h6l-.6 1.4h-4.8Z" fill="${c}" ${S(0.3)}/><path d="M${f(wx - 1.5)} ${f(wz - .4)}v1.4M${f(wx + .3)} ${f(wz - .4)}v1.4M${f(wx + 1.9)} ${f(wz - .4)}v1.4" stroke="#fff" stroke-width=".7"/>`; });
  [[4, 8, '#2f9aa8'], [17, 8, '#3f75c8'], [27.5, 8, '#c0569a'], [38.5, 8, '#26909f'], [-19.5, 10.5, '#e27a2d'], [45, 30, '#cf6a2e']].forEach(([x, z, c]) => { const [wx, wz] = MW(x, z); s += house(wx, wz + 3, 7, 4.6, 5, '#fff4d6', c); });
  // 英会話の お店（けいたいや・でんきや）と おみせの とおり（ほんや・ピザや・バーガーや・ゆぴちゃんの ピンクの へや）・じてんしゃや
  [[-44, 10, '#3baacb'], [-30, 10, '#e2a224'], [-46, 33.1, '#4f7a3c'], [-35, 33.1, '#d9483b'], [-24, 33.1, '#c8783e']].forEach(([x, z, c]) => { const [wx, wz] = MW(x, z); s += house(wx, wz + 2, 7.4, 5, 5, '#fff4d6', c); });
  { const [x, z] = MW(-57, 33.1); s += house(x, z + 2, 8, 5.4, 5.4, '#ffd1e3', '#ff7eb3') + `<path d="M${x} ${f(z - 9)}c-1.6-2.2-4-.6-2.4 1.4L${x} ${f(z - 5.6)}l2.4-2.2c1.6-2-.8-3.6-2.4-1.4Z" fill="#ff5a9a" ${S(0.3)}/>`; }
  { const [x, z] = MW(-61, 11); s += box(x, z + 2.4, 7, 4, 5, '#e8f2d0') + `<g transform="translate(${f(x)} ${f(z - 4.6)})"><circle cx="-2" r="1.5" fill="none" stroke="${INK}" stroke-width=".5"/><circle cx="2" r="1.5" fill="none" stroke="${INK}" stroke-width=".5"/><path d="M-2 0 0-1.6H1.4L2 0M0-1.6-.6-2.4" stroke="#e27a2d" stroke-width=".55" fill="none"/></g>`; }
  // ゲート 4 つ（ほかの ワールドへの とびら）＋ つりの ゲート
  [[-12, -30, '#e27a2d'], [-12, -19, '#3f75c8'], [-12, -8, '#3f9a62'], [-12, 3, '#c8573e'], [-4, 21, '#2d8fc4']].forEach(([x, z, c]) => { const [wx, wz] = MW(x, z); s += `<path d="M${f(wx - 2.4)} ${f(wz + 1.4)}V${f(wz - 2.4)}a2.4 2.4 0 0 1 4.8 0V${f(wz + 1.4)}" fill="none" stroke="${c}" stroke-width="1.4"/><path d="M${f(wx - 1.4)} ${f(wz + 1.4)}V${f(wz - 2.2)}a1.4 1.4 0 0 1 2.8 0V${f(wz + 1.4)}Z" fill="#8ff0c8" opacity=".9"/>`; });
  // 入り江：さんばし（x 4）と 英検の さんばし・ふなつきば（橋の たもと）
  { const [px, pz] = MW(4, 24); s += `<rect x="${f(px - 1.7)}" y="${pz}" width="3.4" height="11" fill="#c98a4b" ${S(0.35)}/>`;
    const [ex0, ez] = MW(-14, 29), [ex1] = MW(21, 29); s += `<rect x="${ex0}" y="${f(ez - 1.2)}" width="${ex1 - ex0}" height="2.4" fill="#c98a4b" ${S(0.35)}/>`;
    for (const [x, end] of [[19.6, 43], [14.6, 33], [9.6, 43], [-2.2, 43], [-7.4, 33], [-12.6, 43]]) { const [wx, wz] = MW(x, 29); s += `<rect x="${f(wx - 1.2)}" y="${wz}" width="2.4" height="${end - 29}" fill="#b97a3f" ${S(0.3)}/>`; } }
  { const [x, z] = MW(31, 37); s += `<rect x="${f(x - 4)}" y="${f(z - 1)}" width="8" height="4" fill="#b97a3f" ${S(0.35)}/>` + boat(x + 9, z + 4, '#e27a2d'); }
  { const [x, z] = MW(-6, -38.8); s += `<rect x="${f(x - 1.4)}" y="${f(z - 7)}" width="2.8" height="7" fill="#b97a3f" ${S(0.3)}/>` + boat(x + 4, z - 9, '#3f9a62'); }
  return s;
}
function boat(x, y, c, k = 1) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${k})"><path d="M-4 0h8l-1.6 2h-4.8Z" fill="#fff4d6" ${S(0.35)}/><path d="M0 0V-6" stroke="${INK}" stroke-width=".4"/><path d="M.3-6 3.6-.6H.3Z" fill="${c}" ${S(0.3)}/><path d="M-.3-5-2.6-.6h2.3Z" fill="#fff" ${S(0.3)}/></g>`;
}

// ── 下絵 ぜんぶ（1 回だけ 作る）──────────────────────────────
export const VIEW = { x0: -430, x1: 410, z0: -505, z1: 405 };   // 海の 小物を まく わく・うごかせる はんい
const FIT = { x0: -398, x1: 392, z0: -470, z1: 382 };   // ぜんぶの 島と 札が 入る わく（はじめの 見え方）
let cachedSvg = null;
export function baseSvg() {
  if (cachedSvg) return cachedSvg;
  const R = rng(20261128);
  const shapes = MAP_ISLANDS.map((r) => `<g id="wms-${r.id}">${r.id === 'main' ? mainShape() : `<path d="${blob(r.x, r.z, r.rx, r.rz, seedOf(r.id))}"/>`}</g>`).join('');
  const uses = (attrs) => MAP_ISLANDS.map((r) => `<use href="#wms-${r.id}"${typeof attrs === 'function' ? attrs(r) : ''}/>`).join('');
  // 海：ふかい 青みどり → 島の まわりの あさせ（ひろい 線を 3 だん）→ 白い なみ（点線）
  let s = `<defs>${TREE_DEFS}${shapes}
    <pattern id="wm-waves" width="34" height="22" patternUnits="userSpaceOnUse"><path d="M2 6q3-3 6 0t6 0M19 17q3-3 6 0t6 0" fill="none" stroke="#e9fbff" stroke-width="1" stroke-linecap="round" opacity=".55"/></pattern>
    <radialGradient id="wm-sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#3cc4cf"/><stop offset=".7" stop-color="#22a7bd"/><stop offset="1" stop-color="#17839e"/></radialGradient>
  </defs>`;
  s += `<rect x="-2000" y="-2000" width="4000" height="4000" fill="#17839e"/><rect x="${VIEW.x0 - 400}" y="${VIEW.z0 - 400}" width="${VIEW.x1 - VIEW.x0 + 800}" height="${VIEW.z1 - VIEW.z0 + 800}" fill="url(#wm-sea)"/>`;
  s += `<rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#wm-waves)"/>`;
  s += `<g class="wm-shallow" stroke-linejoin="round"><g fill="#38bccb" stroke="#38bccb" stroke-width="46">${uses()}</g><g fill="#5cd0d4" stroke="#5cd0d4" stroke-width="24">${uses()}</g>`
    + `<g fill="none" stroke="#d9f6f6" stroke-width="1.3" stroke-dasharray="5 4">${uses((r) => ` transform="translate(${f(r.x)} ${f(r.z)}) scale(1.13) translate(${f(-r.x)} ${f(-r.z)})"`)}</g></g>`;
  // 海の 小物：ヨット・なみの しるし・岩
  for (let i = 0; i < 46; i++) {
    const x = VIEW.x0 + R() * (VIEW.x1 - VIEW.x0), z = VIEW.z0 + R() * (VIEW.z1 - VIEW.z0);
    if (MAP_ISLANDS.some((r) => Math.hypot((x - r.x) / (r.rx + 24), (z - r.z) / (r.rz + 24)) < 1) || inMain(x, z) || nearBridge(x, z, 10)) continue;
    s += i % 6 === 0 ? boat(x, z, ['#e27a2d', '#3f9a62', '#d9483b', '#f2b04a'][i % 4], 1.5) : i % 6 === 1 ? `<g transform="translate(${f(x)} ${f(z)})"><ellipse rx="3.4" ry="1.6" fill="#7d8f86" ${S(0.35)}/><ellipse cx="-.8" cy="-.5" rx="1.6" ry=".7" fill="#a9b8ae"/></g>`
      : `<path d="M${f(x)} ${f(z)}q2.4-2.4 4.8 0t4.8 0" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`;
  }
  // かげ → すなはま → くさ（くさの ふちは こい みどりの 線：ふちどりを 先に 太く、上に くさを ぬる）
  s += `<g fill="#2b8f98">${uses(() => ' transform="translate(3 7)"')}</g>`;
  s += `<g stroke-linejoin="round"><g fill="#f4dca0" stroke="#f4dca0" stroke-width="13">${uses()}</g>`;
  s += `<g fill="#3d7a3a" stroke="#3d7a3a" stroke-width="2.6">${uses()}</g>`;
  s += MAP_ISLANDS.map((r) => `<use href="#wms-${r.id}" fill="${r.id === 'main' ? '#8cc85e' : grassOf(r)}"/>`).join('') + '</g>';
  // くさの ひかり（左上を あかるく）と もよう
  for (const r of MAP_ISLANDS) {
    if (r.id === 'main') continue;
    const g = grassOf(r);
    s += `<path d="${blob(r.x - r.rx * 0.12, r.z - r.rz * 0.14, r.rx * 0.62, r.rz * 0.56, seedOf(r.id) + 3, { wob: 0.12 })}" fill="${light(g, 0.22)}" opacity=".7"/>`;
  }
  // メインの島の 入り江（さんばしの 海）
  { const x0 = MX + MAIN_BAY.x0, x1 = MX + MAIN_BAY.x1, z0 = MZ + MAIN_BAY.z0; s += `<rect x="${x0}" y="${z0}" width="${x1 - x0}" height="40" rx="6" fill="#f4dca0"/><rect x="${x0 + 3}" y="${z0 + 3}" width="${x1 - x0 - 6}" height="40" rx="5" fill="#59cfd8"/><path d="M${x0 + 6} ${z0 + 10}q3-2 6 0t6 0M${x0 + 20} ${z0 + 14}q3-2 6 0t6 0" fill="none" stroke="#fff" stroke-width=".8" opacity=".7"/>`; }
  // 島の 中の 小道：橋の たもとから しるしの 絵まで（クリームの まがった 道）
  let paths = '';
  for (const l of LINKS) for (const [id, p] of [[l.a, l.from], [l.b, l.to]]) {
    const r = BY_ID[id]; if (!r || id === 'main') continue;
    const mx = (p.x + r.x) / 2 + (p.z - r.z) * 0.18, mz = (p.z + r.z) / 2 - (p.x - r.x) * 0.18;
    paths += `<path d="M${f(p.x)} ${f(p.z)}Q${f(mx)} ${f(mz)} ${f(r.x)} ${f(r.z + 4)}"/>`;
  }
  s += `<g fill="none" stroke-linecap="round"><g stroke="#d8b57a" stroke-width="5">${paths}</g><g stroke="#fbeccb" stroke-width="3.4">${paths}</g></g>`;
  // 木：まとまりで おく（しるしの 絵の まわりは あける）
  let trees = '';
  for (const r of MAP_ISLANDS) {
    if (r.id === 'main') continue;
    const T = rng(seedOf(r.id) + 11), kinds = treesFor(r), list = [];
    const clusters = 11 + Math.floor(T() * 4);
    for (let c = 0; c < clusters; c++) {
      const a = T() * Math.PI * 2, d = 0.5 + T() * 0.38, cx = r.x + Math.cos(a) * r.rx * d, cz = r.z + Math.sin(a) * r.rz * d;
      const n = 4 + Math.floor(T() * 5);
      for (let k = 0; k < n; k++) {
        const x = cx + (T() - 0.5) * 13, z = cz + (T() - 0.5) * 10;
        if (!inBlob(r, x, z, 0.9) || Math.abs(x - r.x) < 16 && Math.abs(z - r.z + 3) < 13 || nearBridge(x, z, 5) || nearLabel(r, x, z)) continue;
        list.push([x, z, kinds[Math.floor(T() * kinds.length)], 0.9 + T() * 0.5]);
      }
    }
    list.sort((p, q) => p[1] - q[1]);
    trees += list.map(([x, z, k, sc]) => `<use href="#${k}" transform="translate(${f(x)} ${f(z)}) scale(${f(sc)})"/>`).join('');
  }
  // メインの島の 木：まちの 外がわの くさに
  { const T = rng(99), list = [];
    for (let i = 0; i < 260 && list.length < 70; i++) {
      const lx = -78 + T() * 166, lz = -74 + T() * 117, x = MX + lx, z = MZ + lz;
      if (!inMain(x, z) || !inMain(x + 4, z) || !inMain(x - 4, z) || !inMain(x, z + 4) || !inMain(x, z - 4)) continue;
      if (lx > MAIN_BAY.x0 - 4 && lx < MAIN_BAY.x1 + 4 && lz > MAIN_BAY.z0 - 4) continue;
      if (MAIN_BUSY.some(([a, b, c, d]) => lx > a && lx < b && lz > c && lz < d) || nearBridge(x, z, 5)) continue;
      list.push([x, z, ['wt-a', 'wt-b', 'wt-c', 'wt-pink'][Math.floor(T() * 4)], 0.9 + T() * 0.4]);
    }
    list.sort((p, q) => p[1] - q[1]);
    trees += list.map(([x, z, k, sc]) => `<use href="#${k}" transform="translate(${f(x)} ${f(z)}) scale(${f(sc)})"/>`).join(''); }
  s += `<g class="wm-trees">${trees}</g>`;
  // 橋（木の 板・てすり・まんなかの 休けい台）
  s += `<g class="wm-bridges">${LINKS.map(bridgeSvg).join('')}</g>`;
  // まちと しるしの 絵
  s += `<g class="wm-town">${mainTown()}</g>`;
  s += `<g class="wm-marks">${MAP_ISLANDS.filter((r) => r.id !== 'main').map((r) => `<g transform="translate(${f(r.x)} ${f(r.z - 2)}) scale(${r.id === 'park' ? 1.15 : 1})">${(LANDMARK[r.id] || defaultMark(r))()}</g>`).join('')}</g>`;
  // ひこうきの のりば（✈）：メインの島と U-Speak島（rpg.js の fly が 出る 場所の 近く）
  for (const [x, z] of [[22, 15], [MX + 64, MZ - 40]]) s += planeMark(x, z);   // U-Speak島の 東・メインの島の 北の ならび
  s += '<g class="wm-live-under"></g>';
  // メインの島の 中の 場所の 名前（ちかづけた ときだけ）
  s += `<g class="wm-places">${MAIN_PLACES.map((p) => { const [x, z] = MW(p.x, p.z); return `<g class="wm-cs wm-place" data-x="${x}" data-y="${z}" data-k=".9"><text class="wm-ptext" text-anchor="middle" dominant-baseline="central" font-size="14"><tspan class="en">${esc(p.en)}</tspan><tspan class="ja">${esc(p.ja)}</tspan></text></g>`; }).join('')}</g>`;
  // 名前の 札（英語 ＋ 日本語・どちらの 言語でも 両方）と 番号の 赤い まる
  s += `<g class="wm-labels">${MAP_ISLANDS.map(labelSvg).join('')}</g>`;
  s += '<g class="wm-live-over"></g><g class="wm-hits"></g>';
  // 方位（右下）
  s += `<g transform="translate(${VIEW.x1 - 40} ${VIEW.z1 - 50})" class="wm-compass"><circle r="22" fill="#fff4d6" stroke="#1b3a2f" stroke-width="2"/><path d="M0-18 5 0 0 18-5 0Z" fill="#1b3a2f"/><path d="M0-18 5 0H-5Z" fill="#e27a2d"/><text y="-27" font-size="13" font-weight="900" text-anchor="middle" fill="#fff" class="wm-ink">N</text></g>`;
  cachedSvg = `<svg class="wm-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x0} ${VIEW.z0} ${VIEW.x1 - VIEW.x0} ${VIEW.z1 - VIEW.z0}" font-family="'Hiragino Maru Gothic ProN','Arial Rounded MT Bold','M PLUS Rounded 1c','Noto Sans JP',sans-serif">${s}</svg>`;
  return cachedSvg;
}
// メインの島で 木を おかない ところ（まちの 中・道の まわり）。島の 中の 座標 [x0, x1, z0, z1]。
const MAIN_BUSY = [[56, 72, -48, -34], [-80, -12, -76, 0], [-66, 62, 10, 24], [-34, -20, -30, -18], [-16, 0, -38, 8], [-8, 60, -42, -26], [0, 48, 2, 14], [-70, -14, 4, 40], [52, 90, -30, 34], [40, 50, 24, 36], [-22, -16, 6, 16]];
function nearBridge(x, z, m) {
  return LINKS.some((l) => { const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z, L = Math.hypot(dx, dz) || 1, t = Math.max(0, Math.min(1, ((x - l.from.x) * dx + (z - l.from.z) * dz) / (L * L))); return Math.hypot(x - (l.from.x + dx * t), z - (l.from.z + dz * t)) < m; });
}
const nearLabel = (r, x, z) => Math.abs(x - r.x) < 18 && (LABEL_UP.has(r.id) ? z < r.z - r.rz * 0.6 : z > r.z + r.rz * 0.5);
function defaultMark(r) { return () => shadow(0, 4, 12) + house(0, 4, 10, 6, 6, '#fff4d6', bannerOf(r)); }
function planeMark(x, z) {
  return `<g transform="translate(${f(x)} ${f(z)})"><rect x="-9" y="-2" width="18" height="4" rx="2" fill="#7a8a96" ${S(0.35)}/><path d="M-6 0h12" stroke="#fff" stroke-width=".5" stroke-dasharray="1.4 1"/>`
    + `<g transform="translate(0 -6) rotate(-20)"><path d="M-5 0h10l1.6-.8-1.6-.8H-5Z M-1 0-3 4H-1.4L2 0ZM-1-1.6-3-5H-1.4L2-1.6ZM-4.6-.8-6-3H-5L-3.6-.8Z" fill="#fff" ${S(0.35)}/></g></g>`;
}
function bridgeSvg(l) {
  const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z, len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx) * 180 / Math.PI, w = 6.2;
  let g = `<rect x="-1" y="${f(-w / 2 + 3)}" width="${f(len + 2)}" height="${w}" fill="#0e5d6a" opacity=".3"/>`;   // 海の 上の かげ
  g += `<rect x="-1" y="${f(-w / 2)}" width="${f(len + 2)}" height="${w}" rx="1" fill="#c98a4b" stroke="#6b3f1c" stroke-width=".6"/>`;
  g += `<path d="M0 0H${f(len)}" stroke="#9a6233" stroke-width="${w - 1.2}" stroke-dasharray=".45 1.75"/>`;
  g += `<path d="M0 ${f(-w / 2 + 0.5)}H${f(len)}M0 ${f(w / 2 - 0.5)}H${f(len)}" stroke="#5a3418" stroke-width=".9"/>`;
  g += `<path d="M0 ${f(-w / 2 + 0.5)}H${f(len)}M0 ${f(w / 2 - 0.5)}H${f(len)}" stroke="#7a4a22" stroke-width="1.8" stroke-dasharray=".1 5.4" stroke-linecap="round"/>`;
  if (l.rest) g += `<rect x="${f(len / 2 - 6)}" y="${f(-w / 2 - 2.6)}" width="12" height="${f(w + 5.2)}" rx="1.6" fill="#c98a4b" stroke="#6b3f1c" stroke-width=".6"/><path d="M${f(len / 2 - 4.6)} ${f(-w / 2 - 1.4)}h9.2" stroke="#7a4a22" stroke-width="1.2"/>` + `<circle cx="${f(len / 2 + 5)}" cy="${f(w / 2 + 1.6)}" r="1" fill="#ffd84a" stroke="#6b3f1c" stroke-width=".3"/>`;
  return `<g class="wm-bridge" data-bridge="${esc(l.id)}" transform="translate(${f(l.from.x)} ${f(l.from.z)}) rotate(${f(ang)})">${g}</g>`;
}
// 名前の 札：リボン（島の 色）に 白い 英語・下に 日本語。ちかづけても 大きく なりすぎない（`wm-cs` が 大きさを なおす）。
const LABEL_UP = new Set(['meadow', 'desert', 'canyon']);   // となりの 島の 札と かさなる ので 上に
function labelSvg(r) {
  const big = r.id === 'main', c = bannerOf(r);
  const y = big ? MZ + 49 : LABEL_UP.has(r.id) ? r.z - r.rz - 4 : r.z + r.rz * 0.72, x = big ? MX + 4 : r.x;
  // 英語の とき：札は 英語・下に 日本語（よみ）。日本語の とき：札は 日本語の 名前・下に よみ（同じなら 英語）。下の 行は ちかづけた ときだけ。
  const yomi = r.yomi && r.yomi !== r.name ? r.yomi : shortName(r);
  const one = (main, sub, cls, jaMain) => {
    const fs = big ? 17 : 13, sfs = big ? 13.5 : 12;
    const w = main.length * fs * (jaMain ? 1.04 : 0.6) + 18, h = fs + 9;
    const tail = (sx) => `<path d="M${f(sx * (w / 2 - 3))} ${f(-h / 2 + 4)}h${f(sx * 8)}l${f(-sx * 3)} ${f(h / 2 - 1)}l${f(sx * 3)} ${f(h / 2 - 1)}h${f(-sx * 8)}Z" fill="${dark(c, 0.35)}" stroke="${INK}" stroke-width="1"/>`;
    return `<g class="${cls}">` + tail(-1) + tail(1)
      + `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${h}" rx="4" fill="${c}" stroke="${INK}" stroke-width="1.3"/>`
      + `<rect x="${f(-w / 2 + 2)}" y="${f(-h / 2 + 2)}" width="${f(w - 4)}" height="${f(h / 2 - 2)}" rx="3" fill="#fff" fill-opacity=".16"/>`
      + `<text class="wm-ltext" y="1" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${esc(main)}</text>`
      + `<text class="wm-jtext wm-sub" y="${f(h / 2 + sfs * 0.85)}" font-size="${sfs}" text-anchor="middle" dominant-baseline="central">${esc(sub)}</text>`
      + `<g transform="translate(${f(-w / 2 - 3)} ${f(-h / 2 + 1)})"><circle r="${big ? 10 : 8.6}" fill="#e04a2f" stroke="#fff4d6" stroke-width="2"/><circle r="${big ? 10 : 8.6}" fill="none" stroke="${INK}" stroke-width=".8"/><text class="wm-ntext" font-size="${big ? 13 : 12}" text-anchor="middle" dominant-baseline="central" y=".5">${r.num}</text></g></g>`;
  };
  return `<g class="wm-cs wm-label" data-island="${esc(r.id)}" data-x="${f(x)}" data-y="${f(y)}" data-k="${big ? 1.15 : 1}" translate="no">`
    + one(shortName(r), r.yomi || r.name, 'en', false) + one(r.name, yomi, 'ja', true) + '</g>';
}

// ── 見える 物（ひらく たびに かく）＋ うごかす しくみ ────────────
const nowView = { cx: null, cy: null, w: null };   // とじても 同じ 見え方に もどす ため（ページの 間だけ）
function liveParts(state, kid, KIDS) {
  let under = '', over = '', hits = '', pin = null;
  for (const r of MAP_ISLANDS) {
    const open = state.unlocked(r.id), prem = !!state.premium?.(r.id), here = r.id === state.current;
    const off = kid && !KIDS.includes(r.id);
    if (here) under += r.id === 'main' ? `<rect class="wm-here-ring" x="${MX - 86}" y="${MZ - 82}" width="182" height="134" rx="40"/>` : `<ellipse class="wm-here-ring" cx="${r.x}" cy="${r.z}" rx="${r.rx + 12}" ry="${r.rz + 12}"/>`;
    if (!open && !prem && !off) {   // まだ ひらいて いない：くもで かくす
      const C = rng(seedOf(r.id) + 5);
      let cl = ''; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; cl += `<circle cx="${f(r.x + Math.cos(a) * r.rx * 0.55)}" cy="${f(r.z + Math.sin(a) * r.rz * 0.5 - 4)}" r="${f(r.rx * (0.32 + C() * 0.14))}"/>`; }
      under += `<g class="wm-cloud"><g fill="#c7d6dc" transform="translate(2 4)">${cl}</g><g fill="#f6fbfc">${cl}<circle cx="${r.x}" cy="${r.z - 4}" r="${f(r.rx * 0.6)}"/></g></g>`;
      over += `<g class="wm-cs" data-x="${r.x}" data-y="${f(r.z - 6)}" data-k=".9"><circle r="11" fill="#7a8f9a" stroke="#fff" stroke-width="2"/><text class="wm-ntext" font-size="14" text-anchor="middle" dominant-baseline="central">?</text></g>`;
    }
    if (off) under += `<use href="#wms-${r.id}" class="wm-off"/>`;
    if (prem && !open) over += `<g class="wm-cs" data-x="${f(r.x + r.rx * 0.55)}" data-y="${f(r.z - r.rz * 0.55)}" data-k="1">${lockSvg()}</g>`;
    else if (prem) over += `<g class="wm-cs" data-x="${f(r.x + r.rx * 0.6)}" data-y="${f(r.z - r.rz * 0.55)}" data-k=".8"><circle r="9" fill="#ffd84a" stroke="#7a5200" stroke-width="1.4"/><path d="M0-5.4 1.6-1.8 5.4-1.6 2.4.9 3.4 4.6 0 2.6-3.4 4.6-2.4.9-5.4-1.6-1.6-1.8Z" fill="#fff"/></g>`;
    if (here) pin = { x: r.x, y: r.z - (r.id === 'main' ? 6 : 10) };
    if (off) continue;
    const name = state.isJa ? r.name : shortName(r);
    const st = here ? (state.isJa ? '（いま ここ）' : ' (you are here)') : !open ? (prem ? (state.isJa ? '（🔒 プレミアム）' : ' (premium)') : (state.isJa ? '（まだ ひらいて いない）' : ' (not open yet)')) : '';
    hits += `<g class="wmi" data-island="${esc(r.id)}" role="button" tabindex="0" aria-label="${esc(`${r.num}. ${name}${st}`)}"><use href="#wms-${r.id}"/></g>`;
  }
  return { under, over, hits, pin };
}
const lockSvg = () => `<g><rect x="-8" y="-3" width="16" height="13" rx="3" fill="#f2b04a" stroke="${INK}" stroke-width="1.3"/><path d="M-4.6-3v-3.6a4.6 4.6 0 0 1 9.2 0V-3" fill="none" stroke="#7a8a96" stroke-width="2.6"/><path d="M-4.6-3v-3.6a4.6 4.6 0 0 1 9.2 0V-3" fill="none" stroke="${INK}" stroke-width=".6"/><circle cy="3" r="1.8" fill="${INK}"/><path d="M0 3v3.6" stroke="${INK}" stroke-width="1.4"/></g>`;

// host に ちずを 出す。下絵の DOM は 1 回だけ 作って 使いまわす（ひらく たびに 文字から 作りなおさない）。
// うごかして いる 間は SVG に CSS の transform を かけるだけ（GPU が うごかす・かきなおさない）。
// 手を はなして 0.16 秒 たったら viewBox を なおして 1 回だけ かきなおす（くっきり・札の 大きさも なおす）。
let svgNode = null;
export function mountWorldMap(host, { state, onPick, kid = false, kids = [], fresh = false }) {
  if (!svgNode) { const tpl = document.createElement('template'); tpl.innerHTML = baseSvg(); svgNode = tpl.content.firstElementChild; }
  const svg = svgNode, view = host.querySelector('.wmap-view');
  view.appendChild(svg);
  const { under, over, hits, pin } = liveParts(state, kid, kids);
  svg.querySelector('.wm-live-under').innerHTML = under;
  svg.querySelector('.wm-live-over').innerHTML = over;
  svg.querySelector('.wm-hits').innerHTML = hits;
  for (const g of svg.querySelectorAll('.wm-label')) {   // 下絵の 札にも いまの ようすを（くもの 島は うすく）
    const id = g.dataset.island; g.classList.toggle('dim', !state.unlocked(id) && !state.premium?.(id)); g.classList.toggle('off', kid && !kids.includes(id));
  }
  const scaled = [...svg.querySelectorAll('.wm-cs')].map((n) => [n, +n.dataset.x, +n.dataset.y, +n.dataset.k || 1]);
  // 「きみは ここ」は HTML の 札（ぴょこぴょこ うごく のは この 札だけ。SVG は かきなおさない）。
  let here = null;
  if (pin) {
    here = document.createElement('div'); here.className = 'wmap-here'; here.setAttribute('aria-hidden', 'true');
    here.innerHTML = `<span class="wh-tag"><b class="en">You are here</b><i class="ja">きみは ここ</i></span><svg class="wh-pin" viewBox="-11 -24 22 30"><ellipse cy="3" rx="6" ry="2.2" fill="#000" fill-opacity=".25"/><path d="M0 2C-3-4-9-7-9-13a9 9 0 0 1 18 0c0 6-6 9-9 15Z" fill="#ffd246" stroke="${INK}" stroke-width="1.4"/><path d="M0-18.4l1.9 3.9 4.3.6-3.1 3 .7 4.3L0-8.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" fill="#e27a2d"/></svg>`;
    host.appendChild(here);
  }

  // 見え方：cx, cy ＝ まんなか、w ＝ 見える はば（世界の 単位）。cv ＝ いま viewBox に 入って いる 見え方。
  const size = () => [view.clientWidth || 800, view.clientHeight || 500];
  // はじめの 見え方：ぜんぶの 島（FIT）が 入る いちばん 大きな 見え方。上は タイトルの ぶん あける。
  const fit = () => {
    const [W, H] = size(), top = H < 480 ? 46 : 74, pad = 12, bw = FIT.x1 - FIT.x0, bh = FIT.z1 - FIT.z0;
    const w = Math.max(bw * W / (W - pad * 2), bh * W / (H - top - pad));
    const k = W / w;   // ピクセル / 単位
    return { cx: (FIT.x0 + FIT.x1) / 2, cy: (FIT.z0 + FIT.z1) / 2 - (top - pad) / 2 / k, w };
  };
  const v = nowView.w && !fresh ? { cx: nowView.cx, cy: nowView.cy, w: nowView.w } : fit();
  const cv = { ...v };
  const clampV = () => { v.w = Math.max(60, Math.min((VIEW.x1 - VIEW.x0) * 1.9, v.w)); v.cx = Math.max(VIEW.x0, Math.min(VIEW.x1, v.cx)); v.cy = Math.max(VIEW.z0, Math.min(VIEW.z1, v.cy)); };
  const placePin = () => { if (!here) return; const [W, H] = size(), k = W / v.w; here.style.transform = `translate(${f(W / 2 + (pin.x - v.cx) * k)}px, ${f(H / 2 + (pin.y - v.cy) * k)}px)`; };
  const commit = () => {
    timer = 0; clampV(); Object.assign(cv, v);
    const [W, H] = size(), h = v.w * (H / W), px = W / v.w;   // px ＝ 1 単位が 何ピクセルか
    svg.style.transform = '';
    svg.setAttribute('viewBox', `${f(v.cx - v.w / 2)} ${f(v.cy - h / 2)} ${f(v.w)} ${f(h)}`);
    // 札は 画面の 上で ほぼ 同じ 大きさ（とおくでは ちいさく しすぎず、ちかくでは 大きく しすぎない）。
    const target = Math.max(0.92, Math.min(1.25, 0.9 + (px - 0.6) * 0.12));
    const sc = f(Math.max(0.22, target / px) * 100) / 100;
    for (const [n, x, y, k] of scaled) n.setAttribute('transform', `translate(${x} ${y}) scale(${f(sc * k * 100) / 100})`);
    svg.dataset.near = px > 2.2 ? '1' : ''; svg.dataset.mid = px > 1.25 ? '1' : '';
    nowView.cx = v.cx; nowView.cy = v.cy; nowView.w = v.w;
    placePin();
  };
  let timer = 0, raf = 0;
  const preview = () => {   // うごかして いる 間：transform だけ
    raf = 0; clampV();
    const [W] = size(), k = cv.w / v.w, s2 = W / v.w;
    svg.style.transform = `translate(${f((cv.cx - v.cx) * s2)}px, ${f((cv.cy - v.cy) * s2)}px) scale(${f(k * 1000) / 1000})`;
    placePin();
  };
  const draw = () => { if (!raf) raf = requestAnimationFrame(preview); clearTimeout(timer); timer = setTimeout(commit, 160); };
  commit();

  // ── 指・マウス：ひっぱって うごかす・2 本指で ちかづける・ホイール
  const pts = new Map(); let moved = 0, pinch = null;
  const toWorld = (cx, cy) => { const b = view.getBoundingClientRect(), W = b.width || 1, H = b.height || 1; return [v.cx + ((cx - b.left) / W - 0.5) * v.w, v.cy + ((cy - b.top) / H - 0.5) * v.w * (H / W)]; };
  const zoomAt = (k, cx, cy) => { const [wx, wy] = toWorld(cx, cy); v.w /= k; clampV(); const [nx, ny] = toWorld(cx, cy); v.cx += wx - nx; v.cy += wy - ny; draw(); };
  view.onpointerdown = (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 }; } };
  view.onpointermove = (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { try { view.setPointerCapture(e.pointerId); } catch { /* */ } view.classList.add('drag'); const W = view.clientWidth || 1; v.cx -= dx * v.w / W; v.cy -= dy * v.w / W; draw(); }
    } else if (pts.size === 2 && pinch) {
      moved = 99; const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      zoomAt(d / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch.d = d;
    }
  };
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) view.classList.remove('drag'); };
  view.onpointerup = up; view.onpointercancel = up;
  view.onwheel = (e) => { e.preventDefault(); zoomAt(Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004), e.clientX, e.clientY); };
  // 押した 島へ（ひっぱった ときは 押さない）。どう なるかは rpg.js（onPick）が 決める。
  view.onclick = (e) => { if (moved > 6) { moved = 0; return; } const g = e.target.closest?.('[data-island]'); if (g && !g.classList.contains('off')) onPick?.(g.dataset.island); };
  const mid = () => { const b = view.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  view.onkeydown = (e) => {
    const g = e.target.closest?.('.wmi');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick?.(g.dataset.island); return; }
    const step = v.w * 0.12, k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k && !g) { e.preventDefault(); v.cx += k[0]; v.cy += k[1]; draw(); }
    if (e.key === '+' || e.key === '=') zoomAt(1.3, ...mid());
    if (e.key === '-') zoomAt(1 / 1.3, ...mid());
  };
  // tab で 島に きたら 見える ところへ
  view.onfocusin = (e) => { const g = e.target.closest?.('.wmi'); if (!g) return; const r = BY_ID[g.dataset.island], [W, H] = size(), h = v.w * H / W; if (Math.abs(r.x - v.cx) > v.w * 0.38 || Math.abs(r.z - v.cy) > h * 0.38) { v.cx = r.x; v.cy = r.z; draw(); } };
  const ro = globalThis.ResizeObserver ? new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(commit, 60); }) : null; ro?.observe(view);
  return {
    zoom: (k) => zoomAt(k, ...mid()),
    reset: () => { Object.assign(v, fit()); draw(); },
    focus: (id, w = 250) => { const r = BY_ID[id]; if (!r) return; v.cx = r.id === 'main' ? MX + 5 : r.x; v.cy = r.id === 'main' ? MZ - 14 : r.z; v.w = w; draw(); },
    commit,
    destroy: () => { ro?.disconnect(); if (raf) cancelAnimationFrame(raf); clearTimeout(timer); here?.remove(); },
  };
}
