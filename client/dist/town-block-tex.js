// ブロックの もよう — いし・レンガ・木の いた・ガラス・すな・くさ・みず・ランプ などを canvas に かく。
//
// ・three.js は 読まない（お店の カードの 絵＝town-block-icon.js も 使うので。あちらは WebGL を 使わない きまり）。
// ・1 しゅるい 1 まい、256×128 の 絵：**左 半分＝よこの 面、右 半分＝上の 面**（くさは 上が みどり・よこが 土）。
//   1 回 かいたら おぼえる。3D（town-real.js）は これを テクスチャに して、箱の UV で 左右を ふりわける。
// ・色は town.json の 色から 作る（子どもが 買った ブロックの 色は かえない）。乱数は たねつき＝いつも 同じ 顔。
// ・canvas が 使えない ところ（検査の Node など）では null を 返す＝よぶ がわが 色だけに もどす。
export const TILE = 128;

// ブロックごとの 質感（3D の 材質が 読む）。alpha＝すける、glow＝光る。
export const BLOCK_LOOK = {
  wood: { rough: 0.78 },
  stone: { rough: 0.92 },
  brick: { rough: 0.88 },
  glass: { rough: 0.08, alpha: true },
  grass: { rough: 0.95 },
  sand: { rough: 0.98 },
  snow: { rough: 0.7 },
  lamp: { rough: 0.45, glow: 0.5 },
  flower: { rough: 0.9 },
  water: { rough: 0.12, alpha: true },
};

