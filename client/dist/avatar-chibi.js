// アバター 56 体の デザイン案（2026-11）。島の キャラクター（island-cast.js）と 同じ まるい 2.4 頭身・同じ 体・同じ 部品。
// **いまの アバター（avatars.js・avatar-bodies.js の 箱の 体）は かえて いない。** 見るのは /dev-cast.html?set=avatars。
// id は いまの アバターと 同じ（k-rabbit … / av-dog …）＝ おきかえる ときに セーブも 部屋も そのまま 使える。
//
// 1 体は 表の 1 行。`f` は とくちょうの 部品（下の FEAT）を 上から 順に かさねる：[名前, 色, 色 2…]。
import * as THREE from './three.module.js';
import { chibiMaker, chibiBody, CHIBI_INK as INK, CHIBI_ARM as ARM } from './island-cast.js';

const W = 0xffffff, GOLD = 0xf2c14e, PINK = 0xf7a8b8, CREAM = 0xfff3dd, DARK = 0x24272d, RED = 0xd8323c;
const both = (fn) => { fn(-1); fn(1); };

// うでの Group の 中に 置く（うでと いっしょに ふれる）。座標は 体の 座標の まま 書ける。
const inArm = (a, c, s) => (g, col, p, sc, r, gl) => a(g, col, [p[0] - s * ARM.x, p[1] - ARM.y, p[2]], sc, r, gl, c._limbs?.[s < 0 ? 2 : 3]);
// 右手に もつ もの（うでと いっしょに ふれる）。
const HELD = new Set(['sword', 'wand', 'staff', 'ladle', 'hose', 'lasso', 'shuriken', 'honey', 'banana', 'balloon', 'gift', 'broom', 'lantern']);

