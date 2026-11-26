// ブロック屋の 3D プレビュー — ブロックを1個、立体で描く。
//
// なぜ WebGL を使わないか。ブロックは**立方体**で、等角投影で3面を塗り分けた絵と、
// 実際に three.js で描いた立方体の絵は、48px では見分けがつかない。一方でレンダラーを
// 1つ増やすのは iPad では本当に高い（このページには既に world / アバター / 魚 / 図鑑 /
// きせかえ のレンダラーがある。Safari は本数を制限し、evict されるのは古い方）。
// 10個の立方体のために GL コンテキストを増やす理由がない。
//
// きせかえの店が本物の 3D を焼いているのは、帽子やマントは**形が全部ちがう**から。
// 立方体は立方体で、そこが違う。
//
// 絵はブロック屋の色（`town.json`）から作る。BLOCKWILD 側のドット絵を持ってくることも
// できるが、あちらのテクスチャ生成は three.js を import しているので、**この世界に
// 2本目の three.js を持ち込む**ことになる。それは iframe で隔離した意味を失う。
//
// 2026-11：面に もよう（石・レンガ・木の いた・ガラス…）を はった。もようは `town-block-tex.js` が canvas に かく
// （three.js は 読まない）。やっぱり WebGL は 使わない：面は 平行四辺形 なので 2D の 変形で はれる。
import { blockTexture, BLOCK_LOOK, TILE } from './town-block-tex.js';

const cache = new Map();

// 面の明るさ。上が明るく、右が中くらい、左が暗い — 光が左上から来ている世界の約束。
const TOP = 1.18;
const RIGHT = 0.86;
const LEFT = 0.62;

const shade = (hex, f, alpha = 1) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
};

// ブロックごとの手触り。全部おなじのっぺりした立方体だと、10個並べたときに
// 「色ちがいが10個」にしか見えない。
const SKIN = {
  glass: { alpha: 0.55, edge: '#ffffff', grain: 0 },
  water: { alpha: 0.62, edge: '#cfefff', grain: 0.04 },
  lamp: { glow: true, grain: 0.05 },
  grass: { grain: 0.13 },
  sand: { grain: 0.12 },
  snow: { grain: 0.06 },
  stone: { grain: 0.14 },
  brick: { grain: 0.05, rows: true },
  wood: { grain: 0.09, planks: true },
  flower: { grain: 0.1 },
};

// 決まった見た目にしたいので乱数は使わない（同じブロックは毎回同じ顔）。
const speck = (seed) => {
  let s = seed * 16807 % 2147483647;
  return () => ((s = s * 16807 % 2147483647) / 2147483647);
};

