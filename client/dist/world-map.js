// せかいの ちず（2026-11：「島と島、橋で繋いだじゃん。全体の地図こんな雰囲気で作って」→「こういう感じで。超リアルに。」）。
//
// しまの ちず（world-picker.js）の 中の「🗺 ちず」と「📍 あんない」。
// ・「🗺 ちず」＝ ぬった 地形の 絵（world-paint.js が canvas に 1 回だけ かく）を 下に しき、この SVG は 名前・番号・押せる ところ・
//   「いま ここ」・🔒・くもだけ を のせる（字は くっきり）。「📍 あんない」＝ この SVG の `wm-guide`（たいらな パステルの 地図・まるい しるし）。
//   絵が できるまでは あんないの 地図が 出る。
// ・島の 位置は rpg-data.js の HUBS / REGIONS の x, z、橋は bridges-data.js の LINKS の from / to（世界の 座標の まま）。
//   SVG の 1 ＝ 世界の 1。北（z が 小さい ほう）が 上。島を うごかしたら ちずも 自然に うごく。
// ・**下絵の SVG は 1 回だけ 作って とっておく**（`baseSvg()` の 文字 → `mount` で 1 回だけ DOM に）。ひらく たびに かきなおすのは
//   「いま ここ」・🔒・まだの 雲・押せる 島（`liveParts`）だけ。とじて いる 間は 何も うごかない。
// ・うごかす 間は SVG と 絵の canvas に CSS の transform を かける だけ。手を はなして 0.16 秒 で viewBox を なおす。
// ・**どこへ とべるか・何が ひらいて いるかは rpg.js が 決める**（`state` と `onPick` は world-picker.js から そのまま）。
// ・島の 名前は rpg-data.js が 定義元（`en` から「Island」を おとす・`yomi`／`name`）。辞書には 入れない（translate="no"）。
// ・メインの島の 中の 場所（ビルの まち・プラネタリウム・ひろば・としょかん…）の 位置は main_island.json / main-plaza.js /
//   main-city.js の 島の 中の 座標を 写した もの（MAIN_*）。島の 中を うごかしたら ここも なおす。
import { HUBS, REGIONS } from './rpg-data.js';
import { LINKS } from './bridges-data.js';
import { getLang, onLangChange } from './i18n.js';

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

export const MX = -26, MZ = -79;   // メインの島の まんなか（rpg-data.js の HUBS と 同じ）
// ── ちずの 上の 置きかた：3 つの 海（2026-11：「36 こが ぜんぶ おなじ おもさで ならぶと 番号の まるに 見える」）────
// まんなかの うみ（メインの島と ふだんの 島）・えいけんの うみ（7 つの 英検の 島を 1 本の みちで 5級 → 1級）・
// ぼうけんの うみ（ぼうけんの ちいき 10 を ひらく 順に）。ちずは かざりの 地図なので、ほんとうの 位置とは ちがって よい。
// x, z ＝ ちずの 上の 場所（ox, oz が ほんとうの 場所）、rx, rz ＝ ちずの 上の 大きさ（VS 倍）。
export const VS = 1.5;
export const EIKEN_ROAD = ['eiken5', 'eiken4', 'eiken3', 'eikenp2', 'eiken2', 'eikenp1', 'eiken1'];
export const ADV_ROUTE = ['meadow', 'forest', 'reef', 'canyon', 'snow', 'storm', 'desert', 'ruins', 'moon', 'sky'];   // ひらく 順（rpg-data.js の needs）
export const seaOf = (id) => (EIKEN_ROAD.includes(id) ? 'eiken' : ADV_ROUTE.includes(id) ? 'adv' : 'main');
const MAIN_BOX = { x0: MX - 78 - 6, x1: MX + 88 + 6, z0: MZ - 74 - 6, z1: MZ + 43 + 6 };
{
  for (const r of MAP_ISLANDS) { r.ox = r.x; r.oz = r.z; if (r.id !== 'main') { r.rx *= VS; r.rz *= VS; } r.sea = seaOf(r.id); }
  // まんなかの うみ：ほんとうの 位置から、かさならなく なるまで おしあう（メインの島は うごかさない）
  const list = MAP_ISLANDS.filter((r) => r.sea === 'main' && r.id !== 'main');
  const rad = (r) => Math.max(r.rx, r.rz) * 1.12 + 5;
  for (let it = 0; it < 400; it++) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 0.01, m = rad(a) + rad(b);
      if (d < m) { const k = (m - d) / 2 / d; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
    }
    for (const r of list) {
      const cx = Math.max(MAIN_BOX.x0, Math.min(MAIN_BOX.x1, r.x)), cz = Math.max(MAIN_BOX.z0, Math.min(MAIN_BOX.z1, r.z));
      const dx = r.x - cx, dz = r.z - cz, d = Math.hypot(dx, dz), R = rad(r);
      if (d === 0) { r.z = r.z < MZ ? MAIN_BOX.z0 - R : MAIN_BOX.z1 + R; } else if (d < R) { r.x += dx / d * (R - d); r.z += dz / d * (R - d); }
      if (it < 300) { r.x += (r.ox - r.x) * 0.02; r.z += (r.oz - r.z) * 0.02; }
    }
  }
  const mb = { x0: MAIN_BOX.x0, x1: MAIN_BOX.x1, z0: MAIN_BOX.z0, z1: MAIN_BOX.z1 };
  for (const r of list) { mb.x0 = Math.min(mb.x0, r.x - r.rx); mb.x1 = Math.max(mb.x1, r.x + r.rx); mb.z0 = Math.min(mb.z0, r.z - r.rz); mb.z1 = Math.max(mb.z1, r.z + r.rz); }
  // えいけんの うみ：まんなかの うみの 上に 1 本の みち（ひだり 5級 → みぎ 1級・すこし 波うつ）
  const ecx = (mb.x0 + mb.x1) / 2, ez = mb.z0 - 240, step = 132;
  EIKEN_ROAD.forEach((id, k) => { const r = BY_ID[id]; r.x = ecx + (k - 3) * step; r.z = ez + (k % 2 ? 26 : -26); });
  // ぼうけんの うみ：まんなかの うみの みぎに 2 れつ × 5 だん（ひらく 順に じぐざぐ）
  const ax = mb.x1 + 210, az = (mb.z0 + mb.z1) / 2 - 2 * 140;
  ADV_ROUTE.forEach((id, k) => { const r = BY_ID[id], row = Math.floor(k / 2), col = row % 2 ? 1 - (k % 2) : k % 2; r.x = ax + col * 150; r.z = az + row * 140 + (col ? 30 : 0); });
  for (const r of MAP_ISLANDS) { r.x = Math.round(r.x * 10) / 10; r.z = Math.round(r.z * 10) / 10; }
}
// 3 つの 海の わく（色・名前の 札・タップで ちかづく）
export const SEAS = (() => {
  const out = {};
  for (const sea of ['main', 'eiken', 'adv']) {
    const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const r of MAP_ISLANDS) if (r.sea === sea) {
      const [x0, x1, z0, z1] = r.id === 'main' ? [MAIN_BOX.x0, MAIN_BOX.x1, MAIN_BOX.z0, MAIN_BOX.z1] : [r.x - r.rx, r.x + r.rx, r.z - r.rz, r.z + r.rz];
      b.x0 = Math.min(b.x0, x0); b.x1 = Math.max(b.x1, x1); b.z0 = Math.min(b.z0, z0); b.z1 = Math.max(b.z1, z1);
    }
    const pad = 46; out[sea] = { id: sea, x0: b.x0 - pad, x1: b.x1 + pad, z0: b.z0 - pad - 50, z1: b.z1 + pad };
  }
  return out;
})();
export const SEA_NAMES = { main: { en: 'Central Sea', ja: 'まんなかの うみ' }, eiken: { en: 'Eiken Sea', ja: 'えいけんの うみ' }, adv: { en: 'Adventure Sea', ja: 'ぼうけんの うみ' } };
// 橋：おなじ 海の 島どうしは 橋（メインの島の はしは ほんとうの 岸）。英検の 島どうしは 1 本の みち（ROAD）に おきかえる。
// ちがう 海を つなぐ 橋は「うみの みち」（lane：光の 点線）。どれも data-bridge は もとの id の まま。
const GATES = ['main-meadow', 'mini-eiken3', 'meadow-eiken5'];   // まんなか→ぼうけん・まんなか→えいけん・ぼうけん→えいけん
export const DLINKS = (() => {
  const foot = (id, p) => (id === 'main' ? { x: p.x, z: p.z } : { x: BY_ID[id].x, z: BY_ID[id].z });
  const out = [];
  for (const l of LINKS) {
    const sa = seaOf(l.a), sb = seaOf(l.b);
    if (sa === 'eiken' && sb === 'eiken') { out.push({ ...l, from: foot(l.a, l.from), to: foot(l.b, l.to), hidden: true }); continue; }   // 英検の 島の 中の ほんとうの 橋は ちずでは みちに まとめる
    // 海と 海の あいだは 入り口の 3本だけ 点線で 見せる（ほかは ちずを すっきり させる ため かかない。橋は ゲームに ある まま）
    const gate = GATES.includes(l.id) || GATES.includes(`${l.b}-${l.a}`);
    out.push({ ...l, from: foot(l.a, l.from), to: foot(l.b, l.to), lane: sa !== sb, hidden: sa !== sb && !gate });
  }
  for (let k = 0; k + 1 < EIKEN_ROAD.length; k++) { const a = BY_ID[EIKEN_ROAD[k]], b = BY_ID[EIKEN_ROAD[k + 1]]; out.push({ id: `road-${a.id}-${b.id}`, a: a.id, b: b.id, from: { x: a.x, z: a.z }, to: { x: b.x, z: b.z }, width: 3.6, road: true }); }
  for (const l of out) { const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z; l.len = Math.hypot(dx, dz); l.rest = !l.lane && !l.hidden && l.len >= 90; }
  return out;
})();
// みちの 順（いちらんの ならび）：まんなかの うみは メインの島から 橋を たどった 順、英検は 5級 → 1級、ぼうけんは ひらく 順。
export const ROUTE = (() => {
  const seen = new Set(['main']), q = ['main'], main = [];
  while (q.length) { const id = q.shift(); main.push(id); for (const l of LINKS) { const o = l.a === id ? l.b : l.b === id ? l.a : null; if (o && !seen.has(o) && seaOf(o) === 'main') { seen.add(o); q.push(o); } } }
  for (const r of MAP_ISLANDS) if (r.sea === 'main' && !seen.has(r.id)) main.push(r.id);
  return { main, eiken: [...EIKEN_ROAD], adv: [...ADV_ROUTE] };
})();
// ぜんぶの 島が 入る わく
export const BOUNDS = (() => {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const s2 of Object.values(SEAS)) { b.x0 = Math.min(b.x0, s2.x0); b.x1 = Math.max(b.x1, s2.x1); b.z0 = Math.min(b.z0, s2.z0); b.z1 = Math.max(b.z1, s2.z1); }
  return b;
})();

