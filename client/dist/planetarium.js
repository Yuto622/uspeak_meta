// プラネタリウムの 中（2026-11：「超リアルの 星空に して、プラネタリウムを 作る。メイン島の バトルアリーナの 代わりに」）。
//
// ・としょかん（library.js）・住民の いえ（npc-home.js）と 同じ 作り：**自分の シーン 1 つ**を `rpg.attachPlanetarium()` で つなぐ。
//   カメラ・当たり判定・ミニマップ・描画（rpg.interiorScene）は その しくみが そのまま 見る。WebGL は ふやさない。
// ・入る：メインの島の プラネタリウムの 玄関へ 歩く（main_island.json の spots の `planetarium` → main-island.js の walkIn → ここの enter）。
//   出る：南の 戸口を 歩いて 出る か、上の 帯の「そとへ」。玄関の 前に もどる（戸口の 外＝すぐには 入りなおさない）。お店では ない＝夜も 入れる。
// ・中：くらい まるい ホール（planetarium-real.js）。上の ドームに starfield.js の 星空（外の 夜空と 同じ 星・天の川・ほんものの 星座の 位置）。
//   空は 北極星の まわりを ゆっくり まわる。星座の 線は 入って すこし すると うっすら 出る。
// ・投影機の そばで「⭐ せいざを みる」（E / Enter・指）：オリオン → ほくとしちせい → カシオペヤ → さそり → はくちょう の 順に、
//   その 星座を 目の 前の 空へ まわして 明るく し、英語の 名前を 読みあげる。英語の 名前は **学ぶ 中身**＝英語と 日本語を いつも 両方 出す
//   （`translate="no"`・lang.json には 入れない）。
// ・カメラ：上を 見る 部屋なので、ひくい 位置から 見上げる（広い 画角）。じぶんの め（一人称）でも 見わたせる。
// ・場所の 名前は `in:planetarium`（みんな 同じ 部屋・通話なし）。光は 足さない（半球光と 太陽 1 つ・星は 加算の 点）。
import * as THREE from './three.module.js';
import { buildPlanetariumInterior } from './planetarium-real.js';
import { createStarfield, CONSTELLATIONS, starVector } from './starfield.js';
import { isJa, onLangChange } from './i18n.js';

const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const HOLD = 18;                 // 1 つの 星座を 見せて おく 秒
const FOV = 64;                  // 見上げる カメラの 画角（ふつうは 43）
const LATITUDE = 35, SIDEREAL = 4;   // 北緯 35°・冬の 夜（外の 夜空と 同じ）

