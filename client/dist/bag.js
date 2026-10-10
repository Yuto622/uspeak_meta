// 持ち物（🎒）— たべもの・ふく・いえ・ブロック を カテゴリー（タブ）で。どの島からでも 開ける（右のバーの 🎒🍗）。
//
// 見た目は お店と 同じ：上に えらんだ物が まわる 3D の プレビュー、下に 3D の 絵の カード（bag-preview.js）。
// カードを おす ＝ えらぶ（プレビューに 出る）。プレビューの下の 大きい ボタンで つかう：
//   たべもの →「たべる」（food:eat） / ふく →「きる・ぬぐ」（wear:put） / いえ →「いえの しまに いどうしますか？」→ land:enter {from:'bag'}
// ブロックは 見るだけ（ひろば と BLOCKWILD で つかう）。中身は 部屋が 持っている（bag:get → bag:state）。
import { t as tr, onLangChange } from './i18n.js';
import { createBagPreview } from './bag-preview.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const TABS = [
  ['food', '🍎', 'Food', 'たべもの'],
  ['wear', '👕', 'Clothes', 'ふく'],
  ['house', '🏠', 'House', 'いえ'],
  ['blocks', '🧱', 'Blocks', 'ブロック'],
];
const STAGE = 240;

export function createBagUI({ send, toast, isOnline, food, renderer = null }) {
  const state = { tab: 'food', data: null, ask: false, pick: {} };
  const preview = createBagPreview(renderer);
  const dialog = document.createElement('dialog');
  dialog.id = 'bag-dialog';
  dialog.innerHTML = `<div class="fd-head"><span class="fd-icon">🎒</span><div><small>INVENTORY</small><h2>${bi('Your bag', 'もちもの')}</h2></div>
      <button type="button" class="fd-x" aria-label="とじる" data-t-label="とじる">✕</button></div>
    <nav class="bag-tabs">${TABS.map(([id, ic, en, ja]) => `<button type="button" data-bag-tab="${id}">${ic} ${bi(en, ja)}<span class="bag-n" data-n="${id}"></span></button>`).join('')}</nav>
    <div id="bag-body"></div>`;
  document.body.append(dialog);
  const body = $('#bag-body', dialog);
  $('.fd-x', dialog).onclick = () => dialog.close();
  dialog.addEventListener('close', () => preview.stop());
  dialog.querySelectorAll('[data-bag-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.bagTab; state.ask = false; paint(); }; });

  // ---- いまの タブの 物（カードの 並び）----
  function list(tab = state.tab) {
    const d = state.data;
    if (tab === 'food') return food.state.bag.map((b) => ({ key: `food:${b.id}`, id: b.id, en: b.en, ja: b.ja, note: [`×${b.n} · +${b.fill} 🍗`, `×${b.n} · +${b.fill} 🍗`], info: b, learn: true }));
    if (tab === 'wear') return (d?.wear.items || []).map((it) => ({ key: `wear:${it.id}`, id: it.id, en: it.en, ja: it.ja, note: it.worn ? ['✓ Wearing', '✓ きている'] : ['', ''], info: it, on: it.worn, group: it.slot }));
    if (tab === 'house') return d?.land ? [{ key: `house:${d.land.id}`, id: d.land.id, en: d.land.en || d.land.name, ja: d.land.name, note: [`Step ${d.land.tier}`, `${d.land.tier} だんめ`], info: d.land, emoji: d.land.emoji }] : [];
    return (d?.blocks || []).map((b) => ({ key: `block:${b.id}`, id: b.id, en: b.word, ja: b.ja, note: ['', ''], info: b, learn: true }));
  }
  const EMPTY = {
    food: ['No food yet. Buy some at the stalls on the Main Island.', 'たべものは まだ ないよ。メインの島の やたいで かえるよ。'],
    wear: ['No clothes yet. Buy some at the Clothes Shop (Main Island) or the Dress-up Island.', 'ふくは まだ ないよ。メインの島の ふくや か きせかえ島で かえるよ。'],
    house: ['No house yet. Buy one at the House Shop on the Main Island (or the Land Island).', 'いえは まだ ないよ。メインの島の いえの おみせ（または 土地島）で かえるよ。'],
    blocks: ['No blocks yet. Buy some at the Block Shop.', 'ブロックは まだ ないよ。ブロックやで かえるよ。'],
  };

  function counts() {
    return { food: food.state.bag.reduce((n, b) => n + b.n, 0), wear: state.data?.wear.items.length || 0, house: state.data?.land ? 1 : 0, blocks: state.data?.blocks.length || 0 };
  }

  // プレビューの 下の ボタン（その物で できること）。
  function action(it) {
    if (!it) return '';
    if (state.tab === 'food') {
      const full = food.hunger >= food.state.max - 0.01;
      return `<button type="button" class="fd-buy bag-act" data-act="eat" ${full ? 'disabled' : ''}>${full ? bi('You are full!', 'おなか いっぱい！') : bi('😋 Eat', '😋 たべる')}</button>`;
    }
    if (state.tab === 'wear') return `<button type="button" class="fd-buy bag-act${it.on ? ' off' : ''}" data-act="wear">${it.on ? bi('Take off', 'ぬぐ') : bi('👕 Wear', '👕 きる')}</button>`;
    if (state.tab === 'house') {
      if (!state.ask) return `<button type="button" class="fd-buy bag-act" data-act="ask">${bi('⛵ Go to my island', '⛵ じぶんの しまへ')}</button>`;
      return `<div class="bag-ask"><p>${bi('Go to your island?', 'いえの しまに いどうしますか？')}</p>
        <div class="bag-ask-row"><button type="button" class="fd-buy" data-go>${bi('⛵ Yes, go', '⛵ はい、いく')}</button><button type="button" class="bag-no" data-no>${bi('No', 'いいえ')}</button></div></div>`;
    }
    return `<p class="fd-fine">${bi('Use it on the plaza and in BLOCKWILD.', 'ひろば と BLOCKWILD で つかえるよ。')}</p>`;
  }

  function paint() {
    if (!dialog.open) return;
    const n = counts();
    dialog.querySelectorAll('[data-bag-tab]').forEach((b) => b.classList.toggle('active', b.dataset.bagTab === state.tab));
    dialog.querySelectorAll('[data-n]').forEach((el) => { el.textContent = n[el.dataset.n] ? String(n[el.dataset.n]) : ''; });
    const items = list();
    const meter = state.tab === 'food' ? `<div class="fd-meter"><span>🍗</span><i style="--p:${(food.hunger / food.state.max) * 100}%"></i><b>${Math.ceil(food.hunger)} / ${food.state.max}</b></div>` : '';
    if (!items.length) { preview.stop(); body.innerHTML = `${meter}<p class="fd-empty">${bi(...EMPTY[state.tab])}</p>`; return; }
    const pickKey = items.some((it) => it.key === state.pick[state.tab]) ? state.pick[state.tab] : items[0].key;
    state.pick[state.tab] = pickKey;
    const it = items.find((x) => x.key === pickKey);
    const card = (x) => {
      const url = preview.shot(x.key, x.info);
      return `<button type="button" class="bag-card${x.key === pickKey ? ' picked' : ''}${x.on ? ' on' : ''}" data-pick="${esc(x.key)}">
        <span class="bag-pic">${url ? `<img src="${url}" alt="" draggable="false">` : `<span class="bag-emoji">${esc(x.info?.icon || x.emoji || '🎁')}</span>`}</span>
        <span class="bag-name"${x.learn ? ' translate="no"' : ''}>${x.learn ? esc(x.en) : bi(esc(x.en), esc(x.ja))}</span>
        ${x.note[0] ? `<small>${bi(esc(x.note[0]), esc(x.note[1]))}</small>` : ''}</button>`;
    };
    let grid;
    if (state.tab === 'wear') {
      const slots = state.data?.wear.slots || [];
      grid = slots.map((sl) => { const xs = items.filter((x) => x.group === sl.id); return xs.length ? `<h3 class="fd-h3">${sl.icon} ${bi(esc(sl.en), esc(sl.ja))}</h3><div class="bag-grid">${xs.map(card).join('')}</div>` : ''; }).join('');
    } else grid = `<div class="bag-grid">${items.map(card).join('')}</div>`;
    body.innerHTML = `${meter}<div class="bag-stage-row"><canvas class="bag-stage" width="${STAGE}" height="${STAGE}" aria-hidden="true"></canvas>
        <div class="bag-stage-info"><h3${it.learn ? ' translate="no"' : ''}>${it.learn ? esc(it.en) : bi(esc(it.en), esc(it.ja))}</h3>${it.learn ? `<p class="bag-ja" translate="no">${esc(it.ja)}</p>` : ''}
        ${it.note[0] ? `<p class="fd-fine">${bi(esc(it.note[0]), esc(it.note[1]))}</p>` : ''}${action(it)}</div></div>${grid}`;
    if (!preview.show($('.bag-stage', body), it.key, it.info)) $('.bag-stage', body).classList.add('none');
    body.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { state.pick[state.tab] = b.dataset.pick; state.ask = false; paint(); }; });
    const act = $('[data-act]', body);
    if (act) act.onclick = () => {
      if (act.dataset.act === 'eat') { act.disabled = true; send('food:eat', { id: it.id }); }
      if (act.dataset.act === 'wear') { act.disabled = true; send('wear:put', { id: it.id, off: !!it.on }); }
      if (act.dataset.act === 'ask') { state.ask = true; paint(); }
    };
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