const FEAT = {
  // ---- 耳・フード ----
  earRound: (a, c, col, inner) => both((s) => { a('S', col, [s * 0.48, 2.26, -0.04], [0.36, 0.36, 0.22]); if (inner) a('S', inner, [s * 0.48, 2.26, 0.05], [0.2, 0.2, 0.1]); }),
  earPoint: (a, c, col, inner) => both((s) => { a('K', col, [s * 0.4, 2.38, -0.04], [0.36, 0.46, 0.24], [0, 0, s * -0.28]); if (inner) a('K', inner, [s * 0.4, 2.35, 0.04], [0.2, 0.28, 0.12], [0, 0, s * -0.28]); }),
  earFlop: (a, c, col) => both((s) => a('S', col, [s * 0.66, 1.64, 0], [0.26, 0.68, 0.42], [0, 0, s * 0.18])),
  earBig: (a, c, col, inner) => both((s) => { a('S', col, [s * 0.64, 2.12, -0.06], [0.52, 0.52, 0.26]); if (inner) a('S', inner, [s * 0.64, 2.12, 0.05], [0.3, 0.3, 0.12]); }),
  earLong: (a, c, col, inner) => both((s) => { a('P', col, [s * 0.25, 2.74, -0.06], [0.22, 0.3, 0.16], [0, 0, s * -0.12]); a('S', inner ?? PINK, [s * 0.25, 2.74, 0.03], [0.1, 0.56, 0.06], [0, 0, s * -0.12]); }),
  hood: (a, c, col) => { a('S', col, [0, 1.82, -0.2], [1.42, 1.3, 1.22]); a('S', c.hair, [-0.16, 2.1, 0.3], [0.6, 0.3, 0.44], [0, 0, 0.25]); a('S', c.hair, [0.22, 2.12, 0.28], [0.5, 0.26, 0.4], [0, 0, -0.3]); },
  // ---- 顔 ----
  snout: (a, c, col, nose) => { a('S', col, [0, 1.58, 0.48], [0.5, 0.36, 0.32]); a('S', nose ?? DARK, [0, 1.67, 0.64], [0.17, 0.12, 0.1]); },
  pigNose: (a, c, col) => { a('C', col, [0, 1.6, 0.58], [0.3, 0.12, 0.24], [Math.PI / 2, 0, 0]); both((s) => a('S', 0xb85070, [s * 0.06, 1.6, 0.645], [0.05, 0.08, 0.03])); },
  beak: (a, c, col) => a('K', col, [0, 1.6, 0.62], [0.24, 0.28, 0.2], [Math.PI / 2, 0, 0]),
  eyeRing: (a, c, col) => both((s) => a('S', col, [s * 0.22, 1.73, 0.44], [0.4, 0.44, 0.2])),
  bigEyes: (a, c, col) => both((s) => { a('S', col, [s * 0.24, 1.76, 0.46], [0.34, 0.46, 0.2], [0, 0, s * 0.3]); a('S', W, [s * 0.2, 1.86, 0.55], [0.09, 0.1, 0.04]); }),
  visor: (a, c, col) => a('S', col, [0, 1.74, 0.42], [0.96, 0.3, 0.36], null, 0.7),
  glowEyes: (a, c, col) => both((s) => a('S', col, [s * 0.21, 1.72, 0.52], [0.16, 0.18, 0.08], null, 0.9)),
  jack: (a, c, col) => { both((s) => a('K', col, [s * 0.22, 1.8, 0.53], [0.2, 0.2, 0.06], null, 0.9)); a('A', col, [0, 1.6, 0.54], [0.5, 0.36, 0.2], [Math.PI, 0, 0], 0.9); },
  carrot: (a, c, col) => a('K', col, [0, 1.64, 0.76], [0.14, 0.42, 0.14], [Math.PI / 2, 0, 0]),
  coal: (a) => { for (let i = -2; i <= 2; i += 1) a('S', DARK, [i * 0.1, 1.5 - (2 - Math.abs(i)) * 0.03, 0.54], [0.06, 0.06, 0.04]); },
  beard: (a, c, col) => { a('S', col, [0, 1.42, 0.36], [0.9, 0.66, 0.46]); both((s) => a('S', col, [s * 0.5, 1.62, 0.2], [0.3, 0.5, 0.4])); },
  glasses: (a, c, col) => { both((s) => a('T', col ?? DARK, [s * 0.22, 1.72, 0.56], [0.36, 0.34, 0.3])); },
  patch: (a) => { a('S', DARK, [0.21, 1.73, 0.5], [0.27, 0.27, 0.12]); a('C', DARK, [0, 1.86, 0.02], [1.26, 0.04, 1.16], [0, 0, 0.18]); },
  fangs: (a) => both((s) => a('K', W, [s * 0.07, 1.5, 0.55], [0.05, 0.1, 0.04], [Math.PI, 0, 0])),
  mask: (a, c, col) => { a('S', col, [0, 1.5, 0.12], [1.2, 0.56, 1.0]); a('C', col, [0, 2.0, 0], [1.26, 0.14, 1.16]); a('B', col, [0.5, 1.9, -0.5], [0.12, 0.4, 0.06], [0.4, 0, 0.3]); },
  cheeks: (a, c, col) => both((s) => a('S', col, [s * 0.4, 1.56, 0.42], [0.2, 0.12, 0.06])),
  // ---- 頭の 上 ----
  horns: (a, c, col) => both((s) => a('K', col, [s * 0.36, 2.38, 0], [0.17, 0.36, 0.17], [0, 0, s * -0.35])),
  horn: (a, c, col) => a('K', col, [0, 2.56, 0.2], [0.2, 0.6, 0.2], [0.3, 0, 0], 0.4),
  mane: (a, c, col) => { for (let i = 0; i < 11; i += 1) { const t = (i / 11) * Math.PI * 2; a('S', col, [Math.cos(t) * 0.66, 1.76 + Math.sin(t) * 0.6, -0.14], [0.42, 0.42, 0.36]); } },
  antenna: (a, c, col, tip) => both((s) => { a('C', col, [s * 0.22, 2.5, 0], [0.035, 0.44, 0.035], [0, 0, s * -0.2]); a('S', tip ?? col, [s * 0.27, 2.74, 0], [0.13, 0.13, 0.13], null, 0.4); }),
  antenna1: (a, c, col) => { a('C', 0x8a8f96, [0, 2.48, 0], [0.04, 0.4, 0.04]); a('S', col, [0, 2.72, 0], [0.16, 0.16, 0.16], null, 0.7); },
  halo: (a, c, col) => a('T', col, [0, 2.62, 0], [0.72, 0.72, 0.6], [Math.PI / 2, 0, 0], 0.6),
  fin: (a, c, col) => a('K', col, [0, 2.56, -0.2], [0.14, 0.56, 0.6], [-0.3, 0, 0]),
  crest: (a, c, col) => { for (let i = 0; i < 3; i += 1) a('S', col, [0, 2.44 - i * 0.04, 0.16 - i * 0.2], [0.18, 0.26, 0.2]); },
  spikes: (a, c, col) => { [[2.5, -0.1], [2.34, -0.5], [1.96, -0.74], [1.3, -0.5], [0.9, -0.5]].forEach(([y, z], i) => a('K', col, [0, y, z], [0.22, 0.34, 0.22], [-0.5 - i * 0.35, 0, 0])); },
  teeth: (a) => { for (let i = -2; i <= 2; i += 1) a('K', W, [i * 0.2, 2.02 - Math.abs(i) * 0.05, 0.42 - Math.abs(i) * 0.05], [0.14, 0.18, 0.1], [Math.PI, 0, 0]); },
  frogEyes: (a, c, col) => both((s) => { a('S', col, [s * 0.36, 2.44, 0.06], [0.42, 0.42, 0.42]); a('S', W, [s * 0.36, 2.46, 0.2], [0.28, 0.28, 0.2]); a('S', INK, [s * 0.36, 2.46, 0.29], [0.14, 0.16, 0.08]); }),
  stem: (a, c, col) => { a('C', col, [0, 2.4, 0], [0.16, 0.3, 0.16], [0, 0, 0.2]); a('S', col, [0.2, 2.34, 0], [0.4, 0.06, 0.24]); },
  bow: (a, c, col) => { both((s) => a('K', col, [s * 0.18 + 0.3, 2.3, 0.1], [0.26, 0.3, 0.14], [0, 0, s * Math.PI / 2])); a('S', col, [0.3, 2.3, 0.12], [0.12, 0.12, 0.1]); },
  flower: (a, c, col) => { for (let i = 0; i < 5; i += 1) { const t = (i / 5) * 6.283; a('S', col, [0.4 + Math.cos(t) * 0.1, 2.26 + Math.sin(t) * 0.1, 0.2], [0.13, 0.13, 0.07]); } a('S', 0xffd84a, [0.4, 2.26, 0.24], [0.09, 0.09, 0.06]); },
  goggles: (a, c, col) => { a('C', 0x4a3b34, [0, 2.06, 0], [1.3, 0.1, 1.2]); both((s) => { a('C', 0x8a8f96, [s * 0.2, 2.08, 0.5], [0.26, 0.1, 0.26], [Math.PI / 2, 0, 0]); a('S', col ?? 0x7ed0ff, [s * 0.2, 2.08, 0.54], [0.2, 0.2, 0.06], null, 0.3); }); },
  band: (a, c, col) => { a('C', col, [0, 2.02, -0.02], [1.3, 0.12, 1.2]); a('B', col, [0.56, 1.92, -0.36], [0.1, 0.34, 0.05], [0.3, 0, 0.3]); },
  // ---- ぼうし ----
  chef: (a) => { a('C', W, [0, 2.36, 0], [0.92, 0.26, 0.88]); a('S', W, [0, 2.68, 0], [1.14, 0.62, 1.04]); both((s) => a('S', W, [s * 0.34, 2.72, 0.1], [0.5, 0.5, 0.5])); },
  pirate: (a, c, col) => { a('D', col, [0, 2.18, -0.02], [1.34, 0.6, 1.28]); a('S', col, [0, 2.34, 0.04], [1.7, 0.36, 0.5]); a('S', W, [0, 2.42, 0.3], [0.2, 0.2, 0.08]); },
  cap: (a, c, col, badge) => { a('D', col, [0, 2.2, -0.04], [1.32, 0.6, 1.26]); a('C', col, [0, 2.2, 0.4], [0.84, 0.06, 0.6]); if (badge) a('O', badge, [0, 2.4, 0.52], [0.18, 0.18, 0.06], null, 0.3); },
  helmet: (a, c, col, trim) => { a('D', col, [0, 2.02, -0.04], [1.38, 0.9, 1.32]); a('C', trim ?? col, [0, 2.04, -0.04], [1.42, 0.08, 1.36]); a('B', trim ?? col, [0, 2.5, -0.06], [0.14, 0.14, 1.0]); },
  plume: (a, c, col) => a('S', col, [0, 2.66, -0.22], [0.26, 0.6, 0.6], [0.5, 0, 0]),
  cowboy: (a, c, col) => { a('S', col, [0, 2.3, 0], [2.0, 0.14, 1.6]); a('C', col, [0, 2.5, 0], [0.84, 0.4, 0.8]); a('C', RED, [0, 2.38, 0], [0.86, 0.1, 0.82]); },
  wizard: (a, c, col, star) => { a('C', col, [0, 2.28, 0], [1.7, 0.06, 1.6]); a('K', col, [0.06, 2.86, -0.04], [0.92, 1.16, 0.88], [0, 0, -0.12]); a('O', star ?? GOLD, [0.02, 2.66, 0.4], [0.22, 0.22, 0.06], null, 0.5); },
  bubble: (a, c, col, glass) => { a('S', col, [0, 1.8, -0.18], [1.5, 1.36, 1.3]); a('T', glass ?? 0x7ec8ff, [0, 1.74, 0.2], [1.24, 1.14, 0.8], null, 0.25); },
  kabuto: (a, c, col, gold) => { a('D', col, [0, 2.0, -0.04], [1.4, 0.92, 1.34]); a('S', col, [0, 1.96, -0.3], [1.7, 0.2, 1.1]); a('A', gold ?? GOLD, [0, 2.7, 0.3], [0.9, 0.8, 0.4], [0, 0, Math.PI], 0.3); },
  crown: (a, c, col, gem) => { a('C', col, [0, 2.36, 0], [0.82, 0.24, 0.78], null, 0.25); for (let i = 0; i < 5; i += 1) { const t = (i / 5) * 6.283; a('K', col, [Math.sin(t) * 0.36, 2.58, Math.cos(t) * 0.34], [0.2, 0.26, 0.2], null, 0.25); } a('S', gem ?? RED, [0, 2.38, 0.4], [0.14, 0.14, 0.08], null, 0.3); },
  tiara: (a, c, col) => { a('A', col, [0, 2.2, 0.16], [1.0, 0.5, 0.9], [-0.5, 0, 0], 0.3); a('O', PINK, [0, 2.46, 0.36], [0.16, 0.2, 0.08], null, 0.4); },
  santa: (a, c, col) => { a('D', col, [0, 2.16, -0.02], [1.34, 0.7, 1.28]); a('C', W, [0, 2.18, -0.02], [1.4, 0.18, 1.34]); a('K', col, [0.36, 2.66, -0.1], [0.6, 0.7, 0.6], [0, 0, -0.9]); a('S', W, [0.76, 2.56, -0.1], [0.26, 0.26, 0.26]); },
  top: (a, c, col, band) => { a('C', col, [0, 2.3, 0], [1.4, 0.06, 1.34]); a('C', col, [0, 2.6, 0], [0.82, 0.6, 0.78]); a('C', band ?? RED, [0, 2.38, 0], [0.84, 0.1, 0.8]); },
  // ---- 体 ----
  belly: (a, c, col) => a('S', col, [0, 0.86, 0.26], [0.6, 0.66, 0.26]),
  stripes: (a, c, col) => { for (const y of [0.72, 0.96, 1.18]) a('C', col, [0, y, 0], [0.9 - Math.abs(y - 0.92) * 0.5, 0.08, 0.74 - Math.abs(y - 0.92) * 0.4]); },
  headStripes: (a, c, col) => { for (const x of [-0.2, 0, 0.2]) a('S', col, [x, 2.26, 0.14], [0.08, 0.1, 0.36]); },
  spots: (a, c, col) => { [[0.26, 1.04, 0.3], [-0.24, 0.76, 0.3], [0.34, 2.12, 0.3], [-0.4, 1.94, 0.34]].forEach((p, i) => a('S', col, p, [0.26 + (i % 2) * 0.08, 0.22, 0.12])); },
  bands: (a, c, col) => { a('C', col, [0, 0.66, 0], [0.86, 0.08, 0.72]); both((s) => inArm(a, c, s)('C', col, [s * 0.56, 0.88, 0.03], [0.24, 0.07, 0.24], [0, 0, s * 0.42])); },
  belt: (a, c, col) => { a('C', col, [0, 0.62, 0], [0.86, 0.11, 0.72]); a('B', GOLD, [0, 0.62, 0.36], [0.16, 0.14, 0.04]); },
  buttons: (a, c, col) => { for (const y of [1.12, 0.92, 0.72]) a('S', col, [0, y, 0.36], [0.09, 0.09, 0.06]); },
  emblem: (a, c, col) => a('O', col, [0, 1.02, 0.35], [0.26, 0.26, 0.07], null, 0.35),
  star: (a, c, col) => { a('O', col, [0, 1.02, 0.35], [0.3, 0.3, 0.07], null, 0.5); a('O', col, [0.3, 0.8, 0.3], [0.12, 0.12, 0.05], null, 0.5); },
  scarf: (a, c, col) => { a('C', col, [0, 1.3, 0.02], [0.72, 0.15, 0.62]); a('B', col, [0.22, 1.06, 0.34], [0.18, 0.42, 0.06], [0, 0, -0.12]); },
  collar: (a, c, col) => { a('C', col, [0, 1.3, 0.02], [0.7, 0.1, 0.6]); a('S', GOLD, [0, 1.24, 0.34], [0.12, 0.12, 0.1]); },
  collarUp: (a, c, col) => both((s) => a('K', col, [s * 0.4, 1.44, -0.16], [0.4, 0.6, 0.4], [0, 0, s * 0.3])),
  fur: (a) => { a('C', W, [0, 1.3, 0.02], [0.8, 0.16, 0.7]); a('C', W, [0, 0.42, 0], [1.08, 0.14, 0.92]); },
  cape: (a, c, col) => a('S', col, [0, 0.9, -0.36], [1.2, 1.36, 0.2], [0.16, 0, 0]),
  pack: (a, c, col) => { a('B', col, [0, 0.96, -0.42], [0.62, 0.72, 0.3]); a('B', col, [0, 1.26, -0.4], [0.5, 0.2, 0.34]); },
  wings: (a, c, col) => both((s) => { a('S', col, [s * 0.62, 1.3, -0.42], [0.7, 1.0, 0.1], [0, s * 0.5, s * -0.5]); a('S', col, [s * 0.5, 0.82, -0.42], [0.5, 0.6, 0.1], [0, s * 0.5, s * 0.5]); }),
  batWings: (a, c, col) => both((s) => { a('K', col, [s * 0.62, 1.28, -0.4], [0.5, 0.7, 0.08], [0, s * 0.4, s * -1.0]); a('K', col, [s * 0.56, 0.98, -0.4], [0.36, 0.5, 0.08], [0, s * 0.4, s * -1.5]); }),
  armWings: (a, c, col) => both((s) => inArm(a, c, s)('S', col, [s * 0.6, 0.9, 0], [0.26, 0.7, 0.5], [0, 0, s * 0.5])),
  tail: (a, c, kind, col, tip) => {
    if (kind === 'thin') { a('P', col, [0, 0.66, -0.52], [0.1, 0.3, 0.1], [-1.0, 0, 0]); if (tip) a('S', tip, [0, 0.86, -0.84], [0.2, 0.2, 0.2]); }
    else if (kind === 'curl') a('T', col, [0, 0.76, -0.5], [0.34, 0.34, 0.5], [0, Math.PI / 2, 0]);
    else if (kind === 'bushy') { a('S', col, [0, 0.96, -0.62], [0.46, 0.86, 0.46], [-0.6, 0, 0]); a('S', tip ?? W, [0, 1.24, -0.82], [0.32, 0.4, 0.32], [-0.6, 0, 0]); }
    else if (kind === 'arrow') { a('P', col, [0, 0.72, -0.56], [0.08, 0.36, 0.08], [-0.9, 0, 0]); a('K', col, [0, 1.0, -0.94], [0.26, 0.3, 0.1], [-0.9, 0, 0]); }
    else if (kind === 'dino') a('K', col, [0, 0.5, -0.64], [0.46, 0.9, 0.46], [-1.9, 0, 0]);
    else if (kind === 'pom') a('S', col, [0, 0.6, -0.4], [0.3, 0.3, 0.3]);
  },
  wraps: (a, c, col) => { [[2.1, 0.2], [1.84, -0.14], [1.5, 0.1]].forEach(([y, r]) => a('C', col, [0, y, 0], [1.27 - Math.abs(y - 1.74) * 0.9, 0.07, 1.17 - Math.abs(y - 1.74) * 0.8], [0, 0, r])); for (const y of [1.1, 0.84]) a('C', col, [0, y, 0], [0.9, 0.06, 0.74], [0, 0, y > 1 ? 0.2 : -0.16]); a('B', col, [0.66, 0.5, 0.1], [0.08, 0.4, 0.04], [0, 0, 0.2]); },
  tatters: (a, c, col) => { for (let i = 0; i < 6; i += 1) { const t = (i / 6) * 6.283; a('K', col, [Math.cos(t) * 0.36, 0.22, Math.sin(t) * 0.3], [0.34, 0.44, 0.34], [Math.PI, 0, 0]); } },
  // ---- 手の もの ----
  sword: (a, c, col) => { a('B', col, [0.74, 1.24, 0.2], [0.1, 0.95, 0.04], [0.25, 0, -0.1], 0.15); a('B', GOLD, [0.7, 0.78, 0.1], [0.34, 0.07, 0.08], [0.25, 0, -0.1]); },
  wand: (a, c, col) => { a('C', W, [0.72, 1.06, 0.16], [0.05, 0.7, 0.05], [0.2, 0, -0.2]); a('O', col, [0.8, 1.46, 0.24], [0.3, 0.3, 0.1], null, 0.7); },
  staff: (a, c, col) => { a('C', 0x8a5a2b, [0.74, 1.2, 0.14], [0.07, 1.9, 0.07]); a('S', col, [0.74, 2.24, 0.14], [0.3, 0.3, 0.3], null, 0.6); },
  ladle: (a) => { a('C', 0xc8ced6, [0.72, 1.08, 0.18], [0.05, 0.7, 0.05], [0.2, 0, -0.2]); a('S', 0xc8ced6, [0.8, 1.44, 0.26], [0.24, 0.18, 0.24]); },
  stetho: (a) => { a('T', 0x3a3f4a, [0, 1.22, 0.1], [0.7, 0.7, 0.5], [Math.PI / 2.2, 0, 0]); a('S', 0xc8ced6, [0.16, 0.92, 0.38], [0.14, 0.14, 0.06]); },
  hose: (a) => { a('C', 0x8a8f96, [0.74, 0.86, 0.3], [0.12, 0.5, 0.12], [1.2, 0, 0]); a('K', GOLD, [0.74, 0.96, 0.58], [0.2, 0.2, 0.2], [-1.9, 0, 0]); },
  lasso: (a) => a('T', 0xc9a05a, [0.76, 0.86, 0.16], [0.44, 0.44, 0.4], [0.3, 0.4, 0]),
  shuriken: (a) => a('O', 0xc8ced6, [0.74, 0.86, 0.22], [0.3, 0.3, 0.05], [0, 0, 0.6]),
  honey: (a) => { a('C', 0xf2b04a, [0.72, 0.84, 0.22], [0.34, 0.36, 0.34]); a('C', 0x8a5a2b, [0.72, 1.04, 0.22], [0.38, 0.06, 0.38]); },
  banana: (a) => a('A', 0xffd84a, [0.72, 0.9, 0.2], [0.44, 0.44, 0.9], [0, 0, 2.2]),
  balloon: (a, c, col) => { a('S', col, [0.9, 2.3, 0.1], [0.44, 0.52, 0.44]); a('C', 0xe8e8e8, [0.78, 1.5, 0.1], [0.012, 1.5, 0.012], [0, 0, -0.16]); },
  gift: (a, c, col) => { a('B', col, [0.72, 0.84, 0.26], [0.4, 0.4, 0.4]); a('B', GOLD, [0.72, 0.84, 0.26], [0.42, 0.42, 0.1]); a('B', GOLD, [0.72, 0.84, 0.26], [0.1, 0.42, 0.42]); },
  broom: (a) => { a('C', 0x8a5a2b, [0.74, 1.2, 0.14], [0.06, 1.7, 0.06]); a('K', 0xc9a05a, [0.74, 2.2, 0.14], [0.4, 0.5, 0.2], [Math.PI, 0, 0]); },
  lantern: (a, c, col) => { a('C', col, [0.72, 0.76, 0.24], [0.26, 0.34, 0.26], null, 0.8); a('T', DARK, [0.72, 1.0, 0.24], [0.2, 0.2, 0.2]); },
  bag: (a, c, col) => { a('B', col, [-0.52, 0.76, 0.2], [0.44, 0.4, 0.26]); a('B', col, [0, 1.12, 0.3], [1.0, 0.07, 0.05], [0, 0, -0.55]); },
};

