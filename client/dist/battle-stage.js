// えいごアリーナの 3D の たいせんがめん（2026-11：「こういう UI で たいせんがめんに」）。
//
// スタジアムの まんなかで、じぶんの なかま（ペット・なければ きつねの なかま）が 手前の ひだり、マスターウーピー（ふくろう）が おくの みぎ。
// カメラは じぶんの なかまの うしろから。**ここは 見せるだけ**：ダメージ・勝ち負け・こたえは 部屋が きめ、battle.js が できごとを わたす。
// ・絵は 島と 同じ renderer に べつの シーンを 描き、その コマを ダイアログの 2D の canvas へ うつす（WebGL を ふやさない・島の HUD は ダイアログの うしろ）。
// ・ひらいて いる あいだ 島は 描かない（game.js が `net.battleStage.running` を 見る）。
// ・ぜんぶ この 世界の 形（rpg-models・pet-models・箱と 球）。ほかの ゲームの キャラクターや 模様は 使わない。
import * as THREE from './three.module.js';
import { creatureModel, animateCreature } from './rpg-models.js';
import { CREATURES } from './rpg-data.js';
import { buildPet, animatePet, PET_KINDS } from './pet-models.js';

const YOU = new THREE.Vector3(-3.4, 0, 2.6);
const FOE = new THREE.Vector3(5.6, 0, -3.6);

