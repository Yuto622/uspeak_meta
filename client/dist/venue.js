// 西の 通りの 建物の 中（2026-11）：ショッピングモール・すいぞくかん・MAISON U（ふくの おみせ）・ROYAL HOME（かぐの おみせ）。
//
// ・としょかん（library.js）・プラネタリウム（planetarium.js）と 同じ 作り：**自分の シーン 1 つ**を `rpg.attachVenue()` で つなぐ。
//   カメラ・当たり判定・ミニマップ・描画（rpg.interiorScene）は その しくみが そのまま 見る。WebGL は ふやさない。
// ・入る：メインの島の 戸口へ 歩く（main_island.json の spots の kind mall / aquarium / boutique / furniture → main-island.js の walkIn → enter）。
//   出る：入口を 歩いて 出る か、上の 帯の「🚪 そとへ」。戸口の すぐ 前（外）に もどる。お店の 時間は ない＝夜も 入れる（見る だけの 建物）。
// ・中の 形は はじめて 入る ときに 1 回だけ 作る（mall-real.js / aquarium-real.js / boutique-real.js）。`update(t)` は 中に いる 間だけ。
// ・カメラ：じぶんの 後ろ・すこし 上。部屋（`rooms`＝四角と 天井の 高さ）の 外へ 出ない ように ちかよせる（かべの 外から 見ない）。
// ・場所の 名前は `in:<id>`（みんな 同じ 部屋・通話なし）。光は 半球光と 太陽 1 つ（かげは 落とさない）。
import * as THREE from './three.module.js';
import { isJa } from './i18n.js';

const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;

// id → 作りかた。rooms＝カメラが 入って よい 四角（天井 top）。exit＝この 線より 前（+z）へ 出たら そとへ。
export const VENUES = {
  mall: {
    icon: '🛍', en: 'U-SPEAK MALL', ja: 'ユースピーク モール', where: ['U-SPEAK MALL', 'ショッピングモール'],
    load: async () => (await import('./mall-real.js')).buildMallInterior(),
    rooms: [{ x0: -19.6, x1: 19.6, z0: -14.6, z1: 14.6, top: 16 }],
    exit: { x: 0, z: 14.05, r: 2.6 }, light: { sky: 0xfff6ea, ground: 0xd9cbb4, hemi: 2.3, sun: 1.6 }, bg: 0x2a2420, fov: 60,
  },
  aquarium: {
    icon: '🐋', en: 'U-SPEAK AQUARIUM', ja: 'ユースピーク すいぞくかん', where: ['U-SPEAK AQUARIUM', 'すいぞくかん'],
    load: async () => (await import('./aquarium-real.js')).buildAquarium(),
    rooms: [{ x0: -12.6, x1: 12.6, z0: -24.6, z1: 15.2, top: 11.5 }, { x0: -7.6, x1: 7.6, z0: 14.8, z1: 24.6, top: 4.6 }, { x0: 13, x1: 19.6, z0: -20.6, z1: 11.6, top: 3.1 }],
    exit: { x: 0, z: 24.1, r: 2.6 }, light: { sky: 0x9fd6ff, ground: 0x0d2a3a, hemi: 0.9, sun: 0.25 }, bg: 0x000000, fov: 60,
  },
  boutique: {
    icon: '👗', en: 'MAISON U', ja: 'MAISON U ふくの おみせ', where: ['MAISON U', 'ふくの おみせ'],
    load: async () => (await import('./boutique-real.js')).buildBoutique(),
    rooms: [{ x0: -7.3, x1: 7.3, z0: -6.3, z1: 6.2, top: 7.2 }],
    exit: { x: -4.6, z: 6.75, r: 1.5 }, light: { sky: 0xfff2e0, ground: 0x8f8a80, hemi: 1.9, sun: 1.3 }, bg: 0x1a2230, fov: 62,
  },
  furniture: {
    icon: '🛋', en: 'ROYAL HOME', ja: 'ROYAL HOME かぐの おみせ', where: ['ROYAL HOME', 'かぐの おみせ'],
    load: async () => (await import('./boutique-real.js')).buildFurnitureShowroom(),
    rooms: [{ x0: -8.3, x1: 8.3, z0: -6.3, z1: 6.2, top: 5.3 }],
    exit: { x: 0, z: 6.75, r: 1.5 }, light: { sky: 0xfff2e0, ground: 0x8f8a80, hemi: 1.9, sun: 1.3 }, bg: 0x1a2230, fov: 62,
  },
};

