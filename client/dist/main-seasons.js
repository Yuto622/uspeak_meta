// メインの島の 季節の かざり。大通りの 旗と、ひろばの まんなかの「見せ場」を 季節ごとに かえる。
//
//   春  … さくら色の 旗・花びら
//   夏  … 夏まつり：やぐら（たいこ）・ちょうちんの ひも・夜は 花火
//   秋  … もみじ色の 旗・かぼちゃと わらの 山・落ち葉
//   冬  … イルミネーション・雪。12 月は クリスマスツリー（かざり・星・プレゼント）、1〜2 月は 雪だるま
//
// ・季節は 日本の 月（サーバーの daily.js の seasonFor と 同じ 分けかた）。見た目だけ なので ページが 決める。
//   ためしに 見る：URL に ?season=spring|summer|autumn|winter|xmas。
// ・作るのは いまの 季節の 分だけ（1 回）。光る ものは 夜に 強く（setNight）。動くのは 小さな 点と 光の 強さ だけ。
import * as THREE from './three.module.js';
import { singleFir, singleBroad } from './real-trees.js';

const JST = 9 * 3600 * 1000;
export function seasonNow(now = Date.now()) {
  let forced = '';
  try { forced = new URLSearchParams(location.search).get('season') || ''; } catch { /* Node */ }
  if (forced === 'xmas') return { season: 'winter', xmas: true };
  if (['spring', 'summer', 'autumn', 'winter'].includes(forced)) return { season: forced, xmas: forced === 'winter' };
  const month = new Date(now + JST).getUTCMonth() + 1;
  const season = month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
  return { season, xmas: month === 12 };
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const ballGeo = new THREE.SphereGeometry(0.5, 12, 9);
const drumGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);

