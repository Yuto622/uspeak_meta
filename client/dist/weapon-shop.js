// ぶきや（メインの島の 新しい お店）：形 10 しゅるい × 素材 10 だん＝100 本。
// 品の 定義は fishing-data.js の ITEMS（kind: 'weapon'）＝サーバーも 同じ ものを 読んで 値段を きめる。
// ここは ならべて えらぶ だけ：かう＝store.buy（オンラインは economy の op で 部屋が コインを とる）、もつ＝store.equip
// （手の 見た目は fishing.js の update が 毎コマ equipped を 見て かえる）。
// 3D は 島の renderer を 借りる（bag-preview.js。WebGL を ふやさない）：上に まわる 1 本、カードは 1 本 1 回だけ 焼いた 絵。
// 英語の 名前は 学習の 中身なので translate="no"（日本語は ひらがなで 小さく）。
import { ITEMS, ITEM_BY_ID } from './fishing-data.js';
import { WEAPON_STYLES, WEAPON_TIERS } from './weapons-data.js';
import { createBagPreview } from './bag-preview.js';
import { isJa, onLangChange } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const stars = (tier) => '★'.repeat(1 + Math.floor((tier ?? 0) / 2));
const hex = (n) => `#${Number(n || 0).toString(16).padStart(6, '0')}`;