const ch = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
// 色を f 倍に（1 より 大きいと 明るく）。a は すけぐあい。
const css = (hex, f = 1, a = 1) => { const [r, g, b] = ch(hex); return `rgba(${clamp(r * f)},${clamp(g * f)},${clamp(b * f)},${a})`; };
// 2 つの 色を まぜる（t = 0 で a、1 で b）。
const mix = (a, b, t) => { const A = ch(a), B = ch(b); return (clamp(A[0] + (B[0] - A[0]) * t) << 16) | (clamp(A[1] + (B[1] - A[1]) * t) << 8) | clamp(A[2] + (B[2] - A[2]) * t); };
const rng = (seed) => { let s = (seed % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };

// こまかい つぶ。石・すな・土の ざらざら。
function speckle(g, r, n, hex, spread, size = 1.6, a = 0.5) {
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = css(hex, 1 + (r() - 0.5) * spread, a);
    const s = 0.6 + r() * size;
    g.fillRect(r() * TILE, r() * TILE, s, s);
  }
}
// ぼんやりした しみ。面が のっぺり しない ように。
function blotch(g, r, n, hex, a = 0.12, big = 26) {
  for (let i = 0; i < n; i += 1) {
    const x = r() * TILE, y = r() * TILE, rad = 8 + r() * big;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, css(hex, r() < 0.5 ? 0.7 : 1.3, a)); gr.addColorStop(1, css(hex, 1, 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
// ふちの 面とり：左上が 明るく、右下が 暗い。ブロックを つんだ とき 1 こずつ 見える。
function bevel(g, w = 3, light = 0.2, dark = 0.26) {
  g.fillStyle = `rgba(255,255,255,${light})`; g.fillRect(0, 0, TILE, w); g.fillRect(0, 0, w, TILE);
  g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, TILE - w, TILE, w); g.fillRect(TILE - w, 0, w, TILE);
  g.fillStyle = `rgba(0,0,0,${dark * 0.45})`; g.fillRect(0, TILE - w * 2, TILE, w); g.fillRect(TILE - w * 2, 0, w, TILE);
}

function wood(g, r, c) {
  const rows = 4, ph = TILE / rows;
  for (let i = 0; i < rows; i += 1) {
    const y = i * ph, tone = 0.88 + r() * 0.24;
    const gr = g.createLinearGradient(0, y, 0, y + ph);
    gr.addColorStop(0, css(c, tone * 1.1)); gr.addColorStop(0.5, css(c, tone)); gr.addColorStop(1, css(c, tone * 0.86));
    g.fillStyle = gr; g.fillRect(0, y, TILE, ph);
    // 木目：ゆるく うねる 細い 線。
    for (let k = 0; k < 9; k += 1) {
      const yy = y + 3 + r() * (ph - 6), amp = 0.6 + r() * 1.6, ph0 = r() * 6;
      g.strokeStyle = css(c, r() < 0.7 ? 0.62 : 1.25, 0.16 + r() * 0.2); g.lineWidth = 0.6 + r() * 0.9;
      g.beginPath();
      for (let x = 0; x <= TILE; x += 8) { const py = yy + Math.sin(x * 0.06 + ph0) * amp; if (x) g.lineTo(x, py); else g.moveTo(x, py); }
      g.stroke();
    }
    // ふし。
    if (r() < 0.6) {
      const kx = 14 + r() * (TILE - 28), ky = y + ph * (0.35 + r() * 0.3);
      for (let q = 3; q > 0; q -= 1) { g.strokeStyle = css(c, 0.5, 0.32); g.lineWidth = 0.9; g.beginPath(); g.ellipse(kx, ky, q * 2.6, q * 1.5, 0, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = css(c, 0.4, 0.75); g.beginPath(); g.ellipse(kx, ky, 2.2, 1.4, 0, 0, Math.PI * 2); g.fill();
    }
    // いたの つぎめ と くぎ。
    const jx = (i % 2 ? 0.3 : 0.72) * TILE + (r() - 0.5) * 10;
    g.fillStyle = css(c, 0.34, 0.85); g.fillRect(jx, y, 1.6, ph);
    g.fillStyle = css(c, 1.35, 0.4); g.fillRect(jx + 1.6, y, 1, ph);
    for (const nx of [jx - 5, jx + 7]) { g.fillStyle = css(c, 0.3, 0.9); g.beginPath(); g.arc(nx, y + ph / 2, 1.3, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(nx - 0.8, y + ph / 2 - 1, 0.9, 0.9); }
    // いたと いたの すきま。
    g.fillStyle = css(c, 0.3, 0.9); g.fillRect(0, y + ph - 1.6, TILE, 1.6);
    g.fillStyle = css(c, 1.4, 0.35); g.fillRect(0, y, TILE, 1);
  }
  bevel(g, 2, 0.12, 0.2);
}

function stone(g, r, c) {
  g.fillStyle = css(c); g.fillRect(0, 0, TILE, TILE);
  blotch(g, r, 34, c, 0.16);
  speckle(g, r, 900, c, 0.7, 1.8, 0.45);
  // ひび：暗い 線と、その となりの 明るい 線で くぼみに 見せる。
  for (let i = 0; i < 4; i += 1) {
    let x = r() * TILE, y = r() * TILE; const pts = [[x, y]];
    for (let k = 0; k < 5; k += 1) { x += (r() - 0.5) * 40; y += 8 + r() * 16; pts.push([x, y]); }
    for (const [dx, col, lw] of [[0, css(c, 0.42, 0.6), 1.2], [1.2, css(c, 1.4, 0.3), 0.8]]) {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px + dx, py + dx) : g.moveTo(px + dx, py + dx))); g.stroke();
    }
  }
  // こいしの かげ。
  for (let i = 0; i < 10; i += 1) { const x = r() * TILE, y = r() * TILE, s = 2 + r() * 4; g.fillStyle = css(c, 0.7, 0.4); g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill(); g.fillStyle = css(c, 1.3, 0.35); g.beginPath(); g.ellipse(x - 0.8, y - 0.8, s * 0.6, s * 0.4, 0, 0, Math.PI * 2); g.fill(); }
  bevel(g);
}

function brick(g, r, c) {
  const mortar = mix(c, 0xd9d2c4, 0.78);
  g.fillStyle = css(mortar); g.fillRect(0, 0, TILE, TILE);
  speckle(g, r, 260, mortar, 0.3, 1.4, 0.6);
  const rows = 4, bh = TILE / rows, bw = TILE / 2, gap = 2.5;
  for (let row = 0; row < rows; row += 1) {
    for (let k = -1; k < 2; k += 1) {
      const x = k * bw + (row % 2 ? bw / 2 : 0) + gap / 2, y = row * bh + gap / 2, w = bw - gap, h = bh - gap;
      const tone = 0.84 + r() * 0.3, warm = mix(c, r() < 0.5 ? 0x8a3a2a : 0xd08a5a, r() * 0.25);
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, css(warm, tone * 1.08)); gr.addColorStop(1, css(warm, tone * 0.9));
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      // レンガの ざらつき（その レンガの 中だけ）。
      for (let i = 0; i < 46; i += 1) { g.fillStyle = css(warm, tone * (r() < 0.5 ? 0.72 : 1.25), 0.4); const s = 0.6 + r() * 1.5; g.fillRect(x + r() * (w - 2), y + r() * (h - 2), s, s); }
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, y, w, 1.4); g.fillRect(x, y, 1.2, h);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, y + h - 1.6, w, 1.6); g.fillRect(x + w - 1.2, y, 1.2, h);
    }
  }
  // 目地の かげ（レンガの 下が くぼんで 見える）。
  for (let row = 1; row <= rows; row += 1) { g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, row * bh - gap / 2, TILE, 1); }
}