// 島の 色（くさ）。ぼうけんの ちいきは biome の 色、島は あたたかい みどりを すこしずつ かえる。
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

// メインの島：もとの 角まるの 四角（54×43・power 4）＋ つき出した 土地（main-plaza.js の PLAZA.annex と also）。島の 中の 座標。
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
  { x: -12, z: 9, en: 'Gates', ja: 'ゲート' }, { x: -12, z: 47, en: 'Fishing Piers', ja: 'つりば' }, { x: -37, z: 4, en: 'Talk Shops', ja: 'えいかいわの おみせ' },
];
function boat(x, y, c, k = 1) {
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${k})"><path d="M-4 0h8l-1.6 2h-4.8Z" fill="#fff4d6" ${S(0.35)}/><path d="M0 0V-6" stroke="${INK}" stroke-width=".4"/><path d="M.3-6 3.6-.6H.3Z" fill="${c}" ${S(0.3)}/><path d="M-.3-5-2.6-.6h2.3Z" fill="#fff" ${S(0.3)}/></g>`;
}

// ── 下絵 ぜんぶ（1 回だけ 作る）──────────────────────────────
// 「🗺 ちず」は world-paint.js の ぬった 絵（canvas）が 下に 出て、SVG は 名前・番号・押せる ところだけ。
// 「📍 あんない」と、絵が まだ できて いない あいだは、この SVG の `wm-guide`（たいらな パステルの 地図）が 出る。
export const FIT = { x0: BOUNDS.x0 - 8, x1: BOUNDS.x1 + 8, z0: BOUNDS.z0 - 8, z1: BOUNDS.z1 + 8 };   // ぜんぶの 島が 入る わく（はじめの 見え方）
export const VIEW = { x0: FIT.x0 - 40, x1: FIT.x1 + 40, z0: FIT.z0 - 40, z1: FIT.z1 + 40 };   // うごかせる はんい
// あんないの 色（たいらな パステル）
const GUIDE = { snow: '#e3edf6', desert: '#efdcaa', canyon: '#eab994', reef: '#bfe7c9', ruins: '#cfd6c2', moon: '#c9c6e6', sky: '#eef0c8', storm: '#bcd3a6', forest: '#9ccf8c', grass: '#c3e39c' };
const guideOf = (r) => (r.id === 'main' ? '#cfe6a8' : r.biome ? GUIDE[r.biome] : r.id === 'farm' ? '#e4dc9c' : r.id === 'fishworld' ? '#bfe3b0' : /^eiken/.test(r.id) ? '#c8e3a4' : '#c9e7a2');
let cachedSvg = null;
export function baseSvg() {
  if (cachedSvg) return cachedSvg;
  const shapes = MAP_ISLANDS.map((r) => `<g id="wms-${r.id}">${r.id === 'main' ? mainShape() : `<path d="${blob(r.x, r.z, r.rx, r.rz, seedOf(r.id))}"/>`}</g>`).join('');
  const uses = () => MAP_ISLANDS.map((r) => `<use href="#wms-${r.id}"/>`).join('');
  let s = `<defs>${TREE_DEFS}${shapes}
    <pattern id="wm-waves" width="40" height="26" patternUnits="userSpaceOnUse"><path d="M3 7q3-2.4 6 0t6 0M23 20q3-2.4 6 0t6 0" fill="none" stroke="#ffffff" stroke-width="1" stroke-linecap="round" stroke-opacity=".5"/></pattern>
    <radialGradient id="wm-cloudgrad"><stop offset="0" stop-color="#cfe8dc" stop-opacity=".55"/><stop offset=".55" stop-color="#1b3a2f" stop-opacity=".78"/><stop offset="1" stop-color="#0c241c" stop-opacity="0"/></radialGradient>
    <clipPath id="wm-mclip"><circle r="15.5"/></clipPath>
    <radialGradient id="wm-orb" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#fff4d6"/><stop offset=".35" stop-color="#ffb066"/><stop offset=".8" stop-color="#e27a2d"/><stop offset="1" stop-color="#9a4a14"/></radialGradient>
    <radialGradient id="wm-orb-here" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#ffd246"/><stop offset="1" stop-color="#e27a2d"/></radialGradient>
    <radialGradient id="wm-orb-off" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#cfe8dc"/><stop offset=".5" stop-color="#6f8a80"/><stop offset="1" stop-color="#2c4a3e"/></radialGradient>
    <radialGradient id="wm-glow"><stop offset=".45" stop-color="#ffb066" stop-opacity=".55"/><stop offset="1" stop-color="#ffb066" stop-opacity="0"/></radialGradient>
    <pattern id="wm-stars" width="90" height="70" patternUnits="userSpaceOnUse"><circle cx="12" cy="9" r=".9" fill="#fff4d6"/><circle cx="57" cy="31" r=".6" fill="#8ff0c8"/><circle cx="33" cy="52" r=".7" fill="#fff4d6"/><circle cx="78" cy="61" r="1" fill="#ffd9a8"/><circle cx="70" cy="12" r=".5" fill="#fff"/></pattern>
  </defs>`;
  // あんない（たいらな 地図）
  let gd = `<rect x="-2000" y="-2000" width="4000" height="4000" fill="#08160f"/><rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#wm-stars)"/>`;
  gd += `<g stroke-linejoin="round" fill="#123f34" stroke="#123f34" stroke-width="30">${uses()}</g>`;   // 異次元の 海（うすい ミント）
  gd += `<g class="wm-gbridges">${DLINKS.map((l) => (l.hidden ? `<g class="wm-bridge hidden" data-bridge="${esc(l.id)}"/>` : bridgeSvg(l))).join('')}</g>`;   // 橋は 島の 下に（島の 中の ぶんは かくれる）
  gd += `<g stroke-linejoin="round" fill="#8ff0c8" stroke="#8ff0c8" stroke-width="4">${uses()}</g>`;   // ネオンの ふち
  gd += MAP_ISLANDS.map((r) => `<use href="#wms-${r.id}" fill="${mix(guideOf(r), r.hub ? '#1b3a2f' : '#5a3412', r.hub ? 0.6 : 0.55)}"/>`).join('');
  gd += MAP_ISLANDS.filter((r) => r.id !== 'main').map((r) => `<path d="${blob(r.x - r.rx * 0.08, r.z - r.rz * 0.1, r.rx * 0.56, r.rz * 0.5, seedOf(r.id) + 3, { wob: 0.12 })}" fill="#8ff0c8" fill-opacity=".1"/>`).join('');
  { const x0 = MX + MAIN_BAY.x0, x1 = MX + MAIN_BAY.x1, z0 = MZ + MAIN_BAY.z0; gd += `<rect x="${x0}" y="${z0}" width="${x1 - x0}" height="40" rx="6" fill="#8ff0c8"/><rect x="${x0 + 2.5}" y="${z0 + 2.5}" width="${x1 - x0 - 5}" height="40" rx="5" fill="#123f34"/>`; }
  gd += `<g class="wm-gtown">${guideTown()}</g>`;
  for (const [x, z] of [[BY_ID.willow.x + 30, BY_ID.willow.z + 20], [MX + 64, MZ - 40]]) gd += planeMark(x, z);
  gd += boat(MX + 40, MZ + 41, '#e27a2d', 1.3) + boat(MX - 2, MZ - 48, '#3f9a62', 1.3);
  s += `<g class="wm-guide">${gd}</g>`;
  // 海の 名前（どちらの 見せかたでも）
  // 3 つの 海：うすい わく（海の 色）と 大きな 名前の 札（ひいた ときだけ・おすと その 海へ ちかづく）
  const SEA_COL = { main: '#8ff0c8', eiken: '#f2b04a', adv: '#ffb066' };
  s += `<g class="wm-seazones">${Object.values(SEAS).map((q) => `<rect class="wm-seazone" data-sea="${q.id}" x="${f(q.x0)}" y="${f(q.z0)}" width="${f(q.x1 - q.x0)}" height="${f(q.z1 - q.z0)}" rx="60" fill="${SEA_COL[q.id]}" fill-opacity=".05" stroke="${SEA_COL[q.id]}" stroke-opacity=".45" stroke-width="2.4" stroke-dasharray="14 10"/>`).join('')}</g>`;
  s += '<g class="wm-live-under"></g>';
  // 島の しるし（番号では なく 絵：さかな・かんらんしゃ・本・えんぴつ・ABC・あしあと…・英検は 級の 旗）。押せる（28px 以上）。
  s += `<g class="wm-nums">${MAP_ISLANDS.map((r) => `<g class="wm-num" data-island="${esc(r.id)}"><circle r="26" fill="url(#wm-glow)"/><circle r="21" fill="transparent"/>`
    + markInner(r)
    + `<g class="n-q" transform="translate(-15 -14)"><circle r="8" fill="#0c241c" stroke="#8ff0c8" stroke-width="1.6"/><text font-size="11" font-weight="900" fill="#8ff0c8" text-anchor="middle" dominant-baseline="central" y=".5">?</text></g>`
    + `<g class="n-lock" transform="translate(14 -13)">${lockSvg(0.62)}</g><g class="n-star" transform="translate(15 -13)"><circle r="7" fill="#ffd84a" stroke="#7a5200" stroke-width="1.2"/><path d="M0-4 1.2-1.3 4-1.2 1.8.7 2.5 3.4 0 1.9-2.5 3.4-1.8.7-4-1.2-1.2-1.3Z" fill="#fff"/></g>`
    + '</g>').join('')}</g>`;
  // 名前の 札（まるい クリームの 板に こい 字・ばしょは mount の layout が かさならない ように えらぶ）。メインの島の 中の 場所の 名前も 同じ 札。
  s += `<g class="wm-labels">${MAP_ISLANDS.map(labelSvg).join('')}${MAIN_PLACES.map((p, i) => `<g class="wm-label wm-place" data-place="${i}" translate="no"><rect class="wm-pill"/><text class="wm-ltext" font-size="12" text-anchor="middle" dominant-baseline="central"><tspan class="en">${esc(p.en)}</tspan><tspan class="ja">${esc(p.ja)}</tspan></text></g>`).join('')}</g>`;
  s += `<g class="wm-seabanners">${Object.values(SEAS).map((q) => `<g class="wm-seabanner" data-sea="${q.id}" data-x="${f((q.x0 + q.x1) / 2)}" data-y="${f(q.z0 - 4)}" role="button" tabindex="0" aria-label="${esc(SEA_NAMES[q.id].ja)}"><rect class="wm-sbpill"/><text class="wm-sbtext" font-size="20" text-anchor="middle" dominant-baseline="central"><tspan class="en">${esc(SEA_NAMES[q.id].en)}</tspan><tspan class="ja">${esc(SEA_NAMES[q.id].ja)}</tspan></text></g>`).join('')}</g>`;
  s += '<g class="wm-live-over"></g><g class="wm-hits"></g>';
  cachedSvg = `<svg class="wm-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x0} ${VIEW.z0} ${VIEW.x1 - VIEW.x0} ${VIEW.z1 - VIEW.z0}" font-family="'Hiragino Maru Gothic ProN','Arial Rounded MT Bold','M PLUS Rounded 1c','Noto Sans JP',sans-serif">${s}</svg>`;
  return cachedSvg;
}
// あんないの メインの島：白い 道・ビルの まちの 灰色・ひろばの まる
function guideTown() {
  let s = MAIN_RECTS.slice(2, 4).map((a) => `<rect x="${MX + a.x0 + 4}" y="${MZ + a.z0 + 4}" width="${a.x1 - a.x0 - 8}" height="${a.z1 - a.z0 - 8}" rx="5" fill="#2c4f45"/>`).join('');
  { const [x, z] = MW(71, 16); s += `<ellipse cx="${x}" cy="${z}" rx="13" ry="11" fill="#6a4a24"/>`; }
  { const [x, z] = MW(-28, -24.6); s += `<circle cx="${x}" cy="${z}" r="7" fill="#3c6f60"/>`; }
  s += `<g fill="none" stroke="#fff4d6" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round">${MAIN_ROADS.map(([[x0, z0], [x1, z1]]) => { const [a, b] = MW(x0, z0), [c, d] = MW(x1, z1); return `<path d="M${a} ${b}L${c} ${d}"/>`; }).join('')}</g>`;
  return s;
}
const mainIcon = () => box(-6, 8, 8, 18, 5, '#7fb8d8') + box(5, 8, 7, 12, 5, '#9cc8e0') + `<path d="M-14 8a6 5 0 0 1 12 0Z" fill="#e6e8f2" ${S(0.5)}/>`;
// メインの島で 木を おかない ところ（まちの 中・道の まわり）。島の 中の 座標 [x0, x1, z0, z1]。
function defaultMark(r) { return () => shadow(0, 4, 12) + house(0, 4, 10, 6, 6, '#fff4d6', bannerOf(r)); }
function planeMark(x, z) {
  return `<g transform="translate(${f(x)} ${f(z)})"><rect x="-9" y="-2" width="18" height="4" rx="2" fill="#7a8a96" ${S(0.35)}/><path d="M-6 0h12" stroke="#fff" stroke-width=".5" stroke-dasharray="1.4 1"/>`
    + `<g transform="translate(0 -6) rotate(-20)"><path d="M-5 0h10l1.6-.8-1.6-.8H-5Z M-1 0-3 4H-1.4L2 0ZM-1-1.6-3-5H-1.4L2-1.6ZM-4.6-.8-6-3H-5L-3.6-.8Z" fill="#fff" ${S(0.35)}/></g></g>`;
}
function bridgeSvg(l) {   // ひかりの 橋（あんない）：ミントの 光の おびに オレンジの しん。ちがう 海への「うみの みち」は 点線
  const dx = l.to.x - l.from.x, dz = l.to.z - l.from.z, len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx) * 180 / Math.PI;
  if (l.lane) return `<g class="wm-bridge lane" data-bridge="${esc(l.id)}" transform="translate(${f(l.from.x)} ${f(l.from.z)}) rotate(${f(ang)})"><path d="M0 0H${f(len)}" stroke="#ffb066" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray="5 6" stroke-linecap="round"/></g>`;
  const g = `<rect x="-1" y="-4.5" width="${f(len + 2)}" height="9" rx="4.5" fill="#8ff0c8" fill-opacity=".16"/><rect x="-1" y="-2.4" width="${f(len + 2)}" height="4.8" rx="2.4" fill="#0c241c" stroke="#8ff0c8" stroke-width=".9"/><path d="M1 0H${f(len - 1)}" stroke="#ffb066" stroke-width="1.2" stroke-dasharray="3 2.2" stroke-linecap="round"/>`;
  return `<g class="wm-bridge" data-bridge="${esc(l.id)}" transform="translate(${f(l.from.x)} ${f(l.from.z)}) rotate(${f(ang)})">${g}</g>`;
}
// 島の しるしの 中身（まるい わくと 絵）。英検は 級の 旗（5・4・3・準2・2・準1・1）。いちらんの 行も 同じ 絵（markSvg）。
const GRADE_TXT = { eiken5: ['5', '5'], eiken4: ['4', '4'], eiken3: ['3', '3'], eikenp2: ['P2', '準2'], eiken2: ['2', '2'], eikenp1: ['P1', '準1'], eiken1: ['1', '1'] };
function markInner(r) {
  const c = bannerOf(r);
  if (GRADE_TXT[r.id]) {
    const [en, ja] = GRADE_TXT[r.id], fs = ja.length > 1 ? 10 : 15;
    return `<g class="n-mark"><circle r="19" fill="#fff4d6" stroke="${c}" stroke-width="3"/><path d="M-9 13V-13" stroke="#5a3418" stroke-width="2.2" stroke-linecap="round"/><path d="M-8-13H11L7-5.5 11 2H-8Z" fill="${c}" stroke="#2b2118" stroke-width="1"/>`
      + `<text x="1.5" y="-5" font-size="${fs}" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" class="wm-ink"><tspan class="en">${en}</tspan><tspan class="ja">${ja}</tspan></text></g>`;
  }
  return `<g class="n-mark"><circle r="19" fill="#ffffff" stroke="${c}" stroke-width="3"/><g clip-path="url(#wm-mclip)"><circle r="15.5" fill="${light(c, 0.78)}"/><g transform="translate(0 3.5) scale(.62)">${r.id === 'main' ? mainIcon() : (LANDMARK[r.id] || defaultMark(r))()}</g></g></g>`;
}
// いちらん（HTML）で つかう 小さな しるし。<svg> 1 つ（クリップは ここだけの id）。
export function markSvg(id) {
  const r = BY_ID[id]; if (!r) return '';
  return `<svg viewBox="-22 -22 44 44" aria-hidden="true"><defs><clipPath id="wl-clip-${id}"><circle r="15.5"/></clipPath></defs>${markInner(r).replace('url(#wm-mclip)', `url(#wl-clip-${id})`)}</svg>`;
}
// 名前の 札：英語の とき 英語、日本語の とき ひらがなの よみ（わかち書き・rpg-data.js の yomi）。
function labelSvg(r) {
  return `<g class="wm-label" data-island="${esc(r.id)}" translate="no"><rect class="wm-pill"/>`
    + `<text class="wm-ltext" font-size="13" text-anchor="middle" dominant-baseline="central"><tspan class="en">${esc(shortName(r))}</tspan><tspan class="ja">${esc(r.yomi || r.name)}</tspan></text>`
    + `<text class="wm-sub" font-size="11.5" text-anchor="middle" dominant-baseline="central"></text></g>`;
}
const LABEL_TEXT = (r, ja) => [ja ? (r.yomi || r.name) : shortName(r), ''];
// 文字の はば（canvas で はかる・1 回だけ）
const widths = new Map();
let measureCtx = null;
function textW(t, px) {
  const key = px + '|' + t; if (widths.has(key)) return widths.get(key);
  try { measureCtx ||= document.createElement('canvas').getContext('2d'); } catch { /* */ }
  let w = t.length * px * 0.62;
  if (measureCtx?.measureText) { measureCtx.font = `800 ${px}px 'Hiragino Maru Gothic ProN','Arial Rounded MT Bold','M PLUS Rounded 1c','Noto Sans JP',sans-serif`; w = measureCtx.measureText(t).width || w; }
  widths.set(key, w); return w;
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
      let cl = ''; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; cl += `<circle cx="${f(r.x + Math.cos(a) * r.rx * 0.55)}" cy="${f(r.z + Math.sin(a) * r.rz * 0.5)}" r="${f(r.rx * (0.32 + C() * 0.12))}"/>`; }
      under += `<g class="wm-cloud" fill="url(#wm-cloudgrad)">${cl}<circle cx="${r.x}" cy="${r.z}" r="${f(r.rx * 0.7)}"/></g>`;
    }
    if (off) under += `<use href="#wms-${r.id}" class="wm-off"/>`;
    if (here) pin = r.id;
    if (off) continue;
    const name = state.isJa ? (r.yomi || r.name) : shortName(r);
    const st = here ? (state.isJa ? '（いま ここ）' : ' (you are here)') : !open ? (prem ? (state.isJa ? '（🔒 プレミアム）' : ' (premium)') : (state.isJa ? '（まだ ひらいて いない）' : ' (not open yet)')) : '';
    hits += `<g class="wmi" data-island="${esc(r.id)}" role="button" tabindex="0" aria-label="${esc(`${name}${st}`)}"><use href="#wms-${r.id}"/></g>`;
  }
  return { under, over, hits, pin };
}
const lockSvg = (k = 1) => `<g transform="scale(${k})"><rect x="-8" y="-3" width="16" height="13" rx="3" fill="#f2b04a" stroke="${INK}" stroke-width="1.3"/><path d="M-4.6-3v-3.6a4.6 4.6 0 0 1 9.2 0V-3" fill="none" stroke="#7a8a96" stroke-width="2.6"/><path d="M-4.6-3v-3.6a4.6 4.6 0 0 1 9.2 0V-3" fill="none" stroke="${INK}" stroke-width=".6"/><circle cy="3" r="1.8" fill="${INK}"/><path d="M0 3v3.6" stroke="${INK}" stroke-width="1.4"/></g>`;

