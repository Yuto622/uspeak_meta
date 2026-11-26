// 島の 家（2026-11：「建物も 超リアルに。でも 重く ならない ように」）。
//
// 前は 箱を つんだ 家（だんだんの 屋根）。いまは：かわらの 切妻屋根・しっくいの かべと 木の ほねぐみ・ガラスの まど（夜に 灯る）・
// よろい戸と 花の はこ・ひさしの ある 戸口・れんがの えんとつ・石の 土台。
//
// **重く しない 作り**：1 つの 島の 家を ぜんぶ まとめて、材質ごとに 1 つの メッシュに する（かべ・屋根・木・ガラス＝描く 回数は 島 1 つで 4 回。
// 家が 30 けん あっても 4 回）。もようは 小さな canvas の 絵（128〜256px）を くりかえし、家ごとの 色は 頂点の 色で かける。
// モデルの ファイルは 読まない。光も 足さない（まどは emissive だけ＝island-kit の setNight が 夜に 強く する）。
import * as THREE from './three.module.js';

function tex(size, paint) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); paint(g, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  } catch { return null; }
}
let s0 = 11; const rnd = () => ((s0 = (s0 * 16807) % 2147483647) - 1) / 2147483646;
let shared = null;
function materials() {
  if (shared) return shared;
  const plaster = tex(256, (g, S) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i += 1) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '120,110,95'},${rnd() * 0.07})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 1 + rnd() * 7, 0, 7); g.fill(); }
    for (let i = 0; i < 12; i += 1) { g.fillStyle = `rgba(90,80,60,${0.02 + rnd() * 0.03})`; g.fillRect(rnd() * S, 0, 6 + rnd() * 20, S); }
  });
  const tiles = tex(256, (g, S) => {
    g.fillStyle = '#b9b9b9'; g.fillRect(0, 0, S, S);
    const rows = 8, cols = 8, h = S / rows, w = S / cols;
    for (let r = 0; r < rows; r += 1) for (let c = -1; c < cols; c += 1) {
      const x = c * w + (r % 2 ? w / 2 : 0), y = r * h, l = 150 + rnd() * 80;
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgb(${l - 50},${l - 50},${l - 50})`); gr.addColorStop(0.25, `rgb(${l},${l},${l})`); gr.addColorStop(1, `rgb(${l + 18},${l + 18},${l + 18})`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + w - 1, y); g.lineTo(x + w - 1, y + h * 0.62); g.quadraticCurveTo(x + w / 2, y + h * 1.12, x + 1, y + h * 0.62); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,40,40,0.45)'; g.lineWidth = 1.5; g.stroke();
    }
  });
  const wood = tex(128, (g, S) => {
    g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i += 1) { g.strokeStyle = `rgba(${rnd() > 0.5 ? '70,50,30' : '255,245,225'},${0.08 + rnd() * 0.2})`; g.lineWidth = 0.6 + rnd() * 1.6; const y = rnd() * S; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(S * 0.3, y + (rnd() - 0.5) * 6, S * 0.7, y + (rnd() - 0.5) * 6, S, y + (rnd() - 0.5) * 3); g.stroke(); }
    for (let i = 0; i < 3; i += 1) { g.fillStyle = 'rgba(60,40,25,0.35)'; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 5, 2.4, 0, 0, 7); g.fill(); }
  });
  const M = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, ...o });
  shared = {
    wall: M({ map: plaster, roughness: 0.92 }),
    roof: M({ map: tiles, roughness: 0.7 }),
    wood: M({ map: wood, roughness: 0.8 }),
  };
  return shared;
}

const col = new THREE.Color();
function paintColor(geo, hex) { col.set(hex); const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i += 1) col.toArray(a, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
// 箱 1 つ。もようが 家の 大きさで のびない ように、面ごとに UV を 実寸に する（k ＝ 1 m あたりの くりかえし）。
function boxGeo(x, y, z, w, h, d, color, k = 0.5, rot = null) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f += 1) for (let i = 0; i < 4; i += 1) { const j = f * 4 + i; uv.setXY(j, uv.getX(j) * dims[f][0] * k, uv.getY(j) * dims[f][1] * k); }
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
  g.translate(x, y, z); paintColor(g, color); return g;
}
function triGeo(pts, normal, color, k = 0.5) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.flat()), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([...normal, ...normal, ...normal]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pts.flatMap((p) => [p[2] * k, p[1] * k])), 2));
  g.setIndex([0, 1, 2]); paintColor(g, color); return g;
}
function merge(parts) {
  let nv = 0, ni = 0; for (const p of parts) { nv += p.attributes.position.count; ni += p.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), cl = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, v * 3); nor.set(p.attributes.normal.array, v * 3); uv.set(p.attributes.uv.array, v * 2); cl.set(p.attributes.color.array, v * 3);
    const src = p.index.array; for (let k = 0; k < src.length; k += 1) idx[i + k] = src[k] + v;
    v += p.attributes.position.count; i += src.length; p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
const shadeHex = (hex, amt) => { col.set(hex); const h = {}; col.getHSL(h); return new THREE.Color().setHSL(h.h, h.s, Math.max(0, Math.min(1, h.l + amt))).getHex(); };

// 1 つの 島の 家を ためて、さいごに まとめる。add() は 屋根の てっぺんの 高さを 返す（かんばんを のせる 高さ）。
export function createHouseBatch() {
  const parts = { wall: [], roof: [], wood: [], glass: [] };
  const ranges = [];              // 家ごとの ガラス（お店が しまると その 家だけ 消す）
  const time = { value: 0 };
  let glassGeo = null, base = null, spans = null;
  const BEAM = 0x6b5138, STONE = 0xa39a88;
  function add(x, z, w, d, wall, roof) {
    const g0 = parts.glass.length;
    const hx = w / 2, hz = d / 2, front = z + hz, top = 4.4, over = 0.75;
    const rise = Math.min(2.7, Math.max(1.5, d * 0.36));
    const W = parts.wall, R = parts.roof, T = parts.wood, G = parts.glass;
    // 石の 土台と 戸口の だん。
    W.push(boxGeo(x, 0.35, z, w + 0.9, 0.7, d + 0.9, STONE, 0.7));
    W.push(boxGeo(x, 0.2, front + 0.85, 2.6, 0.4, 1.1, shadeHex(STONE, 0.06), 0.7));
    // かべ（しっくい）と、こしの 板ばり。
    W.push(boxGeo(x, 2.55, z, w, 3.7, d, wall, 0.35));
    T.push(boxGeo(x, 1.15, z, w + 0.06, 0.9, d + 0.06, shadeHex(wall, -0.2), 0.8));
    // 木の ほねぐみ：すみの 柱・上と 中の はり・まんなかの 柱。
    for (const sx of [-hx, hx]) for (const sz of [-hz, hz]) T.push(boxGeo(x + sx, 2.55, z + sz, 0.36, 3.7, 0.36, BEAM, 0.9));
    T.push(boxGeo(x, top - 0.12, z, w + 0.2, 0.28, d + 0.2, BEAM, 0.9));
    T.push(boxGeo(x, 1.66, z, w + 0.12, 0.16, d + 0.12, BEAM, 0.9));
    for (const sx of [-hx * 0.22 - 0.9, hx * 0.22 + 0.9]) if (Math.abs(sx) < hx - 0.4) T.push(boxGeo(x + sx, 3.0, front + 0.02, 0.2, 2.6, 0.12, BEAM, 0.9));
    // 切妻屋根：前と うしろに かたむく 2 まい＋妻の 三角＋むね。
    const run = hz + over, len = Math.hypot(run, rise * (run / hz)), ang = Math.atan2(rise, hz), peak = top + rise;
    for (const s of [-1, 1]) R.push(boxGeo(x, top + (rise * (run / hz)) / 2 - (over * rise) / hz - 0.02 + 0.09, z + s * (run / 2), w + 1.3, 0.2, len, roof, 0.42, [s * ang, 0, 0]));
    R.push(boxGeo(x, peak + 0.14, z, w + 1.4, 0.2, 0.42, shadeHex(roof, -0.12), 0.42));
    for (const s of [-1, 1]) {
      W.push(triGeo(s > 0 ? [[x + hx, top, z + hz], [x + hx, top, z - hz], [x + hx, peak, z]] : [[x - hx, top, z - hz], [x - hx, top, z + hz], [x - hx, peak, z]], [s, 0, 0], wall, 0.35));
      // 妻の はふ板（屋根の ふちの 板）。
      for (const f of [-1, 1]) T.push(boxGeo(x + s * (hx + 0.62), top + (rise * (run / hz)) / 2 - (over * rise) / hz + 0.0, z + f * (run / 2), 0.1, 0.3, len, BEAM, 0.9, [f * ang, 0, 0]));
      // まるい 小まど。
      G.push(boxGeo(x + s * (hx + 0.03), top + rise * 0.36, z, 0.06, 0.7, 0.7, 0xffffff));
      T.push(boxGeo(x + s * (hx + 0.05), top + rise * 0.36, z, 0.06, 0.86, 0.12, BEAM, 0.9)); T.push(boxGeo(x + s * (hx + 0.05), top + rise * 0.36, z, 0.06, 0.12, 0.86, BEAM, 0.9));
    }
    // のきの たるき。
    for (let i = 0; i * 1.0 < w - 0.4; i += 1) T.push(boxGeo(x - hx + 0.4 + i * 1.0, top - 0.02, front + 0.4, 0.14, 0.16, 0.8, BEAM, 0.9, [-ang * 0.6, 0, 0]));
    // れんがの えんとつ。
    const cx = x + hx * 0.55, cz = z - hz * 0.5;
    W.push(boxGeo(cx, peak - 0.3, cz, 0.85, 2.6, 0.85, 0xa5654c, 1.2)); W.push(boxGeo(cx, peak + 1.08, cz, 1.08, 0.22, 1.08, 0x7a4c3a, 1.2));
    // 戸口：わく・板の とびら・のぶ・小まど・ひさしと 柱。
    T.push(boxGeo(x, 1.5, front + 0.03, 1.56, 2.86, 0.28, shadeHex(BEAM, -0.06), 0.9));
    T.push(boxGeo(x, 1.45, front + 0.15, 1.2, 2.5, 0.14, 0x7a5a3c, 1.1));
    for (const dx of [-0.3, 0.3]) T.push(boxGeo(x + dx, 1.45, front + 0.225, 0.03, 2.4, 0.02, 0x4a3524));
    G.push(boxGeo(x, 2.25, front + 0.235, 0.56, 0.5, 0.03, 0xffffff));
    W.push(boxGeo(x + 0.42, 1.4, front + 0.27, 0.12, 0.12, 0.1, 0xd9b45a));
    R.push(boxGeo(x, 3.32, front + 0.62, 2.5, 0.14, 1.35, roof, 0.42, [0.32, 0, 0]));
    for (const sx of [-1.05, 1.05]) { T.push(boxGeo(x + sx, 1.85, front + 1.1, 0.16, 2.5, 0.16, BEAM, 0.9)); T.push(boxGeo(x + sx, 3.0, front + 0.6, 0.12, 0.12, 1.1, BEAM, 0.9)); }
    // まど：わく・ガラス・さん・まどだい・よろい戸・花の はこ。
    const win = (wx, wy, wz, side) => {
      const f = side ? [0.14, 1.3, 1.3] : [1.3, 1.3, 0.14], pane = side ? [0.06, 1.04, 1.04] : [1.04, 1.04, 0.06];
      const o = (a, b) => (side ? [wx + side * a, wy, wz + b] : [wx + b, wy, wz + a]);
      const P = (list, a, b, dy, sx, sy, sz, c, k2) => { const [px, , pz] = o(a, b); list.push(boxGeo(px, wy + dy, pz, side ? sz : sx, sy, side ? sx : sz, c, k2)); };
      P(T, 0.06, 0, 0, f[side ? 2 : 0], 1.3, 0.14, BEAM, 0.9);
      P(G, 0.13, 0, 0, pane[side ? 2 : 0], 1.04, 0.06, 0xffffff, 0.5);
      P(T, 0.17, 0, 0, 1.06, 0.07, 0.04, shadeHex(BEAM, 0.12), 0.9); P(T, 0.17, 0, 0, 0.07, 1.06, 0.04, shadeHex(BEAM, 0.12), 0.9);
      P(T, 0.2, 0, -0.72, 1.5, 0.12, 0.36, BEAM, 0.9);
      if (!side) {
        for (const sh of [-0.86, 0.86]) { P(T, 0.1, sh, 0, 0.4, 1.36, 0.1, shadeHex(roof, -0.02), 1.4); }
        P(T, 0.36, 0, -0.9, 1.3, 0.24, 0.3, 0x7a5a3c, 0.9);
        for (let i = 0; i < 5; i += 1) { P(W, 0.36, -0.5 + i * 0.25, -0.7, 0.22, 0.2, 0.24, i % 2 ? 0x5f9a4a : 0x4f8a3f, 2); P(W, 0.38, -0.5 + i * 0.25, -0.56, 0.14, 0.12, 0.14, [0xf06a8a, 0xffd84a, 0xffffff, 0xf08a3a, 0xc88af0][i], 2); }
      }
    };
    for (const sx of [-hx * 0.58, hx * 0.58]) win(x + sx, 2.85, front, 0);
    for (const s of [-1, 1]) win(x + s * hx, 2.85, z - hz * 0.25, s);
    // まどの 明るさは 1 まいずつ ちがう（r＝明るさ・g＝ゆらぎの ずれ）。5 まいに 1 まいは 消えて いる。戸口の 小まどは いつも つく。
    for (let i = g0; i < parts.glass.length; i += 1) {
      const h = Math.abs(Math.sin((x * 12.9898 + z * 78.233 + i * 37.719)) * 43758.5453) % 1, h2 = (h * 7.13) % 1;
      const level = i === g0 + 2 ? 0.9 : h < 0.2 ? 0.05 : 0.5 + h2 * 0.5;
      const c = parts.glass[i].attributes.color; for (let k = 0; k < c.count; k += 1) c.setXYZ(k, level, h2, 1);
    }
    ranges.push({ key: `${x}:${z}`, from: g0, to: parts.glass.length });
    return peak + 0.3;
  }
  // まとめて root に のせる。夜に 灯る ガラスの 材質を 返す（island-kit の setNight へ）。
  function flush(root) {
    const M = materials(), lit = [];
    for (const key of ['wall', 'roof', 'wood']) {
      if (!parts[key].length) continue;
      const mesh = new THREE.Mesh(merge(parts[key]), M[key]); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; root.add(mesh); parts[key] = [];
    }
    if (parts.glass.length) {
      // ガラスは 島ごとに 1 つ。昼は 空を うつす 青、夜は あたたかい 光。明るさは まど 1 まいずつ（頂点の 色に 入れて ある）＋ ゆっくり ゆらぐ。
      const glass = new THREE.MeshStandardMaterial({ color: 0x86aecb, roughness: 0.12, metalness: 0.55, emissive: new THREE.Color(0xffcf86), emissiveIntensity: 0 });
      glass.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time;
        sh.vertexShader = `attribute vec3 color;\nvarying vec3 vLit;\n${sh.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLit = color;');
        sh.fragmentShader = `uniform float uTime;\nvarying vec3 vLit;\n${sh.fragmentShader}`.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vLit.r * (0.93 + 0.07 * sin(uTime * 1.7 + vLit.g * 40.0));');
      };
      glass.customProgramCacheKey = () => 'uspeak-glass';
      let v = 0; const offs = parts.glass.map((g) => { const o = v; v += g.attributes.position.count; return o; }); offs.push(v);
      spans = new Map(ranges.map((r) => [r.key, [offs[r.from], offs[r.to]]]));
      glassGeo = merge(parts.glass); base = glassGeo.attributes.color.array.slice();
      const mesh = new THREE.Mesh(glassGeo, glass); mesh.frustumCulled = false; root.add(mesh); parts.glass = [];
      lit.push({ material: glass, glow: 1.15 });
    }
    return lit;
  }
  // その 家の まどを つける・消す（お店が しまって いる とき）。key ＝ add に わたした x・z。
  function setLit(x, z, on) {
    const span = spans?.get(`${x}:${z}`); if (!span) return;
    const a = glassGeo.attributes.color;
    for (let k = span[0]; k < span[1]; k += 1) a.array[k * 3] = on ? base[k * 3] : 0.02;
    a.needsUpdate = true;
  }
  return { add, flush, setLit, update(t) { time.value = t; }, get count() { return parts.wall.length; } };
}
