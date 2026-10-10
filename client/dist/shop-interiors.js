// メインの島の お店の 中（バーガーや・ピザや・ほんや・けいたいや・でんきや）— 入ったら「その お店」だと 分かる 内装。
//
// island-interior.js の 部屋（幅 14・奥の カウンター z=-3.2・入口 z=8.4）の 上に 置く。
// まんなかの 通り道（x が -2〜2）は あけておく：入口から カウンターまで まっすぐ 歩けるように。
// 返すのは 当たり判定の 箱（{x, z, w, d} は 半分の 幅）。部屋の blocked() が 見る。
import * as THREE from './three.module.js';

const M = new Map();
const mat = (color, glow = 0) => {
  const k = `${color}:${glow}`;
  if (!M.has(k)) M.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: glow ? color : 0x000000, emissiveIntensity: glow }));
  return M.get(k);
};

export function furnish(decor, { B, root }) {
  const solid = [];
  const block = (x, z, w, d) => solid.push({ x, z, w, d });
  const mesh = (geo, color, x, y, z, glow = 0) => { const m = new THREE.Mesh(geo, mat(color, glow)); m.position.set(x, y, z); m.castShadow = true; root.add(m); return m; };
  const cyl = (r, h, color, x, y, z, glow = 0, seg = 18) => mesh(new THREE.CylinderGeometry(r, r, h, seg), color, x, y, z, glow);
  const light = (color, power, x, y, z) => { const l = new THREE.PointLight(color, power, 9, 2); l.position.set(x, y, z); root.add(l); };
  const rug = (x, z, w, d, a, b) => { for (let i = 0; i < w; i += 1) for (let j = 0; j < d; j += 1) B(x - w / 2 + 0.5 + i, 0.09, z - d / 2 + 0.5 + j, 1, 0.04, 1, (i + j) % 2 ? a : b); };
  const stool = (x, z, c) => { cyl(0.32, 0.08, c, x, 0.72, z); cyl(0.06, 0.7, 0x5a5a5a, x, 0.36, z, 0, 8); };
  const table = (x, z, top, w = 1.8) => { B(x, 0.82, z, w, 0.1, w, top); B(x, 0.42, z, 0.18, 0.8, 0.18, 0x5a4a3a); block(x, z, w / 2, w / 2); };

  // バーガー：上から バンズ・レタス・チーズ・パティ・バンズ。
  const burger = (x, y, z, s = 1) => {
    cyl(0.32 * s, 0.1 * s, 0xd9a05b, x, y + 0.05 * s, z);
    cyl(0.33 * s, 0.1 * s, 0x6b3a1e, x, y + 0.15 * s, z);
    B(x, y + 0.22 * s, z, 0.5 * s, 0.04 * s, 0.5 * s, 0xf3c33a);
    cyl(0.35 * s, 0.04 * s, 0x5fae4b, x, y + 0.26 * s, z);
    const top = mesh(new THREE.SphereGeometry(0.33 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xe0a85e, x, y + 0.28 * s, z);
    top.scale.y = 0.7;
  };
  const fries = (x, y, z) => { B(x, y + 0.2, z, 0.34, 0.4, 0.22, 0xd9343c); for (let i = 0; i < 5; i += 1) B(x - 0.12 + i * 0.06, y + 0.5, z, 0.04, 0.25, 0.04, 0xf3d147); };
  const pizza = (x, y, z, r = 0.5) => {
    cyl(r, 0.06, 0xe6b36a, x, y + 0.03, z, 0, 24);
    cyl(r * 0.88, 0.02, 0xd8402c, x, y + 0.07, z, 0, 24);
    cyl(r * 0.8, 0.02, 0xf6dc8a, x, y + 0.085, z, 0, 24);
    for (let i = 0; i < 6; i += 1) cyl(r * 0.12, 0.02, 0xa8322a, x + Math.cos(i) * r * 0.5, y + 0.1, z + Math.sin(i) * r * 0.5, 0, 10);
  };

  switch (decor) {
    case 'burger': {
      // カウンターの うしろ：グリル（火）・フライヤー・ドリンクの 機械・メニューの 板。
      B(-4.2, 0.9, -5.6, 2.6, 1.8, 1.4, 0x3a3a3a); B(-4.2, 1.84, -5.6, 2.4, 0.08, 1.2, 0xff8a3a, 0.9);
      B(-4.2, 3.2, -5.9, 2.8, 0.9, 1.2, 0x9aa2a8);
      for (let i = 0; i < 3; i += 1) cyl(0.3, 0.08, 0x6b3a1e, -5 + i * 0.8, 1.9, -5.6);
      B(-1.2, 0.9, -5.8, 1.4, 1.8, 1.2, 0xb8c0c6); B(-1.2, 1.82, -5.8, 1.2, 0.06, 1, 0xf3d147, 0.4);
      B(3.6, 1.1, -5.8, 2, 2.2, 1.2, 0xd9343c); for (let i = 0; i < 3; i += 1) B(3.0 + i * 0.6, 1.2, -5.15, 0.3, 0.6, 0.1, [0x3a1e14, 0xf29a2e, 0xf7f7f2][i], 0.2);
      B(0, 3.6, -7.15, 6.4, 1.6, 0.1, 0x2a2a2a);
      [[-2.2, 0xe0a85e], [0, 0xf3d147], [2.2, 0xd9343c]].forEach(([x, c]) => B(x, 3.6, -7.08, 1.6, 1.1, 0.04, c, 0.35));
      light(0xff9a50, 6, -4.2, 2.4, -5);
      // カウンターの 上：バーガーと ポテト。
      burger(-2.2, 1.87, -3.2); burger(-1.3, 1.87, -3.4, 0.8); fries(2.2, 1.87, -3.2); burger(1.2, 1.87, -3.1, 0.9);
      // おきゃくの 席：赤と白の ゆか、テーブルと スツール、テーブルにも バーガー。
      rug(0, 3.2, 12, 6, 0xd9343c, 0xf7f1e1);
      for (const x of [-5, 5]) for (const z of [0.6, 4.6]) {
        table(x, z, 0xf7f1e1, 1.6); burger(x, 0.87, z, 0.9);
        stool(x - 1.2, z, 0xd9343c); stool(x + 1.2, z, 0xd9343c);
      }
      break;
    }
    case 'pizza': {
      // れんがの 石窯（火が ゆれる）。
      for (let y = 0; y < 5; y += 1) B(-4.2, 0.4 + y * 0.6, -5.7, 3.4 - y * 0.35, 0.6, 2 - y * 0.1, y % 2 ? 0xa84a32 : 0xb85a3e);
      B(-4.2, 1.2, -4.66, 1.4, 0.9, 0.1, 0x1b1010); B(-4.2, 1.0, -4.7, 1.0, 0.4, 0.06, 0xff7a2a, 1.2);
      B(-4.2, 3.9, -5.7, 0.6, 1.2, 0.6, 0x7a3a2a);
      light(0xff8040, 9, -4.2, 1.4, -4.4);
      // ピザを のばす 台、ハーブの はち、メニューの 板。
      B(3.6, 0.9, -5.6, 3, 1.8, 1.6, 0xc9b28a); pizza(3.0, 1.8, -5.6, 0.55); pizza(4.3, 1.8, -5.6, 0.45);
      for (let i = 0; i < 3; i += 1) { B(1.2 + i * 0.6, 2.2, -6.9, 0.4, 0.4, 0.4, 0xb85a3e); B(1.2 + i * 0.6, 2.55, -6.9, 0.5, 0.3, 0.5, 0x4f9a45); }
      B(0, 3.7, -7.15, 5, 1.4, 0.1, 0x2f4a2a);
      // カウンターの 上の ピザ。
      pizza(-1.8, 1.87, -3.2); pizza(1.6, 1.87, -3.2, 0.42); cyl(0.05, 0.9, 0x8a6a42, 0.3, 1.9, -3.1);
      // テーブル：赤と白の テーブルクロス・いすと ピザ。
      for (const x of [-5, 5]) for (const z of [0.6, 4.6]) {
        table(x, z, 0xd9343c, 1.8);
        for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) if ((i + j) % 2) B(x - 0.6 + i * 0.6, 0.88, z - 0.6 + j * 0.6, 0.6, 0.02, 0.6, 0xf7f7f2);
        pizza(x, 0.9, z, 0.45);
        stool(x - 1.3, z, 0x6b4a2a); stool(x + 1.3, z, 0x6b4a2a);
      }
      break;
    }
    case 'books': {
      // かべいっぱいの 本だな（いろいろな 色の 背表紙）。
      // 本だな：うしろの 板・たなの 板・その 上に 立つ 本（かべの 反対がわ＝お店の なかに 向く）。
      const shelf = (x, z, w, rot) => {
        const horizontal = rot === 0;
        const inward = horizontal ? 1 : -Math.sign(x);        // 本の 背が 向く 方向
        const at = (along, out, y, sw, sh, sd, c) => (horizontal
          ? B(x + along, y, z + out, sw, sh, sd, c)
          : B(x + out * inward, y, z + along, sd, sh, sw, c));
        const zOut = (o) => (horizontal ? o : o);
        at(0, zOut(-0.35), 2.2, w, 4.4, 0.1, 0x5a3e26);                       // うしろの 板
        for (const e of [-w / 2, w / 2]) at(e, 0, 2.2, 0.12, 4.4, 0.8, 0x7a5a3a); // はしの 柱
        for (let row = 0; row < 5; row += 1) {
          const y = 0.15 + row * 0.85;
          at(0, 0, y, w, 0.08, 0.8, 0x7a5a3a);                                   // たなの 板
          const n = Math.floor((w - 0.3) / 0.2);
          for (let i = 0; i < n; i += 1) {
            if ((i * 5 + row * 3) % 11 === 0) continue;                         // ところどころ すきま
            const c = [0xd9343c, 0x3f6fb8, 0x4fae6b, 0xf3c33a, 0x9b5fd0, 0xe27a2d, 0xf7f1e1][(i * 3 + row) % 7];
            const h = 0.5 + ((i * 7 + row) % 3) * 0.08;
            at(-w / 2 + 0.25 + i * 0.2, 0.05, y + 0.04 + h / 2, 0.16, h, 0.5, c);
          }
        }
        block(x, z, horizontal ? w / 2 : 0.45, horizontal ? 0.45 : w / 2);
      };
      shelf(-6.6, 1.2, 9, 1); shelf(6.6, 1.2, 9, 1); shelf(-4, -6.6, 5, 0); shelf(4, -6.6, 5, 0);
      // 読書の テーブル（ひらいた 本）と 地球儀と はしご。
      table(-4, 4.6, 0xb8865a, 1.8); B(-4, 0.9, 4.6, 0.8, 0.04, 0.55, 0xf7f1e1); B(-4, 0.93, 4.6, 0.04, 0.02, 0.55, 0xc9b28a);
      stool(-4, 6, 0x3f6fb8);
      const globe = mesh(new THREE.SphereGeometry(0.42, 16, 12), 0x3f8fd6, 2.6, 2.35, -3.2); globe.rotation.z = 0.4;
      cyl(0.08, 0.3, 0x8a6a42, 2.6, 1.95, -3.2, 0, 8);
      for (let i = 0; i < 6; i += 1) B(5.9, 0.5 + i * 0.6, -1, 0.1, 0.08, 0.8, 0xa08458);
      for (const z of [-1.4, -0.6]) B(5.9, 1.8, z, 0.1, 3.6, 0.08, 0xa08458);
      rug(1.2, 3.4, 5, 4, 0x9b3a3a, 0xb85a4a);
      // カウンターの 上に つんだ 本。
      for (let i = 0; i < 4; i += 1) B(-2.3, 1.95 + i * 0.13, -3.2, 0.7 - i * 0.05, 0.12, 0.5, [0x3f6fb8, 0xd9343c, 0x4fae6b, 0xf3c33a][i]);
      break;
    }
    case 'phones': {
      // うしろの かべ：けいたいが ならぶ 光る たな。
      B(0, 2.6, -7.0, 10, 3.6, 0.5, 0xeef3f7);
      for (let r = 0; r < 3; r += 1) for (let i = 0; i < 7; i += 1) {
        const x = -4 + i * 1.33; const y = 1.4 + r * 1.1;
        B(x, y, -6.68, 0.5, 0.9, 0.08, 0x1b1f24); B(x, y + 0.02, -6.62, 0.42, 0.76, 0.02, [0x58a0dc, 0xe27a2d, 0x4fae6b, 0xd9668d, 0xf3c33a][(i + r) % 5], 0.8);
      }
      // 大きな けいたいの 看板と ポスター。
      B(4.6, 1.8, -5.4, 1.2, 2.6, 0.3, 0x1b1f24); B(4.6, 1.85, -5.24, 1.0, 2.2, 0.04, 0x58a0dc, 0.7);
      for (const x of [-7.15, 7.15]) for (const z of [-0.5, 4]) B(x, 3.0, z, 0.06, 1.6, 1.2, [0xd9668d, 0x58a0dc, 0x4fae6b, 0xf3c33a][(z > 0 ? 1 : 0) + (x > 0 ? 2 : 0)], 0.5);
      // お店の まんなかの 白い 展示台（けいたいが ねている）。
      for (const x of [-5, 5]) for (const z of [0.8, 4.4]) {
        B(x, 0.5, z, 2.2, 1.0, 1.2, 0xf7f9fb); block(x, z, 1.1, 0.6);
        for (let i = 0; i < 3; i += 1) { B(x - 0.7 + i * 0.7, 1.03, z, 0.36, 0.05, 0.62, 0x1b1f24); B(x - 0.7 + i * 0.7, 1.06, z, 0.3, 0.02, 0.54, [0x58a0dc, 0xd9668d, 0x4fae6b][i], 0.7); }
      }
      // カウンターの 上：レジと けいたい。
      B(2.2, 2.05, -3.2, 0.7, 0.4, 0.5, 0x3a3f46); B(2.2, 2.35, -3.3, 0.6, 0.35, 0.05, 0x7cc4e0, 0.6);
      B(-1.6, 1.9, -3.1, 0.36, 0.05, 0.62, 0x1b1f24); B(-1.6, 1.93, -3.1, 0.3, 0.02, 0.54, 0xe27a2d, 0.8);
      light(0x9fd0ff, 5, 0, 3.5, -5);
      break;
    }
    case 'electronics': {
      // せんたくき（まるい ガラスの とびら）が ならぶ。
      const washer = (x, z, face) => {
        B(x, 0.75, z, 1.4, 1.5, 1.3, 0xf2f4f6); B(x, 1.42, z, 1.42, 0.06, 1.32, 0xd8dde2);
        const door = cyl(0.42, 0.06, 0x3a4a5a, x + face * 0.68, 0.7, z, 0, 24); door.rotation.z = Math.PI / 2;
        const glass = cyl(0.32, 0.07, 0x9fd0e8, x + face * 0.69, 0.7, z, 0.3, 24); glass.rotation.z = Math.PI / 2;
        B(x + face * 0.66, 1.25, z - 0.35, 0.04, 0.12, 0.4, 0x58a0dc, 0.6);
        block(x, z, 0.75, 0.7);
      };
      washer(-6.2, 0.4, 1); washer(-6.2, 2.2, 1); washer(-6.2, 4.0, 1);
      // れいぞうこ と せんぷうき。
      B(6.2, 1.5, 0.6, 1.4, 3.0, 1.3, 0xe6eef2); B(5.48, 1.9, 0.6, 0.02, 0.06, 1.2, 0xc0c8cc); B(5.46, 2.4, 0.25, 0.06, 0.8, 0.06, 0x9aa2a8); block(6.2, 0.6, 0.75, 0.7);
      B(6.2, 1.2, 2.6, 1.4, 2.4, 1.3, 0xf2d6da); B(5.46, 1.6, 2.3, 0.06, 0.7, 0.06, 0x9aa2a8); block(6.2, 2.6, 0.75, 0.7);
      cyl(0.08, 1.4, 0x7a7a7a, 5.6, 0.7, 5.2, 0, 8); cyl(0.3, 0.06, 0x7a7a7a, 5.6, 0.05, 5.2);
      const fan = cyl(0.5, 0.08, 0x7cc4e0, 5.6, 1.5, 5.2, 0, 20); fan.rotation.x = Math.PI / 2; block(5.6, 5.2, 0.4, 0.4);
      // うしろの かべの テレビ（光る がめん）。
      for (const [x, w] of [[-4, 2.6], [0, 3.2], [4, 2.6]]) { B(x, 3.6, -7.12, w, w * 0.6, 0.12, 0x1b1f24); B(x, 3.6, -7.04, w - 0.2, w * 0.6 - 0.2, 0.04, [0x58a0dc, 0x4fae6b, 0xe27a2d][(x + 4) / 4], 0.7); }
      // カウンターの 上：でんしレンジ と ラジオ。
      B(-2, 2.15, -3.2, 1.0, 0.6, 0.7, 0xf2f4f6); B(-2.15, 2.15, -2.84, 0.6, 0.42, 0.02, 0x2a3a3a, 0.2);
      B(2, 2.05, -3.2, 0.9, 0.4, 0.4, 0xd9343c); cyl(0.12, 0.05, 0x2a2a2a, 1.8, 2.05, -2.98).rotation.x = Math.PI / 2;
      light(0xcfe6ff, 5, 0, 3.6, -5);
      break;
    }
    default:
      break;
  }
  return solid;
}
