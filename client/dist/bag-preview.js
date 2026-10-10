// 持ち物の 3D — カードの絵（1 回だけ 焼いて img に）と、えらんだ物が まわる 大きい プレビュー。
//
// **WebGL は 増やさない**：島を描いている renderer を 借りて、オフスクリーンの target に 描いて 読み戻す
// （きせかえの店・ふどうさんと 同じ作り。iPad / Safari は コンテキストの 数に うるさい）。借りたら 必ず 元に 戻す。
// 物の形は それぞれの 場所と 同じ：ふく＝wardrobe-models、いえ＝land-world の buildIslandModel、
// ブロック＝立方体、たべもの＝ここの ボクセル（foodModel）。
import * as THREE from './three.module.js';
import { itemModel } from './wardrobe-models.js';
import { buildIslandModel } from './land-world.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
const box = (g, x, y, z, w, h, d, color, extra) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra)); m.position.set(x, y, z); g.add(m); return m; };
const cyl = (g, x, y, z, r, h, color, extra) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color, extra)); m.position.set(x, y, z); g.add(m); return m; };

// たべもの 9 しゅるい（server/src/game/food.js の id）。ちいさな ボクセルの 置き物。
export function foodModel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'apple': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(0xd8323c, { flatShading: true }));
      body.position.y = 0.5; body.scale.set(1, 0.92, 1); g.add(body);
      box(g, 0, 1.0, 0, 0.08, 0.26, 0.08, 0x6b4a2a); box(g, 0.15, 1.03, 0, 0.26, 0.07, 0.15, 0x4fae4b);
      break;
    }
    case 'banana':
      for (let i = 0; i < 6; i += 1) { const a = -0.9 + i * 0.36; box(g, Math.sin(a) * 0.7, 0.5 - Math.cos(a) * 0.35 + 0.35, 0, 0.3, 0.26, 0.3, i === 0 || i === 5 ? 0x8a6b2a : 0xf3d147).rotation.z = a; }
      break;
    case 'watermelon': {
      const half = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3f8f3a)); half.rotation.x = Math.PI; half.position.y = 0.62; g.add(half);
      cyl(g, 0, 0.63, 0, 0.6, 0.04, 0xf2f2e0); cyl(g, 0, 0.655, 0, 0.54, 0.03, 0xe8424e);
      for (let i = 0; i < 6; i += 1) box(g, Math.cos(i) * 0.3, 0.68, Math.sin(i) * 0.3, 0.06, 0.03, 0.1, 0x1b1b1b);
      break;
    }
    case 'cookie':
      cyl(g, 0, 0.3, 0, 0.55, 0.14, 0xc98a45);
      for (let i = 0; i < 7; i += 1) box(g, Math.cos(i * 2.1) * 0.32, 0.39, Math.sin(i * 2.1) * 0.3, 0.1, 0.06, 0.1, 0x4a2a14);
      break;
    case 'donut': {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.18, 12, 28), mat(0xd9a05b)); t.rotation.x = Math.PI / 2; t.position.y = 0.3; g.add(t);
      const icing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.16, 12, 28, Math.PI * 2), mat(0xf28fb0)); icing.rotation.x = Math.PI / 2; icing.position.y = 0.36; icing.scale.z = 0.6; g.add(icing);
      for (let i = 0; i < 10; i += 1) box(g, Math.cos(i * 0.63) * 0.38, 0.47, Math.sin(i * 0.63) * 0.38, 0.05, 0.03, 0.12, [0xffffff, 0x7cc4e0, 0xffd246][i % 3]).rotation.y = i;
      break;
    }
    case 'cake':
      cyl(g, 0, 0.25, 0, 0.6, 0.5, 0xf7e7c8); cyl(g, 0, 0.52, 0, 0.62, 0.08, 0xfffaf0); cyl(g, 0, 0.36, 0, 0.61, 0.06, 0xe8424e);
      box(g, 0, 0.66, 0, 0.18, 0.18, 0.18, 0xe8424e); box(g, 0, 0.78, 0, 0.06, 0.08, 0.06, 0x4fae4b);
      break;
    case 'milk':
      box(g, 0, 0.5, 0, 0.5, 0.8, 0.5, 0xf7f7f2); box(g, 0, 1.0, 0, 0.5, 0.2, 0.36, 0xf7f7f2).rotation.x = 0.0;
      box(g, 0, 0.55, 0.26, 0.4, 0.3, 0.02, 0x4f8fd8);
      break;
    case 'juice':
      box(g, 0, 0.45, 0, 0.5, 0.7, 0.36, 0xf29a2e); box(g, 0, 0.5, 0.19, 0.3, 0.3, 0.02, 0xffe08a);
      box(g, 0.12, 0.95, 0, 0.05, 0.4, 0.05, 0xf7f7f2).rotation.z = -0.2;
      break;
    case 'smoothie':
      cyl(g, 0, 0.4, 0, 0.3, 0.7, 0xf28fb0, { transparent: true, opacity: 0.92 }); cyl(g, 0, 0.78, 0, 0.32, 0.06, 0xf7f7f2);
      box(g, 0.1, 1.0, 0, 0.05, 0.45, 0.05, 0x7cc4e0).rotation.z = -0.25;
      break;
    default:
      box(g, 0, 0.4, 0, 0.6, 0.6, 0.6, 0xcccccc);
  }
  return g;
}