export function createWeaponShop({ store, toast = () => {}, renderer = null, speak = null }) {
  const WEAPONS = ITEMS.filter((i) => i.kind === 'weapon').sort((a, b) => (WEAPON_STYLES.findIndex((s) => s.id === a.style) - WEAPON_STYLES.findIndex((s) => s.id === b.style)) || (a.tier - b.tier));
  const preview = renderer ? createBagPreview(renderer) : null;
  const state = { tab: 'all', pick: WEAPONS[0]?.id, baking: 0 };

  const dialog = document.createElement('dialog');
  dialog.id = 'weapon-dialog';
  dialog.innerHTML = `<div class="ws-head"><div><small>⚔️ WEAPON SHOP</small><h2>${bi('Weapon Shop', 'ぶきや')}</h2></div>
      <span class="ws-coins">◈ <b id="ws-coins">0</b></span><button type="button" class="ws-close" aria-label="とじる">✕</button></div>
    <div class="ws-body">
      <section class="ws-show">
        <canvas id="ws-canvas" width="360" height="360"></canvas>
        <div class="ws-pick" translate="no"></div>
        <div class="ws-acts"></div>
        <p class="ws-fine">${bi('Weapons are just for looks. They do not change fishing or English.', 'ぶきは みための もちもの。つりや えいごの むずかしさは かわらないよ。')}</p>
      </section>
      <section class="ws-list">
        <nav class="ws-tabs"></nav>
        <div class="ws-grid"></div>
      </section>
    </div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  $('.ws-close').onclick = () => close();
  dialog.addEventListener('close', () => preview?.stop());

  const owned = (id) => store.state.owned.includes(id);
  const worn = () => store.state.equipped?.weapon || null;
  const coins = () => store.state.coins || 0;
  const name = (w) => w.en || w.name;

  function renderTabs() {
    const tabs = [{ id: 'all', en: 'All', ja: 'ぜんぶ', icon: '✨' }, ...WEAPON_STYLES];
    $('.ws-tabs').innerHTML = tabs.map((t) => `<button type="button" data-tab="${t.id}" class="${state.tab === t.id ? 'on' : ''}"><span>${t.icon}</span>${bi(esc(t.en), esc(t.ja))}</button>`).join('');
    $('.ws-tabs').querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; render(); }; });
  }
  function card(w) {
    const st = WEAPON_STYLES.find((s) => s.id === w.style);
    const tag = worn() === w.id ? `<em class="ws-tag on">${bi('Holding', 'もってる')}</em>` : owned(w.id) ? `<em class="ws-tag">✓</em>` : '';
    return `<button type="button" class="ws-card${state.pick === w.id ? ' pick' : ''}${owned(w.id) ? ' own' : ''}" data-id="${esc(w.id)}" style="--c:${hex(w.color)}">
      ${tag}<span class="ws-img" data-shot="${esc(w.id)}"><i>${st?.icon || '🗡️'}</i></span>
      <b translate="no">${esc(name(w))}</b><small>${esc(w.ja || '')}</small>
      <span class="ws-stars">${stars(w.tier)}</span><span class="ws-price">${owned(w.id) ? bi('Owned', 'もってる') : `◈ ${w.price}`}</span></button>`;
  }
  function renderGrid() {
    const list = state.tab === 'all' ? WEAPONS : WEAPONS.filter((w) => w.style === state.tab);
    $('.ws-grid').innerHTML = list.map(card).join('');
    $('.ws-grid').querySelectorAll('.ws-card').forEach((b) => { b.onclick = () => pick(b.dataset.id); });
    bake();
  }
  // カードの 3D の 絵は 1 本 1 回だけ 焼く。1 こまに 2 本ずつ（いっぺんに 焼くと 固まる）。
  function bake() {
    if (!preview) return;
    const run = ++state.baking;
    const imgs = [...$('.ws-grid').querySelectorAll('.ws-img[data-shot]')];
    const step = () => {
      if (run !== state.baking || !dialog.open) return;
      for (let k = 0; k < 2 && imgs.length; k += 1) {
        const el = imgs.shift();
        const url = preview.shot(`weapon:${el.dataset.shot}`);
        if (url) el.innerHTML = `<img alt="" src="${url}">`;
        el.removeAttribute('data-shot');
      }
      if (imgs.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function renderPick() {
    const w = ITEM_BY_ID[state.pick];
    if (!w) return;
    const ti = WEAPON_TIERS[w.tier] || {};
    $('.ws-pick').innerHTML = `<h3>${esc(name(w))} <button type="button" class="ws-say" aria-label="よむ">🔊</button></h3>
      <p>${esc(w.ja || '')}</p><span class="ws-stars big">${stars(w.tier)}</span><span class="ws-mat" style="--c:${hex(w.color)}">${esc(ti.en || '')}</span>`;
    $('.ws-say').onclick = () => speak?.(name(w));
    const have = owned(w.id); const holding = worn() === w.id; const short = w.price - coins();
    const L = (en, ja) => (isJa() ? ja : en);
    $('.ws-acts').innerHTML = holding
      ? `<button type="button" class="ws-btn ghost" data-act="off">${L('Put away', 'しまう')}</button>`
      : have
        ? `<button type="button" class="ws-btn" data-act="hold">✋ ${L('Hold it', 'もつ')}</button>`
        : short > 0
          ? `<button type="button" class="ws-btn" disabled>${L(`${short} more coins`, `あと ◈ ${short}`)}</button>`
          : `<button type="button" class="ws-btn buy" data-act="buy">${L(`Buy ◈ ${w.price}`, `◈ ${w.price} で かう`)}</button>`;
    $('.ws-acts').querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => act(b.dataset.act); });
    $('#ws-coins').textContent = coins().toLocaleString();
    if (dialog.open && preview) preview.show($('#ws-canvas'), `weapon:${w.id}`);
  }
  function pick(id) {
    state.pick = id;
    speak?.(name(ITEM_BY_ID[id]));
    renderPick();
    $('.ws-grid').querySelectorAll('.ws-card').forEach((c) => c.classList.toggle('pick', c.dataset.id === id));
  }
  function act(kind) {
    const w = ITEM_BY_ID[state.pick];
    try {
      if (kind === 'buy') { store.buy(w.id); store.equip(w.id); toast(isJa() ? `${w.ja || name(w)} を かったよ！` : `You got the ${name(w)}!`); }
      if (kind === 'hold') { store.equip(w.id); toast(isJa() ? `${w.ja || name(w)} を もったよ` : `Holding the ${name(w)}`); }
      if (kind === 'off') { store.unequip('weapon'); toast(isJa() ? 'ぶきを しまったよ' : 'Put away'); }
    } catch (err) { toast(String(err?.message || err)); }
    render();
  }
  function render() { renderTabs(); renderGrid(); renderPick(); }
  function open() {
    if (worn()) state.pick = worn();
    if (!dialog.open) dialog.showModal();
    render();
  }
  function close() { if (dialog.open) dialog.close(); }
  onLangChange(() => { if (dialog.open) render(); });
  return { open, close, get isOpen() { return dialog.open; }, count: WEAPONS.length };
}
