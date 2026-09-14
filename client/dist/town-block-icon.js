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

export function blockIcon(id, colour, size = 56) {
  const key = `${id}:${colour}:${size}`;
  if (cache.has(key)) return cache.get(key);
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

  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