function blockModel(colour) {
  const g = new THREE.Group();
  box(g, 0, 0.5, 0, 1, 1, 1, Number(colour) || 0xcccccc);
  return g;
}

// key は "food:apple" / "wear:cap-red" / "house:<look>" / "block:<id>"。info は その物の データ。
function modelFor(key, info) {
  const [kind, id] = key.split(':');
  if (kind === 'food') return { group: foodModel(id) };
  if (kind === 'wear') { const g = itemModel(info); return g ? { group: g } : null; }
  if (kind === 'block') return { group: blockModel(info?.color) };
  if (kind === 'house' && info?.theme) {
    const m = buildIslandModel({ theme: info.theme, grid: info.grid }, { sign: false, sea: 'disc' });
    return { group: m.group, animate: (t) => m.animate(t), dispose: () => m.dispose?.() };
  }
  return null;
}

export function createBagPreview(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7d88, 2.4));
  const key = new THREE.DirectionalLight(0xfff3dc, 2.6);
  key.position.set(-2.4, 3.2, 4);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
  const shots = new Map();
  const targets = new Map();          // size -> { target, pixels, canvas }

  function frame(group) {
    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3());
    const mid = bounds.getCenter(new THREE.Vector3());
    const reach = Math.max(size.x, size.y, size.z, 0.2);
    const away = reach * 2.3;
    cam.position.set(mid.x + away * 0.5, mid.y + away * 0.45, mid.z + away * 0.85);
    cam.near = reach * 0.02; cam.far = reach * 20;
    cam.lookAt(mid);
    cam.updateProjectionMatrix();
  }
  function surface(n) {
    if (!targets.has(n)) {
      const canvas = document.createElement('canvas'); canvas.width = n; canvas.height = n;
      targets.set(n, { target: new THREE.WebGLRenderTarget(n, n), pixels: new Uint8Array(n * n * 4), canvas });
    }
    return targets.get(n);
  }
  // 1 まい 描いて 2D の canvas に うつす。renderer の 状態は 元に もどす。
  function draw(group, n, into = null) {
    if (!renderer) return null;
    const s = surface(n);
    const wasTarget = renderer.getRenderTarget();
    const wasClear = renderer.getClearColor(new THREE.Color());
    const wasAlpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(s.target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(s.target, 0, 0, n, n, s.pixels);
      const out = into || s.canvas;
      const ctx = out.getContext('2d');
      const image = ctx.createImageData(n, n);
      const row = n * 4;
      for (let y = 0; y < n; y += 1) image.data.set(s.pixels.subarray((n - 1 - y) * row, (n - y) * row), y * row);
      ctx.clearRect(0, 0, n, n);
      ctx.putImageData(image, 0, 0);
      return out;
    } catch {
      return null;
    } finally {
      renderer.setClearColor(wasClear, wasAlpha);
      renderer.setRenderTarget(wasTarget);
    }
  }

  // カードの絵：1 物 1 回。
  function shot(k, info) {
    if (shots.has(k)) return shots.get(k);
    const m = modelFor(k, info);
    if (!m) { shots.set(k, null); return null; }
    m.group.rotation.y = -0.6;
    // まわっている 大きい プレビューの 物が 同じ シーンに いるので、焼く 間だけ かくす。
    if (live) live.m.group.visible = false;
    scene.add(m.group);
    m.animate?.(1);
    frame(m.group);
    const out = draw(m.group, 112);
    scene.remove(m.group);
    m.dispose?.();
    if (live) live.m.group.visible = true;
    const url = out ? out.toDataURL('image/png') : null;
    shots.set(k, url);
    return url;
  }

  // 大きい プレビュー：えらんだ物を ゆっくり まわす（ひらいている間だけ）。
  let live = null;
  function show(canvas, k, info) {
    stop();
    const m = modelFor(k, info);
    if (!m || !canvas) return false;
    scene.add(m.group);
    frame(m.group);
    const n = canvas.width;
    let last = 0;
    const tick = (t) => {
      if (!live || live.m !== m) return;
      if (!canvas.isConnected) { stop(); return; }
      // 1 秒に 10 こま（読み戻しは 重いので。まわる 角度は 時間で 決めるので こまが 少なくても なめらか）。隠れた タブでは 描かない。
      if (t - last > 100 && !document.hidden) {
        last = t;
        m.group.rotation.y = t * 0.0008;
        m.animate?.(t / 1000);
        draw(m.group, n, canvas);
      }
      live.raf = requestAnimationFrame(tick);
    };
    live = { m, raf: requestAnimationFrame(tick) };
    return true;
  }
  function stop() {
    if (!live) return;
    cancelAnimationFrame(live.raf);
    scene.remove(live.m.group);
    live.m.dispose?.();
    live = null;
  }

  return { shot, show, stop };
}