// host に ちずを 出す。下絵の DOM は 1 回だけ 作って 使いまわす（ひらく たびに 文字から 作りなおさない）。
// うごかして いる 間は SVG に CSS の transform を かけるだけ（GPU が うごかす・かきなおさない）。
// 手を はなして 0.16 秒 たったら viewBox を なおして 1 回だけ かきなおす（くっきり・札の 大きさも なおす）。
let svgNode = null, paintCache = null;
export function mountWorldMap(host, { state, onPick, kid = false, kids = [], fresh = false, style = 'paint' }) {
  if (!svgNode) { const tpl = document.createElement('template'); tpl.innerHTML = baseSvg(); svgNode = tpl.content.firstElementChild; }
  const svg = svgNode, view = host.querySelector('.wmap-view');
  // ぬった 絵（world-paint.js・1 回だけ かく）。canvas を SVG の 下に おき、CSS の transform で 見え方に あわせる。
  const paint = document.createElement('div'); paint.className = 'wmap-paint'; view.appendChild(paint);
  view.appendChild(svg);
  const tiles = [];
  const setStyle = (st) => { style = st; svg.dataset.style = st; host.dataset.style = st; placeTiles(); if (typeof v !== 'undefined') layout(); };
  svg.dataset.ready = paintCache ? '1' : '';
  const addTile = (t) => { if (!t?.canvas || tiles.some((q) => q.canvas === t.canvas)) return; t.canvas.className = t.soft ? 'wmap-tile soft' : t.ppu > 3 ? 'wmap-tile main' : 'wmap-tile'; paint.appendChild(t.canvas); tiles.push(t); placeTiles(); };
  const useResult = (res) => { if (!res || dead) return; paintCache = res; svg.dataset.ready = '1'; host.dataset.ready = '1'; addTile(res.world); res.main?.then((m) => { if (!dead) addTile(m); }); };
  let dead = false;
  const { under, over, hits, pin } = liveParts(state, kid, kids);
  svg.querySelector('.wm-live-under').innerHTML = under;
  svg.querySelector('.wm-live-over').innerHTML = over;
  svg.querySelector('.wm-hits').innerHTML = hits;
  // 札と 番号の しるしに いまの ようすを（くもの 島は うすく・🔒・⭐・いま ここ）
  const labels = [], nums = [];
  for (const g of svg.querySelectorAll('.wm-label[data-island]')) {
    const r = BY_ID[g.dataset.island], open = state.unlocked(r.id), prem = !!state.premium?.(r.id);
    g.classList.toggle('dim', !open && !prem); g.classList.toggle('off', kid && !kids.includes(r.id)); g.classList.toggle('here', r.id === state.current);
    labels.push({ g, r, rect: g.querySelector('rect'), main: g.querySelector('.wm-ltext'), sub: g.querySelector('.wm-sub') });
  }
  for (const g of svg.querySelectorAll('.wm-num')) {
    const r = BY_ID[g.dataset.island], open = state.unlocked(r.id), prem = !!state.premium?.(r.id);
    g.classList.toggle('locked', !open); g.classList.toggle('prem', prem); g.classList.toggle('here', r.id === state.current); g.classList.toggle('off', kid && !kids.includes(r.id));
    nums.push({ g, r });
  }
  const places = [...svg.querySelectorAll('.wm-place')].map((g) => ({ g, p: MAIN_PLACES[+g.dataset.place], rect: g.querySelector('rect') }));
  const order = [...labels].sort((a, b) => (b.r.id === state.current) - (a.r.id === state.current) || (b.r.id === 'main') - (a.r.id === 'main') || (b.r.hub ? 1 : 0) - (a.r.hub ? 1 : 0) || a.r.num - b.r.num);
  const numAt = (r) => (r.id === 'main' ? [MX + 10, MZ - 12] : [r.x - r.rx * 0.5, r.z - r.rz * 0.55]);   // 番号は 島の 左上（まんなかの 絵を かくさない）
  let moved0 = false;   // 子どもが じぶんで うごかしたか（うごかして いなければ パネルを たたんだ とき 見え方を なおす）
  // 「きみは ここ」は HTML の 札（ぴょこぴょこ うごく のは この 札だけ。SVG は かきなおさない）。
  let here = null;
  if (pin) {
    here = document.createElement('div'); here.className = 'wmap-here'; here.setAttribute('aria-hidden', 'true');
    here.innerHTML = `<i class="wh-ring"></i><i class="wh-ring b"></i><i class="wh-lead"></i><span class="wh-tag"><b class="en">You are here</b><i class="ja">きみは ここ</i></span><svg class="wh-pin" viewBox="-11 -24 22 30"><ellipse cy="3" rx="6" ry="2.2" fill="#000" fill-opacity=".25"/><path d="M0 2C-3-4-9-7-9-13a9 9 0 0 1 18 0c0 6-6 9-9 15Z" fill="#ffd246" stroke="${INK}" stroke-width="1.4"/><path d="M0-18.4l1.9 3.9 4.3.6-3.1 3 .7 4.3L0-8.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" fill="#e27a2d"/></svg>`;
    host.appendChild(here);
  }
  const pinR = pin ? BY_ID[pin] : null;
  // 札の ばしょ えらび（ひらく・うごかし おわる・パネルを たたむ・ことばを かえる たびに 1 回）：
  // 番号の まるは 島の まんなか。名前の 札は こうほ（下・上・右・左・島の 外・ななめ）から、ほかの 札・番号・ほかの 島・パネル・
  // 「きみは ここ」に かさならない ものを えらぶ。どこにも おけない 札は かくす（番号は のこる・ちかづくと 出る）。
  const layout = () => {
    const [W, H] = size(), k = W / v.w, ja = getLang() === 'ja', guide = style === 'guide';
    const mid = false, vb = view.getBoundingClientRect();
    // ひいた 見え方（3 つの 海が ぜんぶ 見える）では 島の 名前を 出さず、海の 名前の 札だけ。海に ちかづくと 島の 名前。
    const overview = v.w > fit().w * 0.72;
    svg.dataset.overview = overview ? '1' : '';
    const toS = (x, z) => [W / 2 + (x - v.cx) * k, H / 2 + (z - v.cy) * k];
    const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const blocks = [];
    const addEl = (el) => { const b = el.getBoundingClientRect(); if (b.width) blocks.push([b.left - vb.left - 4, b.top - vb.top - 4, b.right - vb.left + 4, b.bottom - vb.top + 4]); };
    host.querySelectorAll('.wmap-panel, .wmap-title, .wmap-tools, .wmap-compass').forEach(addEl);
    host.closest('.wm')?.querySelectorAll('.wm-views, .wm-close').forEach(addEl);
    const isl = MAP_ISLANDS.map((r) => {
      if (r.id === 'main') return [r.id, [toS(MX - 78, 0)[0], toS(0, MZ - 74)[1], toS(MX + 88, 0)[0], toS(0, MZ + 43)[1]]];
      const [x, z] = toS(r.x, r.z), rx = r.rx * 0.82 * k, rz = r.rz * 0.82 * k; return [r.id, [x - rx, z - rz, x + rx, z + rz]];
    });
    const far = k < 0.4, ms = far ? 0.8 : 1, nr = 21 * ms; svg.dataset.far = far ? '1' : '';   // とおくは 番号の まるだけ（あんないの 絵の まるは ちかづくと）   // とても ひいた とき（スマホ）は しるしを すこし 小さく（押せる はばは のこす）
    for (const n of nums) {
      const [x, z] = numAt(n.r), [sx, sy] = toS(x, z);
      n.g.setAttribute('transform', `translate(${f(x)} ${f(z)}) scale(${f(ms / k * 1000) / 1000})`);
      if (!n.g.classList.contains('off')) blocks.push([sx - nr, sy - nr, sx + nr, sy + nr]);
    }
    const placed = [];
    if (pinR && here) {   // 「きみは ここ」：ピンの すぐ 上（だめなら 下・よこ）に、線で ピンと つなぐ。ほかの 島の となりには ださない。
      const [x, z] = numAt(pinR), [sx, sy] = toS(x, z), tag = here.querySelector('.wh-tag'), lead = here.querySelector('.wh-lead'), tw = tag.offsetWidth || 110, th = tag.offsetHeight || 28;
      here.classList.remove('nopin');
      const pinBox = [sx - 18, sy - 64, sx + 18, sy - 12];
      const mine = (b) => b[0] <= sx && b[2] >= sx && b[1] <= sy && b[3] >= sy;
      const cands = [[0, -64 - 10 - th / 2], [0, nr + 10 + th / 2], [30 + tw / 2, -38], [-30 - tw / 2, -38], [30 + tw / 2, 14], [-30 - tw / 2, 14]];
      const inView = (R) => R[0] >= 4 && R[1] >= 4 && R[2] <= W - 4 && R[3] <= H - 4;
      let best = null;
      for (const [dx, dy] of cands) {
        const R = [sx + dx - tw / 2, sy + dy - th / 2, sx + dx + tw / 2, sy + dy + th / 2];
        if (!inView(R) || blocks.some((b) => !mine(b) && hit(R, b)) || hit(R, pinBox)) continue;
        best = [dx, dy, R]; break;
      }
      if (!best) for (const [dx, dy] of cands.slice(0, 2)) { const R = [sx + dx - tw / 2, sy + dy - th / 2, sx + dx + tw / 2, sy + dy + th / 2]; if (inView(R)) { best = [dx, dy, R]; break; } }   // せまい ときは ピンの 真上か 真下（ほかの 札が よける）
      blocks.push(pinBox);
      if (best) {
        placed.push(best[2]); tag.style.display = ''; tag.style.left = `${f(best[0] - tw / 2)}px`; tag.style.top = `${f(best[1] - th / 2)}px`; tag.style.transform = 'none';
        // 線：ピン（上なら ピンの 頭・ほかは まるの ふち）から 札の ふちへ
        const fx = 0, fy = best[1] < -40 ? -64 : best[1] > 0 ? nr : -38;
        const ex = Math.max(best[0] - tw / 2, Math.min(best[0] + tw / 2, fx)), ey = Math.max(best[1] - th / 2, Math.min(best[1] + th / 2, fy));
        const len = Math.hypot(ex - fx, ey - fy);
        lead.style.display = len > 2 ? '' : 'none'; lead.style.width = `${f(len)}px`; lead.style.transform = `translate(${f(fx)}px, ${f(fy)}px) rotate(${f(Math.atan2(ey - fy, ex - fx))}rad)`;
      } else { tag.style.display = 'none'; lead.style.display = 'none'; }
    }
    const put = (L, cands, w, h, x, z, own) => {
      const [sx, sy] = toS(x, z);
      for (const [dx, dy] of cands) {
        const cx = sx + dx, cy = sy + dy, R = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (R[0] < 4 || R[1] < 4 || R[2] > W - 4 || R[3] > H - 4) continue;
        if (blocks.some((b) => hit(R, b)) || placed.some((b) => hit(R, b)) || isl.some(([id, b]) => id !== own && hit(R, b))) continue;
        placed.push(R);
        L.g.setAttribute('transform', `translate(${f(x + dx / k)} ${f(z + dy / k)}) scale(${f(1 / k * 1000) / 1000})`);
        L.g.style.display = ''; return true;
      }
      L.g.style.display = 'none'; return false;
    };
    for (const L of order) {
      if (overview || L.g.classList.contains('off')) { L.g.style.display = 'none'; continue; }
      const [t1, t2] = LABEL_TEXT(L.r, ja), w = Math.max(textW(t1, 13), mid ? textW(t2, 11.5) : 0) + 22, h = mid ? 40 : 26;
      L.rect.setAttribute('x', f(-w / 2)); L.rect.setAttribute('y', f(-h / 2)); L.rect.setAttribute('width', f(w)); L.rect.setAttribute('height', h); L.rect.setAttribute('rx', 13);
      L.main.setAttribute('y', mid ? -7 : 0.5); L.sub.setAttribute('y', 10); L.sub.style.display = mid ? '' : 'none';
      const [x, z] = numAt(L.r), ex = (L.r.id === 'main' ? 88 : L.r.rx * 0.82) * k, ez = (L.r.id === 'main' ? 62 : L.r.rz * 0.82) * k, g2 = nr + 3;
      put(L, [[0, -g2 - h / 2], [-g2 - w / 2, 0], [g2 + w / 2, 0], [0, g2 + h / 2], [0, ez + h / 2 + 2], [0, -ez - h / 2 - 2], [ex + w / 2, 0], [-ex - w / 2, 0],
        [ex * 0.8 + w / 2, ez * 0.8 + h / 2], [-ex * 0.8 - w / 2, ez * 0.8 + h / 2], [ex * 0.8 + w / 2, -ez * 0.8 - h / 2], [-ex * 0.8 - w / 2, -ez * 0.8 - h / 2]], w, h, x, z, L.r.id);
    }
    for (const P of places) {   // メインの島の 中の 名前：ちかづいた とき だけ、あいて いれば
      if (k < 2.2) { P.g.style.display = 'none'; continue; }
      const t = ja ? P.p.ja : P.p.en, w = textW(t, 12) + 18, h = 22;
      P.rect.setAttribute('x', f(-w / 2)); P.rect.setAttribute('y', -h / 2); P.rect.setAttribute('width', f(w)); P.rect.setAttribute('height', h); P.rect.setAttribute('rx', 11);
      const [x, z] = MW(P.p.x, P.p.z); put(P, [[0, 0], [0, 16], [0, -16]], w, h, x, z, 'main');
    }
    for (const B of banners) {   // 海の 名前の 札（ひいた ときだけ・海の 上の まんなか）
      if (!overview) { B.g.style.display = 'none'; continue; }
      const t = ja ? SEA_NAMES[B.id].ja : SEA_NAMES[B.id].en, w = textW(t, 20) + 40, h = 40;
      B.rect.setAttribute('x', f(-w / 2)); B.rect.setAttribute('y', -h / 2); B.rect.setAttribute('width', f(w)); B.rect.setAttribute('height', h); B.rect.setAttribute('rx', 20);
      const q = SEAS[B.id], [sx, sy] = toS((q.x0 + q.x1) / 2, q.z0);
      const cy = Math.max(sy - 2, 4 + h / 2);   // 札は わくの 上の ふちに またがる（島の しるしに かからない）
      B.g.style.display = ''; B.g.setAttribute('transform', `translate(${f((q.x0 + q.x1) / 2)} ${f(v.cy + (cy - H / 2) / k)}) scale(${f(1 / k * 1000) / 1000})`);
    }
  };
  const banners = [...svg.querySelectorAll('.wm-seabanner')].map((g) => ({ g, id: g.dataset.sea, rect: g.querySelector('rect') }));
  const offLang = onLangChange(() => { if (!dead) layout(); });
  for (const d of host.querySelectorAll('details')) d.addEventListener('toggle', () => { if (dead) return; if (!moved0) Object.assign(v, fit()); commit(); });

  // 見え方：cx, cy ＝ まんなか、w ＝ 見える はば（世界の 単位）。cv ＝ いま viewBox に 入って いる 見え方。
  const size = () => [view.clientWidth || 800, view.clientHeight || 500];
  // はじめの 見え方：ぜんぶの 島（FIT）が 入る いちばん 大きな 見え方。上は タイトルの ぶん あける。
  // ひらいて いる パネルの ぶん（左・右・上・下）を よけた あいた ところの まんなかに、ぜんぶの 島を おさめる。
  const fit = (box = FIT) => {
    const [W, H] = size(), vb = view.getBoundingClientRect();
    let L = 12, R = 12, T = 12, B = 12;
    const rel = (el) => { const b = el?.getBoundingClientRect?.(); return b && b.width ? [b.left - vb.left, b.top - vb.top, b.right - vb.left, b.bottom - vb.top] : null; };
    for (const el of [host.querySelector('.wmap-title'), ...(host.closest('.wm')?.querySelectorAll('.wm-views, .wm-close') || [])]) { const b = rel(el); if (b) T = Math.max(T, b[3] + 26); }
    const list = host.querySelector('.wmap-list'), key = host.querySelector('.wmap-key'), tools = host.querySelector('.wmap-tools');
    const lb = list?.open ? rel(list) : null, kb = key?.open ? rel(key) : null, tb = rel(tools);
    if (lb) R = Math.max(R, W - lb[0] + 8);
    if (kb) L = Math.max(L, kb[2] + 8);
    if (tb) B = Math.max(B, H - tb[1] + 6);
    if (W - L - R < W * 0.45) { L = 12; R = 12; }   // せまい 画面で パネルが 大きい ときは かさねる
    const bw = box.x1 - box.x0, bh = box.z1 - box.z0, aw = Math.max(80, W - L - R), ah = Math.max(80, H - T - B);
    const k = Math.min(aw / bw, ah / bh), w = W / k;
    return { cx: (box.x0 + box.x1) / 2 - ((L - R) / 2) / k, cy: (box.z0 + box.z1) / 2 - ((T - B) / 2) / k, w };
  };
  const v = nowView.w && !fresh ? { cx: nowView.cx, cy: nowView.cy, w: nowView.w } : fit();
  const cv = { ...v };
  const clampV = () => { v.w = Math.max(60, Math.min((VIEW.x1 - VIEW.x0) * 4.5, v.w)); v.cx = Math.max(VIEW.x0, Math.min(VIEW.x1, v.cx)); v.cy = Math.max(VIEW.z0, Math.min(VIEW.z1, v.cy)); };
  function placeTiles() { if (!tiles.length) return; const [W, H] = size(), k = W / v.w; for (const t of tiles) { if (!t.canvas) continue; t.canvas.style.width = `${t.x1 - t.x0}px`; t.canvas.style.height = `${t.z1 - t.z0}px`; t.canvas.style.transform = `translate(${f(W / 2 + (t.x0 - v.cx) * k)}px, ${f(H / 2 + (t.z0 - v.cy) * k)}px) scale(${f(k * 10000) / 10000})`; } }
  const placePin = () => { if (!here) return; const [W, H] = size(), k = W / v.w, [x, z] = numAt(pinR); here.style.transform = `translate(${f(W / 2 + (x - v.cx) * k)}px, ${f(H / 2 + (z - v.cy) * k)}px)`; };
  const commit = () => {
    timer = 0; clampV(); Object.assign(cv, v);
    const [W, H] = size(), h = v.w * (H / W), px = W / v.w;   // px ＝ 1 単位が 何ピクセルか
    svg.style.transform = '';
    svg.setAttribute('viewBox', `${f(v.cx - v.w / 2)} ${f(v.cy - h / 2)} ${f(v.w)} ${f(h)}`);
    // 札は 画面の 上で ほぼ 同じ 大きさ（とおくでは ちいさく しすぎず、ちかくでは 大きく しすぎない）。
    layout();
    svg.dataset.near = px > 2.2 ? '1' : ''; svg.dataset.mid = px > 1.25 ? '1' : '';
    nowView.cx = v.cx; nowView.cy = v.cy; nowView.w = v.w;
    placePin(); placeTiles();
    if (px > 2.4 && paintCache) wantDetail();
  };
  // ちかづいたら、見えて いる 島の こまかい え を 1 つずつ かく（1 島 1 回だけ・world-paint.js が とっておく）。
  let detailBusy = false;
  const wantDetail = () => {
    if (detailBusy || dead) return;
    const [W, H] = size(), h = v.w * H / W;
    const next = MAP_ISLANDS.find((r) => r.id !== 'main' && !tiles.some((t) => t.id === r.id) && Math.abs(r.x - v.cx) < v.w / 2 + r.rx && Math.abs(r.z - v.cy) < h / 2 + r.rz);
    if (!next) return;
    detailBusy = true;
    import('./world-paint.js').then((m) => m.paintIsland(next.id)).then((t) => { detailBusy = false; if (dead) return; if (t) addTile(t); else tiles.push({ id: next.id, canvas: null }); wantDetail(); }).catch(() => { detailBusy = false; });
  };
  let timer = 0, raf = 0;
  const preview = () => {   // うごかして いる 間：transform だけ
    raf = 0; clampV();
    const [W] = size(), k = cv.w / v.w, s2 = W / v.w;
    svg.style.transform = `translate(${f((cv.cx - v.cx) * s2)}px, ${f((cv.cy - v.cy) * s2)}px) scale(${f(k * 1000) / 1000})`;
    placePin(); placeTiles();
  };
  const draw = () => { if (!raf) raf = requestAnimationFrame(preview); clearTimeout(timer); timer = setTimeout(commit, 160); };
  commit(); setStyle(style);
  if (paintCache) useResult(paintCache);
  else { host.dataset.ready = ''; import('./world-paint.js').then((m) => m.paintWorld()).then(useResult).catch(() => {}); }

  // ── 指・マウス：ひっぱって うごかす・2 本指で ちかづける・ホイール
  const pts = new Map(); let moved = 0, pinch = null;
  const toWorld = (cx, cy) => { const b = view.getBoundingClientRect(), W = b.width || 1, H = b.height || 1; return [v.cx + ((cx - b.left) / W - 0.5) * v.w, v.cy + ((cy - b.top) / H - 0.5) * v.w * (H / W)]; };
  const zoomAt = (k, cx, cy) => { moved0 = true; const [wx, wy] = toWorld(cx, cy); v.w /= k; clampV(); const [nx, ny] = toWorld(cx, cy); v.cx += wx - nx; v.cy += wy - ny; draw(); };
  view.onpointerdown = (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 1) moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 }; } };
  view.onpointermove = (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { moved0 = true; try { view.setPointerCapture(e.pointerId); } catch { /* */ } view.classList.add('drag'); const W = view.clientWidth || 1; v.cx -= dx * v.w / W; v.cy -= dy * v.w / W; draw(); }
    } else if (pts.size === 2 && pinch) {
      moved = 99; const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      zoomAt(d / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch.d = d;
    }
  };
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) view.classList.remove('drag'); };
  view.onpointerup = up; view.onpointercancel = up;
  view.onwheel = (e) => { e.preventDefault(); zoomAt(Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.004), e.clientX, e.clientY); };
  // 押した 島へ（ひっぱった ときは 押さない）。どう なるかは rpg.js（onPick）が 決める。
  view.onclick = (e) => { if (moved > 6) { moved = 0; return; } const g = e.target.closest?.('[data-island]'); if (g && !g.classList.contains('off')) { onPick?.(g.dataset.island); return; } const sea = e.target.closest?.('[data-sea]'); if (sea && svg.dataset.overview) focusSea(sea.dataset.sea); };
  const focusSea = (id) => { const q = SEAS[id]; if (!q) return; moved0 = true; Object.assign(v, fit(q)); draw(); };
  const mid = () => { const b = view.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; };
  view.onkeydown = (e) => {
    const g = e.target.closest?.('.wmi');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick?.(g.dataset.island); return; }
    const sb = e.target.closest?.('.wm-seabanner'); if (sb && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focusSea(sb.dataset.sea); return; }
    const step = v.w * 0.12, k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k && !g) { e.preventDefault(); v.cx += k[0]; v.cy += k[1]; draw(); }
    if (e.key === '+' || e.key === '=') zoomAt(1.3, ...mid());
    if (e.key === '-') zoomAt(1 / 1.3, ...mid());
  };
  // tab で 島に きたら 見える ところへ
  view.onfocusin = (e) => { const g = e.target.closest?.('.wmi'); if (!g) return; const r = BY_ID[g.dataset.island], [W, H] = size(), h = v.w * H / W; if (Math.abs(r.x - v.cx) > v.w * 0.38 || Math.abs(r.z - v.cy) > h * 0.38) { v.cx = r.x; v.cy = r.z; draw(); } };
  const ro = globalThis.ResizeObserver ? new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => { if (!moved0) Object.assign(v, fit()); commit(); }, 60); }) : null; ro?.observe(view);
  return {
    zoom: (k) => zoomAt(k, ...mid()),
    reset: () => { moved0 = false; Object.assign(v, fit()); draw(); },
    focusSea: (id) => focusSea(id),
    focus: (id, w = 250) => { const r = BY_ID[id]; if (!r) return; v.cx = r.id === 'main' ? MX + 5 : r.x; v.cy = r.id === 'main' ? MZ - 14 : r.z; v.w = w; draw(); },
    commit,
    setStyle,
    destroy: () => { dead = true; offLang?.(); paint.remove(); ro?.disconnect(); if (raf) cancelAnimationFrame(raf); clearTimeout(timer); here?.remove(); },
  };
}