// h = hair, st = style（short・bob・twin・long・curly・spiky・pony・bun・buns・none）。animal: true ＝ 人の 耳と かみを 出さない。
const A = (id, name, en, o) => ({ id, name, en, ...o });
const K = (id, name, en, col, belly, f, o = {}) => A(id, name, en, { group: 'はじめの すがた', skin: 0xf1c9a2, hair: 0x55362b, style: 'none', top: col, pants: col, shoe: belly, hand: col, f: [['hood', col], ['belly', belly], ...f], ...o });
const AN = (id, name, en, col, f, o = {}) => A(id, name, en, { group: 'すがたや', skin: col, hand: o.paw ?? col, style: 'none', top: col, pants: col, shoe: o.paw ?? col, noEars: true, f, ...o });
const HU = (id, name, en, o) => A(id, name, en, { group: 'すがたや', skin: 0xe6b68e, hair: 0x4a3426, style: 'short', shoe: DARK, ...o });

export const CHIBI = [
  // ---- はじめの すがた：きぐるみ 8 ----
  K('k-rabbit', 'うさぎ', 'Rabbit', 0xf6b7c8, 0xfff3f6, [['earLong', 0xf6b7c8, 0xfff3f6], ['tail', 'pom', W]]),
  K('k-bear', 'くま', 'Bear', 0xa9744a, 0xf0d9b4, [['earRound', 0xa9744a, 0xf0d9b4], ['honey']], { skin: 0xe6b68e, hair: 0x343137 }),
  K('k-dino', 'きょうりゅう', 'Dino', 0x5fbf6a, 0xf4ecae, [['spikes', 0xf2a03c], ['tail', 'dino', 0x5fbf6a], ['teeth']], { skin: 0xdba57e, hair: 0x302824 }),
  K('k-penguin', 'ペンギン', 'Penguin', 0x2f4270, W, [['armWings', 0x2f4270], ['crest', 0xf2a03c]], { skin: 0xf0d0b2, hair: 0x292e39, shoe: 0xf2a03c }),
  K('k-fox', 'きつね', 'Fox', 0xe98a3c, 0xfff4e0, [['earPoint', 0xe98a3c, 0xfff4e0], ['tail', 'bushy', 0xe98a3c, 0xfff4e0]], { skin: 0xe6b68e }),
  K('k-frog', 'かえる', 'Frog', 0x7ccf5a, 0xf1f7c4, [['frogEyes', 0x7ccf5a]], { skin: 0xc68d65, hair: 0x343137 }),
  K('k-chick', 'ひよこ', 'Chick', 0xffd84a, 0xfff6c4, [['crest', 0xf2a03c], ['armWings', 0xffc02a]], { shoe: 0xf2a03c }),
  K('k-shark', 'さめ', 'Shark', 0x5b8fc4, 0xf3f8fb, [['fin', 0x5b8fc4], ['teeth'], ['tail', 'dino', 0x5b8fc4]], { skin: 0xa9714d, hair: 0x302824 }),
  // ---- はじめの すがた：人 8 ----
  A('kai', 'Kai', 'Kai', { group: 'はじめの すがた', skin: 0xe6b68e, hair: 0x343137, style: 'spiky', top: 0x397e87, pants: 0x43515c, f: [['scarf', 0xf2b04a], ['pack', 0x9a6a3a]] }),
  A('mia', 'Mia', 'Mia', { group: 'はじめの すがた', skin: 0xf1c9a2, hair: 0x55362b, style: 'long', top: 0xc38189, pants: 0x6a4a5a, coat: true, f: [['flower', 0xfff3f6], ['bag', 0x9a6a3a]] }),
  A('ren', 'Ren', 'Ren', { group: 'はじめの すがた', skin: 0xb98059, hair: 0xc3c9cb, style: 'bob', top: 0x6774ad, pants: 0x3a3f55, f: [['scarf', 0xf2c14e], ['emblem', GOLD]] }),
  A('leo', 'Leo', 'Leo', { group: 'はじめの すがた', skin: 0x865738, hair: 0x302824, style: 'curly', top: 0xd2a34d, pants: 0x5a4a36, f: [['goggles', 0x7ed0ff], ['belt', 0x5a4a36]] }),
  A('aya', 'Aya', 'Aya', { group: 'はじめの すがた', skin: 0xdba57e, hair: 0x292e39, style: 'twin', accent: 0xe5533d, top: 0x759768, pants: 0x4a5a48, f: [['bag', 0xc9a05a], ['star', GOLD]] }),
  A('noa', 'Noa', 'Noa', { group: 'はじめの すがた', skin: 0xf0d0b2, hair: 0x8bb3aa, style: 'short', top: 0xb67856, pants: 0x4a4a52, f: [['band', 0xfff3dd], ['wand', 0x8ff0c8]] }),
  A('nova', 'Nova', 'Nova', { group: 'はじめの すがた', skin: 0xc68d65, hair: 0x656f7b, style: 'none', top: 0xe0e7e5, pants: 0xd0dadb, shoe: 0x8a8f96, hand: 0xe0e7e5, f: [['bubble', 0xe0e7e5, 0x7ec8ff], ['emblem', 0x2c6fe0], ['bands', 0xe27a2d], ['pack', 0xc8ced6]] }),
  A('bolt', 'Bolt', 'Bolt', { group: 'はじめの すがた', skin: 0xadc4c7, hair: 0x425d6b, style: 'none', top: 0x5396ab, pants: 0x425d6b, shoe: 0x2f4654, hand: 0x425d6b, noEars: true, noBlush: true, noEyes: true, noMouth: true, f: [['visor', 0x7df9ff], ['antenna1', 0xff7a5a], ['emblem', 0x7df9ff], ['bands', 0x2f4654]] }),
  // ---- すがたや：どうぶつ ----
  AN('av-cat', 'ねこ', 'Cat', 0xf2c08a, [['earPoint', 0xf2c08a, PINK], ['snout', CREAM, PINK], ['tail', 'thin', 0xf2c08a], ['collar', RED], ['belly', CREAM]], { paw: CREAM, noMouth: true }),
  AN('av-panda', 'パンダ', 'Panda', 0xfbfbf7, [['earRound', DARK], ['eyeRing', DARK], ['snout', W, DARK], ['belly', W]], { paw: DARK, sleeve: DARK, pants: DARK, eyeColor: 0x3a3a3a, noMouth: true }),
  AN('av-dog', 'いぬ', 'Dog', 0xc99a5b, [['earFlop', 0x8a5a2e], ['snout', CREAM, DARK], ['tail', 'thin', 0xc99a5b], ['collar', 0x3f6fd0], ['belly', CREAM]], { paw: CREAM, noMouth: true }),
  AN('av-pig', 'ぶた', 'Pig', 0xf7a8b8, [['earPoint', 0xf28aa0], ['pigNose', 0xf28aa0], ['tail', 'curl', 0xf28aa0]], { paw: 0xd96a86, noMouth: true }),
  AN('av-koala', 'コアラ', 'Koala', 0x9aa3ad, [['earBig', 0x7d8791, 0xf2f2f2], ['snout', 0x9aa3ad, DARK], ['belly', 0xe8ecef]], { paw: 0x7d8791, noMouth: true }),
  AN('av-monkey', 'さる', 'Monkey', 0x8a5a2e, [['earRound', 0xe8c39a], ['snout', 0xe8c39a, 0x6a4326], ['tail', 'curl', 0x8a5a2e], ['belly', 0xe8c39a], ['banana']], { paw: 0xe8c39a }),
  AN('av-cow', 'うし', 'Cow', 0xfbfbf7, [['earFlop', DARK], ['horns', 0xe6d3a8], ['snout', PINK, 0xd96a86], ['spots', DARK], ['collar', RED], ['tail', 'thin', DARK, DARK]], { paw: DARK, noMouth: true }),
  AN('av-tiger', 'とら', 'Tiger', 0xf28a2e, [['earRound', 0xf28a2e, CREAM], ['snout', CREAM, 0xd96a86], ['stripes', DARK], ['headStripes', DARK], ['tail', 'thin', 0xf28a2e, DARK], ['belly', CREAM]], { paw: CREAM, noMouth: true }),
  AN('av-bee', 'はち', 'Bee', 0xffd447, [['stripes', DARK], ['antenna', DARK, 0xffd447], ['wings', 0xdff4ff], ['honey']], { paw: DARK, pants: DARK }),
  AN('av-owl', 'ふくろう', 'Owl', 0x8d6e4a, [['earPoint', 0x6f5536], ['eyeRing', CREAM], ['beak', 0xe6a03c], ['belly', 0xe6d3a8], ['armWings', 0x6f5536]], { paw: 0x6f5536, pants: 0xe6a03c, shoe: 0xe6a03c, noMouth: true, noBlush: true }),
  AN('av-lion', 'ライオン', 'Lion', 0xe6b04a, [['mane', 0xb86a1e], ['earRound', 0xe6b04a], ['snout', CREAM, 0x8a5a2e], ['tail', 'thin', 0xe6b04a, 0xb86a1e], ['belly', CREAM]], { paw: CREAM, noMouth: true }),
  AN('av-dragon', 'ドラゴン', 'Dragon', 0x4fae6a, [['horns', 0xf2e3b8], ['snout', 0x7fd08a, DARK], ['spikes', 0xf2a03c], ['batWings', 0x2f7a4a], ['tail', 'dino', 0x4fae6a], ['belly', 0xf4ecae]], { paw: 0x2f7a4a, noMouth: true }),
  AN('av-unicorn', 'ユニコーン', 'Unicorn', 0xfbf6ff, [['earPoint', 0xfbf6ff, PINK], ['horn', GOLD], ['mane', 0xc8a8ff], ['snout', 0xffe0ee, PINK], ['tail', 'bushy', 0xff9ad0, 0x7ad0ff]], { paw: 0xffc8e0, noMouth: true }),
  AN('av-rainbow', 'にじの ドラゴン', 'Rainbow Dragon', 0x7ad0ff, [['horns', W], ['snout', 0xc8b8ff, 0x7a5ad0], ['spikes', W], ['wings', 0xff9ad0], ['tail', 'bushy', 0xffe08a, 0xff9ad0], ['belly', CREAM]], { skin: 0x9a8aff, paw: 0xff9ad0, pants: 0x7ae0a0, shoe: 0xffe08a, noMouth: true }),
  // ---- すがたや：しごと・ものがたり ----
  HU('av-ninja', 'にんじゃ', 'Ninja', { top: 0x2a2f3a, pants: 0x2a2f3a, style: 'none', hand: 0x2a2f3a, noMouth: true, noBlush: true, f: [['hood', 0x2a2f3a], ['mask', 0x2a2f3a], ['belt', RED], ['shuriken']] }),
  HU('av-princess', 'ひめ', 'Princess', { skin: 0xf1c9a2, hair: 0xf2c86a, style: 'long', top: 0xff9ac0, pants: 0xff9ac0, shoe: 0xf2c14e, coat: 0xffb8d4, f: [['tiara', GOLD], ['wand', 0xffd84a], ['buttons', W]] }),
  HU('av-hero', 'ヒーロー', 'Hero', { hair: 0x2b2622, style: 'spiky', top: 0x2c6fe0, pants: 0x2c6fe0, shoe: RED, hand: RED, f: [['cape', RED], ['star', GOLD], ['belt', GOLD], ['band', RED]] }),
  HU('av-knight', 'きし', 'Knight', { style: 'none', top: 0xc0c8d0, pants: 0x8a929c, hand: 0x8a929c, f: [['helmet', 0xc8ced6, GOLD], ['plume', RED], ['emblem', RED], ['sword', 0xe8eef2], ['cape', 0x2c4a8a]] }),
  HU('av-chef', 'コック', 'Chef', { top: 0xfbfbf7, pants: 0x3a3f4a, f: [['chef'], ['buttons', DARK], ['scarf', RED], ['ladle']] }),
  HU('av-pirate', 'かいぞく', 'Pirate', { hair: DARK, top: 0xb8323c, pants: DARK, shoe: 0x4a3426, f: [['pirate', DARK], ['patch'], ['beard', DARK], ['belt', GOLD], ['sword', 0xc8ced6]] }),
  HU('av-police', 'けいさつ', 'Police', { hair: DARK, top: 0x2c4a8a, pants: 0x1f3566, f: [['cap', 0x1f3566, GOLD], ['emblem', GOLD], ['belt', DARK]] }),
  HU('av-fire', 'しょうぼうし', 'Firefighter', { style: 'none', top: RED, pants: DARK, hand: 0xffd447, f: [['helmet', RED, 0xffd447], ['bands', 0xffd447], ['belt', DARK], ['hose']] }),
  HU('av-doctor', 'おいしゃさん', 'Doctor', { top: 0xfbfbf7, pants: 0x5aa6a0, shoe: W, coat: true, f: [['glasses', DARK], ['stetho'], ['emblem', RED]] }),
  HU('av-cowboy', 'カウボーイ', 'Cowboy', { top: 0xb8703a, pants: 0x2c4a8a, shoe: 0x6a4326, f: [['cowboy', 0x8a5a2e], ['scarf', RED], ['belt', GOLD], ['star', GOLD], ['lasso']] }),
  HU('av-wizard', 'まほうつかい', 'Wizard', { style: 'none', top: 0x5a3a9a, pants: 0x3a2670, coat: true, f: [['wizard', 0x5a3a9a, GOLD], ['beard', 0xfbfbf7], ['star', GOLD], ['staff', 0x8ff0c8]] }),
  HU('av-astro', 'うちゅうひこうし', 'Astronaut', { style: 'none', top: 0xf2f4f7, pants: 0xf2f4f7, shoe: 0xc8ced6, hand: 0xf2f4f7, f: [['bubble', 0xf2f4f7, 0x7ec8ff], ['emblem', 0x2c6fe0], ['bands', 0xe27a2d], ['pack', 0xc8ced6]] }),
  HU('av-samurai', 'さむらい', 'Samurai', { style: 'none', top: 0x8a1f2a, pants: DARK, coat: 0x8a1f2a, f: [['kabuto', DARK, GOLD], ['bands', GOLD], ['belt', GOLD], ['sword', 0xc8ced6]] }),
  HU('av-king', 'おうさま', 'King', { style: 'none', top: 0x7a2ea0, pants: DARK, coat: true, f: [['crown', GOLD, RED], ['beard', 0xfbfbf7], ['cape', RED], ['fur'], ['emblem', GOLD]] }),
  HU('av-santa', 'サンタ', 'Santa', { style: 'none', top: RED, pants: RED, hand: W, coat: true, f: [['santa', RED], ['beard', 0xfbfbf7], ['fur'], ['belt', DARK], ['gift', 0x2f8f5b]] }),
  // ---- すがたや：ふしぎ ----
  HU('av-robot', 'ロボット', 'Robot', { skin: 0xb8c8d8, style: 'none', top: 0x8fa3b8, pants: 0x5a6a7a, shoe: 0x3a4654, hand: 0x5a6a7a, noEars: true, noEyes: true, noMouth: true, noBlush: true, f: [['visor', 0x7df9ff], ['antenna1', RED], ['emblem', 0x7df9ff], ['bands', 0x3a4654]] }),
  HU('av-alien', 'うちゅうじん', 'Alien', { skin: 0x7fe07a, style: 'none', top: 0x7a3fd0, pants: 0x5a2ea0, shoe: 0x3a1f70, noEars: true, noEyes: true, noBlush: true, f: [['bigEyes', DARK], ['antenna', 0x7fe07a, 0xffd447], ['emblem', 0xffd447]] }),
  HU('av-ghost', 'おばけ', 'Ghost', { skin: 0xf4f6fb, style: 'none', top: 0xf4f6fb, pants: 0xf4f6fb, shoe: 0xdfe4ee, noEars: true, coat: true, f: [['tatters', 0xf4f6fb], ['cheeks', PINK], ['lantern', 0xffd84a]] }),
  HU('av-mummy', 'ミイラ', 'Mummy', { skin: 0xe8e0c8, style: 'none', top: 0xe8e0c8, pants: 0xe8e0c8, shoe: 0xcfc5a8, noEars: true, noBlush: true, eyeColor: 0x4a3a1a, f: [['wraps', 0xb8ad8a]] }),
  HU('av-vampire', 'バンパイア', 'Vampire', { skin: 0xe8e0ea, hair: DARK, style: 'short', top: DARK, pants: DARK, coat: true, f: [['cape', 0x8a1f2a], ['collarUp', 0x8a1f2a], ['emblem', RED], ['fangs']] }),
  HU('av-fairy', 'ようせい', 'Fairy', { hair: 0xffd447, style: 'buns', top: 0x8fe0b0, pants: 0x5fc08a, shoe: PINK, coat: 0x5fc08a, f: [['wings', 0xfff0ff], ['flower', PINK], ['wand', W]] }),
  HU('av-angel', 'てんし', 'Angel', { hair: 0xffe08a, style: 'curly', top: 0xfbfbf7, pants: 0xfbfbf7, shoe: GOLD, coat: true, f: [['wings', W], ['halo', GOLD], ['belt', GOLD]] }),
  HU('av-devil', 'こあくま', 'Little Devil', { skin: 0xd8323c, style: 'none', top: 0xb81f2f, pants: 0x8a1220, noEars: true, f: [['horns', DARK], ['batWings', 0x5a0f18], ['tail', 'arrow', 0x8a1220], ['emblem', GOLD], ['fangs']] }),
  HU('av-snowman', 'ゆきだるま', 'Snowman', { skin: 0xfbfdff, style: 'none', top: 0xfbfdff, pants: 0xfbfdff, shoe: 0xe8eef5, hand: 0x8a5a2e, noEars: true, noMouth: true, f: [['top', DARK, RED], ['carrot', 0xf28a2e], ['coal'], ['buttons', DARK], ['scarf', 0x2f8f5b], ['broom']] }),
  HU('av-pumpkin', 'かぼちゃ', 'Pumpkin', { skin: 0xf28a2e, style: 'none', top: 0x2f8f5b, pants: DARK, hand: 0x2f8f5b, noEars: true, noEyes: true, noMouth: true, noBlush: true, f: [['jack', 0xffe08a], ['stem', 0x2f8f5b], ['cape', DARK], ['lantern', 0xffb03a]] }),
  HU('av-gold', 'おうごんの きし', 'Golden Knight', { skin: 0xffe98a, style: 'none', top: 0xffd447, pants: 0xe6b020, shoe: 0xb88a10, hand: 0xe6b020, noEars: true, noEyes: true, noMouth: true, noBlush: true, f: [['helmet', 0xffd447, RED], ['plume', RED], ['visor', DARK], ['cape', RED], ['emblem', W], ['bands', 0xb88a10], ['sword', W]] }),
];