export function createMainSeasons({ root, spot, street, onObstacle, clear = () => true }) {
  const glows = [];        // { material, day, night, twinkle? }
  const tickers = [];      // (t, dt, player) => void
  let night = 0, group = null, current = null, last = 0;
  const mats = new Map();
  const mat = (color, glow = null) => {
    const key = `${color}:${glow ? glows.length : 0}`;
    if (!glow && mats.has(key)) return mats.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    if (glow) { m.emissive = new THREE.Color(color); glows.push({ material: m, ...glow }); } else mats.set(key, m);
    return m;
  };
  const box = (x, y, z, w, h, d, color, glow = null) => {
    const m = new THREE.Mesh(boxGeo, mat(color, glow)); m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  };
  // 同じ 形を たくさん：1 色 1 回の 描画。
  function many(geo, color, list, glow = null, scale = [1, 1, 1]) {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat(color, glow), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(...scale);
    list.forEach((p, i) => mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q, p[3] ? new THREE.Vector3(p[3], p[3], p[3]).multiply(s) : s)));
    mesh.castShadow = !glow; mesh.frustumCulled = false; group.add(mesh); return mesh;
  }
  // たるんだ ひもの 上の 点。
  function along(ax, ay, az, bx, by, bz, step = 1.1, sag = 0.55) {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az, by - ay) / step)), out = [];
    for (let i = 0; i <= n; i += 1) { const t = i / n; out.push([ax + (bx - ax) * t, ay + (by - ay) * t - Math.sin(t * Math.PI) * sag, az + (bz - az) * t]); }
    return out;
  }
  const cord = (pts) => many(boxGeo, 0x3a3128, pts, null, [0.06, 0.06, 0.06]);
  const pole = (x, z, h, color = 0x6f5b3e) => { box(x, h / 2, z, 0.22, h, 0.22, color); box(x, 0.15, z, 0.6, 0.3, 0.6, 0x8d8570); };

  // ふって くる もの（花びら・落ち葉・雪）：子どもの まわりの 箱の 中だけ。
  function drift(count, color, size, fall, wander) {
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    const R = 34, H = 16;
    for (let i = 0; i < count; i += 1) { pos[i * 3] = (Math.random() - 0.5) * R * 2; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = (Math.random() - 0.5) * R * 2; seed[i] = Math.random() * 6.28; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false; group.add(pts);
    tickers.push((t, dt, player) => {
      if (player) pts.position.set(player.position.x - root.position.x, 0, player.position.z - root.position.z);
      for (let i = 0; i < count; i += 1) {
        pos[i * 3 + 1] -= fall * dt * (0.7 + (seed[i] % 1) * 0.6);
        pos[i * 3] += Math.sin(t * 0.9 + seed[i]) * wander * dt;
        pos[i * 3 + 2] += Math.cos(t * 0.7 + seed[i] * 1.7) * wander * dt;
        if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = H;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }
  // 大通りの 旗（季節の 色）。
  function flags(colours) {
    const pts = along(street.ax, street.h, street.az, street.bx, street.h, street.bz, 1.2);
    cord(pts);
    colours.forEach((c, k) => many(boxGeo, c, pts.filter((_, i) => i % colours.length === k).map((p) => [p[0], p[1] - 0.3, p[2]]), null, [0.42, 0.5, 0.08]));
  }

  // 見せ場の まんなかの 大きな 木（どの 季節も 木）。
  function bigTree(x, z, colour, scale = 1.35, seed = 21) {
    const tree = singleBroad({ colour, seed });
    tree.group.scale.setScalar(scale); tree.group.position.set(x, 0, z); group.add(tree.group);
    tickers.push((t) => tree.update(t));
    onObstacle?.({ x, z, w: 0.7, d: 0.7 });
    return tree.height * scale;
  }

  // ---- 春 ----
  function spring() {
    flags([0xf7a8c4, 0xfff4f7, 0xa9d873, 0xf9c6d8]);
    // 見せ場：大きな さくらの 木。根もとに 花。
    const { x, z } = spot;
    bigTree(x, z, 0xf8b4cd);
    const beds = [];
    for (let i = 0; i < 40; i += 1) { const a = Math.random() * 6.283, r = 1.6 + Math.random() * 2.2; beds.push([x + Math.cos(a) * r, 0.5, z + Math.sin(a) * r, 0.8 + Math.random() * 0.6]); }
    [0xf48fb1, 0xfff176, 0xffffff, 0xce93d8].forEach((c, k) => many(ballGeo, c, beds.filter((_, i) => i % 4 === k), null, [0.3, 0.26, 0.3]));
    many(boxGeo, 0x5f8a3a, beds.map((b) => [b[0], 0.34, b[2]]), null, [0.06, 0.3, 0.06]);
    many(ballGeo, 0xf9c6d8, Array.from({ length: 70 }, () => { const a = Math.random() * 6.283, r = Math.random() * 4.6; return [x + Math.cos(a) * r, 0.24, z + Math.sin(a) * r]; }), null, [0.2, 0.03, 0.14]);   // おちた 花びら
    drift(260, 0xf9bcd2, 0.2, 0.9, 0.9);
  }

  // ---- 夏：夏まつり ----
  function summer() {
    const lantern = (pts, red = true) => {
      many(ballGeo, red ? 0xe5392f : 0xfff1d8, pts.map((p) => [p[0], p[1] - 0.34, p[2]]), { day: 0.35, night: 1.7 }, [0.44, 0.56, 0.44]);
      many(boxGeo, 0x2a2420, pts.flatMap((p) => [[p[0], p[1] - 0.05, p[2]], [p[0], p[1] - 0.63, p[2]]]), null, [0.26, 0.06, 0.26]);
    };
    // 大通り：赤と 白の ちょうちん。
    const main = along(street.ax, street.h + 0.3, street.az, street.bx, street.h + 0.3, street.bz, 1.5);
    cord(main); lantern(main.filter((_, i) => i % 2 === 0), true); lantern(main.filter((_, i) => i % 2 === 1), false);
    // 見せ場：大きな みどりの 木。その よこに たいこ。
    const { x, z } = spot;
    const top = bigTree(x, z, 0x58a548) * 0.52;
    const dx = 2.6, dz = 1.8;
    box(x + dx, 0.5, z + dz, 1.0, 1.0, 1.0, 0x6f4a30);
    const drum = new THREE.Mesh(drumGeo, mat(0x9a3b2a)); drum.scale.set(1.2, 1.0, 1.2); drum.rotation.z = Math.PI / 2; drum.position.set(x + dx, 1.6, z + dz); drum.castShadow = true; group.add(drum);
    for (const sx of [-0.51, 0.51]) { const skin = new THREE.Mesh(drumGeo, mat(0xf2e6c8)); skin.scale.set(1.14, 0.04, 1.14); skin.rotation.z = Math.PI / 2; skin.position.set(x + dx + sx, 1.6, z + dz); group.add(skin); }
    // 木から まわりの 柱へ、ちょうちんの ひも 6 本。
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.3, px = x + Math.cos(a) * 7, pz = z + Math.sin(a) * 7;
      if (!clear(px, pz)) continue;                     // 建物・道・水の 上には 立てない
      pole(px, pz, 3.6);
      const pts = along(x, top, z, px, 3.6, pz, 1.25, 0.5);
      cord(pts); lantern(pts.slice(1).filter((_, k) => k % 2 === 0), i % 2 === 0); lantern(pts.slice(1).filter((_, k) => k % 2 === 1), i % 2 !== 0);
    }
    // 夜の 花火（点の かたまり 3 つ。ひらいて、おちて、きえる）。
    const COLOURS = [0xff6b6b, 0xffd166, 0x8ff0c8, 0x7ec8ff, 0xff9ad5, 0xffffff];
    for (let b = 0; b < 3; b += 1) {
      const N = 90, dirs = [], pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i += 1) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u); dirs.push([r * Math.cos(a), u, r * Math.sin(a), 0.75 + Math.random() * 0.35]); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, m); pts.frustumCulled = false; group.add(pts);
      const st = { at: -1, c: [0, 0, 0] };
      tickers.push((t) => {
        const period = 5.5, age = ((t + b * 1.9) % period);
        if (night < 0.45) { m.opacity = 0; return; }
        if (age < st.at || st.at < 0) { st.c = [x + (Math.random() - 0.5) * 30, 17 + Math.random() * 7, z - 14 + (Math.random() - 0.5) * 22]; m.color.setHex(COLOURS[Math.floor(Math.random() * COLOURS.length)]); }
        st.at = age;
        const life = 2.6, u = Math.min(1, age / life), spread = 7.5 * (1 - (1 - u) ** 3);
        for (let i = 0; i < N; i += 1) { const d = dirs[i]; pos[i * 3] = st.c[0] + d[0] * spread * d[3]; pos[i * 3 + 1] = st.c[1] + d[1] * spread * d[3] - u * u * 3.2; pos[i * 3 + 2] = st.c[2] + d[2] * spread * d[3]; }
        geo.attributes.position.needsUpdate = true;
        m.opacity = age < life ? (1 - u * u) * Math.min(1, (night - 0.45) * 4) : 0;
      });
    }
  }

  // ---- 秋 ----
  function autumn() {
    flags([0xd9482b, 0xf0a52a, 0x8a5a2b, 0xe8742a]);
    const { x, z } = spot;
    // わらの 山と かぼちゃ。
    for (const [dx, dy, dz] of [[-0.9, 0.5, 0], [0.9, 0.5, 0], [0, 0.5, 1.2], [0, 1.5, 0.3]]) { box(x + dx, dy, z + dz, 1.7, 1.0, 1.1, 0xd9b45a); box(x + dx, dy, z + dz, 1.74, 0.1, 1.14, 0xb58f3e); }
    const pumpkins = [[-2.2, 0.42, 1.2, 1.1], [2.1, 0.36, 1.0, 0.9], [1.3, 0.3, 2.2, 0.75], [-1.2, 0.32, 2.3, 0.8], [0.2, 0.46, 2.6, 1.2], [-2.6, 0.28, -0.4, 0.7], [2.7, 0.3, -0.6, 0.75]].map((p) => [x + p[0], p[1], z + p[2], p[3]]);
    many(ballGeo, 0xe8811f, pumpkins, null, [0.95, 0.78, 0.95]);
    many(boxGeo, 0x5a7a3a, pumpkins.map((p) => [p[0], p[1] + 0.36 * p[3], p[2], p[3]]), null, [0.12, 0.2, 0.12]);
    // うしろに 大きな もみじの 木。
    bigTree(x, z - 2.4, 0xd9482b);
    onObstacle?.({ x, z: z + 0.3, w: 1.9, d: 1.1 });
    drift(240, 0xe8742a, 0.26, 1.3, 1.5);
  }

  // ---- 冬 ----
  function winter(xmas) {
    // 大通り：色とりどりの あかり（3 くみが かわるがわる またたく）。
    const pts = along(street.ax, street.h, street.az, street.bx, street.h, street.bz, 0.7, 0.6);
    cord(pts);
    const BULB = [0xff5a5a, 0xffd24a, 0x5fe08a, 0x5ab6ff, 0xff8ad0];
    BULB.forEach((c, k) => many(ballGeo, c, pts.filter((_, i) => i % BULB.length === k).map((p) => [p[0], p[1] - 0.16, p[2]]), { day: 0.5, night: 2.2, twinkle: k * 1.3 }, [0.24, 0.3, 0.24]));
    const { x, z } = spot;
    many(boxGeo, 0xf4f8fc, [[x, 0.3, z, 1], [x + 3.6, 0.28, z + 2.6, 0.5], [x - 3.8, 0.28, z - 2.0, 0.6], [x - 2.4, 0.28, z + 3.6, 0.4]], null, [7.6, 0.14, 7.6]);   // 雪の つもった 地面
    if (xmas) {
      const fir = singleFir({ height: 7.4, colour: 0x62ad6e, seed: 9 });
      const S = 1.5; fir.group.scale.setScalar(S); fir.group.position.set(x, 0, z); group.add(fir.group);
      tickers.push((t) => fir.update(t));
      box(x, 0.35, z, 1.5, 0.7, 1.5, 0xb5322c); box(x, 0.72, z, 1.62, 0.1, 1.62, 0xf2c14e);
      const H = fir.height * S;
      // かざりの 玉と、らせんの あかり。木の 円すいの 表面に のせる。
      const onCone = (u, a, out = 1) => { const y = H * (0.2 + u * 0.78), r = ((1 - u) * 2.9 + 0.3) * S * 0.86 * out; return [x + Math.cos(a) * r, y - (1 - u) * 0.7, z + Math.sin(a) * r]; };
      const baubles = []; for (let i = 0; i < 54; i += 1) baubles.push([...onCone(0.04 + (i / 54) * 0.86, i * 2.4), 0.8 + (i % 3) * 0.25]);
      [0xe5392f, 0xf2c14e, 0x4aa3ff, 0xf5f5f5].forEach((c, k) => many(ballGeo, c, baubles.filter((_, i) => i % 4 === k), { day: 0.25, night: 0.9 }, [0.34, 0.34, 0.34]));
      const lights = []; for (let i = 0; i < 150; i += 1) { const u = i / 150; lights.push(onCone(u * 0.95, u * Math.PI * 2 * 7, 1.04)); }
      [0xfff0a8, 0xff7a7a, 0x8fe8ff].forEach((c, k) => many(ballGeo, c, lights.filter((_, i) => i % 3 === k), { day: 0.7, night: 2.6, twinkle: k * 2.1 }, [0.16, 0.16, 0.16]));
      // てっぺんの 星。
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat(0xffd84a, { day: 0.8, night: 3 })); star.position.set(x, H + 0.35, z); star.scale.set(1, 1.5, 0.5); group.add(star);
      tickers.push((t) => { star.rotation.y = t * 0.8; });
      // プレゼント。
      [[-2.2, 1.6, 0xd8342c, 0.9], [2.0, 1.9, 0x2f8f5b, 1.0], [0.4, 2.7, 0x3a78d8, 0.75], [-1.3, -2.3, 0xf2c14e, 0.8], [2.5, -1.0, 0xa24ad8, 0.7], [-2.8, -0.4, 0x2f8f5b, 0.65]].forEach(([dx, dz, c, s]) => {
        box(x + dx, s / 2, z + dz, s, s, s, c); box(x + dx, s / 2, z + dz, s * 1.03, s * 1.03, s * 0.18, 0xfff4d6); box(x + dx, s / 2, z + dz, s * 0.18, s * 1.03, s * 1.03, 0xfff4d6);
      });
      onObstacle?.({ x, z, w: 0.9, d: 0.9 });
    } else {
      // 雪を かぶった もみの 木と、雪だるま 2 つ。
      const fir = singleFir({ height: 7.4, colour: 0xb9d8c2, seed: 9 });
      fir.group.scale.setScalar(1.35); fir.group.position.set(x, 0, z - 2.2); group.add(fir.group);
      tickers.push((t) => fir.update(t));
      // 雪だるま 2 つ。
      for (const [dx, dz, s] of [[-1.3, 0, 1], [1.5, 0.6, 0.72]]) {
        many(ballGeo, 0xf7fafd, [[x + dx, 0.75 * s, z + dz, 1.5 * s], [x + dx, 1.85 * s, z + dz, 1.1 * s], [x + dx, 2.65 * s, z + dz, 0.8 * s]]);
        box(x + dx, 2.68 * s, z + dz + 0.42 * s, 0.12 * s, 0.12 * s, 0.4 * s, 0xf08a2a);
        box(x + dx, 3.1 * s, z + dz, 0.7 * s, 0.1 * s, 0.7 * s, 0x2a2a2a); box(x + dx, 3.35 * s, z + dz, 0.46 * s, 0.5 * s, 0.46 * s, 0x2a2a2a);
        box(x + dx, 2.25 * s, z + dz, 0.9 * s, 0.16 * s, 0.9 * s, 0xd8342c);
      }
      onObstacle?.({ x: x + 0.1, z: z + 0.3, w: 2.2, d: 0.9 });
    }
    drift(420, 0xffffff, 0.2, 1.7, 0.7);
  }

  function applyGlow(t = 0) {
    for (const g of glows) {
      const base = g.day + (g.night - g.day) * night;
      g.material.emissiveIntensity = g.twinkle === undefined ? base : base * (0.55 + 0.45 * Math.sin(t * 2.6 + g.twinkle));
    }
  }
  function setSeason({ season, xmas }) {
    const key = `${season}:${xmas ? 1 : 0}`;
    if (key === current) return;
    if (group) { root.remove(group); group.traverse((o) => { if (o.geometry && ![boxGeo, ballGeo, drumGeo].includes(o.geometry)) o.geometry.dispose(); }); }
    glows.length = 0; tickers.length = 0; mats.clear();
    group = new THREE.Group(); root.add(group); current = key;
    ({ spring, summer, autumn, winter: () => winter(xmas) })[season]?.();
    applyGlow();
  }
  return {
    setSeason,
    get season() { return current; },
    setNight(n) { night = Math.max(0, Math.min(1, n || 0)); applyGlow(last); },
    update(t, player) {
      const dt = Math.min(0.1, Math.max(0, t - last)); last = t;
      for (const fn of tickers) fn(t, dt, player);
      if (glows.some((g) => g.twinkle !== undefined)) applyGlow(t);
    },
  };
}
