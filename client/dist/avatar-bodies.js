// きせかえ島で 買える すがた（アバター）。
//
// はじめに えらべる 8人（avatars.js）とは べつの、コインで 買う 体。作りは 同じ「箱の つみ木」で、
// 足・うで は 同じ 場所に 同じ 順（limbs[0..1]=足、[2..3]=うで）で 作るので、歩く うごきも
// ぼうし・めがね・かばん・バッジ（anchors）も そのまま 使える。
// three だけに たよる：サーバーの 検査（wardrobe.test.mjs）からも 読める。
import * as THREE from './three.module.js';

const geometry = new THREE.BoxGeometry();
const materials = new Map();
const material = (c, glow = 0) => {
  const k = `${c}:${glow}`;
  if (!materials.has(k)) materials.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: glow ? 0.35 : 0.7, emissive: glow ? c : 0x000000, emissiveIntensity: glow }));
  return materials.get(k);
};

// 名前・色は wardrobe.json（店の 札と ねだん）。ここは 形だけ。
export const PREMIUM_AVATARS = ['av-cat', 'av-panda', 'av-ninja', 'av-princess', 'av-hero', 'av-knight', 'av-dragon', 'av-unicorn'];
const IS = new Set(PREMIUM_AVATARS);
export const isPremiumAvatar = (id) => IS.has(id);

const GOLD = 0xffd447; const WHITE = 0xfbfbf7; const INK = 0x24272d; const RED = 0xd8323c;

// 体の もと：色を うけとって 足・どう・うで・あたま・目を 作り、かざりを のせる 道具を 返す。
function base(g, { body, arm = body, hand, head, legs, shoes, eyes = INK, mouth = 0x9b655a, face = true }) {
  const b = (x, y, z, w, h, d, c, parent = g, glow = 0) => {
    const m = new THREE.Mesh(geometry, material(c, glow));
    m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const limbs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.23, 0.91, 0); g.add(leg);
    b(0, -0.34, 0, 0.34, 0.72, 0.43, legs, leg); b(0, -0.75, 0.07, 0.39, 0.2, 0.57, shoes, leg); limbs.push(leg);
  }
  b(0, 1.29, 0, 0.94, 0.81, 0.54, body);
  for (const side of [-1, 1]) {
    const armG = new THREE.Group(); armG.position.set(side * 0.6, 1.57, 0); g.add(armG);
    b(0, -0.2, 0, 0.27, 0.5, 0.38, arm, armG); b(0, -0.53, 0.015, 0.25, 0.2, 0.34, hand, armG); limbs.push(armG);
  }
  b(0, 1.98, 0, 0.75, 0.66, 0.67, head);
  if (face) {
    b(-0.17, 2.03, 0.346, 0.075, 0.08, 0.028, eyes); b(0.17, 2.03, 0.346, 0.075, 0.08, 0.028, eyes);
    if (mouth !== null) b(0, 1.83, 0.35, 0.17, 0.045, 0.025, mouth);
  }
  return { b, limbs, legL: limbs[0], legR: limbs[1], armL: limbs[2], armR: limbs[3] };
}

