// ぼくじょう島の どうぶつの 3D プレビュー — one renderer for the whole farm screen.
//
// The shop's animal cards, the pen's cards and the little paddock at the top of the pen
// all show the same models the island stands in the grass (`farm-animals.js`). A card
// cannot own a canvas each — a dozen WebGL contexts is more than an iPad gives — so
// cards get a picture baked once per session from an offscreen target (as the wardrobe
// and the estate office do), and the one live canvas is the paddock, where the child's
// own animals stand on a turning patch of grass, looking about.
import * as THREE from './three.module.js';
import { buildAnimal, animateAnimal } from './farm-animals.js';

const THUMB_W = 180;
const THUMB_H = 150;
const bucket = (hearts) => (hearts >= 6 ? 6 : hearts >= 3 ? 3 : 0);

export function createAnimalStage() {
  let renderer = null;
  let failed = false;
  const models = new Map();          // "kind:heartsBucket" -> Group
  const shots = new Map();           // same key -> data URL (null when WebGL is out)
  const stage = new THREE.Scene();
  stage.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a7a55, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.8);
  sun.position.set(4, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 });
  stage.add(sun);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: 0x79b35a, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; stage.add(grass);
  const camera = new THREE.PerspectiveCamera(28, 1.2, 0.05, 60);
  const shown = new THREE.Group();   // what is on the live paddock
  stage.add(shown);
  let target = null; let pixels = null; let flat = null;
  let host = null; let live = []; let spinning = false; let spin = 0; let lastT = 0; let dragging = false; let lastX = 0;
  let baking = 0;

  function ensureRenderer() {
    if (renderer || failed) return;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.className = 'farm-stage-canvas';
      const c = renderer.domElement;
      c.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; c.setPointerCapture?.(e.pointerId); });
      c.addEventListener('pointermove', (e) => { if (!dragging) return; spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; });
      const letGo = () => { dragging = false; };
      c.addEventListener('pointerup', letGo); c.addEventListener('pointercancel', letGo);
    } catch { failed = true; }
  }
  const keyOf = (kind, hearts) => `${kind}:${bucket(hearts)}`;
  function modelOf(kind, hearts) {
    const k = keyOf(kind, hearts);
    if (!models.has(k)) models.set(k, buildAnimal(kind, { hearts: bucket(hearts), seed: 0 }));
    return models.get(k);
  }
  function frame(size, aspect, n = 1) {
    // One animal on a card stands back far enough for comb and horns; a ring stands back by its size.
    const r = size * (n > 1 ? 1.25 + n * 0.22 : 1.45);
    camera.aspect = aspect; camera.fov = 28;
    camera.position.set(r * 1.5, r * 1.05 + size * 0.25, r * 2.1);
    camera.lookAt(0, size * 0.45, 0);
    camera.updateProjectionMatrix();
  }
  function clearShown() { while (shown.children.length) shown.remove(shown.children[0]); }

  // A card's picture: one animal, three-quarter view, read back from an offscreen target.
  function bake(key) {
    if (shots.has(key)) return shots.get(key);
    ensureRenderer();
    if (!renderer) { shots.set(key, null); return null; }
    const [kind, h] = key.split(':');
    const model = modelOf(kind, Number(h) || 0);
    if (!target) {
      target = new THREE.WebGLRenderTarget(THUMB_W, THUMB_H);
      pixels = new Uint8Array(THUMB_W * THUMB_H * 4);
      flat = document.createElement('canvas'); flat.width = THUMB_W; flat.height = THUMB_H;
    }
    const wasTarget = renderer.getRenderTarget();
    let url = null;
    try {
      clearShown();
      model.rotation.y = -0.6; model.position.set(0, 0, 0); animateAnimal(model, 1.3, 0);
      shown.add(model); shown.rotation.y = 0;
      const size = model.userData.size || 1;
      grass.scale.setScalar(size * 0.9); grass.visible = true;
      frame(size, THUMB_W / THUMB_H);
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(stage, camera);
      renderer.readRenderTargetPixels(target, 0, 0, THUMB_W, THUMB_H, pixels);
      const ctx = flat.getContext('2d');
      const image = ctx.createImageData(THUMB_W, THUMB_H);
      const row = THUMB_W * 4;
      for (let y = 0; y < THUMB_H; y += 1) image.data.set(pixels.subarray((THUMB_H - 1 - y) * row, (THUMB_H - y) * row), y * row);
      ctx.putImageData(image, 0, 0);
      url = flat.toDataURL('image/png');
    } catch { url = null; }
    renderer.setRenderTarget(wasTarget);
    clearShown();
    shots.set(key, url);
    if (live.length) place();
    return url;
  }
  // Every `img[data-shot="kind:hearts"]` under `root` gets its picture, two per frame so
  // the screen never stalls; the emoji beside it stays until then (and for good without WebGL).
  function fill(root) {
    const run = ++baking;
    const els = [...root.querySelectorAll('img[data-shot]')];
    const show = (el, url) => { el.src = url; el.hidden = false; el.closest('.farm-card, .farm-plotcard')?.classList.add('shot'); };
    for (const el of els) { const url = shots.get(el.dataset.shot); if (url) show(el, url); }
    const todo = els.filter((el) => !shots.has(el.dataset.shot));
    const step = () => {
      if (run !== baking) return;
      for (let i = 0; i < 2 && todo.length; i += 1) { const el = todo.shift(); const url = bake(el.dataset.shot); if (url && el.isConnected) show(el, url); }
      if (todo.length) requestAnimationFrame(step);
    };
    if (todo.length) requestAnimationFrame(step);
  }

  // The paddock: the child's animals in a ring, turning slowly, a finger spins it. Each
  // one is built afresh (cheap: a dozen shared boxes) so the seeded wobble differs.
  function place() {
    clearShown();
    const n = live.length; if (!n) return;
    let big = 1;
    live.forEach((a, i) => {
      const m = buildAnimal(a.kind, { hearts: bucket(a.hearts), seed: i * 1.7 });
      const ang = (i / n) * Math.PI * 2 + 0.6;
      const r = n > 1 ? 0.9 + n * 0.28 : 0;
      m.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      m.rotation.y = -ang + Math.PI / 2 + 0.3;
      big = Math.max(big, m.userData.size || 1);
      shown.add(m);
    });
    grass.scale.setScalar((n > 1 ? 1.4 + n * 0.32 : 0.9) * Math.max(1, big * 0.8));
  }
  function draw(now) {
    if (!renderer || !host || !host.isConnected) { spinning = false; return; }
    const w = host.clientWidth || 320; const h = host.clientHeight || 180;
    const c = renderer.domElement;
    if (c.width !== Math.round(w * renderer.getPixelRatio()) || c.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    const t = now / 1000;
    if (!dragging) spin += (t - (lastT || t)) * 0.3;
    shown.rotation.y = spin;
    let big = 1;
    shown.children.forEach((m) => { animateAnimal(m, t, 0); big = Math.max(big, m.userData.size || 1); });
    frame(big, w / h, live.length);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 0);
    renderer.render(stage, camera);
    lastT = t;
    requestAnimationFrame(draw);
  }
  // `animals` is the room's list ({kind, hearts}); `el` the box the canvas lives in.
  function show(el, animals) {
    ensureRenderer();
    host = el;
    if (!renderer || !el) { if (el) el.classList.add('no-gl'); return false; }
    if (renderer.domElement.parentElement !== el) el.append(renderer.domElement);
    live = animals.map((a) => ({ kind: a.kind, hearts: a.hearts || 0 }));
    place();
    if (!spinning) { spinning = true; lastT = 0; requestAnimationFrame(draw); }
    return true;
  }
  function stop() { host = null; live = []; clearShown(); }
  return { fill, show, stop, bake, shot: (kind, hearts) => shots.get(keyOf(kind, hearts)) ?? null, key: keyOf, get ready() { return !!renderer; } };
}
