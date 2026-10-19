// 光の道：左の カードの いちばん 上の タスクへ、足もとから 光の つぶを 流す（Fable III・Roblox の Beam と 同じ 考え）。
// 行き先は 部屋が 決めて 送る（tasks:state の go = { island, spot? }）。ここは 見せるだけ。
//
// 出す とき（docs の 調べもの：道しるべは「なれたら いらなく なる」のが よい・出しすぎると じゃま）：
//   1 章（はじめの 10こ）は いつも。2 章からは いちばん 上の タスクが 30 秒 すすまない ときだけ。
//   カードの「🧭 みちを けす」で 消せる（この 端末に 覚える）。「🧭 みちを 出す」で すぐ 出る。
// 道は メインの島の 道（main_island.json の roads）に そって まがる。ほかの 島が 行き先なら
// 「しまの ちず」の ボタンを 光らせる（島へは とぶので 道は 引けない）。
import * as THREE from './three.module.js';

const KEY = 'uspeak-task-guide-v1';
const STUCK_MS = 30000;
const GAP = 1.7;             // つぶの 間かく（m）
const MAX = 150;
const ARRIVE = 3;            // ここまで 来たら 道は 消す（光の柱は のこる）

export function createTaskGuide({ scene, player, rpg }) {
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* private mode */ }
  let data = null;
  let stamp = performance.now();
  let lastKey = '';
  let forced = false;
  let beaconOn = '';
  let route = [];
  let routeAt = 0;
  let isle = null;              // { roads, hills, spots: Map }

  fetch('main_island.json').then((r) => r.json()).then((j) => {
    const i = j.island;
    isle = { roads: i.roads || [], hills: i.hills || [], spots: new Map(i.spots.map((s) => [s.id, { x: s.x, z: s.z }])) };
  }).catch(() => {});

  // 矢じるし（＞）。子どもには まるより「どっちへ」が 分かる。まわりに やわらかい 光の わ。
  const chevron = new THREE.Shape();
  chevron.moveTo(-0.42, -0.3); chevron.lineTo(0, 0.18); chevron.lineTo(0.42, -0.3);
  chevron.lineTo(0.42, -0.06); chevron.lineTo(0, 0.42); chevron.lineTo(-0.42, -0.06); chevron.closePath();
  const geo = new THREE.ShapeGeometry(chevron).rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc928, transparent: true, opacity: 1, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const dots = new THREE.InstancedMesh(geo, mat, MAX);
  const haloGeo = new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.InstancedMesh(haloGeo, haloMat, MAX);
  for (const mesh of [dots, halo]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.visible = false;
    scene.add(mesh);
  }
  const UP = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  const first = () => data?.tasks?.[0] || null;
  const go = () => first()?.go || null;

  // 出すか どうか（カードの ボタンの 文も これで きまる）。
  function wanted() {
    if (!enabled || !go()) return false;
    if (forced || (data?.chapter?.n || 1) <= 1) return true;
    return performance.now() - stamp > STUCK_MS;
  }

  // ---- 道の 形（メインの島の 中の 座標） -------------------------------------
  const lift = (x, z) => {
    let h = 0;
    for (const hill of isle?.hills || []) {
      const d = Math.hypot(x - hill.x, z - hill.z) / hill.r;
      if (d < 1) h = Math.max(h, Math.cos(d * Math.PI / 2) * 2.2);
    }
    return Math.round(h * 2) / 2;
  };
  const onRoad = (p) => {
    let best = null;
    for (const r of isle?.roads || []) {
      const pt = r.z !== undefined
        ? { x: Math.max(Math.min(r.x0, r.x1), Math.min(Math.max(r.x0, r.x1), p.x)), z: r.z }
        : { x: r.x, z: Math.max(Math.min(r.z0, r.z1), Math.min(Math.max(r.z0, r.z1), p.z)) };
      const d = Math.hypot(pt.x - p.x, pt.z - p.z);
      if (!best || d < best.d) best = { road: r, pt, d };
    }
    return best;
  };
  const cross = (a, b) => {
    const h = a.z !== undefined ? a : b.z !== undefined ? b : null;
    const w = a.x !== undefined && a.z === undefined ? a : b.x !== undefined && b.z === undefined ? b : null;
    return h && w ? { x: w.x, z: h.z } : null;
  };
  function plan(P, T) {
    const straight = Math.hypot(T.x - P.x, T.z - P.z);
    if (straight < 9 || !isle?.roads?.length) return [P, T];
    const a = onRoad(P); const b = onRoad(T);
    if (!a || !b) return [P, T];
    let pts = [P, a.pt];
    if (a.road !== b.road) { const i = cross(a.road, b.road); if (i) pts.push(i); }
    pts.push(b.pt, T);
    pts = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.6);
    // 道を まわるのが まっすぐの 3 倍より 長いなら、まっすぐ（島の 中は 歩ける）。
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return len > straight * 3 ? [P, T] : pts;
  }

  function setBeacon(spot) {
    if (beaconOn === spot) return;
    beaconOn = spot;
    try { rpg.main?.setTarget?.(spot || ''); } catch { /* the island is still building */ }
  }
  function glowMap(on) {
    for (const el of document.querySelectorAll('#flight-button, #mapbtn, #rail-toggle')) el.classList.toggle('task-glow', on);
  }

  function hide() { dots.visible = halo.visible = false; dots.count = halo.count = 0; route = []; }

  function update(t) {
    const g = go();
    const show = wanted();
    const here = rpg.state?.current;
    const walking = rpg.state?.mode !== 'flight' && !rpg.insideBuilding && !rpg.interiorScene;
    glowMap(!!(show && g && g.island !== here && walking));
    const target = show && g?.spot && g.island === 'main' && here === 'main' && isle?.spots.get(g.spot);
    setBeacon(target ? g.spot : '');
    if (!target || !walking) { hide(); return; }
    const o = rpg.main.origin();
    const P = { x: player.position.x - o.x, z: player.position.z - o.z };
    if (Math.hypot(target.x - P.x, target.z - P.z) < ARRIVE) { hide(); return; }
    const now = performance.now();
    if (!route.length || now - routeAt > 400) { route = plan(P, target); routeAt = now; } else route[0] = P;
    // 線の 長さ と、つぶを ながす（行き先の ほうへ 動いて 見える）
    const segs = [];
    let total = 0;
    for (let i = 1; i < route.length; i++) { const l = Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z); segs.push(l); total += l; }
    const shift = (t * 1.6) % GAP;
    let n = 0; let si = 0; let acc = 0;
    for (let s = 0.9 + shift; s < total - 0.8 && n < MAX; s += GAP) {
      while (si < segs.length - 1 && s > acc + segs[si]) { acc += segs[si]; si += 1; }
      const k = segs[si] ? (s - acc) / segs[si] : 0;
      const a = route[si]; const b = route[si + 1];
      const x = a.x + (b.x - a.x) * k; const z = a.z + (b.z - a.z) * k;
      // はじめと おわりは 小さく、まんなかは 光が 波うつ
      const fade = Math.min(1, (s - 0.5) / 1.2, (total - s) / 2);
      const pulse = 1.15 + 0.3 * Math.sin(s * 0.9 - t * 5);
      sc.setScalar(Math.max(0.2, fade) * pulse);
      v.set(x + o.x, lift(x, z) + 0.4, z + o.z);
      // 矢じるしの 先（+z の 形）を 進む 向き（a → b）に むける
      q.setFromAxisAngle(UP, Math.atan2(b.x - a.x, b.z - a.z));
      m4.compose(v, q, sc);
      dots.setMatrixAt(n, m4);
      v.y -= 0.02;
      m4.compose(v, q, sc);
      halo.setMatrixAt(n, m4);
      n += 1;
    }
    dots.count = halo.count = n;
    dots.instanceMatrix.needsUpdate = halo.instanceMatrix.needsUpdate = true;
    dots.visible = halo.visible = n > 0;
  }

  return {
    set(payload) {
      data = payload || null;
      const f = first();
      const key = f ? `${f.id}:${f.have}` : '';
      if (key !== lastKey) {
        if (!f || !lastKey.startsWith(`${f.id}:`)) forced = false;
        lastKey = key; stamp = performance.now();
      }
      if (!data) { hide(); setBeacon(''); glowMap(false); }
    },
    update,
    get shown() { return wanted(); },
    get task() { return first(); },
    get available() { return !!go(); },
    toggle() {
      if (wanted()) { enabled = false; forced = false; } else { enabled = true; forced = true; }
      try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* private mode */ }
    },
  };
}