const BODIES = {
  // ねこ：オレンジの とら。耳・ひげ・しっぽ・すずの 首わ。
  'av-cat'(g) {
    const O = 0xf2983a; const D = 0xc96f1f; const C = 0xfff3dd; const P = 0xf5a3b5;
    const { b, limbs, legL, legR } = base(g, { body: O, hand: C, head: O, legs: O, shoes: C, mouth: null });
    for (const s of [-1, 1]) { b(s * 0.27, 2.42, -0.02, 0.22, 0.24, 0.16, O); b(s * 0.27, 2.41, 0.065, 0.12, 0.14, 0.02, P); }
    b(0, 1.86, 0.345, 0.36, 0.2, 0.03, C); b(0, 1.93, 0.365, 0.09, 0.055, 0.02, P); b(0, 1.84, 0.365, 0.03, 0.09, 0.015, D);
    for (const s of [-1, 1]) for (const dy of [0.03, -0.04]) b(s * 0.34, 1.87 + dy, 0.35, 0.2, 0.018, 0.012, WHITE);
    for (const x of [-0.2, 0, 0.2]) b(x, 2.32, 0.02, 0.09, 0.03, 0.5, D);
    for (const y of [1.5, 1.3, 1.1]) b(0, y, -0.275, 0.7, 0.07, 0.02, D);
    b(0, 1.24, 0.275, 0.52, 0.56, 0.02, C);
    b(0, 1.64, 0, 0.8, 0.09, 0.7, RED); b(0, 1.57, 0.36, 0.12, 0.12, 0.08, GOLD, g, 0.25);
    b(0, 1.0, -0.36, 0.15, 0.15, 0.3, O); b(0, 1.28, -0.52, 0.15, 0.6, 0.15, O); b(0, 1.62, -0.52, 0.16, 0.14, 0.16, C);
    for (const leg of [legL, legR]) b(0, -0.2, 0.22, 0.3, 0.07, 0.02, D, leg);
    return limbs;
  },
  // パンダ：白い 体に 黒い 手足、目の まわり、ささの は。
  'av-panda'(g) {
    const W = 0xf7f7f2; const K = 0x25272c; const G = 0x6fb650;
    const { b, limbs, armR } = base(g, { body: W, arm: K, hand: K, head: W, legs: K, shoes: K, eyes: K, mouth: null, face: false });
    for (const s of [-1, 1]) {
      b(s * 0.3, 2.4, -0.02, 0.26, 0.22, 0.18, K);
      b(s * 0.18, 2.02, 0.34, 0.22, 0.24, 0.02, K); b(s * 0.17, 2.04, 0.355, 0.08, 0.09, 0.02, WHITE); b(s * 0.165, 2.035, 0.368, 0.04, 0.05, 0.01, K);
    }
    b(0, 1.86, 0.345, 0.3, 0.18, 0.03, WHITE); b(0, 1.91, 0.365, 0.12, 0.07, 0.02, K); b(0, 1.82, 0.365, 0.14, 0.025, 0.015, K);
    b(0, 1.56, 0, 0.96, 0.24, 0.56, K);
    b(0, 1.2, 0.275, 0.5, 0.42, 0.02, 0xffffff);
    b(0, 0.98, -0.3, 0.2, 0.18, 0.12, K);
    b(0, -0.45, 0.24, 0.06, 0.62, 0.06, G, armR); b(0.1, -0.2, 0.24, 0.2, 0.07, 0.03, 0x4f9a3a, armR); b(-0.1, -0.36, 0.24, 0.2, 0.07, 0.03, 0x4f9a3a, armR);
    return limbs;
  },
  // にんじゃ：目だけ 出る ずきん、赤い はちまき、せなかの かたな。
  'av-ninja'(g) {
    const N = 0x23262f; const N2 = 0x15171d; const S = 0xe0b48c; const ST = 0xc3cad4;
    const { b, limbs, legL, legR, armL, armR } = base(g, { body: N, hand: N2, head: S, legs: N2, shoes: 0x0f1014, mouth: null });
    b(0, 2.27, 0, 0.8, 0.16, 0.72, N); b(0, 1.8, 0.005, 0.8, 0.3, 0.7, N);
    for (const s of [-1, 1]) b(s * 0.385, 2.07, 0, 0.05, 0.26, 0.72, N);
    b(0, 2.07, -0.335, 0.8, 0.26, 0.05, N);
    b(0, 2.2, 0, 0.82, 0.075, 0.74, RED); b(0.22, 2.08, -0.42, 0.11, 0.34, 0.04, RED); b(0.36, 1.98, -0.45, 0.11, 0.34, 0.04, RED);
    b(0, 1.0, 0, 0.97, 0.12, 0.57, RED); b(0.2, 0.9, 0.29, 0.12, 0.26, 0.03, RED);
    b(0, 1.42, 0.275, 0.5, 0.05, 0.02, N2); b(0, 1.32, 0.275, 0.5, 0.05, 0.02, N2);
    const cross = (x, y) => { b(x, y, 0.285, 0.2, 0.06, 0.02, ST); b(x, y, 0.285, 0.06, 0.2, 0.02, ST); };
    cross(-0.22, 1.54);
    const sword = new THREE.Group(); sword.position.set(0, 1.5, -0.34); sword.rotation.z = 0.62; g.add(sword);
    b(0, 0, 0, 0.09, 1.25, 0.06, 0x3a3f4a, sword); b(0, 0.66, 0, 0.26, 0.06, 0.1, GOLD, sword); b(0, 0.84, 0, 0.08, 0.3, 0.07, RED, sword);
    for (const leg of [legL, legR]) { b(0, -0.5, 0, 0.36, 0.06, 0.45, RED, leg); b(0, -0.6, 0, 0.36, 0.06, 0.45, RED, leg); }
    for (const a of [armL, armR]) b(0, -0.38, 0, 0.29, 0.08, 0.4, RED, a);
    return limbs;
  },
  // ひめ：3だんの ドレス、金の かみ、かんむり。
  'av-princess'(g) {
    const P = 0xf07fae; const P2 = 0xf8a9c9; const P3 = 0xfdd0e1; const H = 0xf4c552; const S = 0xf6d2b4;
    const { b, limbs, armL, armR } = base(g, { body: P, arm: S, hand: S, head: S, legs: WHITE, shoes: 0xe55d93, mouth: 0xd9566f });
    b(0, 0.98, 0, 1.06, 0.3, 0.68, P); b(0, 0.74, 0, 1.22, 0.3, 0.82, P2); b(0, 0.5, 0, 1.36, 0.24, 0.94, P3);
    b(0, 0.39, 0, 1.4, 0.05, 0.98, WHITE);
    for (const x of [-0.42, -0.14, 0.14, 0.42]) b(x, 0.62, 0.42, 0.1, 0.1, 0.02, GOLD, g, 0.2);
    b(0, 1.12, 0, 0.98, 0.1, 0.58, GOLD); b(0, 1.12, 0.3, 0.16, 0.16, 0.04, 0x58c4f0, g, 0.3);
    b(0, 1.64, 0.28, 0.34, 0.05, 0.02, GOLD); b(0, 1.57, 0.285, 0.09, 0.09, 0.02, 0x58c4f0, g, 0.3);
    for (const a of [armL, armR]) b(0, -0.02, 0, 0.38, 0.3, 0.48, P3, a);
    b(0, 2.32, 0, 0.83, 0.18, 0.75, H); b(0, 1.62, -0.33, 0.86, 1.3, 0.2, H); b(0, 2.2, 0.3, 0.62, 0.11, 0.1, H);
    for (const s of [-1, 1]) { b(s * 0.4, 1.86, -0.04, 0.15, 0.82, 0.52, H); b(s * 0.25, 1.9, 0.342, 0.1, 0.06, 0.015, 0xf3a0a8); }
    b(0, 2.46, 0, 0.5, 0.1, 0.5, GOLD, g, 0.25);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0.2]]) b(x, 2.57, z, 0.1, x === 0 ? 0.2 : 0.13, 0.1, GOLD, g, 0.25);
    b(0, 2.47, 0.26, 0.1, 0.09, 0.03, 0xe5466b, g, 0.3);
    return limbs;
  },
  // ヒーロー：赤い マントと ブーツ、マスク、むねの 星。
  'av-hero'(g) {
    const B = 0x2c6fe0; const B2 = 0x1f4fa8; const S = 0xe6b68e; const H = 0x4a3326;
    const { b, limbs, legL, legR, armL, armR } = base(g, { body: B, hand: RED, head: S, legs: B2, shoes: RED });
    b(0, 2.04, 0.342, 0.77, 0.17, 0.02, 0x1b2f6b);
    for (const s of [-1, 1]) { b(s * 0.17, 2.04, 0.355, 0.12, 0.085, 0.02, 0xffffff); b(s * 0.17, 2.04, 0.368, 0.05, 0.06, 0.01, INK); }
    b(0, 2.32, 0, 0.83, 0.18, 0.75, H); b(0, 2.2, -0.3, 0.83, 0.25, 0.2, H); b(0.16, 2.3, 0.3, 0.46, 0.16, 0.16, H); b(0.3, 2.42, 0.22, 0.2, 0.12, 0.2, H);
    b(0, 1.04, 0, 0.97, 0.12, 0.57, GOLD); b(0, 1.04, 0.29, 0.2, 0.16, 0.03, RED);
    b(0, 1.4, 0.275, 0.4, 0.4, 0.02, GOLD, g, 0.2); b(0.05, 1.48, 0.288, 0.14, 0.14, 0.02, RED); b(0, 1.4, 0.288, 0.2, 0.07, 0.02, RED); b(-0.05, 1.32, 0.288, 0.14, 0.14, 0.02, RED); // いなずま
    b(0, 1.66, -0.02, 1.0, 0.1, 0.6, RED); b(0, 1.12, -0.33, 0.9, 1.1, 0.06, RED); b(0, 0.5, -0.36, 0.98, 0.2, 0.06, 0xb82731);
    for (const leg of [legL, legR]) b(0, -0.56, 0, 0.37, 0.07, 0.46, GOLD, leg);
    for (const a of [armL, armR]) b(0, -0.4, 0, 0.3, 0.08, 0.41, GOLD, a);
    return limbs;
  },
  // きし：ぎんの よろい、かぶとの 赤い はね、青い マント。
  'av-knight'(g) {
    const A = 0xbfc8d2; const A2 = 0x8792a0; const S = 0xe6b68e; const C = 0x2f5fb3;
    const { b, limbs, legL, legR, armL, armR } = base(g, { body: A, arm: A2, hand: A, head: S, legs: A2, shoes: 0x5d6875 });
    b(0, 2.3, 0, 0.84, 0.2, 0.76, A); b(0, 2.0, -0.335, 0.82, 0.62, 0.08, A);
    for (const s of [-1, 1]) b(s * 0.4, 2.0, 0, 0.08, 0.62, 0.74, A);
    b(0, 2.17, 0.345, 0.78, 0.08, 0.03, A); b(0, 1.9, 0.345, 0.78, 0.07, 0.03, A); b(0, 1.74, 0.3, 0.5, 0.12, 0.12, A2);
    b(0, 2.04, 0.36, 0.06, 0.34, 0.03, A2);
    b(0, 2.44, 0, 0.1, 0.1, 0.7, GOLD); b(0, 2.6, -0.08, 0.12, 0.3, 0.5, RED); b(0, 2.52, 0.2, 0.12, 0.16, 0.16, RED);
    b(0, 1.55, 0.275, 0.7, 0.26, 0.03, 0xd6dde5); b(0, 1.34, 0.285, 0.3, 0.34, 0.03, C); b(0, 1.34, 0.297, 0.1, 0.34, 0.02, GOLD); b(0, 1.15, 0.285, 0.18, 0.08, 0.03, C); // たての もよう
    b(0, 1.0, 0, 0.97, 0.12, 0.57, 0x6b4a2b); b(0, 1.0, 0.29, 0.16, 0.14, 0.03, GOLD, g, 0.2);
    for (const a of [armL, armR]) { b(0, 0.08, 0, 0.42, 0.2, 0.52, A, a); b(0, -0.03, 0, 0.44, 0.05, 0.54, GOLD, a); b(0, -0.5, 0.015, 0.3, 0.26, 0.4, A, a); }
    for (const leg of [legL, legR]) { b(0, -0.3, 0.2, 0.26, 0.2, 0.06, A, leg); b(0, -0.62, 0, 0.37, 0.07, 0.46, A, leg); }
    b(0, 1.66, -0.04, 0.98, 0.08, 0.58, C); b(0, 1.14, -0.33, 0.86, 1.02, 0.06, C); b(0, 0.66, -0.335, 0.86, 0.08, 0.06, GOLD);
    return limbs;
  },
  // ドラゴン：つの・はな先・せびれ・つばさ・しっぽ。
  'av-dragon'(g) {
    const G = 0x4fb35a; const G2 = 0x3a8f45; const Y = 0xf6e3a0; const F = 0xf08a3c;
    const { b, limbs, legL, legR, armL, armR } = base(g, { body: G, hand: G2, head: G, legs: G, shoes: G2, eyes: INK, mouth: null, face: false });
    for (const s of [-1, 1]) {
      b(s * 0.2, 2.06, 0.34, 0.16, 0.16, 0.02, 0xffe86b, g, 0.25); b(s * 0.2, 2.06, 0.353, 0.05, 0.13, 0.015, INK);
      b(s * 0.25, 2.44, -0.08, 0.13, 0.26, 0.13, Y); b(s * 0.25, 2.6, -0.12, 0.09, 0.14, 0.09, Y);
      b(s * 0.1, 1.97, 0.5, 0.05, 0.05, 0.02, INK); b(s * 0.14, 1.79, 0.47, 0.06, 0.08, 0.03, WHITE);
    }
    b(0, 1.9, 0.41, 0.46, 0.28, 0.18, 0x66c871); b(0, 1.8, 0.4, 0.4, 0.04, 0.17, 0x2c6e36);
    for (let i = 0; i < 6; i += 1) b(0, 2.38 - i * 0.24, -0.36 + (i === 0 ? 0.1 : 0), 0.1, 0.17, 0.16, F);
    b(0, 1.24, 0.275, 0.56, 0.62, 0.02, Y); for (const y of [1.44, 1.26, 1.08]) b(0, y, 0.287, 0.56, 0.02, 0.01, 0xe2c773);
    b(0, 0.98, -0.42, 0.32, 0.3, 0.4, G); b(0, 0.82, -0.74, 0.24, 0.22, 0.36, G); b(0, 0.72, -1.0, 0.16, 0.16, 0.26, G); b(0, 0.74, -1.16, 0.2, 0.22, 0.12, F);
    for (const s of [-1, 1]) {
      const wing = new THREE.Group(); wing.position.set(s * 0.3, 1.55, -0.33); wing.rotation.y = s * -0.35; g.add(wing);
      b(s * 0.3, 0.1, 0, 0.6, 0.08, 0.07, G2, wing); b(s * 0.28, -0.14, 0, 0.5, 0.42, 0.04, F, wing); b(s * 0.66, -0.02, 0, 0.3, 0.5, 0.04, F, wing); b(s * 0.86, 0.18, 0, 0.14, 0.3, 0.04, F, wing);
    }
    for (const leg of [legL, legR]) for (const x of [-0.12, 0, 0.12]) b(x, -0.8, 0.37, 0.07, 0.08, 0.06, Y, leg);
    for (const a of [armL, armR]) for (const x of [-0.08, 0.08]) b(x, -0.65, 0.05, 0.06, 0.07, 0.06, Y, a);
    return limbs;
  },
  // ユニコーン：金の つの、にじの たてがみと しっぽ、むねの 星。
  'av-unicorn'(g) {
    const W = 0xfdfcff; const L = 0xb9a1ec; const P = 0xffc6dc; const RAINBOW = [0xff6b7d, 0xffa24a, 0xffe066, 0x6fd58a, 0x5fb8f5, 0xb48cf2];
    const { b, limbs, legL, legR } = base(g, { body: W, hand: L, head: W, legs: W, shoes: L, eyes: 0x4a3a7a, mouth: null });
    b(0, 2.43, 0.2, 0.15, 0.14, 0.15, GOLD, g, 0.3); b(0, 2.57, 0.2, 0.11, 0.14, 0.11, GOLD, g, 0.3); b(0, 2.7, 0.2, 0.07, 0.13, 0.07, GOLD, g, 0.3);
    for (const s of [-1, 1]) { b(s * 0.31, 2.4, -0.02, 0.15, 0.22, 0.11, W); b(s * 0.31, 2.39, 0.04, 0.08, 0.13, 0.02, P); b(s * 0.26, 1.92, 0.342, 0.11, 0.06, 0.015, P); b(s * 0.17, 2.1, 0.346, 0.1, 0.02, 0.02, 0x4a3a7a); }
    b(0, 1.84, 0.37, 0.42, 0.22, 0.08, P); for (const s of [-1, 1]) b(s * 0.09, 1.86, 0.415, 0.04, 0.04, 0.015, 0xd98aa8);
    RAINBOW.forEach((c, i) => { b(0, 2.37 - i * 0.03, 0.02 - i * 0.07, 0.24, 0.12, 0.14, c); b(0, 2.2 - i * 0.2, -0.38, 0.3 - i * 0.02, 0.2, 0.14, c); });
    RAINBOW.forEach((c, i) => b((i - 2.5) * 0.045, 0.96 - i * 0.07, -0.34 - i * 0.05, 0.1, 0.34, 0.1, c));
    b(0, 1.4, 0.275, 0.3, 0.1, 0.02, GOLD, g, 0.25); b(0, 1.4, 0.275, 0.1, 0.3, 0.02, GOLD, g, 0.25); b(0, 1.4, 0.283, 0.18, 0.18, 0.02, GOLD, g, 0.25);
    b(0, 1.64, 0, 0.82, 0.07, 0.7, L);
    for (const leg of [legL, legR]) b(0, -0.6, 0, 0.36, 0.06, 0.45, GOLD, leg, 0.2);
    return limbs;
  },
};