const HUMAN = new Set([0xf1c9a2, 0xe6b68e, 0xdba57e, 0xc68d65, 0xb98059, 0xa9714d, 0x865738, 0xf0d0b2, 0xe8c39a]);
export const isChibiAvatar = (id) => CHIBI.some((m) => m.id === id);

// avatars.js の buildAvatar と 同じ 約束で 返す：userData.limbs（左あし・右あし・左うで・右うで）・anchors（head・face・chest・back・hand）・worn。
// skin・shirt は すがた えらびで かえた 色（あれば）。
export function buildChibiAvatar(id, { skin, shirt } = {}) {
  let c = CHIBI.find((m) => m.id === id); if (!c) return null;
  if (Number.isInteger(shirt) && shirt !== c.top) { const from = c.top, swap = (v) => (v === from ? shirt : v); c = { ...c, top: shirt, pants: swap(c.pants), hand: swap(c.hand), sleeve: swap(c.sleeve), coat: swap(c.coat), f: (c.f || []).map((row) => row.map(swap)) }; }
  if (Number.isInteger(skin) && HUMAN.has(c.skin)) c = { ...c, skin };
  const group = new THREE.Group();
  const add = chibiMaker(group);
  c = { accent: GOLD, ...c };
  const limbs = chibiBody(add, c, group);
  c._limbs = limbs;
  for (const [name, ...args] of c.f || []) FEAT[name]?.(HELD.has(name) ? inArm(add, c, 1) : add, c, ...args);
  // きせかえの 品（箱の 体に 合わせて ある）を のせる 場所。頭が 大きいので 少し 大きく する。
  const hood = (c.f || []).some((r) => r[0] === 'hood' || r[0] === 'bubble');
  const anchors = {};
  for (const [name, x, y, z, k] of [['head', 0, hood ? 2.42 : 2.22, -0.02, 1.5], ['face', 0, 1.72, 0.58, 1.25], ['chest', 0, 1.0, 0.37, 1], ['back', 0, 1.05, -0.4, 1.1]]) {
    const a = new THREE.Group(); a.position.set(x, y, z); a.scale.setScalar(k); anchors[name] = a; group.add(a);
  }
  anchors.hand = new THREE.Group(); anchors.hand.position.set(0.63 - ARM.x, 0.74 - ARM.y, 0.04); limbs[3].add(anchors.hand);
  group.userData.limbs = limbs; group.userData.anchors = anchors; group.userData.worn = new Map();
  if (id.startsWith('av-')) group.userData.premium = id;
  group.userData.cast = { ...c, island: c.group, role: '', note: '', bg: lighten(c.top) };
  return group;
}
function lighten(hex) { const col = new THREE.Color(hex); const hsl = {}; col.getHSL(hsl); return new THREE.Color().setHSL(hsl.h, Math.min(0.55, hsl.s * 0.6 + 0.2), 0.66).getHex(); }