export function createBattleStage({ renderer }) {
  let scene = null; let camera = null; let raf = 0; let out = null; let ctx = null;
  let you = null; let foe = null; let crowd = []; let last = 0; let clock = 0;
  const acts = [];      // { who, kind, at }
  const fxs = [];       // わざの 光：{ type, who, at, miss }
  let pool = null; let shake = 0;
  let ended = null;     // 'you' | 'foe' が たおれた

  const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
  const flat = (geo, color, y) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: .9 })); m.rotation.x = -Math.PI / 2; m.position.y = y; return m; };

  function star(r) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i += 1) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const k = i % 2 ? r * .45 : r; if (i) s.lineTo(Math.cos(a) * k, Math.sin(a) * k); else s.moveTo(Math.cos(a) * k, Math.sin(a) * k); }
    return new THREE.ShapeGeometry(s);
  }

  // 異次元の アリーナ（2026-11：「もっと 対戦画面 異次元に」）：宇宙に うかぶ ネオンの 舞台。星・星雲・わっかの ある 星・光の 柱・まわる クリスタル。
  // 光る ものは MeshBasicMaterial（光の 計算なし）と 加算の 半透明だけ。影・ぼかし・後処理は 使わない＝軽い。
  const glow = (geo, color, opacity = 1) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opacity >= 1, side: THREE.DoubleSide }));
  const lay = (m, y) => { m.rotation.x = -Math.PI / 2; m.position.y = y; return m; };
  const spin = []; const pulse = []; const beams = []; let stars = null;

  function build() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1c15);
    scene.add(new THREE.HemisphereLight(0xffe3bf, 0x2b5744, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-6, 12, 8); scene.add(key);
    const rim = new THREE.DirectionalLight(0x87f2c5, 1.4); rim.position.set(8, 5, -10); scene.add(rim);
    camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 600);

    // 星（700 つぶ・1 回の 描画）。
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pts = new Float32Array(700 * 3); const cols = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i += 1) {
      const a = rnd() * Math.PI * 2; const e = (rnd() - .25) * 1.5; const r = 180 + rnd() * 80;
      pts.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
      const c = new THREE.Color().setHSL(.55 + rnd() * .3, .7, .7 + rnd() * .3); cols.set([c.r, c.g, c.b], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pts, 3)); sg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: true })); scene.add(stars);

    // 星雲（大きな うすい 光の 玉）と、わっかの ある 星。
    for (const [x, y, z, r, c, o] of [[-70, 30, -150, 70, 0xffab3c, .1], [80, 10, -160, 80, 0x61edb3, .08], [10, 60, -170, 60, 0xff902f, .07], [-130, -10, -60, 50, 0xffab3c, .06], [-60, 26, -150, 45, 0xffbf6b, .08], [70, 14, -160, 50, 0x87f2c5, .07]]) {
      const n = glow(new THREE.SphereGeometry(r, 40, 28), c, o); n.position.set(x, y, z); scene.add(n);
    }
    const planet = new THREE.Group(); planet.position.set(46, 30, -110); planet.rotation.z = .35;
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(13, 24, 18), new THREE.MeshStandardMaterial({ color: 0xffb85c, emissive: 0x2d6d53, emissiveIntensity: .6, roughness: .7 })));
    planet.add(lay(glow(new THREE.RingGeometry(17, 24, 48), 0xffd166, .55), 0)); scene.add(planet); spin.push([planet, .05]);

    // 舞台：くらい ガラスの 円ばん＋ネオンの 輪（みゃくうつ）＋まんなかの ほし（この 世界の しるし）。
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(19, 16, 2.4, 48), new THREE.MeshStandardMaterial({ color: 0x1c3a2e, roughness: .35, metalness: .4 })); deck.position.y = -1.2; scene.add(deck);
    const under = new THREE.Mesh(new THREE.ConeGeometry(15, 12, 24), new THREE.MeshStandardMaterial({ color: 0x1d3f31, roughness: .8, flatShading: true })); under.rotation.x = Math.PI; under.position.y = -8.4; scene.add(under);
    scene.add(lay(glow(new THREE.CircleGeometry(19, 48), 0x19392c), .01));
    for (const [r0, r1, c] of [[18.2, 18.9, 0xffba7d], [13.2, 13.5, 0x87f2c5], [8.6, 8.9, 0xffba7d]]) { const ring = lay(glow(new THREE.RingGeometry(r0, r1, 64), c), .03); scene.add(ring); pulse.push(ring); }
    for (let i = 0; i < 12; i += 1) { const a = (i / 12) * Math.PI * 2; const tick = lay(glow(new THREE.PlaneGeometry(.25, 3.6), 0xffd8a6, .8), .02); tick.position.set(Math.sin(a) * 15.8, .02, Math.cos(a) * 15.8); tick.rotation.z = -a; scene.add(tick); }
    const mid = new THREE.Group(); mid.position.set(.6, 0, -.4); scene.add(mid);
    mid.add(lay(glow(new THREE.CircleGeometry(6.2, 48), 0x2a5f48), .04));
    const emblem = lay(glow(star(4), 0xffd166), .06); mid.add(emblem); spin.push([mid, .12]);
    const halo = lay(glow(new THREE.RingGeometry(5.6, 6.2, 48), 0xffd166, .8), .05); mid.add(halo); pulse.push(halo);

    // 光の 柱（舞台の ふち・6 本）と、まわりを まわる クリスタル。
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + .5; const col = i % 2 ? 0x87f2c5 : 0xffba7d;
      const beam = glow(new THREE.CylinderGeometry(.5, .9, 46, 12, 1, true), col, .28); beam.position.set(Math.sin(a) * 18.6, 23, Math.cos(a) * 18.6); scene.add(beam); beams.push(beam);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, .8, 12), new THREE.MeshStandardMaterial({ color: 0x35624f, metalness: .5, roughness: .4 })); base.position.set(beam.position.x, .4, beam.position.z); scene.add(base);
    }
    const orbit = new THREE.Group(); scene.add(orbit); spin.push([orbit, .08]);
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2; const r = 26 + rnd() * 12; const size = .8 + rnd() * 1.8;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(size), new THREE.MeshStandardMaterial({ color: [0xffba7d, 0x87f2c5, 0xffd8a6, 0xffd166][i % 4], emissive: [0xa0591a, 0x438162, 0xa0743a, 0x9a6a10][i % 4], emissiveIntensity: .9, roughness: .25, flatShading: true }));
      gem.position.set(Math.sin(a) * r, 2 + rnd() * 14, Math.cos(a) * r); gem.userData.seed = rnd() * 10; orbit.add(gem); crowd.push(gem);
    }
    // うかぶ 小さな 島（とおく）。
    for (const [x, y, z, k] of [[-34, 6, -40, 1.4], [38, -2, -30, 1], [-20, 12, -70, 1.8]]) {
      const isle = new THREE.Group(); isle.position.set(x, y, z); isle.scale.setScalar(k);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(5, 3.6, 1.4, 10), new THREE.MeshStandardMaterial({ color: 0x8f623a, flatShading: true })); isle.add(top);
      const rock = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6, 8), new THREE.MeshStandardMaterial({ color: 0x3c6e59, flatShading: true })); rock.rotation.x = Math.PI; rock.position.y = -3.6; isle.add(rock);
      const tip = glow(new THREE.OctahedronGeometry(1.1), 0xffba7d); tip.position.y = 2.6; isle.add(tip);
      isle.userData.seed = rnd() * 10; scene.add(isle); crowd.push(isle); isle.userData.base = y;
    }
    // あたった ときの 光の 輪（1 つを 使いまわす）。
    buildFx();
  }

  // ---- わざの 光（2026-11：「攻撃の エフェクト それぞれ 異次元に」）----
  // わざごとに ちがう 見せかた。部品は はじめに 作って 使いまわす（毎コマ 作らない）。ぜんぶ 加算の 光＝光の 計算なし。
  //   poyon ＝ とびこんで、地面に 3 重の 衝撃の 輪と 星の かけら
  //   beam  ＝ ためて、水色の 光線（まわる 輪が 流れる）
  //   super ＝ あいての 上に 金の 門が ひらき、大きな 星の クリスタルが 落ちて 大爆発（画面が ゆれる）
  //   heal  ＝ みどりの 輪が のぼり、光の つぶが らせんに まわる
  //   void  ＝ あいての こうげき：むらさきの やみの 玉が 弧を えがいて とぶ（外れは よこを すりぬける）
  //   fizzle＝ しぼむ 輪と 落ちる つぶ
  function buildFx() {
    const g = new THREE.Group(); scene.add(g);
    const mk = (geo, color, op = .9) => { const m = glow(geo, color, op); m.visible = false; m.frustumCulled = false; g.add(m); return m; };
    pool = {
      all: g,
      rings: Array.from({ length: 12 }, () => mk(new THREE.RingGeometry(.8, 1, 40), 0xffffff, .9)),
      sparks: Array.from({ length: 22 }, () => mk(new THREE.OctahedronGeometry(.2), 0xffffff, .95)),
      core: mk(new THREE.CylinderGeometry(.16, .16, 1, 10, 1, true), 0xffffff, .95),
      outer: mk(new THREE.CylinderGeometry(.45, .45, 1, 14, 1, true), 0xffba7d, .45),
      orb: mk(new THREE.SphereGeometry(.5, 16, 12), 0xffbf6b, .9),
      orb2: mk(new THREE.SphereGeometry(.85, 16, 12), 0x87f2c5, .35),
      portal: mk(new THREE.TorusGeometry(2.4, .16, 10, 44), 0xffd166, .95),
      meteor: mk(new THREE.OctahedronGeometry(1.2), 0xffd166, .95),
      flash: mk(new THREE.SphereGeometry(1, 20, 14), 0xffffff, .8),
    };
  }
  const UP = new THREE.Vector3(0, 1, 0); const FWD = new THREE.Vector3(0, 0, 1);
  const va = new THREE.Vector3(); const vb = new THREE.Vector3(); const vd = new THREE.Vector3(); const vp = new THREE.Vector3();

  function drawFx(t) {
    for (const m of pool.all.children) m.visible = false;
    shake = 0; let ri = 0; let si = 0;
    const ring = (p, scale, color, op, face = 'ground') => {
      const m = pool.rings[ri++]; if (!m || op <= 0) return;
      m.visible = true; m.position.copy(p); m.scale.setScalar(Math.max(.01, scale)); m.material.color.set(color); m.material.opacity = Math.min(1, op);
      if (face === 'ground') m.rotation.set(-Math.PI / 2, 0, 0); else if (face === 'cam') { m.rotation.set(0, 0, 0); m.lookAt(camera.position); } else m.quaternion.setFromUnitVectors(FWD, face);
    };
    const spark = (x, y, z, color, op, k = 1) => { const m = pool.sparks[si++]; if (!m || op <= 0) return; m.visible = true; m.position.set(x, y, z); m.scale.setScalar(k); m.rotation.set(t * 5 + si, t * 7, 0); m.material.color.set(color); m.material.opacity = Math.min(1, op); };
    const show = (m, p, scale, color, op) => { if (op <= 0) return; m.visible = true; m.position.copy(p); m.scale.setScalar(Math.max(.01, scale)); m.material.color.set(color); m.material.opacity = Math.min(1, op); };
    for (const f of fxs) {
      const u = t - f.at; if (u < 0) continue;
      va.copy(f.who === 'you' ? YOU : FOE).setY(1.25); vb.copy(f.who === 'you' ? FOE : YOU).setY(1.3);
      vd.subVectors(vb, va); const len = vd.length(); vd.normalize();
      if (f.type === 'poyon' && u >= .25 && u < 1.05) {
        const k = (u - .25) / .8; vp.copy(vb).setY(.12);
        [0x87f2c5, 0xffba7d, 0xffffff].forEach((c, i) => ring(vp, 1 + k * (3.5 + i * 2.2), c, 1 - k));
        for (let i = 0; i < 8; i += 1) { const a = (i / 8) * Math.PI * 2; spark(vb.x + Math.cos(a) * k * 3.4, 1.1 + Math.sin(k * Math.PI) * 1.6, vb.z + Math.sin(a) * k * 3.4, i % 2 ? 0xffd166 : 0xffffff, 1 - k, 1.4); }
        show(pool.flash, vb, .6 + k * 2.2, 0xbbf7de, .7 * (1 - k * 2));
      }
      if (f.type === 'beam') {
        if (u < .3) { vp.copy(va).addScaledVector(vd, 1); show(pool.orb, vp, .3 + (u / .3) * 1.1, 0xffba7d, .9); ring(vp, 2.2 - (u / .3) * 1.4, 0xffffff, .8, 'cam'); }
        if (u >= .3 && u < .95) {
          const k = (u - .3) / .65; const wide = (1 + Math.sin(u * 46) * .18) * (k > .8 ? (1 - k) * 5 : 1);
          vp.copy(va).addScaledVector(vd, len / 2);
          for (const [m, c, w] of [[pool.core, 0xffffff, 1], [pool.outer, 0xffba7d, 1]]) { m.visible = true; m.position.copy(vp); m.quaternion.setFromUnitVectors(UP, vd); m.scale.set(wide * w, len, wide * w); m.material.color.set(c); }
          for (let i = 0; i < 4; i += 1) { const q = ((k * 2.4) + i / 4) % 1; vp.copy(va).addScaledVector(vd, q * len); ring(vp, .9 + Math.sin(q * Math.PI) * .5, i % 2 ? 0x87f2c5 : 0xffba7d, .9, vd); }
          if (u >= .45) { show(pool.flash, vb, .8 + Math.sin(u * 30) * .2 + (u - .45) * 2, 0xffcc9f, .75 * (1 - k * .6)); for (let i = 0; i < 6; i += 1) { const a = i * 1.05 + u * 9; spark(vb.x + Math.cos(a) * 1.3, 1.3 + Math.sin(a * 1.7) * 1.1, vb.z + Math.sin(a) * 1.3, 0xffffff, .9); } }
        }
      }
      if (f.type === 'super' && u < 1.5) {
        vp.copy(vb).setY(7.5);
        if (u < 1.05) { pool.portal.visible = true; pool.portal.position.copy(vp); pool.portal.rotation.set(Math.PI / 2, 0, u * 7); pool.portal.scale.setScalar(Math.min(1, u / .3) * (u > .85 ? (1.05 - u) * 5 : 1)); ring(vp, 2.6 + Math.sin(u * 20) * .2, 0x87f2c5, .8); }
        if (u >= .4 && u < .8) { const k = (u - .4) / .4; vp.setY(7.5 - (7.5 - 1.4) * k * k); show(pool.meteor, vp, 1 + k * .3, 0xffd166, 1); pool.meteor.rotation.set(u * 9, u * 13, 0); for (let i = 0; i < 5; i += 1) spark(vp.x + Math.sin(i * 2.1) * .4, vp.y + .8 + i * .55, vp.z + Math.cos(i * 2.1) * .4, i % 2 ? 0xffffff : 0xffd166, .9 - i * .15, 1.3 - i * .15); }
        if (u >= .8) {
          const k = (u - .8) / .7; vp.copy(vb).setY(.12);
          show(pool.flash, vb, 1 + k * 9, 0xfff1b8, .95 * (1 - k));
          [0xffd166, 0x87f2c5, 0xffba7d, 0xffffff].forEach((c, i) => ring(vp, 1 + k * (4 + i * 2.6), c, 1 - k));
          for (let i = 0; i < 14; i += 1) { const a = (i / 14) * Math.PI * 2; const r = k * (3 + (i % 3) * 1.4); spark(vb.x + Math.cos(a) * r, 1 + Math.sin(k * Math.PI) * (2 + (i % 4)), vb.z + Math.sin(a) * r, [0xffd166, 0xffffff, 0x87f2c5][i % 3], 1 - k, 1.8); }
          shake = Math.max(shake, .4 * (1 - Math.min(1, k * 1.8)));
        }
      }
      if (f.type === 'heal' && u < 1.2) {
        const k = u / 1.2;
        for (let i = 0; i < 4; i += 1) { const y = ((k * 1.5 + i / 4) % 1) * 3.4; vp.copy(va).setY(.15 + y); ring(vp, 1.6 - y * .2, i % 2 ? 0xffba7d : 0x6ef0a8, (1 - y / 3.4) * (1 - k * .6)); }
        for (let i = 0; i < 10; i += 1) { const a = i * .63 + u * 5; const y = ((u * .9 + i / 10) % 1) * 3.4; spark(va.x + Math.cos(a) * 1.25, .2 + y, va.z + Math.sin(a) * 1.25, i % 3 ? 0x6ef0a8 : 0xffffff, (1 - y / 3.4) * (1 - k * .5), 1.1); }
        show(pool.flash, va, 1.3 + Math.sin(u * 8) * .15, 0x6ef0a8, .28 * (1 - k));
      }
      if (f.type === 'void' && u < 1.3) {
        const end = f.miss ? 1.5 : 1; const k = Math.min(end, u / .45);
        vp.copy(va).addScaledVector(vd, k * len); vp.y += Math.sin(Math.min(1, k) * Math.PI) * 2.2;
        if (f.miss) { vp.x += k * 1.9; vp.z += k * .6; }
        if (k < end) { show(pool.orb, vp, 1 + Math.sin(u * 30) * .12, 0xffab3c, .95); show(pool.orb2, vp, 1.2, 0x61edb3, .4); ring(vp, 1.25, 0xffbf6b, .8, 'cam'); for (let i = 1; i <= 5; i += 1) spark(vp.x - vd.x * i * .45, vp.y - Math.cos(Math.min(1, k) * Math.PI) * i * .12, vp.z - vd.z * i * .45, 0xffbf6b, .8 - i * .14, 1.2 - i * .15); }
        if (!f.miss && u >= .45) { const h = (u - .45) / .6; if (h < 1) { [0xffbf6b, 0x61edb3].forEach((c, i) => ring(vb, 1 + h * (3 + i * 2), c, 1 - h, 'cam')); show(pool.flash, vb, .8 + h * 3, 0xffbf6b, .7 * (1 - h)); shake = Math.max(shake, .12 * (1 - h)); } }
      }
      if (f.type === 'fizzle' && u < .8) {
        const k = u / .8; vp.copy(va).setY(1.6);
        ring(vp, 1.6 * (1 - k), 0xe6d1b6, .8 * (1 - k), 'cam');
        for (let i = 0; i < 4; i += 1) spark(va.x + (i - 1.5) * .45, 2 - k * 1.6, va.z, 0xb8a58c, .8 * (1 - k));
      }
    }
    while (fxs.length && t - fxs[0].at > 2) fxs.shift();
  }

  // 高さを そろえる（形ごとに 大きさが ちがうので、背の 高さで 合わせる）。
  function fit(group, height) {
    const b = new THREE.Box3().setFromObject(group); const h = Math.max(.2, b.max.y - b.min.y);
    const holder = new THREE.Group(); const k = height / h;
    group.scale.multiplyScalar(k); group.position.y = -b.min.y * k; holder.add(group);
    const shade = new THREE.Mesh(new THREE.RingGeometry(height * .34, height * .5, 28), new THREE.MeshBasicMaterial({ color: 0xffba7d, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = .08; holder.add(shade);
    holder.userData.body = group; holder.userData.shade = shade;
    return holder;
  }

  function cast(pet) {
    for (const f of [you, foe]) if (f) scene.remove(f);
    const owls = CREATURES.filter((c) => c.archetype === 'owl'); const owl = owls[owls.length - 1] || CREATURES[1];   // じぶんの なかまと 色が かぶらない 地域の ふくろう
    const fox = CREATURES.find((c) => c.archetype === 'fox') || CREATURES[0];
    const mine = PET_KINDS.includes(pet) ? { g: buildPet(pet), tick: (g, t) => animatePet(g, t, false) } : { g: creatureModel(fox), tick: (g, t) => animateCreature(g, t, 3) };
    you = fit(mine.g, 2.3); you.userData.tick = mine.tick; you.userData.home = YOU.clone();
    foe = fit(creatureModel(owl), 2.9); foe.userData.tick = (g, t) => animateCreature(g, t, 5); foe.userData.home = FOE.clone();
    you.position.copy(YOU); foe.position.copy(FOE);
    you.rotation.y = Math.atan2(FOE.x - YOU.x, FOE.z - YOU.z);
    foe.rotation.y = Math.atan2(YOU.x - FOE.x, YOU.z - FOE.z);
    scene.add(you, foe);
  }

  function pose(f, other, t) {
    const body = f.userData.body; const home = f.userData.home;
    f.userData.tick(body, t);
    f.position.copy(home); body.rotation.z = 0; f.scale.setScalar(1); let lift = 0;
    const who = f === you ? 'you' : 'foe';
    for (const a of acts) {
      const u = (t - a.at);
      if (a.who === who && a.kind === 'attack' && u >= 0 && u < .5) {              // あいてへ とびこむ
        const k = Math.sin((u / .5) * Math.PI);
        f.position.lerpVectors(home, other.userData.home, k * .32); lift = Math.max(lift, k * .5);
      }
      if (a.who === who && a.kind === 'hit' && u >= 0 && u < .45) {                 // あたって ゆれる
        f.position.x += Math.sin(u * 60) * .16 * (1 - u / .45); f.scale.setScalar(1 - Math.sin((u / .45) * Math.PI) * .12);
      }
      if (a.who === who && a.kind === 'cast' && u >= 0 && u < .6) { lift = Math.max(lift, Math.sin((u / .6) * Math.PI) * .35); f.scale.setScalar(1 + Math.sin((u / .6) * Math.PI) * .08); }
      if (a.who === who && a.kind === 'heal' && u >= 0 && u < .8) lift = Math.max(lift, Math.abs(Math.sin((u / .8) * Math.PI * 2)) * .7);
      if (a.who === who && a.kind === 'dodge' && u >= 0 && u < .5) f.position.x += Math.sin((u / .5) * Math.PI) * (who === 'you' ? -1 : 1) * .9;
      if (a.who === who && a.kind === 'fizzle' && u >= 0 && u < .5) body.rotation.z = Math.sin(u * 26) * .12;
      if (a.who === who && a.kind === 'cheer' && u >= 0) lift = Math.max(lift, Math.abs(Math.sin(u * 5)) * .6);
      if (a.who === who && a.kind === 'faint' && u >= 0) { const k = Math.min(1, u / .7); body.rotation.z = k * 1.35; f.position.y = -k * .15; }
    }
    f.position.y += lift;
    f.userData.shade.scale.setScalar(1 - Math.min(.5, lift * .5));
  }

  function size() {
    if (!out) return;
    const w = Math.max(1, out.clientWidth); const h = Math.max(1, out.clientHeight); const dpr = Math.min(devicePixelRatio || 1, 1.5);
    if (out.width !== Math.round(w * dpr) || out.height !== Math.round(h * dpr)) { out.width = Math.round(w * dpr); out.height = Math.round(h * dpr); }
    // たてに 長い 画面（スマホの たて）は ひいて 2 人とも 入れる。
    camera.aspect = w / h; camera.fov = w / h < 1 ? 70 : w / h < 1.5 ? 54 : 44; camera.updateProjectionMatrix();
  }

  function frame(ts) {
    if (!out) return;
    if (!out.isConnected || !out.closest('dialog')?.open) { out = null; ctx = null; return; }   // ダイアログが とじたら かならず 止まる（島に renderer を かえす）
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.1, (ts - last) / 1000 || 0); last = ts; clock += dt;
    size();
    while (acts.length && clock - acts[0].at > 4 && acts[0].kind !== 'faint' && acts[0].kind !== 'cheer') acts.shift();
    pose(you, foe, clock); pose(foe, you, clock);
    for (const [g, v] of spin) g.rotation.y += dt * v;
    pulse.forEach((r, i) => { r.scale.setScalar(1 + Math.sin(clock * 2 + i * 1.3) * .012); r.material.opacity = .75 + Math.sin(clock * 3 + i) * .25; r.material.transparent = true; });
    beams.forEach((b2, i) => { b2.material.opacity = (ended ? .5 : .22) + Math.sin(clock * 2.4 + i) * .08; });
    for (const p of crowd) { if (p.userData.base !== undefined) p.position.y = p.userData.base + Math.sin(clock * .6 + p.userData.seed) * .8; else { p.rotation.x += dt * .6; p.rotation.y += dt * .9; } }
    if (stars) stars.rotation.y += dt * .004;
    drawFx(clock);
    // カメラ：じぶんの なかまの ひだり うしろ。ゆっくり ゆれる。
    camera.position.set(-4.4 + Math.sin(clock * .25) * .5, 3 + Math.sin(clock * .4) * .12, 10.4);
    if (shake) { camera.position.x += (Math.random() - .5) * shake; camera.position.y += (Math.random() - .5) * shake; }
    camera.lookAt(.6, 1.3, -.8);
    try {
      const was = renderer.getRenderTarget(); renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, 0, 0, out.width, out.height);
      renderer.setRenderTarget(was);
    } catch { /* 描けない コマは とばす */ }
  }

  return {
    get running() { return !!out; },
    // canvas：ダイアログの 中の 2D の canvas。pet：じぶんの ペットの しゅるい（なければ きつね）。
    start(canvas, { pet = '' } = {}) {
      try {
        if (!scene) build();
        ctx = canvas.getContext('2d'); if (!ctx) return false;
        out = canvas; acts.length = 0; fxs.length = 0; ended = null; clock = 0; last = performance.now();
        cast(pet);
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
        return true;
      } catch { out = null; return false; }
    },
    stop() { cancelAnimationFrame(raf); out = null; ctx = null; },
    // できごとを じゅんばんに 見せる（battle.js が 部屋の events を わたす）。delay は 秒。
    // fx：わざの 光（poyon / beam / super / void）。あたる 時刻は わざごとに ちがう。
    play(kind, who, delay = 0, fx = 'poyon') {
      const at = clock + delay; const other = who === 'you' ? 'foe' : 'you';
      if (kind === 'attack') {
        const hitAt = { poyon: .25, beam: .45, super: .8, void: .45 }[fx] ?? .25;
        acts.push({ who, kind: fx === 'poyon' ? 'attack' : 'cast', at }); acts.push({ who: other, kind: 'hit', at: at + hitAt });
        fxs.push({ type: fx, who, at });
      } else if (kind === 'miss') { acts.push({ who, kind: 'cast', at }); acts.push({ who: other, kind: 'dodge', at: at + .3 }); fxs.push({ type: 'void', who, at, miss: true }); }
      else { acts.push({ who, kind, at }); if (kind === 'heal' || kind === 'fizzle') fxs.push({ type: kind, who, at }); }
      fxs.sort((x, y) => x.at - y.at);
    },
    end(won, delay = 0) { ended = won ? 'foe' : 'you'; acts.push({ who: ended, kind: 'faint', at: clock + delay }); acts.push({ who: won ? 'you' : 'foe', kind: 'cheer', at: clock + delay + .3 }); },
    reset() { acts.length = 0; fxs.length = 0; ended = null; },
  };
}