// ── ふやした すがた（2026-11：「もっと レパートリー 爆増」）。1 体ずつ 手で 書かず、**とくちょうの 表**（SPECS）から 組み立てる。
// 耳・はな・たてがみ・しま・しっぽ・つの・はね・ぼうし・マント・ひげ…を 表に 書けば 体に なる。足す ときは 表に 1 行＋wardrobe.json に 1 行。
const SPECS = {
  'av-dog': { body: 0xc99a5b, head: 0xc99a5b, hand: 0xfff3dd, legs: 0xc99a5b, shoes: 0xfff3dd, ears: ['flop',0x8a5a2e], snout: 0xfff3dd, nose: 0x24272d, tail: ['thin',0xc99a5b], collar: 0x3f6fd0, belly: 0xfff3dd },
  'av-pig': { body: 0xf7a8b8, head: 0xf7a8b8, hand: 0xf28aa0, legs: 0xf7a8b8, shoes: 0xd96a86, ears: ['point',0xf28aa0], snout: 0xf28aa0, nose: 0xd96a86, tail: ['curl',0xf28aa0] },
  'av-koala': { body: 0x9aa3ad, head: 0x9aa3ad, hand: 0x7d8791, legs: 0x9aa3ad, shoes: 0x7d8791, ears: ['big',0x7d8791,0xf2f2f2], nose: 0x24272d, belly: 0xe8ecef },
  'av-monkey': { body: 0x8a5a2e, head: 0x8a5a2e, hand: 0xe8c39a, legs: 0x8a5a2e, shoes: 0xe8c39a, ears: ['round',0xe8c39a], snout: 0xe8c39a, tail: ['curl',0x8a5a2e], belly: 0xe8c39a },
  'av-cow': { body: 0xfbfbf7, head: 0xfbfbf7, hand: 0x24272d, legs: 0xfbfbf7, shoes: 0x24272d, ears: ['flop',0x24272d], snout: 0xf7a8b8, horns: 0xe6d3a8, spots: 0x24272d, tail: ['thin',0x24272d], collar: 0xd8323c },
  'av-tiger': { body: 0xf28a2e, head: 0xf28a2e, hand: 0xfff3dd, legs: 0xf28a2e, shoes: 0xfff3dd, ears: ['round',0xf28a2e,0xfff3dd], snout: 0xfff3dd, nose: 0xd96a86, stripes: 0x24272d, tail: ['thin',0xf28a2e], belly: 0xfff3dd },
  'av-bee': { body: 0xffd447, head: 0xffd447, hand: 0x24272d, legs: 0x24272d, shoes: 0x24272d, stripes: 0x24272d, antenna: 0x24272d, wings: 0xdff4ff },
  'av-owl': { body: 0x8d6e4a, head: 0x8d6e4a, hand: 0x6f5536, legs: 0xe6a03c, shoes: 0xe6a03c, ears: ['point',0x6f5536], bigeyes: 0xfff3dd, beak: 0xe6a03c, belly: 0xe6d3a8, wings: 0x6f5536 },
  'av-lion': { body: 0xe6b04a, head: 0xe6b04a, hand: 0xfff3dd, legs: 0xe6b04a, shoes: 0xfff3dd, ears: ['round',0xe6b04a], snout: 0xfff3dd, nose: 0x8a5a2e, mane: 0xb86a1e, tail: ['thin',0xe6b04a], belly: 0xfff3dd },
  'av-chef': { body: 0xfbfbf7, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x3a3f4a, shoes: 0x24272d, hat: ['chef',0xfbfbf7], buttons: 0x24272d, scarf: 0xd8323c, hair: 0x4a3426 },
  'av-pirate': { body: 0xb8323c, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x24272d, shoes: 0x4a3426, hat: ['pirate',0x24272d], eyepatch: 1, belt: 0xffd447, beard: 0x24272d, stripes: 0xfbfbf7 },
  'av-police': { body: 0x2c4a8a, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x1f3566, shoes: 0x24272d, hat: ['cap',0x1f3566,0xffd447], emblem: 0xffd447, belt: 0x24272d, hair: 0x24272d },
  'av-fire': { body: 0xd8323c, head: 0xe6b68e, hand: 0xffd447, legs: 0x24272d, shoes: 0x24272d, hat: ['helmet',0xd8323c,0xffd447], bands: 0xffd447, belt: 0x24272d },
  'av-doctor': { body: 0xfbfbf7, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x5aa6a0, shoes: 0xfbfbf7, hair: 0x4a3426, emblem: 0xd8323c, scarf: 0x5aa6a0, glasses: 1 },
  'av-cowboy': { body: 0xb8703a, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x2c4a8a, shoes: 0x6a4326, hat: ['cowboy',0x8a5a2e], scarf: 0xd8323c, belt: 0xffd447, emblem: 0xffd447 },
  'av-wizard': { body: 0x5a3a9a, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x3a2670, shoes: 0x24272d, hat: ['wizard',0x5a3a9a,0xffd447], beard: 0xfbfbf7, belt: 0xffd447, cape: 0x3a2670, stars: 0xffd447 },
  'av-astro': { body: 0xf2f4f7, head: 0xe6b68e, hand: 0xf2f4f7, legs: 0xf2f4f7, shoes: 0xc8ced6, hat: ['bubble',0xf2f4f7,0x7ec8ff], emblem: 0x2c6fe0, bands: 0xe27a2d, pack: 0xc8ced6 },
  'av-samurai': { body: 0x8a1f2a, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x24272d, shoes: 0x24272d, hat: ['kabuto',0x24272d,0xffd447], bands: 0xffd447, belt: 0xffd447, sword: 0xc8ced6 },
  'av-robot': { body: 0x8fa3b8, head: 0xb8c8d8, hand: 0x5a6a7a, legs: 0x5a6a7a, shoes: 0x3a4654, antenna: 0xd8323c, visor: 0x7df9ff, emblem: 0x7df9ff, bands: 0x3a4654, nomouth: 1, noeyes: 1 },
  'av-alien': { body: 0x7a3fd0, head: 0x7fe07a, hand: 0x7fe07a, legs: 0x5a2ea0, shoes: 0x3a1f70, antenna: 0x7fe07a, bigeyes: 0x24272d, emblem: 0xffd447, nomouth: 1 },
  'av-ghost': { body: 0xf4f6fb, head: 0xf4f6fb, hand: 0xf4f6fb, legs: 0xf4f6fb, shoes: 0xdfe4ee, cheeks: 0xf7a8b8, tatters: 0xf4f6fb, glow: 0.25 },
  'av-mummy': { body: 0xe8e0c8, head: 0xe8e0c8, hand: 0xe8e0c8, legs: 0xe8e0c8, shoes: 0xcfc5a8, wraps: 0xb8ad8a, eyes: 0xffd447 },
  'av-vampire': { body: 0x24272d, head: 0xe8e0ea, hand: 0xe8e0ea, legs: 0x24272d, shoes: 0x24272d, hair: 0x24272d, cape: 0x8a1f2a, collarUp: 0x8a1f2a, emblem: 0xd8323c, fangs: 1 },
  'av-fairy': { body: 0x8fe0b0, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x5fc08a, shoes: 0xf7a8b8, hair: 0xffd447, wings: 0xfff0ff, halo: 0xf7a8b8, stars: 0xffffff, skirt: 0x5fc08a },
  'av-angel': { body: 0xfbfbf7, head: 0xe6b68e, hand: 0xe6b68e, legs: 0xfbfbf7, shoes: 0xffd447, hair: 0xffe08a, wings: 0xffffff, halo: 0xffd447, belt: 0xffd447, skirt: 0xfbfbf7 },
  'av-devil': { body: 0xb81f2f, head: 0xd8323c, hand: 0xd8323c, legs: 0x8a1220, shoes: 0x24272d, horns: 0x24272d, tail: ['arrow',0x8a1220], wings: 0x5a0f18, emblem: 0xffd447 },
  'av-king': { body: 0x7a2ea0, head: 0xe6b68e, hand: 0xe6b68e, legs: 0x24272d, shoes: 0x24272d, hat: ['crown',0xffd447,0xd8323c], beard: 0xfbfbf7, cape: 0xd8323c, fur: 0xfbfbf7, belt: 0xffd447, emblem: 0xffd447 },
  'av-santa': { body: 0xd8323c, head: 0xe6b68e, hand: 0xfbfbf7, legs: 0xd8323c, shoes: 0x24272d, hat: ['santa',0xd8323c,0xfbfbf7], beard: 0xfbfbf7, fur: 0xfbfbf7, belt: 0x24272d, buttons: 0xffd447 },
  'av-snowman': { body: 0xfbfdff, head: 0xfbfdff, hand: 0x8a5a2e, legs: 0xfbfdff, shoes: 0xe8eef5, hat: ['top',0x24272d,0xd8323c], carrot: 0xf28a2e, buttons: 0x24272d, scarf: 0x2f8f5b, nomouth: 1 },
  'av-pumpkin': { body: 0x2f8f5b, head: 0xf28a2e, hand: 0x2f8f5b, legs: 0x24272d, shoes: 0x24272d, stem: 0x2f8f5b, jack: 0xffe08a, noeyes: 1, nomouth: 1, cape: 0x24272d },
  'av-gold': { body: 0xffd447, head: 0xffe98a, hand: 0xe6b020, legs: 0xe6b020, shoes: 0xb88a10, hat: ['helmet',0xffd447,0xd8323c], cape: 0xd8323c, emblem: 0xffffff, bands: 0xb88a10, sword: 0xffffff, glow: 0.3, visor: 0x24272d, noeyes: 1, nomouth: 1 },
  'av-rainbow': { body: 0x7ad0ff, head: 0x9a8aff, hand: 0xff9ad0, legs: 0x7ae0a0, shoes: 0xffe08a, horns: 0xffffff, wings: 0xff9ad0, tail: ['bushy',0xffe08a], spikes: 0xffffff, snout: 0xc8b8ff, belly: 0xfff3dd, glow: 0.25 },
};