function glass(g, r, c) {
  g.clearRect(0, 0, TILE, TILE);
  const gr = g.createLinearGradient(0, 0, TILE, TILE);
  gr.addColorStop(0, css(c, 1.12, 0.42)); gr.addColorStop(0.5, css(c, 1, 0.24)); gr.addColorStop(1, css(c, 0.8, 0.4));
  g.fillStyle = gr; g.fillRect(0, 0, TILE, TILE);
  // ななめの うつりこみ。
  for (const [x0, w, a] of [[18, 16, 0.5], [44, 6, 0.36], [92, 10, 0.2]]) {
    g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.moveTo(x0, 6); g.lineTo(x0 + w, 6); g.lineTo(x0 + w - 46, TILE - 6); g.lineTo(x0 - 46, TILE - 6); g.closePath(); g.fill();
  }
  // わく：明るい ふちと、内がわの 細い かげ。
  g.strokeStyle = css(mix(c, 0xffffff, 0.55), 1, 0.95); g.lineWidth = 7; g.strokeRect(3.5, 3.5, TILE - 7, TILE - 7);
  g.strokeStyle = css(c, 0.55, 0.6); g.lineWidth = 1.2; g.strokeRect(7.5, 7.5, TILE - 15, TILE - 15);
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2; g.strokeRect(1, 1, TILE - 2, TILE - 2);
}

