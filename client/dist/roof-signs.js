// メインの島の お店の 屋根に のる かんばん（2026-11：箱を つんだ 形を やめて、なめらかな 形と つやの ある 材質に）。
// roofSign(kind, color) → Group（底が y = 0・正面が +z・高さ 2.5 くらい）。知らない kind は null（前の 箱の かんばんが のこる）。
// モデルの ファイルは 読まない。1 けん 10〜30 メッシュ・光は 足さない（emissive だけ）。
import * as THREE from './three.module.js';

const P = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, ...o });
const add = (g, geo, m, x = 0, y = 0, z = 0, r = null) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (r) o.rotation.set(r[0], r[1], r[2]); o.castShadow = true; g.add(o); return o; };
// かどの まるい 板（w × h・あつさ d）。
function slab(w, h, d, r = 0.12) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: Math.min(0.04, d / 3), bevelThickness: Math.min(0.04, d / 3), bevelSegments: 2, curveSegments: 6 }); g.translate(0, 0, -d / 2); return g;
}
const poly = (pts, d) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](x, y)); const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }); g.translate(0, 0, -d / 2); return g; };
function tex(size, paint) { try { const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; } }
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const post = (g, h = 0.5) => { add(g, new THREE.CylinderGeometry(0.09, 0.11, h, 10), P({ color: 0x5a4632, roughness: 0.8 }), 0, h / 2, 0); return h; };