function fromSpec(g, S) {
  const { b, limbs } = base(g, { body: S.body, arm: S.arm ?? S.body, hand: S.hand, head: S.head, legs: S.legs, shoes: S.shoes, eyes: S.eyes ?? INK, mouth: S.nomouth || S.snout || S.beak ? null : 0x9b655a, face: !S.noeyes && !S.bigeyes });
  const G = S.glow || 0; if (G) g.traverse((m) => { if (m.isMesh) m.material = material(m.material.color.getHex(), G); });
  const both = (fn) => { fn(-1); fn(1); };
  if (S.belly) b(0, 1.24, 0.275, 0.56, 0.58, 0.02, S.belly);
  if (S.ears) { const [t, c, inner] = S.ears;
    if (t === 'round') both((s) => { b(s * 0.3, 2.4, -0.02, 0.24, 0.22, 0.14, c); if (inner) b(s * 0.3, 2.4, 0.055, 0.13, 0.12, 0.02, inner); });
    else if (t === 'point') both((s) => { b(s * 0.27, 2.42, -0.02, 0.2, 0.24, 0.14, c); b(s * 0.27, 2.58, -0.02, 0.1, 0.1, 0.1, c); });
    else if (t === 'flop') both((s) => { b(s * 0.44, 2.05, -0.02, 0.14, 0.5, 0.36, c); });
    else if (t === 'big') both((s) => { b(s * 0.48, 2.26, -0.02, 0.36, 0.4, 0.16, c); if (inner) b(s * 0.48, 2.26, 0.07, 0.2, 0.22, 0.02, inner); });
    else if (t === 'long') both((s) => { b(s * 0.22, 2.75, -0.05, 0.18, 0.7, 0.14, c); });
  }
  if (S.mane) { b(0, 2.0, -0.12, 1.1, 1.0, 0.5, S.mane); b(0, 2.42, 0.1, 0.9, 0.2, 0.5, S.mane); both((s) => b(s * 0.46, 1.95, 0.16, 0.16, 0.7, 0.3, S.mane)); }
  if (S.snout) { b(0, 1.88, 0.36, 0.36, 0.24, 0.08, S.snout); b(0, 1.95, 0.41, 0.12, 0.08, 0.03, S.nose ?? INK); }
  else if (S.nose) b(0, 1.92, 0.35, 0.16, 0.12, 0.04, S.nose);
  if (S.beak) b(0, 1.9, 0.38, 0.16, 0.12, 0.14, S.beak);
  if (S.bigeyes) both((s) => { b(s * 0.18, 2.06, 0.345, 0.26, 0.26, 0.03, S.bigeyes); if (S.bigeyes !== INK) b(s * 0.18, 2.06, 0.365, 0.1, 0.1, 0.02, INK); else b(s * 0.14, 2.1, 0.365, 0.06, 0.06, 0.02, WHITE); });
  if (S.visor) b(0, 2.03, 0.345, 0.6, 0.16, 0.03, S.visor, g, 0.6);
  if (S.cheeks) both((s) => b(s * 0.27, 1.92, 0.345, 0.12, 0.07, 0.02, S.cheeks));
  if (S.fangs) both((s) => b(s * 0.07, 1.78, 0.35, 0.05, 0.08, 0.02, WHITE));
  if (S.glasses) { both((s) => b(s * 0.17, 2.03, 0.36, 0.2, 0.18, 0.02, INK)); both((s) => b(s * 0.17, 2.03, 0.372, 0.13, 0.11, 0.015, 0xcfe8f0)); }
  if (S.eyepatch) { b(-0.17, 2.03, 0.365, 0.16, 0.15, 0.02, INK); b(0, 2.12, 0.35, 0.78, 0.04, 0.02, INK); }
  if (S.carrot) b(0, 1.95, 0.46, 0.09, 0.09, 0.26, S.carrot);
  if (S.jack) { both((s) => b(s * 0.17, 2.06, 0.345, 0.14, 0.14, 0.03, S.jack, g, 0.7)); b(0, 1.82, 0.345, 0.4, 0.08, 0.03, S.jack, g, 0.7); for (const x of [-0.24, -0.08, 0.08, 0.24]) b(x, 2.0, 0.34, 0.03, 0.66, 0.02, 0xc96a1a); }
  if (S.stem) { b(0, 2.38, 0, 0.14, 0.16, 0.14, S.stem); b(0.12, 2.4, 0, 0.2, 0.05, 0.12, S.stem); }
  if (S.hair) { b(0, 2.34, -0.02, 0.8, 0.14, 0.72, S.hair); b(0, 2.2, -0.31, 0.8, 0.3, 0.12, S.hair); }
  if (S.beard) { b(0, 1.76, 0.33, 0.6, 0.3, 0.08, S.beard); both((s) => b(s * 0.34, 1.92, 0.3, 0.1, 0.34, 0.1, S.beard)); }
  if (S.stripes) { for (const y of [1.52, 1.3, 1.08]) b(0, y, 0, 0.96, 0.08, 0.56, S.stripes); if (!S.hat) for (const x of [-0.2, 0, 0.2]) b(x, 2.32, 0.02, 0.08, 0.03, 0.5, S.stripes); }
  if (S.spots) { b(-0.22, 1.42, 0.275, 0.3, 0.26, 0.02, S.spots); b(0.24, 1.14, 0.275, 0.24, 0.2, 0.02, S.spots); b(0.2, 2.2, 0.34, 0.26, 0.2, 0.02, S.spots); b(0, 1.3, -0.275, 0.4, 0.34, 0.02, S.spots); }
  if (S.wraps) { for (const [y, r] of [[1.6, 0.08], [1.34, -0.1], [1.08, 0.06]]) b(0, y, 0, 0.97, 0.06, 0.57, S.wraps).rotation.z = r; for (const [y, r] of [[2.22, 0.1], [1.86, -0.08]]) b(0, y, 0, 0.78, 0.05, 0.7, S.wraps).rotation.z = r; }
  if (S.bands) { both((s) => b(s * 0.6, 1.2, 0, 0.29, 0.08, 0.4, S.bands)); both((s) => b(s * 0.23, 0.36, 0, 0.36, 0.08, 0.45, S.bands)); }
  if (S.buttons) for (const y of [1.5, 1.3, 1.1]) b(0, y, 0.28, 0.08, 0.08, 0.03, S.buttons);
  if (S.emblem) b(0, 1.4, 0.28, 0.22, 0.22, 0.03, S.emblem, g, 0.3);
  if (S.stars) for (const [x, y] of [[-0.28, 1.5], [0.26, 1.2], [0.1, 1.56]]) b(x, y, 0.28, 0.08, 0.08, 0.02, S.stars, g, 0.5);
  if (S.belt) { b(0, 0.94, 0, 0.97, 0.12, 0.57, S.belt); b(0, 0.94, 0.29, 0.16, 0.14, 0.03, GOLD); }
  if (S.collar) { b(0, 1.66, 0, 0.8, 0.09, 0.7, S.collar); b(0, 1.58, 0.36, 0.1, 0.1, 0.06, GOLD); }
  if (S.scarf) { b(0, 1.68, 0.02, 0.86, 0.14, 0.72, S.scarf); b(0.2, 1.46, 0.31, 0.18, 0.36, 0.05, S.scarf); }
  if (S.fur) { b(0, 1.66, 0, 0.98, 0.12, 0.6, S.fur); b(0, 0.92, 0, 0.98, 0.1, 0.58, S.fur); }
  if (S.collarUp) both((s) => b(s * 0.36, 1.78, -0.2, 0.22, 0.36, 0.3, S.collarUp));
  if (S.skirt) b(0, 0.9, 0, 1.06, 0.26, 0.66, S.skirt);
  if (S.tatters) for (const x of [-0.3, 0, 0.3]) b(x, 0.12, 0, 0.22, 0.2, 0.4, S.tatters);
  if (S.cape) { const c = b(0, 1.2, -0.34, 0.92, 1.1, 0.06, S.cape); c.rotation.x = 0.12; }
  if (S.pack) b(0, 1.34, -0.4, 0.6, 0.66, 0.24, S.pack);
  if (S.wings) both((s) => { const w = b(s * 0.56, 1.5, -0.36, 0.62, 0.74, 0.05, S.wings, g, 0.25); w.rotation.y = -s * 0.5; const w2 = b(s * 0.5, 1.02, -0.34, 0.42, 0.4, 0.05, S.wings, g, 0.25); w2.rotation.y = -s * 0.5; });
  if (S.halo) { b(0, 2.72, 0, 0.6, 0.05, 0.12, S.halo, g, 0.8); b(0, 2.72, 0.24, 0.6, 0.05, 0.12, S.halo, g, 0.8).position.z = 0.24; b(0, 2.72, -0.24, 0.6, 0.05, 0.12, S.halo, g, 0.8); both((s) => b(s * 0.3, 2.72, 0, 0.12, 0.05, 0.6, S.halo, g, 0.8)); }
  if (S.horns) both((s) => { b(s * 0.26, 2.42, 0, 0.12, 0.2, 0.12, S.horns); b(s * 0.32, 2.56, 0, 0.09, 0.14, 0.09, S.horns); });
  if (S.spikes) for (let i = 0; i < 4; i += 1) b(0, 2.44 - i * 0.02, 0.2 - i * 0.18, 0.1, 0.18, 0.12, S.spikes);
  if (S.antenna) both((s) => { b(s * 0.2, 2.5, 0, 0.05, 0.36, 0.05, INK); b(s * 0.2, 2.72, 0, 0.14, 0.14, 0.14, S.antenna, g, 0.5); });
  if (S.sword) { const sw = b(0.34, 1.3, -0.36, 0.08, 1.2, 0.06, S.sword, g, 0.2); sw.rotation.z = -0.5; b(0.06, 1.72, -0.36, 0.26, 0.07, 0.08, GOLD).rotation.z = -0.5; }
  if (S.tail) { const [t, c] = S.tail;
    if (t === 'thin') { b(0, 1.0, -0.36, 0.13, 0.13, 0.3, c); b(0, 1.26, -0.5, 0.13, 0.56, 0.13, c); }
    else if (t === 'bushy') { const m = b(0, 1.1, -0.56, 0.32, 0.32, 0.7, c); m.rotation.x = 0.5; }
    else if (t === 'curl') { b(0, 1.0, -0.34, 0.12, 0.12, 0.2, c); b(0, 1.12, -0.44, 0.12, 0.3, 0.12, c); b(0, 1.24, -0.36, 0.12, 0.12, 0.2, c); }
    else if (t === 'arrow') { b(0, 1.0, -0.36, 0.1, 0.1, 0.3, c); b(0, 1.3, -0.52, 0.1, 0.66, 0.1, c); b(0, 1.68, -0.52, 0.28, 0.2, 0.1, c); }
  }
  if (S.hat) { const [t, c, c2] = S.hat;
    if (t === 'chef') { b(0, 2.38, 0, 0.8, 0.14, 0.72, c); b(0, 2.66, 0, 0.94, 0.42, 0.84, c); }
    else if (t === 'pirate') { b(0, 2.36, 0, 1.2, 0.12, 0.8, c); b(0, 2.52, 0, 0.8, 0.26, 0.5, c); b(0, 2.5, 0.26, 0.2, 0.16, 0.03, WHITE); }
    else if (t === 'cap') { b(0, 2.38, 0, 0.82, 0.2, 0.74, c); b(0, 2.3, 0.42, 0.7, 0.06, 0.24, c); b(0, 2.4, 0.375, 0.16, 0.12, 0.03, c2); }
    else if (t === 'helmet') { b(0, 2.4, 0, 0.86, 0.26, 0.78, c); b(0, 2.3, 0.02, 0.98, 0.08, 0.92, c); b(0, 2.6, 0, 0.14, 0.18, 0.6, c2); }
    else if (t === 'cowboy') { b(0, 2.34, 0, 1.36, 0.07, 1.2, c); b(0, 2.5, 0, 0.72, 0.28, 0.64, c); b(0, 2.4, 0, 0.75, 0.07, 0.67, 0x4a3426); }
    else if (t === 'wizard') { b(0, 2.34, 0, 1.2, 0.07, 1.1, c); b(0, 2.5, 0, 0.7, 0.28, 0.64, c); b(0, 2.78, -0.02, 0.46, 0.3, 0.42, c); b(0, 3.04, -0.06, 0.24, 0.26, 0.24, c); b(0, 2.42, 0, 0.73, 0.08, 0.67, c2); }
    else if (t === 'bubble') { b(0, 2.38, 0, 0.98, 0.14, 0.9, c); both((s) => b(s * 0.45, 2.0, 0, 0.12, 0.74, 0.86, c)); b(0, 2.0, -0.4, 0.98, 0.74, 0.12, c); b(0, 1.6, 0, 0.98, 0.1, 0.9, c); b(0, 2.12, 0.37, 0.66, 0.2, 0.04, c2, g, 0.3); }
    else if (t === 'kabuto') { b(0, 2.38, 0, 0.9, 0.22, 0.8, c); b(0, 2.26, -0.1, 1.1, 0.1, 0.9, c); both((s) => { const h = b(s * 0.28, 2.66, 0.2, 0.08, 0.5, 0.06, c2); h.rotation.z = -s * 0.5; }); }
    else if (t === 'crown') { b(0, 2.38, 0, 0.8, 0.16, 0.72, c, g, 0.3); for (const x of [-0.3, 0, 0.3]) b(x, 2.54, 0.3, 0.14, 0.18, 0.1, c, g, 0.3); b(0, 2.4, 0.365, 0.1, 0.1, 0.03, c2, g, 0.4); }
    else if (t === 'santa') { b(0, 2.34, 0, 0.9, 0.14, 0.8, c2); b(0, 2.52, 0, 0.74, 0.26, 0.66, c); b(0.16, 2.74, 0, 0.44, 0.22, 0.4, c); b(0.42, 2.7, 0, 0.2, 0.2, 0.2, c2); }
    else if (t === 'top') { b(0, 2.34, 0, 1.0, 0.06, 0.9, c); b(0, 2.62, 0, 0.62, 0.5, 0.56, c); b(0, 2.42, 0, 0.65, 0.09, 0.59, c2); }
  }
  return limbs;
}
for (const id of Object.keys(SPECS)) { BODIES[id] = (g) => fromSpec(g, SPECS[id]); PREMIUM_AVATARS.push(id); IS.add(id); }

// 体を 1つ 作る。avatars.js の buildAvatar と 同じ 約束（userData.limbs・anchors・worn）で 返す。
export function buildPremiumAvatar(id) {
  const make = BODIES[id];
  if (!make) return null;
  const g = new THREE.Group();
  const limbs = make(g);
  const anchors = {};
  for (const [name, x, y, z] of [['head', 0, 2.31, 0], ['face', 0, 2.03, 0.34], ['chest', 0, 1.42, 0.28], ['back', 0, 1.5, -0.28], ['hand', 0, -0.53, 0.015]]) {
    const a = new THREE.Group(); a.position.set(x, y, z); anchors[name] = a;
    (name === 'hand' ? limbs[3] : g).add(a);
  }
  g.userData.limbs = limbs; g.userData.anchors = anchors; g.userData.worn = new Map(); g.userData.premium = id;
  return g;
}
