// 土地島の画面 — the estate office (buy the next island, or change its look), and the
// board of everyone's.
//
// The office shows all twelve islands from land.json as a grid of cards, each with a real
// 3D picture of the island it sells — the very group land-world.js builds when a child
// walks on it, drawn once into an offscreen target and kept as an image — and, above the
// grid, a turntable where the island a child tapped turns slowly and can be dragged round.
// Buying is two taps on purpose ("この しまに する？ ◈ 600" and then yes): nothing a child
// only looks at costs anything. Every price on a button is read from the same file the
// room charges from, so the two cannot disagree; the charge itself only ever happens there.
import * as THREE from './three.module.js';
import { t as tr, isJa, onLangChange } from './i18n.js';
import { loadLandData } from './land-island.js';
import { buildIslandModel } from './land-world.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const THUMB_W = 220;
const THUMB_H = 150;

export function createLandUI({ send, toast, isOnline, world }) {
  const state = { mode: 'office', land: null, coins: 0, board: null, pick: '', confirm: false, busy: false };
  let data = null;
  const looks = new Map();          // look id -> { ...look, tier, grid }
  loadLandData().then((d) => {
    data = d;
    for (const t of d.tiers || []) for (const l of t.looks || []) looks.set(l.id, { ...l, tier: t.tier, grid: t.grid, price: t.price });
    if (dialog.open) render();
  });

  const dialog = document.createElement('dialog');
  dialog.id = 'land-dialog';
  dialog.setAttribute('aria-labelledby', 'land-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">LAND ISLAND</span><h2 id="land-title">土地島</h2></div>
      <span class="land-coins">◈ <b id="land-coins">0</b></span>
      <button type="button" id="land-close" aria-label="閉じる">×</button>
    </div><div id="land-body"></div>`;
  document.body.append(dialog);
  // The office keeps its own element so the turntable's canvas survives a re-render.
  const office = document.createElement('div');
  office.className = 'land-office';
  office.innerHTML = `<p class="land-lead" id="land-lead"></p>
    <div class="land-stage">
      <div class="land-view"><canvas id="land-canvas" aria-label="しまの 3D プレビュー"></canvas><span class="land-view-emoji" id="land-view-emoji" hidden></span><span class="land-view-hint">🔄 <i>ゆびで まわせる</i></span></div>
      <div class="land-pick" id="land-pick"></div>
    </div>
    <div class="land-grid" id="land-grid"></div>
    <p class="land-note" id="land-note"></p>`;
  const close = () => { try { dialog.close(); } catch { /* already closed */ } };
  $('#land-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => { spinning = false; });

  const name = (t) => (isJa() ? t.name : t.en);
  const blurb = (l) => (isJa() ? l.ja : l.blurb);

  // ---- the 3D pictures ---------------------------------------------------------------
  //
  // One renderer, owned by this dialog, draws the turntable while the office is open and
  // bakes each card's picture once per session. Twelve cards cannot each have a canvas —
  // twelve WebGL contexts is more than Safari gives and more than an iPad can afford — so
  // the cards get images read back from an offscreen target (the way the wardrobe does).
  let renderer = null;
  let failed = false;
  const models = new Map();         // look id -> buildIslandModel(...)
  const shots = new Map();          // look id -> data URL (or null when WebGL is out)
  const stage = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xeaf4ff, 0x6a7a55, 1.6);
  stage.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.7);
  sun.position.set(14, 22, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 });
  stage.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 200);
  let shown = null;                 // the model on the turntable
  let spin = 0;                     // where a drag left it
  let dragging = false;
  let spinning = false;
  let lastT = 0;
  let target = null;
  let pixels = null;
  let flat = null;

  function ensureRenderer() {
    if (renderer || failed) return;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: $('#land-canvas', office), antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } catch {
      failed = true;
      $('#land-canvas', office).hidden = true;
      $('#land-view-emoji', office).hidden = false;
    }
  }
  const modelOf = (id) => {
    const l = looks.get(id);
    if (!l) return null;
    if (!models.has(id)) models.set(id, buildIslandModel({ theme: l.theme, grid: l.grid }, { sign: false, sea: 'disc' }));
    return models.get(id);
  };
  // The sun and the sky follow the island on the turntable: a volcano at dusk, the
  // moon under stars, a beach at noon.
  function light(model) {
    const th = model.theme;
    sun.color.set(th.sun); sun.intensity = th.space ? 2.0 : 1.7;
    hemi.intensity = th.space ? 0.8 : 1.6; hemi.groundColor.set(th.ground);
    stage.background = new THREE.Color(th.sky);
  }
  function frame(model, aspect) {
    // A wide stage sees less height than a card does, so it stands further back.
    const h = model.half; const k = aspect < 1.6 ? 1 : 1 + (aspect - 1.6) * 0.45;
    camera.aspect = aspect; camera.fov = 30;
    camera.position.set(h * 1.55 * k, h * 1.45 * k, h * 2.05 * k);
    camera.lookAt(0, 0.4, 0);
    camera.updateProjectionMatrix();
  }

  function bake(id) {
    if (shots.has(id)) return shots.get(id);
    ensureRenderer();
    const model = renderer ? modelOf(id) : null;
    if (!model) { shots.set(id, null); return null; }
    if (!target) {
      target = new THREE.WebGLRenderTarget(THUMB_W, THUMB_H);
      pixels = new Uint8Array(THUMB_W * THUMB_H * 4);
      flat = document.createElement('canvas'); flat.width = THUMB_W; flat.height = THUMB_H;
    }
    const wasShown = shown;
    const wasTarget = renderer.getRenderTarget();
    let url = null;
    try {
      stage.add(model.group); model.group.rotation.y = -0.35; model.animate(1.0);
      light(model); frame(model, THUMB_W / THUMB_H);
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(stage, camera);
      renderer.readRenderTargetPixels(target, 0, 0, THUMB_W, THUMB_H, pixels);
      // GL reads bottom-up and a canvas is top-down, so the rows go back in reverse.
      const ctx = flat.getContext('2d');
      const image = ctx.createImageData(THUMB_W, THUMB_H);
      const row = THUMB_W * 4;
      for (let y = 0; y < THUMB_H; y += 1) image.data.set(pixels.subarray((THUMB_H - 1 - y) * row, (THUMB_H - y) * row), y * row);
      ctx.putImageData(image, 0, 0);
      url = flat.toDataURL('image/jpeg', 0.86);
    } catch {
      url = null;                   // no picture today; the emoji stands in
    }
    renderer.setRenderTarget(wasTarget);
    if (wasShown !== model) stage.remove(model.group);
    if (wasShown && wasShown !== model) stage.add(wasShown.group);
    shots.set(id, url);
    return url;
  }
  // Bake a few cards a frame, so opening the office does not stall on a tablet drawing
  // twelve islands before it shows anything.
  let baking = 0;
  function bakeVisible() {
    const run = ++baking;
    for (const el of dialog.querySelectorAll('[data-shot]')) { const url = shots.get(el.dataset.shot); if (url) { el.src = url; el.hidden = false; el.parentElement?.classList.add('shot'); } }
    const todo = [...dialog.querySelectorAll('[data-shot]')].filter((el) => !shots.has(el.dataset.shot));
    const step = () => {
      if (run !== baking || !dialog.open) return;
      for (let i = 0; i < 2 && todo.length; i += 1) {
        const el = todo.shift();
        const url = bake(el.dataset.shot);
        if (url && el.isConnected) { el.src = url; el.hidden = false; el.parentElement?.classList.add('shot'); }
      }
      if (todo.length) requestAnimationFrame(step);
    };
    if (todo.length) requestAnimationFrame(step);
  }

  function show(id) {
    ensureRenderer();
    const model = modelOf(id);
    if (!renderer || !model) { const em = $('#land-view-emoji', office); em.textContent = looks.get(id)?.emoji || '🏝'; em.hidden = !!renderer; return; }
    if (shown && shown !== model) stage.remove(shown.group);
    shown = model;
    stage.add(model.group);
    light(model);
    spinUp();
  }
  function draw(now) {
    if (!renderer || !dialog.open || state.mode !== 'office') { spinning = false; return; }
    const c = $('#land-canvas', office);
    const w = c.clientWidth || 320; const h = c.clientHeight || 220;
    if (c.width !== Math.round(w * renderer.getPixelRatio()) || c.height !== Math.round(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    const t = now / 1000;
    if (shown) {
      if (!dragging) spin += (t - (lastT || t)) * 0.25;
      shown.group.rotation.y = spin;
      shown.animate(t);
      frame(shown, w / h);
      renderer.setRenderTarget(null);
      renderer.render(stage, camera);
    }
    lastT = t;
    requestAnimationFrame(draw);
  }
  function spinUp() { if (renderer && dialog.open && !spinning) { spinning = true; lastT = 0; requestAnimationFrame(draw); } }
  // A finger (or a mouse) turns the island; let go and it goes on turning by itself.
  const canvas = $('#land-canvas', office);
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; spin += (e.clientX - lastX) * 0.012; lastX = e.clientX; });
  const letGo = () => { dragging = false; };
  canvas.addEventListener('pointerup', letGo); canvas.addEventListener('pointercancel', letGo);

  // ---- the office --------------------------------------------------------------------
  // What a card is to this child: theirs, a change of look, the next step, or later.
  function standing(l) {
    const L = state.land;
    if (!L) return 'later';
    if (l.tier === L.tier) return l.id === L.look ? 'mine' : 'restyle';
    if (L.next && l.tier === L.next.tier) return 'next';
    return l.tier < L.tier ? 'passed' : 'later';
  }
  const priceOf = (l) => (standing(l) === 'restyle' ? state.land.step.restyle : standing(l) === 'next' ? state.land.next.price : (looks.get(l.id)?.price ?? l.price ?? 0));

  function defaultPick() {
    const L = state.land;
    if (!L) return '';
    if (state.pick && looks.has(state.pick)) return state.pick;
    return L.next ? L.next.looks[0].id : L.look;
  }

  function render() {
    if (!dialog.open) return;
    $('#land-coins', dialog).textContent = state.coins;
    $('#land-title', dialog).textContent = state.mode === 'board' ? tr('みんなの しま') : tr('しまの ふどうさん');
    const body = $('#land-body', dialog);
    if (state.mode === 'board') { body.innerHTML = renderBoard(); bakeVisible(); return; }
    const L = state.land;
    if (!L || !data) { body.innerHTML = `<p class="land-note">${tr('よみこんで います…')}</p>`; return; }
    if (office.parentElement !== body) body.replaceChildren(office);
    state.pick = defaultPick();
    $('#land-lead', office).innerHTML = L.tier
      ? tr('いまの しまは {name}。カードを おすと 3Dで 見られる。', { name: `<b>${esc(name(L.island))}</b>` })
      : tr('じぶんだけの しまを かおう。カードを おすと 3Dで 見られる。');
    $('#land-grid', office).innerHTML = L.tiers.flatMap((t) => t.looks.map((l) => {
      const s = standing(l);
      const can = (s === 'next' || s === 'restyle') && state.coins >= priceOf(l);
      return `<button type="button" class="land-card ${s} ${l.id === state.pick ? 'selected' : ''}" data-look="${esc(l.id)}" data-theme="${esc(l.theme)}">
        <span class="land-shot"><img data-shot="${esc(l.id)}" alt="" hidden><span class="land-emoji" translate="no">${esc(l.emoji)}</span><span class="land-step">${tr('だい{n}だん', { n: t.tier })}</span></span>
        <b>${esc(name(l))}</b>
        <span class="land-price">${s === 'mine' ? `✔ ${tr('いまの しま')}` : s === 'passed' ? `✔ ${tr('かった')}` : s === 'restyle' ? `${tr('もようがえ')} ◈ ${priceOf(l)}` : `◈ ${priceOf(l)}`}</span>
        ${s === 'later' ? `<span class="land-lock">🔒 ${tr('まえの しまの つぎ')}</span>` : s === 'next' && !can ? `<span class="land-lock">${tr('あと {n} コイン', { n: priceOf(l) - state.coins })}</span>` : ''}
      </button>`;
    })).join('');
    renderPick();
    $('#land-note', office).textContent = tr('しまは じゅんばんに かう。おなじ だんの もう ひとつの しまには、やすく もようがえ できる。かった しまは ⛵ の いえから いけるよ。えいごの もんだいや コインの もらいかたは かわらない。');
    bakeVisible();
    show(state.pick);
  }

  // The panel beside the turntable: what the island is, what it costs, and the button.
  function renderPick() {
    const l = looks.get(state.pick);
    const el = $('#land-pick', office);
    if (!l) { el.innerHTML = ''; return; }
    const s = standing(l); const price = priceOf(l); const can = state.coins >= price;
    let action = '';
    if (s === 'mine') action = `<span class="land-state">✔ ${tr('いまの しま')}</span>`;
    else if (s === 'passed') action = `<span class="land-state">✔ ${tr('かった')}</span>`;
    else if (s === 'later') action = `<span class="land-state">🔒 ${tr('まえの しまの つぎ')}</span>`;
    else if (state.confirm) action = `<div class="land-row"><button type="button" class="primary" data-buy="${esc(l.id)}" data-kind="${s}" ${state.busy ? 'disabled' : ''}>${s === 'restyle' ? tr('はい、もようがえ！') : tr('はい、かう！')} ◈ ${price}</button><button type="button" data-cancel="1">${tr('やめる')}</button></div>`;
    else action = `<button type="button" class="primary" data-ask="${esc(l.id)}" ${can ? '' : 'disabled'}>${can ? (s === 'restyle' ? tr('もようがえ する') : tr('この しまに する')) : tr('あと {n} コイン', { n: price - state.coins })}</button>`;
    el.innerHTML = `<span class="land-step">${tr('だい{n}だん', { n: l.tier })} · ${l.grid}×${l.grid}</span>
      <b><span class="land-emoji" translate="no">${esc(l.emoji)}</span> ${esc(name(l))}</b>
      <small>${esc(blurb(l))}</small>
      ${s === 'restyle' ? `<small class="land-hint">${tr('おなじ だんの べつの しま。◈ {n} で もようがえ できる。', { n: price })}</small>` : ''}
      <span class="land-price">${s === 'mine' || s === 'passed' ? '' : `◈ ${price}`}</span>
      ${action}`;
    for (const b of office.querySelectorAll('.land-card')) b.classList.toggle('selected', b.dataset.look === state.pick);
  }

  function renderBoard() {
    const b = state.board;
    if (!b || !data) return `<p class="land-note">${tr('よみこんで います…')}</p>`;
    return `<p class="land-lead">${tr('クラスの {n}人が しまを もっています。', { n: b.owners })}</p>
      <ul class="land-board">${b.rows.map((r) => {
        const l = looks.get(r.look) || null;
        return `<li class="${r.name === b.me.name ? 'me' : ''}"><span class="land-shot small">${l ? `<img data-shot="${esc(l.id)}" alt="" hidden>` : ''}<span class="land-emoji" translate="no">${l ? esc(l.emoji) : '🌊'}</span></span><b>${esc(r.name)}</b><span>${l ? `${esc(name(l))}<br><i>${tr('だい{n}だん', { n: l.tier })}</i>` : tr('まだ')}</span>${l ? `<button type="button" class="land-go" data-visit="${esc(r.name)}" ${state.busy ? 'disabled' : ''}>⛵ ${tr('いく')}</button>` : ''}</li>`;
      }).join('')}</ul>
      <p class="land-note">${tr('なまえの じゅん。しまは じまんの ために あるので、ならべかえは しない。')} ${tr('⛵ いく で、その 子の しまへ ふねで いける。')}</p>`;
  }

  dialog.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.look) { state.pick = b.dataset.look; state.confirm = false; renderPick(); show(state.pick); return; }
    if (b.dataset.ask) { state.confirm = true; renderPick(); return; }
    if (b.dataset.cancel) { state.confirm = false; renderPick(); return; }
    if (b.dataset.buy) { state.busy = true; renderPick(); send(b.dataset.kind === 'restyle' ? 'land:restyle' : 'land:buy', { look: b.dataset.buy }); }
    if (b.dataset.visit) { state.busy = true; render(); send('land:visit', { name: b.dataset.visit }); }
  });
  onLangChange(() => { if (dialog.open) render(); });

  // ---- the doorways -----------------------------------------------------------------
  function label(spot) {
    if (spot.kind === 'office') return tr('しまを かう');
    if (spot.kind === 'ferry') return tr('じぶんの しまへ');
    if (spot.kind === 'board') return tr('みんなの しまを 見る');
    return tr('{who} と 話す', { who: spot.character || '' });
  }

  function enter(spot) {
    if (!isOnline()) { toast(tr('土地島は オンラインで あそべます。クラスに 入ってね。')); return false; }
    if (spot.kind === 'ferry') { send('land:enter', {}); return true; }
    state.mode = spot.kind === 'board' ? 'board' : 'office';
    state.confirm = false; state.busy = false;
    if (!dialog.open) dialog.showModal();
    render();
    send(spot.kind === 'board' ? 'land:board' : 'land:open', {});
    return true;
  }

  // ---- the room's answers -------------------------------------------------------------
  function onState(m) { state.land = m; if (m.wallet) state.coins = m.wallet.coins; state.busy = false; render(); }
  function onBought(m) {
    state.land = m; if (m.wallet) state.coins = m.wallet.coins; state.busy = false; state.confirm = false;
    state.pick = m.look || state.pick;
    render();
    const isle = m.island || { name: '', en: '', emoji: '' };
    toast(m.restyled
      ? tr('{emoji} {name}に もようがえ した！', { emoji: isle.emoji || '', name: name(isle) })
      : tr('{emoji} {name}を かった！ ⛵ の いえから いこう。', { emoji: isle.emoji || '', name: name(isle) }));
  }
  function onBoard(m) { state.board = m; render(); }
  function onIsland(m) { state.busy = false; close(); world.enter(m); }
  function onError(m) {
    state.busy = false;
    const said = {
      'too far': tr('その たてものの いりぐちで やろう。'), 'not enough coins': tr('コインが たりない。'), 'biggest already': tr('もう いちばん おおきな しま！'),
      'no island': m?.name ? tr('{who} は まだ しまを もっていない。', { who: m.name }) : tr('まだ しまを もっていない。ふどうさんで かおう。'),
      'same look': tr('もう その しま だよ。'), 'no such look': tr('その しまは いま えらべない。'), 'no such child': tr('その 子は クラスに いない。'),
    }[m?.reason];
    if (said) toast(said);
    state.confirm = false;
    render();
  }

  return { state, dialog, label, enter, onState, onBought, onBoard, onIsland, onError, close, shots };
}
