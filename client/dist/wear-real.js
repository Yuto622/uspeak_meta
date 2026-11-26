// きせかえの タブの 絵（すがた・ぼうし・かお・せなか・むね）を リアルな 3D で。絵文字の かわりに 出す。
// たべもの（food-real.js）と 同じ 作り：1 回だけ 絵に して レンダラーは すぐ 捨てる。作れない 端末は 絵文字の まま。
import * as THREE from './three.module.js';
import { renderShots, fitUnit } from './food-real.js';
import { buildChibiAvatar } from './avatar-chibi.js';

const P = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, ...o });
const mesh = (g, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const BUILD = {
  avatar(g) { const a = buildChibiAvatar('av-hero'); if (a) g.add(a); },
  hat(g) {                                                    // シルクハット：フェルトの つやと 赤い リボン
    const felt = P({ color: 0x23202b, roughness: 0.62, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color(0x6a6480) });
    mesh(g, lathe([[0.001, 0], [0.86, 0], [0.9, 0.03], [0.86, 0.07], [0.5, 0.09], [0.5, 0.1]]), felt);
    mesh(g, lathe([[0.5, 0.08], [0.47, 0.5], [0.52, 0.92], [0.5, 0.96], [0.001, 0.97]]), felt);
    mesh(g, new THREE.CylinderGeometry(0.487, 0.5, 0.2, 48, 1, true), P({ color: 0xd8243c, roughness: 0.35, sheen: 1, sheenColor: new THREE.Color(0xff9aa8), side: THREE.DoubleSide }), 0, 0.2, 0);
    g.rotation.z = -0.12;
  },
  face(g) {                                                   // サングラス：つやの ある ふちと 青い レンズ
    const frame = P({ color: 0x2a2140, roughness: 0.2, clearcoat: 1 });
    const lens = P({ color: 0x3fa9f5, roughness: 0.05, metalness: 0.4, clearcoat: 1, transparent: true, opacity: 0.82 });
    for (const s of [-1, 1]) {
      const rim = mesh(g, new THREE.TorusGeometry(0.3, 0.045, 12, 40), frame, s * 0.37, 0.4, 0); rim.scale.set(1.12, 0.86, 1);
      const l = mesh(g, new THREE.CylinderGeometry(0.29, 0.29, 0.03, 40), lens, s * 0.37, 0.4, 0); l.rotation.x = Math.PI / 2; l.scale.set(1.12, 1, 0.86);
      const arm = mesh(g, new THREE.CapsuleGeometry(0.03, 0.8, 4, 8), frame, s * 0.72, 0.42, -0.42); arm.rotation.x = Math.PI / 2;
      mesh(g, new THREE.SphereGeometry(0.05, 12, 8), frame, s * 0.7, 0.44, 0);
    }
    const bridge = mesh(g, new THREE.TorusGeometry(0.1, 0.035, 8, 16, Math.PI), frame, 0, 0.44, 0);
    bridge.castShadow = true; g.rotation.x = -0.12;
  },
  back(g) {                                                   // リュック：ふくらんだ 布・ポケット・ファスナー・もちて
    const cloth = P({ color: 0xe5335a, roughness: 0.75, sheen: 0.6, sheenColor: new THREE.Color(0xff9ab0) });
    const dark = P({ color: 0xb81f44, roughness: 0.75 });
    const body = mesh(g, new THREE.CapsuleGeometry(0.42, 0.46, 10, 32), cloth, 0, 0.62, 0); body.scale.set(1, 1, 0.62);
    const pocket = mesh(g, new THREE.CapsuleGeometry(0.26, 0.12, 8, 24), dark, 0, 0.42, 0.22); pocket.scale.set(1.15, 1, 0.5);
    const zip = mesh(g, new THREE.TorusGeometry(0.36, 0.014, 6, 40, Math.PI), P({ color: 0xf2c14e, roughness: 0.3, metalness: 0.8 }), 0, 0.82, 0.2); zip.scale.set(1, 0.7, 1);
    mesh(g, new THREE.SphereGeometry(0.035, 10, 8), P({ color: 0xf2c14e, roughness: 0.3, metalness: 0.9 }), 0.36, 0.8, 0.22);
    const handle = mesh(g, new THREE.TorusGeometry(0.14, 0.03, 8, 20, Math.PI), dark, 0, 1.24, -0.02);
    handle.castShadow = true;
    for (const s of [-1, 1]) { const st = mesh(g, new THREE.CapsuleGeometry(0.05, 0.7, 4, 8), dark, s * 0.3, 0.62, -0.26); st.rotation.z = s * 0.1; }
  },
  chest(g) {                                                  // メダル：リボンと 金の 円ばん・星
    const gold = P({ color: 0xf5c542, roughness: 0.22, metalness: 1 });
    for (const [s, c] of [[-1, 0x2c6fe0], [1, 0xd8243c]]) { const r = mesh(g, new THREE.BoxGeometry(0.2, 0.62, 0.03), P({ color: c, roughness: 0.5, sheen: 1 }), s * 0.11, 1.0, 0); r.rotation.z = s * -0.22; }
    const disc = mesh(g, new THREE.CylinderGeometry(0.36, 0.36, 0.07, 48), gold, 0, 0.42, 0); disc.rotation.x = Math.PI / 2;
    const rim = mesh(g, new THREE.TorusGeometry(0.36, 0.035, 10, 48), gold, 0, 0.42, 0); rim.castShadow = true;
    const star = new THREE.Shape(); for (let i = 0; i < 10; i += 1) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.1 : 0.23; star[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    mesh(g, new THREE.ExtrudeGeometry(star, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }), P({ color: 0xfff0b0, roughness: 0.15, metalness: 1 }), 0, 0.42, 0.035);
    mesh(g, new THREE.TorusGeometry(0.06, 0.018, 8, 16), gold, 0, 0.8, 0);
  },
};
export const WEAR_TABS = Object.keys(BUILD);
let shots = null;
export function wearTabShots() {
  if (!shots) shots = renderShots(WEAR_TABS, (id, env) => { const inner = new THREE.Group(); BUILD[id](inner); return fitUnit(inner, env); }, { size: 192, look: 0.48, turn: -0.4 });
  return shots;
}
