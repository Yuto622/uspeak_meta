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