export function createPlanetarium({ player, camera, toast = () => {}, rpg = null, speak = null }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020508);
  scene.add(new THREE.HemisphereLight(0xbcd4e6, 0x1b3a2f, 0.85));
  const sun = new THREE.DirectionalLight(0xdfe9ff, 0.6);
  sun.position.set(3, 12, 6);
  scene.add(sun);

  const state = { active: false, near: false, sig: '', hi: -1, shown: -1 };
  let hall = null, sky = null, lines = null, labels = [];
  let parent = null, cooldown = 0, whereWas = null, back = null;
  let entered = 0, clock = 0, hold = 0, hiK = 0, turnK = 0, next = 0, camYaw = 0, camPos = null;
  const qIdle = new THREE.Quaternion(), qTarget = new THREE.Quaternion();

  function ensure() {
    if (hall) return true;
    hall = buildPlanetariumInterior();
    scene.add(hall.group);
    const R = hall.radius - 0.4;
    sky = createStarfield({ count: 7000, band: 4200, radius: R, seed: 11, horizon: [0.0, 0.07], scale: 1.4, gain: 1.2, milkyGain: 0.3, twinkle: 0.45, milkySize: 2048 });
    sky.group.position.copy(hall.center);
    scene.add(sky.group);
    // 星座の 線（ぜんぶで 描画 1 回）。星に かさならない ように 両はしを 少し ちぢめる。
    const pos = [], grp = [], a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
    CONSTELLATIONS.forEach((c, ci) => {
      for (const [i, j] of c.lines) {
        starVector(c.stars[i][0], c.stars[i][1], a); starVector(c.stars[j][0], c.stars[j][1], b);
        const cut = Math.min(0.3, 0.022 / Math.max(0.02, a.distanceTo(b)));
        for (const k of [cut, 1 - cut]) { p.copy(a).lerp(b, k).normalize().multiplyScalar(R * 0.996); pos.push(p.x, p.y, p.z); grp.push(ci); }
      }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    lg.setAttribute('aGroup', new THREE.BufferAttribute(new Float32Array(grp), 1));
    lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({
      uniforms: { uAll: { value: 0 }, uHi: { value: -9 }, uHiK: { value: 0 }, uHorizon: sky.uniforms.uHorizon },
      vertexShader: `attribute float aGroup; uniform float uAll, uHi, uHiK; uniform vec2 uHorizon; varying float vA; varying float vH;
        void main(){ vec3 dir = normalize(mat3(modelMatrix) * position); float up = smoothstep(uHorizon.x, uHorizon.y + .05, dir.y);
          vH = step(abs(aGroup - uHi), .5) * uHiK; vA = (uAll * (1. - .6 * uHiK) + vH * .95) * up;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `precision mediump float; varying float vA; varying float vH;
        void main(){ gl_FragColor = vec4(mix(vec3(.56, .94, .78), vec3(1., .96, .84), vH) * vA, 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    lines.frustumCulled = false; lines.renderOrder = -1;
    sky.group.add(lines);
    // 星座の 名前（英語を 大きく・日本語を 下に。いつも 両方）。星座の 南がわに 置く。
    const pole = new THREE.Vector3(0, 1, 0);
    CONSTELLATIONS.forEach((c) => {
      const mid = new THREE.Vector3();
      const vs = c.stars.map((s) => starVector(s[0], s[1], new THREE.Vector3()));
      for (const v of vs) mid.add(v);
      mid.normalize();
      const north = pole.clone().addScaledVector(mid, -pole.dot(mid)).normalize();
      let south = 0; for (const v of vs) south = Math.max(south, -Math.asin(Math.max(-1, Math.min(1, v.clone().sub(mid).dot(north)))));
      c.mid = mid; c.north = north;
      let sprite = null;
      try {
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
        const g = cv.getContext('2d');
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(2,8,12,0.9)'; g.shadowBlur = 10;
        g.fillStyle = '#fff4d6'; g.font = '800 74px sans-serif'; g.fillText(c.en, 256, 62, 500);
        g.fillStyle = '#8ff0c8'; g.font = '700 50px sans-serif'; g.fillText(c.ja, 256, 142, 500);
        const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
        sprite.scale.set(3.7, 1.39, 1); sprite.renderOrder = 3; sprite.userData.signText = `${c.en} / ${c.ja}`;
        const at = mid.clone().addScaledVector(north, -Math.tan(south + 0.11)).normalize().multiplyScalar(R * 0.95);
        sprite.position.copy(at); sprite.userData.dir = at.clone().normalize();
        sky.group.add(sprite);
      } catch { sprite = null; }
      labels.push(sprite);
    });
    return true;
  }

  // ---- 画面の 部品：上の 帯・下の ボタン・星座の 名前 ----
  let nearEl = null, bar = null, cap = null;
  try {
    nearEl = document.createElement('div'); nearEl.id = 'plan-near'; nearEl.className = 'near'; nearEl.hidden = true; nearEl.setAttribute('translate', 'no');
    nearEl.innerHTML = '<button type="button"><kbd>E</kbd> <span></span></button>';
    document.body.appendChild(nearEl);
    nearEl.querySelector('button').onclick = () => interact();
    bar = document.createElement('div'); bar.id = 'plan-bar'; bar.hidden = true; bar.setAttribute('translate', 'no');
    bar.innerHTML = `<span>🔭 ${bi('Planetarium', 'プラネタリウム')}</span><button type="button">🚪 ${bi('Go out', 'そとへ')}</button>`;
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = () => leave();
    // 星座の 名前：英語と 日本語を いつも 両方（学ぶ 中身。.en / .ja の きりかえは 使わない）。
    cap = document.createElement('div'); cap.id = 'plan-caption'; cap.hidden = true; cap.setAttribute('translate', 'no'); cap.setAttribute('aria-live', 'polite');
    cap.innerHTML = '<small>⭐ CONSTELLATION ・ せいざ</small><strong></strong><span></span>';
    document.body.appendChild(cap);
    for (const el of [nearEl, bar]) for (const ev of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation());
    addEventListener('keydown', (e) => {
      if (!state.active || !state.near || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = String(e.key || '').toLowerCase();
      if (k !== 'e' && k !== 'enter') return;
      if (document.querySelector('dialog[open]') || /^(input|textarea|select)$/i.test(e.target?.tagName || '')) return;
      e.preventDefault(); e.stopPropagation();
      interact();
    }, true);
    onLangChange(() => { state.sig = ''; });
  } catch { nearEl = null; bar = null; cap = null; }

  const dialogOpen = () => { try { return !!document.querySelector('dialog[open]'); } catch { return false; } };

  function paint() {
    if (nearEl) {
      const on = state.active && state.near && !dialogOpen();
      const sig = on ? `${state.hi >= 0}|${isJa()}` : '';
      if (sig !== state.sig) {
        state.sig = sig; nearEl.hidden = !on;
        if (on) nearEl.querySelector('span').innerHTML = state.hi >= 0 ? `⭐ ${bi('Next constellation', 'つぎの せいざ')}` : `⭐ ${bi('Show constellations', 'せいざを みる')}`;
      }
    }
    if (cap && state.shown !== state.hi) {
      state.shown = state.hi;
      const c = CONSTELLATIONS[state.hi];
      cap.hidden = !c || !state.active;
      if (c) { cap.querySelector('strong').textContent = c.en; cap.querySelector('span').textContent = c.ja; }
    }
  }

  // 星座 c を 目の 前の 空（カメラの むきの 高さ 34°）へ まわす むき。北を 上に。
  const ray = new THREE.Vector3(), from = new THREE.Vector3(), want = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), r1 = new THREE.Vector3(), u1 = new THREE.Vector3();
  function aim(c) {
    const alt = 0.52;
    from.copy(camPos || player.position); if (!camPos) from.y = 2;   // camPos＝この 部屋の カメラ（eye）か 一人称の 目
    ray.set(-Math.sin(camYaw) * Math.cos(alt), Math.sin(alt), -Math.cos(camYaw) * Math.cos(alt));
    // カメラからの 線が ドームに 当たる 点。
    const oc = from.clone().sub(hall.center), bq = oc.dot(ray), cq = oc.lengthSq() - (hall.radius - 0.4) ** 2;
    const tHit = -bq + Math.sqrt(Math.max(0, bq * bq - cq));
    want.copy(from).addScaledVector(ray, tHit).sub(hall.center).normalize();
    if (want.y < 0.35) { want.y = 0.35; want.normalize(); }
    r1.crossVectors(c.north, c.mid).normalize();
    mA.makeBasis(r1, c.north, c.mid);
    u1.copy(up).addScaledVector(want, -up.dot(want)).normalize();
    r1.crossVectors(u1, want).normalize();
    mB.makeBasis(r1, u1, want);
    mB.multiply(mA.transpose());
    qTarget.setFromRotationMatrix(mB);
  }

  // 投影機の ボタン：つぎの 星座を 見せて、英語の 名前を 読む。
  function interact() {
    if (!state.active || !hall || dialogOpen()) return false;
    const i = next % CONSTELLATIONS.length; next = i + 1;
    return show(i);
  }
  function show(i) {
    const c = CONSTELLATIONS[i];
    if (!state.active || !c) return false;
    // いま 見せて いる 空から なめらかに つづける。
    if (sky) { qIdle.copy(sky.group.quaternion); }
    state.hi = i; hold = HOLD; turnK = 0; hiK = 0; resume = true;
    aim(c);
    try { speak?.(c.en); } catch { /* 声が なくても つづく */ }
    paint();
    return true;
  }
  let resume = false;           // 星座を 見せた あと：その 空から また ゆっくり まわりはじめる
  let spin = 0;                 // ふだんの まわり（恒星時の ずれ・時間）

  function outside() {
    const main = rpg?.main, ext = main?.planetarium;
    if (ext && typeof main.origin === 'function') { const o = main.origin(); return { x: o.x + ext.x + ext.door.x, z: o.z + ext.z + ext.door.z + 2.0, r: 0 }; }
    return back;
  }

  function enter() {
    if (state.active) return false;
    try { ensure(); } catch (err) { try { console.warn('[planetarium] へやが 作れない', err); } catch { /* */ } toast(isJa() ? 'いまは 入れないよ。' : 'You cannot go in now.'); return false; }
    state.active = true; state.near = false; state.sig = ''; state.hi = -1; state.shown = -2;
    parent = player.parent;
    back = { x: player.position.x, z: player.position.z + 2.4, r: 0 };
    scene.add(player);
    player.position.set(hall.spawn.x, 0, hall.spawn.z);
    player.rotation.y = hall.spawn.ry;
    camera.position.set(hall.spawn.x, 2.2, hall.spawn.z + 1.6);
    camPos = null; eyeSet = false; cooldown = 1.2; entered = -1; hold = 0; hiK = 0; turnK = 0; next = 0; spin = 0; resume = false;
    sky.setSky(LATITUDE, SIDEREAL); lines.material.uniforms.uAll.value = 0; sky.highlight(-9, 0);
    try {
      document.body.classList.add('in-building', 'in-planetarium');
      const where = document.querySelector('.location');
      whereWas = where ? where.innerHTML : null;
      if (where) where.innerHTML = `<span>✦</span> ${bi('PLANETARIUM', 'プラネタリウム')}`;
      if (bar) bar.hidden = false;
      const outer = document.querySelector('#near'); if (outer) outer.style.display = 'none';
    } catch { /* */ }
    return true;
  }

  // restore＝外の 玄関の 前に 立たせる。島が かわった あと（ひこうき・先生の「いっしょに いどう」）は 場所を さわらない。
  function leave(silent = false, restore = true) {
    if (!state.active) return false;
    state.active = false; state.near = false; state.hi = -1;
    (parent || null)?.add(player);
    const out = restore ? outside() : null;
    if (out) { player.position.set(out.x, 0, out.z); player.rotation.y = out.r; }
    try {
      document.body.classList.remove('in-building', 'in-planetarium');
      const where = document.querySelector('.location');
      if (where && whereWas !== null && restore) where.innerHTML = whereWas;
      whereWas = null;
      if (bar) bar.hidden = true;
      if (cap) cap.hidden = true;
    } catch { /* */ }
    state.shown = -2;
    paint();
    return true;
  }

  function blocked(x, z) {
    if (!state.active || !hall) return null;
    return hall.blocked(x, z, 0.34);
  }

  const smooth = (k) => k * k * (3 - 2 * k);
  const qSpin = new THREE.Quaternion(), axis = new THREE.Vector3();
  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) return;
    // ひこうきで 飛ぶ・ほかの 島へ うつった：だまって 出る。
    const flying = rpg?.state?.mode === 'flight', moved = !!rpg && rpg.state?.current !== 'main';
    if (flying || moved) { leave(true, !moved); return; }
    if (entered < 0) entered = t;
    clock = t - entered;
    hall.update(t);
    sky.update(t);
    // 星座の 線は 入って 1.5 秒 から ゆっくり 出る。
    const all = THREE.MathUtils.smoothstep(clock, 1.5, 5) * 0.42;
    if (state.hi >= 0) {
      hold -= dt; turnK = Math.min(1, turnK + dt / 2.6); hiK = Math.min(1, hiK + dt / 1.6);
      sky.group.quaternion.copy(qIdle).slerp(qTarget, smooth(turnK));
      if (hold <= 0) { state.hi = -1; }
    } else {
      hiK = Math.max(0, hiK - dt / 1.4);
      if (!resume) { spin += dt; sky.setSky(LATITUDE, SIDEREAL + spin / 40); } else {
        // 見せた 空の まま、いまの 北極の まわりを ゆっくり まわる（恒星時 1 時間＝40 秒）。
        axis.set(0, 1, 0).applyQuaternion(sky.group.quaternion).normalize();
        qSpin.setFromAxisAngle(axis, -dt * (Math.PI / 12) / 40);
        sky.group.quaternion.premultiply(qSpin);
      }
    }
    const hi = state.hi >= 0 ? state.hi : (hiK > 0 ? lines.material.uniforms.uHi.value : -9);
    sky.highlight(hi, hiK);
    const lu = lines.material.uniforms; lu.uAll.value = all; lu.uHi.value = hi; lu.uHiK.value = hiK;
    // 名前の 札：ふだんは うすく、見せて いる 星座は はっきり。地平線の 下は 消す。
    for (let i = 0; i < labels.length; i += 1) {
      const s = labels[i]; if (!s) continue;
      axis.copy(s.userData.dir).applyQuaternion(sky.group.quaternion);
      const up2 = THREE.MathUtils.smoothstep(axis.y, 0.1, 0.22);
      const base = (all / 0.42) * 0.62;
      const o = (i === hi ? base + (1 - base) * hiK : base * (1 - 0.75 * hiK)) * up2;
      s.material.opacity = o; s.visible = o > 0.01;
      const k = i === hi ? 1 + 0.3 * hiK : 1; s.scale.set(3.7 * k, 1.39 * k, 1);
    }
    state.near = Math.hypot(player.position.x - hall.projector.x, player.position.z - hall.projector.z) < hall.projector.r;
    paint();
    // 戸口を 歩いて 出る（ほかの 戸口と 同じ）。
    const ex = hall.exit;
    if (!cooldown && !dialogOpen() && Math.abs(player.position.x - ex.x) < ex.r && player.position.z > ex.z - 0.45) leave();
  }

  // ゲームは 毎フレーム 自分の カメラの 場所を 入れなおすので、ここの 目の 場所（eye）は 自分で おぼえて おく。
  const desired = new THREE.Vector3(), lookAt = new THREE.Vector3(), eye = new THREE.Vector3(); let eyeSet = false;
  function updateCamera({ yaw, pitch, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    camYaw = yaw;
    const px = player.position.x, pz = player.position.z, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (firstPerson) {
      camera.updateProjectionMatrix();
      camera.position.set(px, 2.05 + player.position.y, pz);
      camera.lookAt(px + fx * Math.cos(pitch) * 10, camera.position.y + Math.sin(pitch) * 10, pz + fz * Math.cos(pitch) * 10);
      camPos = camera.position; eyeSet = false;
      return true;
    }
    // 見上げる カメラ：じぶんの 後ろ・ひくい 位置から、ドームを 大きく。画角を ひろげる（ゲームは 毎フレーム 43 へ もどそうと する）。
    camera.fov = FOV; camera.updateProjectionMatrix();
    desired.set(px - fx * 7.5, 2.1, pz - fz * 7.5);
    const d = Math.hypot(desired.x, desired.z), max = hall.radius - 1.1;
    if (d > max) { desired.x *= max / d; desired.z *= max / d; }
    if (!eyeSet) { eye.copy(desired); eyeSet = true; } else eye.lerp(desired, 1 - Math.exp(-(dt || 0.016) * 5));
    camera.position.copy(eye);
    const e = THREE.MathUtils.clamp(0.4 + pitch * 0.8, 0.08, 1.25);
    lookAt.set(camera.position.x + fx * Math.cos(e) * 10, camera.position.y + Math.sin(e) * 10, camera.position.z + fz * Math.cos(e) * 10);
    camera.lookAt(lookAt);
    camPos = eye;
    return true;
  }

  // 右上の 小さな 地図：まるい ホール・いすの 輪・投影機（オレンジ）・出口（ミント）・じぶん。
  function minimap(ctx) {
    if (!state.active || !hall) return false;
    const k = 4.6, ox = 90, oz = 68, X = (x) => ox + x * k, Z = (z) => oz + z * k;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#0c241c'; ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = '#1b3a2f'; ctx.beginPath(); ctx.arc(ox, oz, hall.radius * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8ff0c8'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#3f8f6c'; for (const s of hall.seats) { ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), 1.9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#8ff0c8'; ctx.fillRect(X(-1.25), Z(hall.radius) - 3, 2.5 * k, 5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '9px sans-serif';
    ctx.fillStyle = '#ffb066'; ctx.beginPath(); ctx.arc(ox, oz, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillText('⭐', ox, oz + 0.5);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X(player.position.x), Z(player.position.z), 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e27a2d'; ctx.beginPath(); ctx.arc(X(player.position.x), Z(player.position.z), 3, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff4d6'; ctx.font = 'bold 9px sans-serif';
    ctx.fillText(isJa() ? 'プラネタリウム' : 'PLANETARIUM', 6, 8);
    return true;
  }

  return {
    scene, state, enter, leave, blocked, update, updateCamera, minimap, interact, show,
    get active() { return state.active; },
    get near() { return state.near; },
    get constellation() { return CONSTELLATIONS[state.hi] || null; },
    get sky() { return sky; },
    get labels() { return labels; },
  };
}