function grassBlades(g, r, c, y0, y1, n) {
  for (let i = 0; i < n; i += 1) {
    const x = r() * TILE, y = y0 + r() * (y1 - y0), len = 3 + r() * 6, lean = (r() - 0.5) * 4;
    g.strokeStyle = css(mix(c, r() < 0.5 ? 0x2f6b2a : 0xcfe88a, r() * 0.45), 0.8 + r() * 0.45, 0.75); g.lineWidth = 0.8 + r() * 0.9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + lean, y - len); g.stroke();
  }
}
function dirt(g, r, hex) {
  g.fillStyle = css(hex); g.fillRect(0, 0, TILE, TILE);
  blotch(g, r, 20, hex, 0.18, 20);
  speckle(g, r, 700, hex, 0.8, 2, 0.5);
  for (let i = 0; i < 9; i += 1) { const x = r() * TILE, y = 30 + r() * (TILE - 34), s = 2 + r() * 3.5; g.fillStyle = css(0x9c958a, 0.8 + r() * 0.4, 0.9); g.beginPath(); g.ellipse(x, y, s, s * 0.72, r() * 3, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - s, y + s * 0.6, s * 2, 1); }
}
function grassSide(g, r, c) {
  dirt(g, r, 0x8a6240);
  // 上から たれる くさ：列ごとに 深さを かえて ぎざぎざに。
  for (let x = 0; x < TILE; x += 2) {
    const d = 22 + Math.sin(x * 0.21) * 4 + r() * 12;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, d, 2, 3);
    g.fillStyle = css(c, 0.82 + r() * 0.3); g.fillRect(x, 0, 2, d);
  }
  grassBlades(g, r, c, 6, 36, 260);
  g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, 0, TILE, 2.5);
  bevel(g, 2, 0.06, 0.24);
}
function grassTop(g, r, c) {
  g.fillStyle = css(c); g.fillRect(0, 0, TILE, TILE);
  blotch(g, r, 26, c, 0.2, 22);
  grassBlades(g, r, c, 0, TILE + 6, 1300);
  for (let i = 0; i < 26; i += 1) { g.fillStyle = `rgba(255,255,210,${0.3 + r() * 0.3})`; g.fillRect(r() * TILE, r() * TILE, 1.4, 1.4); }
  bevel(g, 2, 0.1, 0.2);
}

function sand(g, r, c) {
  g.fillStyle = css(c); g.fillRect(0, 0, TILE, TILE);
  blotch(g, r, 18, c, 0.1, 30);
  // 風の あと：ゆるい なみの すじ。
  for (let i = 0; i < 7; i += 1) {
    const y = 8 + i * 18 + r() * 6, ph = r() * 6;
    for (const [dy, col] of [[0, css(c, 0.8, 0.3)], [2, css(c, 1.18, 0.4)]]) {
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      for (let x = 0; x <= TILE; x += 8) { const py = y + dy + Math.sin(x * 0.07 + ph) * 3; if (x) g.lineTo(x, py); else g.moveTo(x, py); }
      g.stroke();
    }
  }
  speckle(g, r, 1500, c, 0.5, 1.1, 0.55);
  for (let i = 0; i < 40; i += 1) { g.fillStyle = css(0x8a7350, 1, 0.45); g.fillRect(r() * TILE, r() * TILE, 1.2, 1.2); }
  for (let i = 0; i < 22; i += 1) { g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(r() * TILE, r() * TILE, 1, 1); }
  bevel(g, 3, 0.16, 0.2);
}