// 前の 絵：色を 3 面に ぬりわけた 立方体。もようが かけない ときの 予備。
function flatIcon(id, colour, size) {
  const skin = SKIN[id] || {};
  const cv = document.createElement('canvas');
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  cv.width = cv.height = Math.round(size * dpr);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);

  // 等角投影の立方体。上面のひし形、右面と左面の平行四辺形。
  const w = size * 0.78;
  const h = w * 0.5;            // ひし形の高さ＝幅の半分（2:1 の等角）
  const cx = size / 2;
  const top = size * 0.12;
  const side = w * 0.52;        // 側面の高さ

  const faces = [
    // 上面
    { pts: [[cx, top], [cx + w / 2, top + h / 2], [cx, top + h], [cx - w / 2, top + h / 2]], f: TOP },
    // 左面
    { pts: [[cx - w / 2, top + h / 2], [cx, top + h], [cx, top + h + side], [cx - w / 2, top + h / 2 + side]], f: LEFT },
    // 右面
    { pts: [[cx, top + h], [cx + w / 2, top + h / 2], [cx + w / 2, top + h / 2 + side], [cx, top + h + side]], f: RIGHT },
  ];

  const rnd = speck(Math.abs(colour) + 13);
  for (const face of faces) {
    ctx.beginPath();
    ctx.moveTo(...face.pts[0]);
    for (const p of face.pts.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
    ctx.fillStyle = shade(colour, face.f, skin.alpha ?? 1);
    ctx.fill();
    // ざらつき：面の中に小さな点を落とすだけで、石は石らしく、砂は砂らしくなる。
    if (skin.grain) {
      ctx.save();
      ctx.clip();
      for (let i = 0; i < 26; i += 1) {
        const x = cx - w / 2 + rnd() * w;
        const y = top + rnd() * (h + side);
        ctx.fillStyle = shade(colour, face.f * (rnd() < 0.5 ? 1 - skin.grain : 1 + skin.grain), skin.alpha ?? 1);
        ctx.fillRect(x, y, size * 0.045, size * 0.045);
      }
      ctx.restore();
    }
    ctx.strokeStyle = skin.edge || shade(colour, face.f * 0.78, 0.9);
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.stroke();
  }

  // レンガは横の目地、木は縦の板目。1本の線で「何でできているか」が変わる。
  ctx.save();
  ctx.strokeStyle = shade(colour, 0.7, 0.85);
  ctx.lineWidth = Math.max(1, size * 0.015);
  if (skin.rows) {
    for (const t of [0.33, 0.66]) {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, top + h / 2 + side * t);
      ctx.lineTo(cx, top + h + side * t);
      ctx.lineTo(cx + w / 2, top + h / 2 + side * t);
      ctx.stroke();
    }
  }
  if (skin.planks) {
    for (const t of [0.34, 0.68]) {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 + w * 0.5 * t, top + h / 2 + h * 0.5 * t);
      ctx.lineTo(cx - w / 2 + w * 0.5 * t, top + h / 2 + h * 0.5 * t + side);
      ctx.stroke();
    }
  }
  ctx.restore();

  // ランプは光る。買う理由が「明るいから」なので、絵が暗いと意味がない。
  if (skin.glow) {
    const g = ctx.createRadialGradient(cx, top + h + side * 0.3, size * 0.05, cx, top + h + side * 0.3, size * 0.5);
    g.addColorStop(0, shade(colour, 1.4, 0.5));
    g.addColorStop(1, shade(colour, 1.4, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  return cv.toDataURL('image/png');
}

// 立方体の 3 面に、town-block-tex.js の もよう（石・レンガ・木の いた…）を はる。
// 面は 平行四辺形 なので、2D の 変形（setTransform）だけで ぴったり はれる＝WebGL は いらない。
// そのあと 光（上が 明るい・左が 暗い）、地面に 近い ところの かげ、角の ハイライト、足もとの かげを かさねる。
function richIcon(id, colour, size) {
  const atlas = blockTexture(id, colour);
  if (!atlas) return null;
  const look = BLOCK_LOOK[id] || {};
  const cv = document.createElement('canvas');
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  cv.width = cv.height = Math.round(size * dpr);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const w = size * 0.8;
  const h = w * 0.5;
  const cx = size / 2;
  const top = size * 0.06;
  const side = w * 0.55;
  // かど：T＝上、R＝右、C＝まんなか、L＝左、下の 3 つ。
  const T = [cx, top], R = [cx + w / 2, top + h / 2], C = [cx, top + h], L = [cx - w / 2, top + h / 2];
  const LB = [L[0], L[1] + side], CB = [C[0], C[1] + side], RB = [R[0], R[1] + side];
  const path = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); };
  const base = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  base();

  // 足もとの かげ。
  const sh = ctx.createRadialGradient(cx, CB[1] - h * 0.42, w * 0.1, cx, CB[1] - h * 0.42, w * 0.66);
  sh.addColorStop(0, 'rgba(20,30,25,.38)'); sh.addColorStop(1, 'rgba(20,30,25,0)');
  ctx.save(); ctx.translate(0, CB[1] - h * 0.42); ctx.scale(1, 0.5); ctx.translate(0, -(CB[1] - h * 0.42));
  ctx.fillStyle = sh; ctx.fillRect(0, 0, size, size * 2); ctx.restore();

  // すけない ブロックは 先に 形を ぬって おく（面と 面の あいだに すきまが 見えない ように）。
  if (!look.alpha) { path([T, R, RB, CB, LB, L]); ctx.fillStyle = shade(colour, 0.6); ctx.fill(); }

  // 面を はる：o＝左上の かど、u＝よこの 辺、v＝たての 辺。sx＝絵の どちらの 半分か。
  const face = (o, u, v, sx) => {
    ctx.setTransform(u[0] / TILE * dpr, u[1] / TILE * dpr, v[0] / TILE * dpr, v[1] / TILE * dpr, o[0] * dpr, o[1] * dpr);
    ctx.drawImage(atlas, sx, 0, TILE, TILE, 0, 0, TILE, TILE);
    base();
  };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  face(L, sub(C, L), [0, side], 0);
  face(C, sub(R, C), [0, side], 0);
  face(T, sub(R, T), sub(L, T), TILE);

  // 光：左の 面は かげ、右は 少し かげ、上は 明るい。
  path([L, C, CB, LB]); ctx.fillStyle = `rgba(8,14,24,${look.glow ? 0.16 : 0.36})`; ctx.fill();
  path([C, R, RB, CB]); ctx.fillStyle = `rgba(8,14,24,${look.glow ? 0.05 : 0.14})`; ctx.fill();
  path([T, R, C, L]); ctx.fillStyle = 'rgba(255,255,240,.12)'; ctx.fill();
  // 地面に 近い ほど 暗い（かこまれた ところの かげ）。
  for (const pts of [[L, C, CB, LB], [C, R, RB, CB]]) {
    path(pts);
    const ao = ctx.createLinearGradient(0, C[1] + side * 0.45, 0, CB[1]);
    ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, `rgba(0,0,0,${look.glow ? 0.12 : 0.3})`);
    ctx.fillStyle = ao; ctx.fill();
  }
  // まんなかの 角：左の 面は 角に むかって 少し 明るく（まるみ）。
  path([L, C, CB, LB]);
  const edge = ctx.createLinearGradient(C[0] - w * 0.14, 0, C[0], 0);
  edge.addColorStop(0, 'rgba(255,255,255,0)'); edge.addColorStop(1, 'rgba(255,255,255,.12)');
  ctx.fillStyle = edge; ctx.fill();

  // 角の ハイライト と りんかく。
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.62)'; ctx.lineWidth = Math.max(0.8, size * 0.016);
  ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(R[0], R[1]); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(C[0], C[1]); ctx.lineTo(CB[0], CB[1]); ctx.stroke();
  path([T, R, RB, CB, LB, L]);
  ctx.strokeStyle = look.alpha ? shade(colour, 0.55, 0.55) : shade(colour, 0.36, 0.7); ctx.lineWidth = Math.max(0.8, size * 0.014); ctx.stroke();

  // ガラスと 水は つるつる：左の 面に 白い 光の すじ。
  if (look.alpha) {
    ctx.save(); path([L, C, CB, LB]); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.beginPath(); ctx.moveTo(L[0] + w * 0.06, L[1] + side * 0.16); ctx.lineTo(L[0] + w * 0.16, L[1] + side * 0.2); ctx.lineTo(L[0] + w * 0.16, L[1] + side * 0.72); ctx.lineTo(L[0] + w * 0.06, L[1] + side * 0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // ランプは 光る：まわりに あたたかい 光を 足す。
  if (look.glow) {
    ctx.globalCompositeOperation = 'lighter';
    const gy = top + h + side * 0.35;
    const g = ctx.createRadialGradient(cx, gy, size * 0.04, cx, gy, size * 0.58);
    g.addColorStop(0, shade(colour, 1.2, 0.5)); g.addColorStop(0.5, shade(colour, 1.1, 0.16)); g.addColorStop(1, shade(colour, 1, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }
  return cv.toDataURL('image/png');
}

export function blockIcon(id, colour, size = 56) {
  const key = `${id}:${colour}:${size}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try { url = richIcon(id, Number(colour), size); } catch { url = null; }
  if (!url) url = flatIcon(id, colour, size);
  cache.set(key, url);
  return url;
}
