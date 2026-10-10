// 持ち物（🎒）— たべもの・ふく・いえ・ブロック を カテゴリー（タブ）で。どの島からでも 開ける（右のバーの 🎒🍗）。
//
// 中身は 部屋が 持っている（bag:get → bag:state）。押したら いつもの 道で 頼むだけ：
//   たべもの → food:eat（おなかが ふえる） / ふく → wear:put（着る・ぬぐ） / いえ →「いえの しまに いどうしますか？」→ land:enter {from:'bag'}
// ブロックは 見るだけ（ひろば と BLOCKWILD で つかう）。
import { t as tr, isJa, onLangChange } from './i18n.js';
import { blockIcon } from './town-block-icon.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const TABS = [
  ['food', '🍎', 'Food', 'たべもの'],
  ['wear', '👕', 'Clothes', 'ふく'],
  ['house', '🏠', 'House', 'いえ'],
  ['blocks', '🧱', 'Blocks', 'ブロック'],
];

export function createBagUI({ send, toast, isOnline, food }) {
  const state = { tab: 'food', data: null, ask: false };
  const dialog = document.createElement('dialog');
  dialog.id = 'bag-dialog';
  dialog.innerHTML = `<div class="fd-head"><span class="fd-icon">🎒</span><div><small>INVENTORY</small><h2>${bi('Your bag', 'もちもの')}</h2></div>
      <button type="button" class="fd-x" aria-label="とじる" data-t-label="とじる">✕</button></div>
    <nav class="bag-tabs">${TABS.map(([id, ic, en, ja]) => `<button type="button" data-bag-tab="${id}">${ic} ${bi(en, ja)}<span class="bag-n" data-n="${id}"></span></button>`).join('')}</nav>
    <div id="bag-body"></div>`;
  document.body.append(dialog);
  const body = $('#bag-body', dialog);
  $('.fd-x', dialog).onclick = () => dialog.close();
  dialog.querySelectorAll('[data-bag-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.bagTab; state.ask = false; paint(); }; });

  function counts() {
    const d = state.data;
    return {
      food: food.state.bag.reduce((n, b) => n + b.n, 0),
      wear: d?.wear.items.length || 0,
      house: d?.land ? 1 : 0,
      blocks: d?.blocks.length || 0,
    };
  }

  function foodTab() {
    const bag = food.state.bag;
    const h = food.hunger;
    const full = h >= food.state.max - 0.01;
    const meter = `<div class="fd-meter"><span>🍗</span><i style="--p:${(h / food.state.max) * 100}%"></i><b>${Math.ceil(h)} / ${food.state.max}</b></div>`;
    if (!bag.length) return `${meter}<p class="fd-empty">${bi('No food yet. Buy some at the stalls on the Main Island.', 'たべものは まだ ないよ。メインの島の やたいで かえるよ。')}</p>`;
    return `${meter}<div class="fd-bag">${bag.map((b) => `<button type="button" class="fd-eat" data-eat="${esc(b.id)}" ${full ? 'disabled' : ''}><span class="fd-emoji">${b.icon}</span><span translate="no">${esc(b.en)}</span><small>×${b.n} · +${b.fill} 🍗</small></button>`).join('')}</div>
      <p class="fd-fine">${full ? bi('You are full!', 'おなか いっぱい！') : bi('Tap to eat.', 'おすと たべるよ。')}</p>`;
  }

  function wearTab() {
    const w = state.data?.wear;
    if (!w?.items.length) return `<p class="fd-empty">${bi('No clothes yet. Buy some at the Clothes Shop (Main Island) or the Dress-up Island.', 'ふくは まだ ないよ。メインの島の ふくや か きせかえ島で かえるよ。')}</p>`;
    return w.slots.map((sl) => {
      const items = w.items.filter((it) => it.slot === sl.id);
      if (!items.length) return '';
      return `<h3 class="fd-h3">${sl.icon} ${bi(esc(sl.en), esc(sl.ja))}</h3><div class="fd-bag">${items.map((it) => `<button type="button" class="fd-eat bag-wear${it.worn ? ' on' : ''}" data-wear="${esc(it.id)}" data-worn="${it.worn ? 1 : 0}">
        <span class="bag-swatch" style="--c:#${esc(it.colour || 'cccccc')}"></span><span>${bi(esc(it.en), esc(it.ja))}</span><small>${it.worn ? bi('✓ Wearing · tap to take off', '✓ きている・おすと ぬぐ') : bi('Tap to wear', 'おすと きる')}</small></button>`).join('')}</div>`;
    }).join('');
  }

  function houseTab() {
    const l = state.data?.land;
    if (!l) return `<p class="fd-empty">${bi('No house yet. Buy one at the House Shop on the Main Island (or the Land Island).', 'いえは まだ ないよ。メインの島の いえの おみせ（または 土地島）で かえるよ。')}</p>`;
    const card = `<button type="button" class="bag-house" data-house><span class="bag-house-emoji">${esc(l.emoji || '🏝')}</span><div>${bi(esc(l.en || l.name), esc(l.name))}<small>${bi(`Step ${l.tier}`, `${l.tier} だんめ`)}</small></div><b>⛵</b></button>`;
    if (!state.ask) return `${card}<p class="fd-fine">${bi('Tap to go to your island.', 'おすと じぶんの しまへ いけるよ。')}</p>`;
    return `${card}<div class="bag-ask"><p>${bi('Go to your island?', 'いえの しまに いどうしますか？')}</p>
      <div class="bag-ask-row"><button type="button" class="fd-buy" data-go>${bi('⛵ Yes, go', '⛵ はい、いく')}</button><button type="button" class="bag-no" data-no>${bi('No', 'いいえ')}</button></div></div>`;
  }

  function blocksTab() {
    const list = state.data?.blocks || [];
    if (!list.length) return `<p class="fd-empty">${bi('No blocks yet. Buy some at the Block Shop.', 'ブロックは まだ ないよ。ブロックやで かえるよ。')}</p>`;
    return `<div class="fd-bag">${list.map((b) => `<div class="fd-eat bag-block"><img src="${blockIcon(b.id, Number(b.color))}" alt="" draggable="false"><span translate="no">${esc(b.word)}</span><small>${esc(b.ja)}</small></div>`).join('')}</div>
      <p class="fd-fine">${bi('Use them on the plaza and in BLOCKWILD.', 'ひろば と BLOCKWILD で つかえるよ。')}</p>`;
  }

  function paint() {
    if (!dialog.open) return;
    const n = counts();
    dialog.querySelectorAll('[data-bag-tab]').forEach((b) => b.classList.toggle('active', b.dataset.bagTab === state.tab));
    dialog.querySelectorAll('[data-n]').forEach((el) => { el.textContent = n[el.dataset.n] ? String(n[el.dataset.n]) : ''; });
    body.innerHTML = state.tab === 'food' ? foodTab() : state.tab === 'wear' ? wearTab() : state.tab === 'house' ? houseTab() : blocksTab();
    body.querySelectorAll('[data-eat]').forEach((b) => { b.onclick = () => { b.disabled = true; send('food:eat', { id: b.dataset.eat }); }; });
    body.querySelectorAll('[data-wear]').forEach((b) => { b.onclick = () => { b.disabled = true; send('wear:put', { id: b.dataset.wear, off: b.dataset.worn === '1' }); }; });
    const house = $('[data-house]', body); if (house) house.onclick = () => { state.ask = true; paint(); };
    const go = $('[data-go]', body); if (go) go.onclick = () => { go.disabled = true; dialog.close(); send('land:enter', { from: 'bag' }); };
    const no = $('[data-no]', body); if (no) no.onclick = () => { state.ask = false; paint(); };
  }

  function open(tab = state.tab) {
    if (!isOnline()) { toast(tr('オンラインで あそべます。')); return; }
    state.tab = tab; state.ask = false;
    if (!dialog.open) dialog.showModal();
    paint();
    send('bag:get', {});
  }
  function onState(m) { state.data = m; if (m.food) food.apply(m.food); paint(); }
  // ふくを 着た・ぬいだ：ならびだけ 書きかえる（もう一度 たずねない）。
  function onWorn(m) {
    if (!state.data?.wear) return;
    const on = new Set(m.worn || []);
    for (const it of state.data.wear.items) it.worn = on.has(it.id);
    paint();
  }

  onLangChange(() => paint());
  return { open, onState, onWorn, refresh: paint, get isOpen() { return dialog.open; }, state };
}