function snow(g, r, c, top) {
  const gr = g.createLinearGradient(0, 0, 0, TILE);
  gr.addColorStop(0, css(c, 1.05)); gr.addColorStop(1, css(mix(c, 0xb9d3ea, top ? 0.12 : 0.42)));
  g.fillStyle = gr; g.fillRect(0, 0, TILE, TILE);
  // ふんわりした くぼみ（青い かげ）と ふくらみ（白）。
  for (let i = 0; i < 22; i += 1) {
    const x = r() * TILE, y = r() * TILE, rad = 8 + r() * 20, blue = r() < 0.55;
    const s = g.createRadialGradient(x, y, 0, x, y, rad);
    s.addColorStop(0, blue ? 'rgba(150,185,225,.26)' : 'rgba(255,255,255,.7)'); s.addColorStop(1, blue ? 'rgba(150,185,225,0)' : 'rgba(255,255,255,0)');
    g.fillStyle = s; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // きらきら。
  for (let i = 0; i < 70; i += 1) { g.fillStyle = `rgba(255,255,255,${0.6 + r() * 0.4})`; g.fillRect(r() * TILE, r() * TILE, 1.2, 1.2); }
  for (let i = 0; i < 7; i += 1) { const x = r() * TILE, y = r() * TILE; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.moveTo(x, y - 3); g.lineTo(x, y + 3); g.stroke(); }
  for (let i = 0; i < 50; i += 1) { g.fillStyle = 'rgba(120,160,205,.3)'; g.fillRect(r() * TILE, r() * TILE, 1.3, 1.3); }
  bevel(g, 3, 0.3, 0.12);
}

function lamp(g, r, c, top) {
  const iron = 0x4a3a28;
  g.fillStyle = css(iron); g.fillRect(0, 0, TILE, TILE);
  speckle(g, r, 240, iron, 0.6, 1.5, 0.5);
  // 光る ガラス：まんなかが 白く、ふちへ オレンジ。
  const m = 13, s = TILE - m * 2;
  const gl = g.createRadialGradient(TILE / 2, TILE / 2, 2, TILE / 2, TILE / 2, s * 0.74);
  gl.addColorStop(0, '#fffdf0'); gl.addColorStop(0.3, css(mix(c, 0xffffff, 0.45))); gl.addColorStop(0.7, css(c)); gl.addColorStop(1, css(mix(c, 0xe0762a, 0.6)));
  g.fillStyle = gl; g.fillRect(m, m, s, s);
  // 和紙の すじ。
  for (let i = 0; i < 12; i += 1) { g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.1})`; g.fillRect(m, m + r() * s, s, 1); }
  // さん（こうし）。
  g.fillStyle = css(iron);
  if (top) { g.beginPath(); g.arc(TILE / 2, TILE / 2, 15, 0, Math.PI * 2); g.fill(); g.fillStyle = css(iron, 1.6); g.beginPath(); g.arc(TILE / 2 - 2, TILE / 2 - 2, 7, 0, Math.PI * 2); g.fill(); } else { g.fillRect(TILE / 2 - 2.5, m, 5, s); g.fillRect(m, TILE / 2 - 2.5, s, 5); }
  // わくの つや と びょう。
  g.strokeStyle = css(iron, 1.7, 0.8); g.lineWidth = 1.4; g.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.6; g.strokeRect(m - 1, m - 1, s + 2, s + 2);
  for (const [x, y] of [[6.5, 6.5], [TILE - 6.5, 6.5], [6.5, TILE - 6.5], [TILE - 6.5, TILE - 6.5]]) { g.fillStyle = css(iron, 2); g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x + 0.7, y + 0.7, 1.4, 0, Math.PI * 2); g.fill(); }
}

function flower(g, r, c) {
  const leaf = 0x4f8f3e;
  g.fillStyle = css(leaf, 0.72); g.fillRect(0, 0, TILE, TILE);
  // はっぱ：ななめの だ円を たくさん。
  for (let i = 0; i < 150; i += 1) {
    const x = r() * TILE, y = r() * TILE, a = r() * Math.PI;
    g.fillStyle = css(mix(leaf, r() < 0.5 ? 0x2c6a2c : 0x9fd06a, r() * 0.5), 0.8 + r() * 0.4); g.beginPath(); g.ellipse(x, y, 5 + r() * 4, 2 + r() * 1.6, a, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.14)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke();
  }
  // はな：5 まいの 花びらと 黄色い しん。色は その ブロックの 色。
  for (let i = 0; i < 17; i += 1) {
    const x = 9 + r() * (TILE - 18), y = 9 + r() * (TILE - 18), rad = 5.5 + r() * 4, rot = r() * 6;
    const pc = mix(c, 0xffffff, r() * 0.4);
    g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(x + 1.5, y + 2, rad * 1.25, 0, Math.PI * 2); g.fill();
    for (let p = 0; p < 5; p += 1) { const a = rot + p * Math.PI * 2 / 5; g.fillStyle = css(pc, p % 2 ? 0.94 : 1.06); g.beginPath(); g.ellipse(x + Math.cos(a) * rad * 0.62, y + Math.sin(a) * rad * 0.62, rad * 0.62, rad * 0.46, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffd84a'; g.beginPath(); g.arc(x, y, rad * 0.34, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(180,110,20,.6)'; g.beginPath(); g.arc(x + 0.6, y + 0.6, rad * 0.16, 0, Math.PI * 2); g.fill();
  }
  bevel(g, 2, 0.1, 0.22);
}

function water(g, r, c, top) {
  g.clearRect(0, 0, TILE, TILE);
  const gr = g.createLinearGradient(0, 0, 0, TILE);
  gr.addColorStop(0, css(mix(c, 0xffffff, 0.18), 1, 0.8)); gr.addColorStop(1, css(c, top ? 0.92 : 0.62, 0.86));
  g.fillStyle = gr; g.fillRect(0, 0, TILE, TILE);
  // 光の あみ：うねる 明るい 線を 2 むきに。
  for (let i = 0; i < (top ? 9 : 6); i += 1) {
    const y = r() * TILE, ph = r() * 6, amp = 4 + r() * 5;
    g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.28})`; g.lineWidth = 1 + r() * 1.6; g.beginPath();
    for (let x = -4; x <= TILE + 4; x += 6) { const py = y + Math.sin(x * 0.09 + ph) * amp + Math.sin(x * 0.03 + ph * 2) * 5; if (x > -4) g.lineTo(x, py); else g.moveTo(x, py); }
    g.stroke();
  }
  for (let i = 0; i < 5; i += 1) { g.strokeStyle = css(c, 0.5, 0.3); g.lineWidth = 1.4; const y = r() * TILE, ph = r() * 6; g.beginPath(); for (let x = 0; x <= TILE; x += 6) { const py = y + Math.sin(x * 0.08 + ph) * 5; if (x) g.lineTo(x, py); else g.moveTo(x, py); } g.stroke(); }
  for (let i = 0; i < 16; i += 1) { g.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.4})`; g.beginPath(); g.ellipse(r() * TILE, r() * TILE, 1 + r() * 2.2, 0.8, 0, 0, Math.PI * 2); g.fill(); }
  if (!top) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, 0, TILE, 2.5); }
}

// 知らない ブロック：色の 面に ざらつきと 面とり だけ。
function plain(g, r, c) {
  g.fillStyle = css(c); g.fillRect(0, 0, TILE, TILE);
  blotch(g, r, 16, c, 0.12);
  speckle(g, r, 500, c, 0.4, 1.6, 0.4);
  bevel(g);
}

const PAINT = {
  wood: [wood, wood], stone: [stone, stone], brick: [brick, brick], glass: [glass, glass],
  grass: [grassSide, grassTop], sand: [sand, sand],
  snow: [(g, r, c) => snow(g, r, c, false), (g, r, c) => snow(g, r, c, true)],
  lamp: [(g, r, c) => lamp(g, r, c, false), (g, r, c) => lamp(g, r, c, true)],
  flower: [flower, flower],
  water: [(g, r, c) => water(g, r, c, false), (g, r, c) => water(g, r, c, true)],
};

const cache = new Map();

// その ブロックの 絵（canvas・256×128）。かけない ときは null。
export function blockTexture(id, colour) {
  const c = Number(colour) || 0xaaaaaa;
  const key = `${id}:${c}`;
  if (cache.has(key)) return cache.get(key);
  let cv = null;
  try {
    cv = document.createElement('canvas');
    cv.width = TILE * 2; cv.height = TILE;
    const g = cv.getContext('2d');
    const [side, top] = PAINT[id] || [plain, plain];
    [side, top].forEach((paint, i) => {
      g.save(); g.beginPath(); g.rect(i * TILE, 0, TILE, TILE); g.clip(); g.translate(i * TILE, 0);
      paint(g, rng(c + 17 + i * 101 + String(id).length * 7), c);
      g.restore();
    });
  } catch { cv = null; }
  cache.set(key, cv);
  return cv;
}
