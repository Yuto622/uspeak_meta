// きせかえの店 — try it on, then buy it.
//
// The layout is the reference's (DreaMagic): the avatar stands on the left, the items are
// a grid of cards each with its price on a coin badge, and the slots are a rail of icons
// down the side. Two things about it are deliberate and worth keeping:
//
//   * Tapping an item TRIES IT ON, whether or not the child owns it. Wanting a thing you
//     can see on yourself is most of what a shop is for, and a seven-year-old should not
//     have to imagine it.
//   * A locked item still shows its price and what unlocks it. "あと 60 コイン" and
//     "レベル 6 から" are two different answers and a child can act on both.
//
// Nothing here decides anything: what is owned, what is worn and what it costs all come
// from the room, and buying is a request the room can refuse.
import * as THREE from './three.module.js';
import { buildAvatar, dressAvatar } from './avatars.js';
import { itemModel } from './wardrobe-models.js';
import { loadWardrobe } from './wardrobe-data.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createWardrobe({ send, isOnline, toast, avatars }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'wear-dialog';
  dialog.innerHTML = `
    <button class="close" id="wear-close" aria-label="閉じる">×</button>
    <div class="wear-head">
      <div><span class="wear-eyebrow">DRESS UP</span><h2>きせかえ</h2></div>
      <div class="wear-coins"><i class="coin-face" aria-hidden="true"></i><b id="wear-coins">0</b></div>
    </div>
    <div class="wear-body">
      <section class="wear-stage">
        <canvas id="wear-canvas" aria-label="きせかえのプレビュー"></canvas>
        <p id="wear-fallback" hidden>3Dプレビューを ひょうじ できません。かうことは できます。</p>
        <p class="wear-caption" id="wear-caption"></p>
      </section>
      <section class="wear-pick">
        <nav class="wear-slots" id="wear-slots" aria-label="きせかえのしゅるい"></nav>
        <div class="wear-grid" id="wear-grid"></div>
      </section>
    </div>`;
  document.body.append(dialog);
  $('#wear-close', dialog).onclick = () => dialog.close();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.close(); });

  let table = null;
  let shop = null;
  let slot = 'hat';
  let trying = null;          // the item being previewed but not worn

  // ---- the little stage ----------------------------------------------------------------
  let renderer = null;
  let failed = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d3f43);
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0x35545c, 2.6));
  const key = new THREE.DirectionalLight(0xfff0cf, 2.6);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(0, 1.6, 5.4);
  camera.lookAt(0, 1.25, 0);
  let model = null;
  let spin = 0;
  let spinning = false;
  let wearing = '';       // the avatar the stage's body was built from

  function ensureStage() {
    if (renderer || failed) return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: $('#wear-canvas', dialog), antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch {
      failed = true;
      $('#wear-canvas', dialog).hidden = true;
      $('#wear-fallback', dialog).hidden = false;
    }
  }

  // One loop at a time, and only while the shop is open — the world is drawing behind
  // this dialog and a second frame loop on an iPad is half of somebody's frame rate.
  // `spinning` is what says the loop has stopped: without it the second visit to the shop
  // gets a frozen avatar, because `draw` returns on a closed dialog and nothing starts it
  // again.
  function draw() {
    if (!renderer || !dialog.open) { spinning = false; return; }
    const c = $('#wear-canvas', dialog);
    const w = c.clientWidth || 240;
    const h = c.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (model) { spin += 0.008; model.rotation.y = Math.sin(spin) * 0.6; }
    renderer.render(scene, camera);
    requestAnimationFrame(draw);
  }
  function spinUp() { if (renderer && dialog.open && !spinning) { spinning = true; draw(); } }

  // ---- the picture on each card --------------------------------------------------------
  //
  // Every card shows the real model, not a colour. Forty cards cannot each have a canvas —
  // that is forty WebGL contexts, which Safari will not give you and an iPad cannot afford
  // — so the ONE renderer the stage already owns draws each item once into an offscreen
  // target, the pixels are read back into an ordinary image, and the card shows that. Baked
  // once per item per session; after that a card costs nothing.
  const THUMB = 132;
  const shots = new Map();            // item id -> data URL
  let target = null;
  let pixels = null;
  let flat = null;                    // the 2D canvas the pixels are painted into
  const shotScene = new THREE.Scene();
  shotScene.add(new THREE.HemisphereLight(0xffffff, 0x6b7d88, 2.5));
  const shotKey = new THREE.DirectionalLight(0xfff3dc, 2.7);
  shotKey.position.set(-2.4, 3.2, 4);
  shotScene.add(shotKey);
  const shotCam = new THREE.PerspectiveCamera(30, 1, 0.05, 24);

  function bake(item) {
    if (shots.has(item.id)) return shots.get(item.id);
    ensureStage();
    if (!renderer) return null;
    const model = itemModel(item);
    if (!model) { shots.set(item.id, null); return null; }
    if (!target) {
      target = new THREE.WebGLRenderTarget(THUMB, THUMB);
      pixels = new Uint8Array(THUMB * THUMB * 4);
      flat = document.createElement('canvas');
      flat.width = THUMB;
      flat.height = THUMB;
    }
    // Turned a little before it is framed, so flat things — a cape, a badge, a pair of
    // glasses — show an edge instead of reading as a coloured rectangle.
    model.rotation.set(0.1, -0.52, 0);
    model.updateMatrixWorld(true);
    shotScene.add(model);
    // Frame whatever it is. A wizard hat is a metre tall and a badge is two centimetres;
    // one fixed camera would show the badge as a dot and crop the hat.
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const mid = bounds.getCenter(new THREE.Vector3());
    const reach = Math.max(size.x, size.y, size.z, 0.2);
    const away = reach * 2.5;
    shotCam.position.set(mid.x + away * 0.5, mid.y + away * 0.42, mid.z + away * 0.88);
    shotCam.lookAt(mid);
    shotCam.updateProjectionMatrix();

    // The stage is mid-render behind this dialog; put back everything we touch.
    const wasTarget = renderer.getRenderTarget();
    const wasClear = renderer.getClearColor(new THREE.Color());
    const wasAlpha = renderer.getClearAlpha();
    let url = null;
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(shotScene, shotCam);
      renderer.readRenderTargetPixels(target, 0, 0, THUMB, THUMB, pixels);
      // GL reads bottom-up and a canvas is top-down, so the rows go back in reverse.
      const ctx = flat.getContext('2d');
      const image = ctx.createImageData(THUMB, THUMB);
      const row = THUMB * 4;
      for (let y = 0; y < THUMB; y += 1) {
        image.data.set(pixels.subarray((THUMB - 1 - y) * row, (THUMB - y) * row), y * row);
      }
      ctx.clearRect(0, 0, THUMB, THUMB);
      ctx.putImageData(image, 0, 0);
      url = flat.toDataURL('image/png');
    } catch {
      url = null;                     // no picture today; the colour swatch stands in
    }
    renderer.setClearColor(wasClear, wasAlpha);
    renderer.setRenderTarget(wasTarget);
    shotScene.remove(model);
    shots.set(item.id, url);
    return url;
  }

  // Bake the slot the child is looking at, a few at a time, so opening the shop does not
  // stall on a tablet drawing forty models before it shows anything.
  let baking = 0;
  function bakeVisible() {
    const run = ++baking;
    const todo = [...dialog.querySelectorAll('[data-shot]')].filter((el) => !shots.has(el.dataset.shot));
    const step = () => {
      if (run !== baking || !dialog.open) return;
      for (let i = 0; i < 3 && todo.length; i += 1) {
        const el = todo.shift();
        const item = table?.byId.get(el.dataset.shot);
        const url = item ? bake(item) : null;
        if (url && el.isConnected) { el.src = url; el.hidden = false; el.parentElement?.classList.add('shot'); }
      }
      if (todo.length) requestAnimationFrame(step);
    };
    // Anything already baked goes on immediately; only the new ones wait for a frame.
    for (const el of dialog.querySelectorAll('[data-shot]')) {
      const url = shots.get(el.dataset.shot);
      if (url) { el.src = url; el.hidden = false; el.parentElement?.classList.add('shot'); }
    }
    if (todo.length) requestAnimationFrame(step);
  }

  // What the body is wearing right now on screen: everything worn, plus whatever is being
  // tried on (which replaces the worn thing in that slot).
  function previewList() {
    if (!table || !shop) return [];
    const on = (shop.worn || []).map((id) => table.byId.get(id)).filter(Boolean);
    if (!trying) return on;
    return [...on.filter((i) => i.slot !== trying.slot), trying];
  }

  function redress() {
    if (failed) return;
    ensureStage();
    // Rebuilt when the child changes face or colour, so the shop shows who they are now
    // rather than who they were when they first opened it.
    const who = JSON.stringify(avatars.config);
    if (model && who !== wearing) { scene.remove(model); model = null; }
    if (!model) {
      wearing = who;
      model = buildAvatar(avatars.config);
      model.position.y = -1.15;
      scene.add(model);
    }
    spinUp();
    dressAvatar(model, previewList(), itemModel);
  }

  // ---- the cards -------------------------------------------------------------------------
  function render() {
    if (!shop) return;
    $('#wear-coins', dialog).textContent = (shop.coins || 0).toLocaleString();
    $('#wear-slots', dialog).innerHTML = (shop.slots || []).map((s) => `
      <button type="button" data-slot="${esc(s.id)}" class="${s.id === slot ? 'on' : ''}" aria-pressed="${s.id === slot}">
        <span>${esc(s.icon)}</span>${esc(s.ja)}
      </button>`).join('');
    dialog.querySelectorAll('[data-slot]').forEach((b) => {
      b.onclick = () => { slot = b.dataset.slot; trying = null; render(); redress(); };
    });

    const items = (shop.items || []).filter((i) => i.slot === slot);
    $('#wear-grid', dialog).innerHTML = items.map((i) => {
      const state = i.worn ? 'きているよ' : i.owned ? 'もっている' : i.locked ? `レベル ${i.level} から`
        : i.afford ? '' : `あと ${(i.price - shop.coins).toLocaleString()} コイン`;
      return `
        <button type="button" class="wear-card ${i.worn ? 'worn' : ''} ${i.locked ? 'locked' : ''}" data-item="${esc(i.id)}">
          <i class="wear-swatch" style="--c:#${esc(i.colour)}"><img data-shot="${esc(i.id)}" alt="" hidden></i>
          <b>${esc(i.ja)}</b>
          <small>${esc(i.en)}</small>
          <span class="wear-price ${i.owned ? 'owned' : ''}">${i.owned ? '✓' : `<i class="coin-face"></i>${i.price}`}</span>
          ${state ? `<em>${esc(state)}</em>` : ''}
        </button>`;
    }).join('') || '<p class="wear-empty">この しゅるいは まだ ありません。</p>';

    dialog.querySelectorAll('[data-item]').forEach((b) => { b.onclick = () => pick(b.dataset.item); });
    caption();
    bakeVisible();
  }

  function caption() {
    const item = trying || (shop?.items || []).find((i) => i.worn && i.slot === slot);
    const el = $('#wear-caption', dialog);
    if (!item) { el.innerHTML = '<span>なにも つけていません</span>'; return; }
    const own = shop.items.find((i) => i.id === item.id) || item;
    el.innerHTML = own.owned
      ? `<b>${esc(item.ja)}</b><button type="button" id="wear-do" class="wear-do">${own.worn ? 'ぬぐ' : 'きる'}</button>`
      : own.locked
        ? `<b>${esc(item.ja)}</b><span class="wear-locked">レベル ${own.level} から かえます</span>`
        : `<b>${esc(item.ja)}</b><button type="button" id="wear-do" class="wear-do buy" ${own.afford ? '' : 'disabled'}>
             ${own.afford ? `<i class="coin-face"></i> ${own.price} で かう` : `あと ${(own.price - shop.coins).toLocaleString()} コイン`}
           </button>`;
    const go = $('#wear-do', dialog);
    if (go) {
      go.onclick = () => {
        if (!own.owned) send('wear:buy', { id: item.id });
        else send('wear:put', { id: item.id, off: !!own.worn });
      };
    }
  }

  // Tapping a card tries it on. Buying is a second, deliberate tap — a child should never
  // spend coins by browsing.
  function pick(id) {
    const item = (shop?.items || []).find((i) => i.id === id);
    if (!item) return;
    trying = trying?.id === id ? null : table.byId.get(id);
    render();
    redress();
  }

  return {
    // `slot` opens the shop already showing one kind of thing: きせかえ島 has a shop per
    // slot, and a child who walked into the hat shop should be looking at hats.
    async open({ slot: want = '' } = {}) {
      if (!isOnline()) { toast('きせかえは オンラインで つかえます。'); return; }
      if (!table) {
        try { table = await loadWardrobe(); } catch { toast('きせかえを よみこめませんでした。'); return; }
      }
      if (want && table.slots.some((s) => s.id === want)) { slot = want; trying = null; }
      if (!dialog.open) dialog.showModal();
      if (!shop) $('#wear-grid', dialog).innerHTML = '<p class="wear-empty">よみこみ中…</p>';
      send('wear:list', {});
      redress();
    },
    onShop(m) {
      shop = m;
      trying = null;
      render();
      redress();
    },
    // Bought: the room has taken the coins and put the thing on. The list that follows
    // refreshes the cards, so this only has to say something nice.
    onBought(m) {
      const item = table?.byId.get(m.id);
      if (item) toast(`${item.ja} を かいました！`);
    },
    onWorn(m) {
      if (!shop) return;
      shop.worn = m.worn || [];
      for (const i of shop.items) { i.owned = (m.owned || []).includes(i.id); i.worn = shop.worn.includes(i.id); }
      trying = null;
      render();
      redress();
    },
    onError(m) {
      toast({
        'no such item': 'その アイテムは ありません。',
        'already owned': 'すでに もっています。',
        'level too low': 'レベルが たりません。',
        'not enough coins': 'コインが たりません。',
        'not yours': 'まだ もっていません。',
      }[m?.reason] || 'きせかえが できませんでした。');
    },
    get isOpen() { return dialog.open; },
    get dialog() { return dialog; },
    get table() { return table; },
  };
}
