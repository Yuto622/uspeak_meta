// じてんしゃや（メインの島の 西の はま・2026-11）。6 台。
// 品の 定義は bikes-data.js（fishing-data.js の ITEMS に kind: 'bike' で 入って いる）＝値段と 買う 判定は サーバー（economy の buy）。
// ここは ならべて えらぶ だけ：かう＝store.buy（部屋が コインを とる）、のる＝bike-ride.js の mount（部屋が もって いるか 見る）。
// 3D は 島の renderer を 借りる（bag-preview.js の `bike:<id>`。WebGL を ふやさない）：左に まわる 1 台、カードは 1 台 1 回だけ 焼いた 絵。
// 英語の 名前は 学習の 中身なので translate="no"（日本語は ひらがなで 小さく・lang.json には 入れない）。
import { BIKES, BIKE_BY_ID, RUN_PACE } from './bikes-data.js';
import { createBagPreview } from './bag-preview.js';
import { isJa, onLangChange } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const hex = (n) => `#${Number(n || 0).toString(16).padStart(6, '0')}`;
const WALK = 5;
const TOP = Math.max(...BIKES.map((b) => b.speed)) * RUN_PACE;

export function createBikeShop({ store, toast = () => {}, renderer = null, speak = null, ride = null }) {
  const preview = renderer ? createBagPreview(renderer) : null;
  const state = { pick: BIKES[0].id, baking: 0 };

  const dialog = document.createElement('dialog');
  dialog.id = 'bike-dialog';
  dialog.innerHTML = `<div class="bs-head"><div><small>🚲 BIKE SHOP</small><h2>${bi('Bike Shop', 'じてんしゃや')}</h2></div>
      <span class="bs-coins">◈ <b id="bs-coins">0</b></span><button type="button" class="bs-close" aria-label="とじる">✕</button></div>
    <div class="bs-body">
      <section class="bs-show">
        <canvas id="bs-canvas" width="360" height="360"></canvas>
        <div class="bs-pick" translate="no"></div>
        <div class="bs-speed"></div>
        <div class="bs-acts"></div>
        <p class="bs-fine">${bi('A bike is faster than running. Ride it outside on any island.', 'じてんしゃは はしるより はやいよ。どの しまでも そとで のれるよ。')}</p>
      </section>
      <section class="bs-list"><div class="bs-grid"></div></section>
    </div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  $('.bs-close').onclick = () => close();
  dialog.addEventListener('close', () => preview?.stop());

  const owned = (id) => store.state.owned.includes(id);
  const coins = () => store.state.coins || 0;
  const L = (en, ja) => (isJa() ? ja : en);
  const pace = (b) => b.speed * RUN_PACE;

  function card(b) {
    const riding = ride?.riding === b.id;
    const tag = riding ? `<em class="bs-tag on">${bi('Riding', 'のってる')}</em>` : owned(b.id) ? '<em class="bs-tag">✓</em>' : '';
    return `<button type="button" class="bs-card${state.pick === b.id ? ' pick' : ''}${owned(b.id) ? ' own' : ''}" data-id="${esc(b.id)}" style="--c:${hex(b.color)}">
      ${tag}<span class="bs-img" data-shot="${esc(b.id)}"><i>🚲</i></span>
      <b translate="no">${esc(b.en)}</b><small translate="no">${esc(b.ja)}</small>
      <span class="bs-bolt">⚡ ×${b.speed.toFixed(2).replace(/0$/, '')}</span><span class="bs-price">${owned(b.id) ? bi('Owned', 'もってる') : `◈ ${b.price}`}</span></button>`;
  }
  function renderGrid() {
    $('.bs-grid').innerHTML = BIKES.map(card).join('');
    $('.bs-grid').querySelectorAll('.bs-card').forEach((el) => { el.onclick = () => pick(el.dataset.id); });
    bake();
  }
  // カードの 3D の 絵は 1 台 1 回だけ 焼く。1 こまに 1 台ずつ。
  function bake() {
    if (!preview) return;
    const run = ++state.baking;
    const imgs = [...$('.bs-grid').querySelectorAll('.bs-img[data-shot]')];
    const stepBake = () => {
      if (run !== state.baking || !dialog.open) return;
      const el = imgs.shift();
      if (el) { const url = preview.shot(`bike:${el.dataset.shot}`); if (url) el.innerHTML = `<img alt="" src="${url}">`; el.removeAttribute('data-shot'); }
      if (imgs.length) requestAnimationFrame(stepBake);
    };
    requestAnimationFrame(stepBake);
  }
  function renderPick() {
    const b = BIKE_BY_ID[state.pick];
    if (!b) return;
    $('.bs-pick').innerHTML = `<h3>${esc(b.en)} <button type="button" class="bs-say" aria-label="よむ">🔊</button></h3><p>${esc(b.ja)}</p>`;
    $('.bs-say').onclick = () => speak?.(b.en);
    // はやさの くらべ：あるく・はしる・この じてんしゃ（いちばん 速い 金の じてんしゃを 100% に）。
    const row = (icon, en, ja, v, cls = '') => `<div class="bs-row ${cls}"><span class="bs-what">${icon} ${bi(en, ja)}</span><span class="bs-bar"><em style="width:${Math.round((v / TOP) * 100)}%"></em></span><b>${v % 1 ? v.toFixed(1) : v}</b></div>`;
    $('.bs-speed').innerHTML = row('🚶', 'Walk', 'あるく', WALK) + row('🏃', 'Run', 'はしる', RUN_PACE) + row('🚲', 'This bike', 'この じてんしゃ', pace(b), 'me');
    const have = owned(b.id); const riding = ride?.riding === b.id; const short = b.price - coins();
    $('.bs-acts').innerHTML = riding
      ? `<button type="button" class="bs-btn ghost" data-act="off">${L('Get off', 'おりる')}</button>`
      : have
        ? `<button type="button" class="bs-btn" data-act="ride">🚲 ${L('Ride', 'のる')}</button>`
        : short > 0
          ? `<button type="button" class="bs-btn" disabled>${L(`${short} more coins`, `あと ◈ ${short}`)}</button>`
          : `<button type="button" class="bs-btn buy" data-act="buy">${L(`Buy ◈ ${b.price}`, `◈ ${b.price} で かう`)}</button>`;
    $('.bs-acts').querySelectorAll('[data-act]').forEach((el) => { el.onclick = () => act(el.dataset.act); });
    $('#bs-coins').textContent = coins().toLocaleString();
    if (dialog.open && preview) preview.show($('#bs-canvas'), `bike:${b.id}`);
  }
  function pick(id) {
    state.pick = id;
    speak?.(BIKE_BY_ID[id].en);
    renderPick();
    $('.bs-grid').querySelectorAll('.bs-card').forEach((c) => c.classList.toggle('pick', c.dataset.id === id));
  }
  function act(kind) {
    const b = BIKE_BY_ID[state.pick];
    try {
      if (kind === 'buy') { store.buy(b.id); toast(isJa() ? `${b.ja} を かったよ！ もちものに 入ったよ` : `You got the ${b.en}! It is in your bag.`); }
      if (kind === 'ride') { close(); ride?.mount(b.id); return; }
      if (kind === 'off') ride?.dismount('shop');
    } catch (err) { toast(String(err?.message || err)); }
    render();
  }
  function render() { renderGrid(); renderPick(); }
  function open() {
    if (ride?.riding) state.pick = ride.riding;
    if (!dialog.open) dialog.showModal();
    render();
  }
  function close() { if (dialog.open) dialog.close(); }
  onLangChange(() => { if (dialog.open) render(); });
  return { open, close, refresh: () => { if (dialog.open) render(); }, get isOpen() { return dialog.open; }, count: BIKES.length };
}