const SIGN = {
  fish_buy(g) {                                              // つやの ある さかな
    const y = post(g, 0.6) + 0.75, skin = P({ color: 0x4f9bd8, roughness: 0.22, clearcoat: 1, metalness: 0.25 });
    add(g, new THREE.SphereGeometry(0.5, 32, 20), skin, 0, y, 0).scale.set(2.5, 1.25, 0.8);
    add(g, new THREE.SphereGeometry(0.5, 24, 14), P({ color: 0xe8f3f8, roughness: 0.3, clearcoat: 0.8 }), 0.05, y - 0.16, 0).scale.set(2.2, 0.86, 0.74);
    const fin = P({ color: 0x2f6fb0, roughness: 0.3, clearcoat: 0.8, side: THREE.DoubleSide });
    add(g, poly([[0, 0], [0.75, 0.62], [0.55, 0], [0.75, -0.62]], 0.08), fin, 1.12, y, 0);
    add(g, poly([[-0.4, 0], [0.1, 0.5], [0.42, 0]], 0.06), fin, -0.05, y + 0.52, 0);
    add(g, poly([[-0.2, 0], [0.16, -0.36], [0.3, 0]], 0.05), fin, -0.3, y - 0.4, 0.3, [0.5, 0, 0]);
    for (const s of [-1, 1]) { add(g, new THREE.SphereGeometry(0.11, 12, 10), P({ color: 0xffffff, roughness: 0.1 }), -0.82, y + 0.14, s * 0.3); add(g, new THREE.SphereGeometry(0.06, 10, 8), P({ color: 0x15181c, roughness: 0.1 }), -0.87, y + 0.14, s * 0.36); }
  },
  phones(g) {                                                // スマホ：光る 画面と アプリ
    const y = post(g, 0.3) + 1.25;
    add(g, slab(1.5, 2.6, 0.16, 0.24), P({ color: 0x1b1f2a, roughness: 0.2, metalness: 0.6, clearcoat: 1 }), 0, y, 0);
    add(g, slab(1.34, 2.36, 0.02, 0.18), new THREE.MeshStandardMaterial({ color: 0x3a8fe8, emissive: 0x3a8fe8, emissiveIntensity: 0.55, roughness: 0.15 }), 0, y, 0.09);
    const cols = [0xff6b6b, 0xffd246, 0x6be3a0, 0xb48cff, 0xff9ad0, 0x7ed0ff];
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) add(g, slab(0.3, 0.3, 0.02, 0.08), new THREE.MeshStandardMaterial({ color: cols[(r * 3 + c) % 6], emissive: cols[(r * 3 + c) % 6], emissiveIntensity: 0.35, roughness: 0.3 }), -0.4 + c * 0.4, y + 0.66 - r * 0.42, 0.115);
    add(g, slab(0.5, 0.06, 0.02, 0.03), P({ color: 0xdfe6ee, roughness: 0.3 }), 0, y - 1.02, 0.115);
  },
  electronics(g) {                                           // いなずまの かんばん
    const y = post(g, 0.3) + 1.2;
    add(g, slab(2.6, 2.2, 0.18, 0.3), P({ color: 0x1b2a4a, roughness: 0.35, clearcoat: 0.6 }), 0, y, 0);
    add(g, poly([[0.25, 0.95], [-0.5, -0.1], [-0.05, -0.1], [-0.3, -0.95], [0.5, 0.15], [0.05, 0.15]], 0.14), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffb800, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.3 }), 0, y, 0.15);
  },
  homework(g) {                                              // えんぴつと ノート
    add(g, slab(2.0, 1.5, 0.16, 0.08), P({ color: 0x3d6fb0, roughness: 0.6 }), -0.2, 0.86, 0, [-0.25, 0.2, 0]);
    const page = tex(128, (c, S) => { c.fillStyle = '#fffdf5'; c.fillRect(0, 0, S, S); c.strokeStyle = '#9fc3e6'; c.lineWidth = 2; for (let i = 1; i < 8; i += 1) { c.beginPath(); c.moveTo(8, i * 16); c.lineTo(S - 8, i * 16); c.stroke(); } c.strokeStyle = '#e58fa0'; c.beginPath(); c.moveTo(22, 0); c.lineTo(22, S); c.stroke(); });
    add(g, slab(1.84, 1.36, 0.02, 0.05), P({ map: page, color: 0xffffff, roughness: 0.8 }), -0.2, 0.88, 0.09, [-0.25, 0.2, 0]);
    const pen = new THREE.Group(); pen.position.set(0.95, 0.1, 0.15); pen.rotation.z = -0.22; g.add(pen);
    add(pen, new THREE.CylinderGeometry(0.16, 0.16, 1.9, 6), P({ color: 0xf2c531, roughness: 0.35, clearcoat: 0.7 }), 0, 1.25, 0);
    add(pen, new THREE.ConeGeometry(0.16, 0.36, 6), P({ color: 0xe9c79a, roughness: 0.8 }), 0, 0.12, 0, [Math.PI, 0, 0]); add(pen, new THREE.ConeGeometry(0.06, 0.13, 6), P({ color: 0x2a2a2a, roughness: 0.4 }), 0, -0.01, 0, [Math.PI, 0, 0]);
    add(pen, new THREE.CylinderGeometry(0.165, 0.165, 0.2, 12), P({ color: 0xc8ced6, roughness: 0.25, metalness: 1 }), 0, 2.3, 0); add(pen, new THREE.CylinderGeometry(0.15, 0.15, 0.24, 12), P({ color: 0xf08aa0, roughness: 0.7 }), 0, 2.5, 0);
  },
  books(g) {                                                 // 本の 山
    const cols = [0xd9483b, 0x2f6fbf, 0xf2b630, 0x2f9e5b];
    cols.forEach((c, i) => { const y = 0.2 + i * 0.4, turn = (i % 2 ? 0.14 : -0.1); add(g, slab(2.2 - i * 0.14, 0.36, 1.5, 0.05), P({ color: c, roughness: 0.55, clearcoat: 0.3 }), 0, y, 0, [0, turn, 0]); add(g, slab(2.1 - i * 0.14, 0.26, 1.42, 0.02), P({ color: 0xfbf6e8, roughness: 0.9 }), 0.07, y, 0.03, [0, turn, 0]); });
    for (const s of [-1, 1]) add(g, slab(0.9, 0.06, 1.2, 0.03), P({ color: 0xfffdf5, roughness: 0.85 }), s * 0.44, 1.95, 0, [0, 0, s * -0.3]);
    add(g, slab(0.08, 0.12, 1.24, 0.03), P({ color: 0x8a5bc8, roughness: 0.5 }), 0, 1.82, 0);
  },
  pizza(g) {                                                 // まるい ピザ（こっちを 向く）
    const top = tex(256, (c, S) => {
      c.fillStyle = '#d99a4a'; c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, 7); c.fill();
      const gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.43); gr.addColorStop(0, '#f6d27a'); gr.addColorStop(0.8, '#f2c257'); gr.addColorStop(1, '#d94a2a'); c.fillStyle = gr; c.beginPath(); c.arc(S / 2, S / 2, S * 0.43, 0, 7); c.fill();
      let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
      for (let i = 0; i < 9; i += 1) { const a = i * 0.7 + 0.3, r = (0.12 + (i % 3) * 0.1) * S; c.fillStyle = '#b3261e'; c.beginPath(); c.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, S * 0.055, 0, 7); c.fill(); c.fillStyle = 'rgba(255,170,140,0.5)'; c.beginPath(); c.arc(S / 2 + Math.cos(a) * r - 3, S / 2 + Math.sin(a) * r - 3, S * 0.02, 0, 7); c.fill(); }
      for (let i = 0; i < 40; i += 1) { c.fillStyle = rnd() > 0.5 ? '#3f8a3a' : '#2a2a2a'; c.fillRect(S * (0.15 + rnd() * 0.7), S * (0.15 + rnd() * 0.7), 5, 3); }
    });
    const y = post(g, 0.3) + 1.2, pie = new THREE.Group(); pie.position.set(0, y, 0); pie.rotation.x = Math.PI / 2 - 0.25; g.add(pie);
    add(pie, new THREE.CylinderGeometry(1.2, 1.2, 0.12, 48), [P({ color: 0xc98a3c, roughness: 0.8 }), P({ map: top, color: 0xffffff, roughness: 0.6, clearcoat: 0.2 }), P({ color: 0xc98a3c, roughness: 0.8 })]);
    add(pie, new THREE.TorusGeometry(1.16, 0.1, 10, 48), P({ color: 0xd99a4a, roughness: 0.75 }), 0, 0.05, 0, [Math.PI / 2, 0, 0]);
  },
  burger(g) {                                                // ハンバーガー
    const bun = P({ color: 0xd9953f, roughness: 0.5, clearcoat: 0.3 });
    add(g, lathe([[0.001, 0], [1.0, 0], [1.08, 0.14], [1.04, 0.32], [0.001, 0.34]]), bun);
    add(g, new THREE.CylinderGeometry(1.1, 1.1, 0.26, 40), P({ color: 0x5a3320, roughness: 0.85 }), 0, 0.5, 0);
    add(g, slab(2.1, 2.1, 0.07, 0.1), P({ color: 0xf7c531, roughness: 0.4, clearcoat: 0.4 }), 0, 0.68, 0, [Math.PI / 2, 0, 0.6]);
    const let2 = new THREE.TorusGeometry(1.05, 0.11, 8, 40); const p = let2.attributes.position; for (let i = 0; i < p.count; i += 1) p.setZ(i, p.getZ(i) + Math.sin(Math.atan2(p.getY(i), p.getX(i)) * 9) * 0.07); let2.computeVertexNormals();
    add(g, let2, P({ color: 0x5fae3f, roughness: 0.55 }), 0, 0.8, 0, [Math.PI / 2, 0, 0]);
    add(g, new THREE.CylinderGeometry(1.0, 1.0, 0.12, 40), P({ color: 0xd8342c, roughness: 0.35, clearcoat: 0.6 }), 0, 0.88, 0);
    add(g, lathe([[1.06, 0.94], [1.08, 1.1], [0.98, 1.4], [0.7, 1.64], [0.3, 1.76], [0.001, 1.78]]), bun);
    for (let i = 0; i < 16; i += 1) { const a = i * 2.4, r = 0.2 + (i % 4) * 0.2, h = 1.76 - r * r * 0.36; add(g, new THREE.SphereGeometry(0.05, 8, 6), P({ color: 0xfff1cf, roughness: 0.5 }), Math.cos(a) * r, h, Math.sin(a) * r).scale.set(1, 0.5, 1.5); }
    g.scale.setScalar(0.95);
  },
  wear_shop(g, color) {                                      // Tシャツ（ハンガーに かかる）
    const y = post(g, 0.3) + 1.1;
    add(g, poly([[-0.5, 0.95], [-1.25, 0.5], [-0.95, 0.05], [-0.62, 0.3], [-0.62, -0.95], [0.62, -0.95], [0.62, 0.3], [0.95, 0.05], [1.25, 0.5], [0.5, 0.95], [0.22, 0.8], [-0.22, 0.8]], 0.22), P({ color: color ?? 0xe8668d, roughness: 0.75, sheen: 0.6 }), 0, y, 0);
    add(g, slab(0.5, 0.5, 0.03, 0.12), P({ color: 0xffffff, roughness: 0.6 }), 0, y - 0.1, 0.13);
    add(g, new THREE.TorusGeometry(0.16, 0.03, 8, 20, Math.PI * 1.5), P({ color: 0xc8ced6, roughness: 0.2, metalness: 1 }), 0, y + 1.2, 0);
  },
  block_shop(g) {                                            // つみあげた ブロック
    const cols = [0xd9483b, 0x3f8fd8, 0xf2c531, 0x4fae5a];
    [[-0.55, 0.5, 0], [0.55, 0.5, 0], [0, 1.5, 0], [0.5, 2.36, 0.0]].forEach(([x, y, z], i) => { const s = i === 3 ? 0.72 : 1; add(g, slab(s, s, s, 0.1), P({ color: cols[i], roughness: 0.35, clearcoat: 0.6 }), x, y, z, [0, i * 0.25, 0]); for (const dx of [-0.22, 0.22]) for (const dz of [-0.22, 0.22]) add(g, new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.12, 12), P({ color: cols[i], roughness: 0.35, clearcoat: 0.6 }), x + dx * s, y + s / 2 + 0.05, z + dz * s); });
  },
  weapon_shop(g) {                                           // たてと こうさした けん
    const y = post(g, 0.3) + 1.25, steel = P({ color: 0xdfe6ee, roughness: 0.18, metalness: 1 }), gold = P({ color: 0xf2c14e, roughness: 0.25, metalness: 1 });
    add(g, poly([[-0.9, 0.9], [0.9, 0.9], [0.9, -0.1], [0, -1.1], [-0.9, -0.1]], 0.16), P({ color: 0x2c4a8a, roughness: 0.35, clearcoat: 0.8 }), 0, y, 0);
    add(g, poly([[-0.7, 0.72], [0.7, 0.72], [0.7, -0.05], [0, -0.85], [-0.7, -0.05]], 0.04), gold, 0, y, 0.1);
    add(g, poly([[-0.52, 0.56], [0.52, 0.56], [0.52, 0], [0, -0.62], [-0.52, 0]], 0.04), P({ color: 0x2c4a8a, roughness: 0.35 }), 0, y, 0.13);
    for (const s of [-1, 1]) { const sw = new THREE.Group(); sw.position.set(0, y, -0.14); sw.rotation.z = s * 0.7; g.add(sw); add(sw, poly([[-0.09, -0.6], [0.09, -0.6], [0.09, 1.3], [0, 1.52], [-0.09, 1.3]], 0.05), steel); add(sw, slab(0.6, 0.12, 0.1, 0.04), gold, 0, -0.62, 0); add(sw, new THREE.CylinderGeometry(0.06, 0.06, 0.4, 10), P({ color: 0x5a3b24, roughness: 0.8 }), 0, -0.88, 0); add(sw, new THREE.SphereGeometry(0.09, 10, 8), gold, 0, -1.1, 0); }
  },
  land_shop(g) {                                             // 小さな 家と 金の かぎ
    add(g, slab(1.5, 1.1, 1.1, 0.06), P({ color: 0xfbf3e2, roughness: 0.85 }), -0.3, 0.75, 0);
    const roof = new THREE.ConeGeometry(1.25, 0.8, 4); roof.rotateY(Math.PI / 4); add(g, roof, P({ color: 0xc8423a, roughness: 0.6 }), -0.3, 1.7, 0).scale.set(1, 1, 0.8);
    add(g, slab(0.34, 0.56, 0.04, 0.05), P({ color: 0x7a5a3c, roughness: 0.7 }), -0.3, 0.5, 0.57);
    const gold = P({ color: 0xf5c542, roughness: 0.2, metalness: 1 }); const k = new THREE.Group(); k.position.set(0.95, 1.2, 0.2); k.rotation.z = -0.3; g.add(k);
    add(k, new THREE.TorusGeometry(0.3, 0.09, 10, 24), gold, 0, 0.5, 0); add(k, new THREE.CylinderGeometry(0.07, 0.07, 1.0, 10), gold, 0, -0.3, 0); for (const yy of [-0.62, -0.4]) add(k, slab(0.26, 0.12, 0.08, 0.02), gold, 0.16, yy, 0);
  },
  word_house(g) {                                            // A・B・C の つみき
    const face = (ch, bg) => tex(128, (c, S) => { c.fillStyle = bg; c.fillRect(0, 0, S, S); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 8; c.strokeRect(8, 8, S - 16, S - 16); c.fillStyle = '#fff'; c.font = '900 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, S / 2, S / 2 + 6); });
    [['A', '#d9483b', -0.6, 0.5, 0.2], ['B', '#3f8fd8', 0.6, 0.5, -0.15], ['C', '#f2a531', 0, 1.5, 0.3]].forEach(([ch, bg, x, y, turn]) => add(g, slab(1, 1, 1, 0.1), P({ map: face(ch, bg), color: 0xffffff, roughness: 0.4, clearcoat: 0.5 }), x, y, 0, [0, turn, 0]));
  },
};

export function roofSign(kind, color) {
  const make = SIGN[kind]; if (!make) return null;
  const g = new THREE.Group(); make(g, color); return g;
}
export const ROOF_SIGNS = Object.keys(SIGN);

// ゲート：石の 柱と アーチ、うずを まく 光の まく（色は 行き先の 色）。はば 4.6（柱は x = ±2.3）・正面が +z。9 メッシュ・光は 足さない。
export function gateModel(color) {
  const g = new THREE.Group(), stone = P({ color: 0xd9d2c0, roughness: 0.85 }), dark = P({ color: 0xb3ab98, roughness: 0.9 });
  const col = lathe([[0.001, 0], [0.62, 0], [0.62, 0.3], [0.46, 0.42], [0.4, 0.6], [0.37, 3.3], [0.44, 3.42], [0.56, 3.5], [0.56, 3.7], [0.001, 3.7]], 16);
  for (const s of [-1, 1]) add(g, col, stone, s * 2.3, 0, 0);
  add(g, new THREE.TorusGeometry(2.3, 0.42, 10, 28, Math.PI), stone, 0, 3.7, 0);
  add(g, new THREE.TorusGeometry(2.3, 0.5, 8, 5, 0.34), dark, 0, 3.7, 0, [0, 0, Math.PI / 2 - 0.17]);          // かなめ石
  const hex = `#${new THREE.Color(color).getHexString()}`;
  const swirl = tex(256, (c, S) => {
    const gr = c.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, hex); gr.addColorStop(1, '#0c241c'); c.fillStyle = gr; c.fillRect(0, 0, S, S);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 5; c.lineCap = 'round';
    for (let k = 0; k < 4; k += 1) { c.beginPath(); for (let i = 0; i <= 60; i += 1) { const a = k * 1.57 + i * 0.09, r = 6 + i * 1.9; c[i ? 'lineTo' : 'moveTo'](S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); } c.stroke(); }
  });
  const veil = new THREE.Shape(); veil.moveTo(-1.95, 0.1); veil.lineTo(1.95, 0.1); veil.lineTo(1.95, 3.7); veil.absarc(0, 3.7, 1.95, 0, Math.PI, false); veil.lineTo(-1.95, 0.1);
  const vg = new THREE.ShapeGeometry(veil, 20), uv = vg.attributes.uv, pos = vg.attributes.position;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (pos.getX(i) + 2.9) / 5.8, pos.getY(i) / 5.8);
  const m = new THREE.MeshStandardMaterial({ color, map: swirl, emissive: color, emissiveMap: swirl, emissiveIntensity: 0.5, transparent: true, opacity: 0.88, side: THREE.DoubleSide, roughness: 0.3 });
  const v = new THREE.Mesh(vg, m); g.add(v);
  for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffb066, emissiveIntensity: 0.5 }), s * 2.3, 3.95, 0);
  g.userData.spin = (t) => { if (swirl) { swirl.center.set(0.5, 0.33); swirl.rotation = t * 0.5; } m.emissiveIntensity = 0.42 + Math.sin(t * 2) * 0.08; };
  return g;
}