export function createVenue(id, { player, camera, toast = () => {}, rpg = null }) {
  const V = VENUES[id];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(V.bg);
  scene.add(new THREE.HemisphereLight(V.light.sky, V.light.ground, V.light.hemi));
  const sun = new THREE.DirectionalLight(0xfff0dc, V.light.sun); sun.position.set(6, 30, 10); scene.add(sun);

  const state = { active: false, loading: false };
  let built = null, parent = null, cooldown = 0, whereWas = null, night = -1;

  let bar = null;
  try {
    bar = document.createElement('div'); bar.id = `venue-bar-${id}`; bar.className = 'venue-bar'; bar.hidden = true; bar.setAttribute('translate', 'no');
    bar.innerHTML = `<span>${V.icon} ${bi(V.en, V.ja)}</span><button type="button">🚪 ${bi('Go out', 'そとへ')}</button>`;
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = () => leave();
    for (const ev of ['pointerdown', 'touchstart', 'mousedown']) bar.addEventListener(ev, (e) => e.stopPropagation());
  } catch { bar = null; }

  const dialogOpen = () => { try { return !!document.querySelector('dialog[open]'); } catch { return false; } };

  // 外の 戸口の すぐ 前（世界の 座標）。
  function outside() {
    const main = rpg?.main, sp = main?.data?.spots?.find((s) => s.kind === id);
    if (sp && typeof main.origin === 'function') { const o = main.origin(); return { x: o.x + sp.x, z: o.z + sp.z + 2.2, r: 0 }; }
    return null;
  }

  async function ensure() {
    if (built) return true;
    built = await V.load();
    built.group.traverse((o) => { o.castShadow = false; });
    scene.add(built.group);
    return true;
  }

  async function enter() {
    if (state.active || state.loading) return false;
    state.loading = true;
    try { await ensure(); } catch (err) {
      state.loading = false;
      try { console.warn(`[venue] ${id} の 中が 作れない`, err); } catch { /* */ }
      toast(isJa() ? 'いまは 入れないよ。' : 'You cannot go in now.'); return false;
    }
    state.loading = false;
    // 待って いる 間に ほかの 島へ いった・ひこうき：入らない。
    if (rpg && (rpg.state?.current !== 'main' || rpg.state?.mode === 'flight')) return false;
    state.active = true;
    parent = player.parent;
    scene.add(player);
    const e = built.entrance;
    // 入口の すぐ 中で、物に かさならない 所（ふくやの 入口の そばには かさたてが ある）。
    let at = [e.x, e.z - 0.4];
    for (const [dx, dz] of [[0, -0.4], [0.6, -0.4], [0, -1.2], [0.8, -1.2], [-0.8, -1.2], [0, -2]]) { if (!blockedAt(e.x + dx, e.z + dz)) { at = [e.x + dx, e.z + dz]; break; } }
    player.position.set(at[0], 0, at[1]);
    player.rotation.y = e.ry ?? Math.PI;
    camera.position.set(e.x, 3, e.z);
    cooldown = 1.2; eyeSet = false; night = -1;
    try {
      document.body.classList.add('in-building', `in-${id}`);
      const where = document.querySelector('.location');
      whereWas = where ? where.innerHTML : null;
      if (where) where.innerHTML = `<span>✦</span> ${bi(V.where[0], V.where[1])}`;
      if (bar) bar.hidden = false;
      const outer = document.querySelector('#near'); if (outer) outer.style.display = 'none';
    } catch { /* */ }
    return true;
  }

  // restore＝外の 戸口の 前に 立たせる。島が かわった あと（ひこうき・先生の「いっしょに いどう」）は 場所を さわらない。
  function leave(silent = false, restore = true) {
    if (!state.active) return false;
    state.active = false;
    (parent || null)?.add(player);
    const out = restore ? outside() : null;
    if (out) { player.position.set(out.x, 0, out.z); player.rotation.y = out.r; }
    try {
      document.body.classList.remove('in-building', `in-${id}`);
      const where = document.querySelector('.location');
      if (where && whereWas !== null && restore) where.innerHTML = whereWas;
      whereWas = null;
      if (bar) bar.hidden = true;
    } catch { /* */ }
    return true;
  }

  function blocked(x, z) {
    if (!state.active || !built) return null;
    return blockedAt(x, z);
  }
  function blockedAt(x, z) {
    if (!V.rooms.some((r) => x > r.x0 - 0.2 && x < r.x1 + 0.2 && z > r.z0 - 0.2 && z < r.z1 + 1.0)) return true;
    return built.obstacles.some((o) => Math.abs(x - o.x) < o.w + 0.34 && Math.abs(z - o.z) < o.d + 0.34);
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active || !built) return;
    const flying = rpg?.state?.mode === 'flight', moved = !!rpg && rpg.state?.current !== 'main';
    if (flying || moved) { leave(true, !moved); return; }
    built.update?.(t);
    const n = Math.round((rpg?.main?.night ?? 0) * 20) / 20;
    if (n !== night) { night = n; built.setNight?.(n); }
    const ex = V.exit;
    if (!cooldown && !dialogOpen() && Math.abs(player.position.x - ex.x) < ex.r && player.position.z > ex.z) leave();
  }

  // カメラ：じぶんの 後ろ 6.5・上 3.2。部屋の 外へ 出る ぶんは じぶんの ほうへ ちかよせる。
  const desired = new THREE.Vector3(), eye = new THREE.Vector3(), probe = new THREE.Vector3(); let eyeSet = false;
  const roomAt = (x, z, m = 0.35) => V.rooms.find((r) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m);
  function updateCamera({ yaw, pitch, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    const px = player.position.x, pz = player.position.z, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (firstPerson) {
      camera.updateProjectionMatrix();
      camera.position.set(px, 2.05 + player.position.y, pz);
      camera.lookAt(px + fx * Math.cos(pitch) * 10, camera.position.y + Math.sin(pitch) * 10, pz + fz * Math.cos(pitch) * 10);
      eyeSet = false; return true;
    }
    camera.fov = V.fov; camera.updateProjectionMatrix();
    const back = 6.5, up = 3.2;
    desired.set(px - fx * back, up, pz - fz * back);
    if (!roomAt(desired.x, desired.z)) {
      // じぶんから 後ろへ、部屋の 中に いる ところまで（8 回 二分）。
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i += 1) { const m = (lo + hi) / 2; probe.set(px + (desired.x - px) * m, 0, pz + (desired.z - pz) * m); if (roomAt(probe.x, probe.z)) lo = m; else hi = m; }
      desired.set(px + (desired.x - px) * lo, up + (1 - lo) * 1.6, pz + (desired.z - pz) * lo);
    }
    const r = roomAt(desired.x, desired.z, 0) || roomAt(px, pz, 0);
    if (r) desired.y = Math.min(desired.y, r.top - 0.4);
    if (!eyeSet) { eye.copy(desired); eyeSet = true; } else eye.lerp(desired, 1 - Math.exp(-(dt || 0.016) * 6));
    camera.position.copy(eye);
    const e = THREE.MathUtils.clamp(pitch, -0.6, 0.9);
    camera.lookAt(px + fx * Math.cos(e) * 6, 1.6 + Math.sin(e) * 6, pz + fz * Math.cos(e) * 6);
    return true;
  }

  // 右上の 小さな 地図：部屋の 四角・出口（ミント）・じぶん。
  function minimap(ctx) {
    if (!state.active) return false;
    const xs = V.rooms.flatMap((r) => [r.x0, r.x1]), zs = V.rooms.flatMap((r) => [r.z0, r.z1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const k = Math.min(160 / (x1 - x0), 112 / (z1 - z0)), ox = 90 - ((x0 + x1) / 2) * k, oz = 76 - ((z0 + z1) / 2) * k;
    const X = (x) => ox + x * k, Z = (z) => oz + z * k;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#0c241c'; ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = '#1b3a2f'; ctx.strokeStyle = '#8ff0c8'; ctx.lineWidth = 1.2;
    for (const r of V.rooms) { ctx.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k); ctx.strokeRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k); }
    ctx.fillStyle = '#8ff0c8'; ctx.fillRect(X(V.exit.x - V.exit.r), Z(V.exit.z) - 1, V.exit.r * 2 * k, 4);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X(player.position.x), Z(player.position.z), 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e27a2d'; ctx.beginPath(); ctx.arc(X(player.position.x), Z(player.position.z), 3, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff4d6'; ctx.font = 'bold 9px sans-serif';
    ctx.fillText(isJa() ? V.where[1] : V.where[0], 6, 8);
    return true;
  }

  return {
    id, scene, state, enter, leave, blocked, update, updateCamera, minimap,
    get active() { return state.active; },
    get built() { return built; },
  };
}
