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
  const spin = []; const pulse = []; const beams = []; let stars = null; let burst = null;

  function build() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a24);
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a1f6e, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-6, 12, 8); scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7ad9, 1.4); rim.position.set(8, 5, -10); scene.add(rim);
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
    for (const [x, y, z, r, c, o] of [[-70, 30, -150, 70, 0x7a3cff, .1], [80, 10, -160, 80, 0xff4fb3, .08], [10, 60, -170, 60, 0x2fd6ff, .07], [-130, -10, -60, 50, 0x3c6bff, .06], [-60, 26, -150, 45, 0xb06bff, .08], [70, 14, -160, 50, 0xff7ad9, .07]]) {
      const n = glow(new THREE.SphereGeometry(r, 40, 28), c, o); n.position.set(x, y, z); scene.add(n);
    }
    const planet = new THREE.Group(); planet.position.set(46, 30, -110); planet.rotation.z = .35;
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(13, 24, 18), new THREE.MeshStandardMaterial({ color: 0x6b5cff, emissive: 0x2a1a8e, emissiveIntensity: .6, roughness: .7 })));
    planet.add(lay(glow(new THREE.RingGeometry(17, 24, 48), 0xffd166, .55), 0)); scene.add(planet); spin.push([planet, .05]);

    // 舞台：くらい ガラスの 円ばん＋ネオンの 輪（みゃくうつ）＋まんなかの ほし（この 世界の しるし）。
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(19, 16, 2.4, 48), new THREE.MeshStandardMaterial({ color: 0x141a4a, roughness: .35, metalness: .4 })); deck.position.y = -1.2; scene.add(deck);
    const under = new THREE.Mesh(new THREE.ConeGeometry(15, 12, 24), new THREE.MeshStandardMaterial({ color: 0x1b1450, roughness: .8, flatShading: true })); under.rotation.x = Math.PI; under.position.y = -8.4; scene.add(under);
    scene.add(lay(glow(new THREE.CircleGeometry(19, 48), 0x10164a), .01));
    for (const [r0, r1, c] of [[18.2, 18.9, 0x7df9ff], [13.2, 13.5, 0xff7ad9], [8.6, 8.9, 0x7df9ff]]) { const ring = lay(glow(new THREE.RingGeometry(r0, r1, 64), c), .03); scene.add(ring); pulse.push(ring); }
    for (let i = 0; i < 12; i += 1) { const a = (i / 12) * Math.PI * 2; const tick = lay(glow(new THREE.PlaneGeometry(.25, 3.6), 0xa6b4ff, .8), .02); tick.position.set(Math.sin(a) * 15.8, .02, Math.cos(a) * 15.8); tick.rotation.z = -a; scene.add(tick); }
    const mid = new THREE.Group(); mid.position.set(.6, 0, -.4); scene.add(mid);
    mid.add(lay(glow(new THREE.CircleGeometry(6.2, 48), 0x241a7a), .04));
    const emblem = lay(glow(star(4), 0xffd166), .06); mid.add(emblem); spin.push([mid, .12]);
    const halo = lay(glow(new THREE.RingGeometry(5.6, 6.2, 48), 0xffd166, .8), .05); mid.add(halo); pulse.push(halo);

    // 光の 柱（舞台の ふち・6 本）と、まわりを まわる クリスタル。
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + .5; const col = i % 2 ? 0xff7ad9 : 0x7df9ff;
      const beam = glow(new THREE.CylinderGeometry(.5, .9, 46, 12, 1, true), col, .28); beam.position.set(Math.sin(a) * 18.6, 23, Math.cos(a) * 18.6); scene.add(beam); beams.push(beam);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, .8, 12), new THREE.MeshStandardMaterial({ color: 0x2a2f7a, metalness: .5, roughness: .4 })); base.position.set(beam.position.x, .4, beam.position.z); scene.add(base);
    }
    const orbit = new THREE.Group(); scene.add(orbit); spin.push([orbit, .08]);
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2; const r = 26 + rnd() * 12; const size = .8 + rnd() * 1.8;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(size), new THREE.MeshStandardMaterial({ color: [0x7df9ff, 0xff7ad9, 0xa6b4ff, 0xffd166][i % 4], emissive: [0x1a8fa0, 0x9a2a7a, 0x3a3fa0, 0x9a6a10][i % 4], emissiveIntensity: .9, roughness: .25, flatShading: true }));
      gem.position.set(Math.sin(a) * r, 2 + rnd() * 14, Math.cos(a) * r); gem.userData.seed = rnd() * 10; orbit.add(gem); crowd.push(gem);
    }
    // うかぶ 小さな 島（とおく）。
    for (const [x, y, z, k] of [[-34, 6, -40, 1.4], [38, -2, -30, 1], [-20, 12, -70, 1.8]]) {
      const isle = new THREE.Group(); isle.position.set(x, y, z); isle.scale.setScalar(k);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(5, 3.6, 1.4, 10), new THREE.MeshStandardMaterial({ color: 0x3a8f7a, flatShading: true })); isle.add(top);
      const rock = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6, 8), new THREE.MeshStandardMaterial({ color: 0x3a2f8a, flatShading: true })); rock.rotation.x = Math.PI; rock.position.y = -3.6; isle.add(rock);
      const tip = glow(new THREE.OctahedronGeometry(1.1), 0x7df9ff); tip.position.y = 2.6; isle.add(tip);
      isle.userData.seed = rnd() * 10; scene.add(isle); crowd.push(isle); isle.userData.base = y;
    }
    // あたった ときの 光の 輪（1 つを 使いまわす）。
    burst = lay(glow(new THREE.RingGeometry(.7, 1, 32), 0xffffff, .9), 0); burst.visible = false; scene.add(burst);
  }

  // 高さを そろえる（形ごとに 大きさが ちがうので、背の 高さで 合わせる）。
  function fit(group, height) {
    const b = new THREE.Box3().setFromObject(group); const h = Math.max(.2, b.max.y - b.min.y);
    const holder = new THREE.Group(); const k = height / h;
    group.scale.multiplyScalar(k); group.position.y = -b.min.y * k; holder.add(group);
    const shade = new THREE.Mesh(new THREE.RingGeometry(height * .34, height * .5, 28), new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
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
    if (burst) { const h = acts.find((x) => x.kind === 'hit' && clock >= x.at && clock - x.at < .5); burst.visible = !!h; if (h) { const tgt = h.who === 'you' ? YOU : FOE; const u = (clock - h.at) / .5; burst.position.set(tgt.x, 1.2, tgt.z); burst.rotation.set(0, 0, 0); burst.lookAt(camera.position); burst.scale.setScalar(1 + u * 5); burst.material.opacity = .9 * (1 - u); } }
    // カメラ：じぶんの なかまの ひだり うしろ。ゆっくり ゆれる。
    camera.position.set(-4.4 + Math.sin(clock * .25) * .5, 3 + Math.sin(clock * .4) * .12, 10.4);
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
        out = canvas; acts.length = 0; ended = null; clock = 0; last = performance.now();
        cast(pet);
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
        return true;
      } catch { out = null; return false; }
    },
    stop() { cancelAnimationFrame(raf); out = null; ctx = null; },
    // できごとを じゅんばんに 見せる（battle.js が 部屋の events を わたす）。delay は 秒。
    play(kind, who, delay = 0) {
      const at = clock + delay; const other = who === 'you' ? 'foe' : 'you';
      if (kind === 'attack') { acts.push({ who, kind: 'attack', at }); acts.push({ who: other, kind: 'hit', at: at + .25 }); }
      else if (kind === 'miss') { acts.push({ who, kind: 'attack', at }); acts.push({ who: other, kind: 'dodge', at: at + .15 }); }
      else acts.push({ who, kind, at });
    },
    end(won, delay = 0) { ended = won ? 'foe' : 'you'; acts.push({ who: ended, kind: 'faint', at: clock + delay }); acts.push({ who: won ? 'you' : 'foe', kind: 'cheer', at: clock + delay + .3 }); },
    reset() { acts.length = 0; ended = null; },
  };
}
