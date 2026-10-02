// ぼくじょう島の画面 — the farm, one building at a time, and the English each job costs.
//
// Walk into the seed shop and this is the shop; into the greenhouse and it is the field.
// Every button here is a request: "plant this", "water", "ship three eggs". The room
// answers with a question, this screen shows it, and the work happens only if the
// answer is right. Nothing on this page knows an answer, a price it did not read from
// farm.json, or whether a plot is ready — all of that arrives in `farm:state`.
import { t as tr, onLangChange, isJa } from './i18n.js';
import { loadFarmData } from './farm-island.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEASON = { spring: { ja: 'はる', en: 'Spring', emoji: '🌸' }, summer: { ja: 'なつ', en: 'Summer', emoji: '🌻' }, autumn: { ja: 'あき', en: 'Autumn', emoji: '🍁' }, winter: { ja: 'ふゆ', en: 'Winter', emoji: '⛄' } };
const STAGE = ['', '🌱', '🌿', '', '🥀'];

export function createFarmUI({ send, toast, isOnline, onFarm }) {
  const state = {
    spot: null,          // the building this screen is for
    farm: null,          // the last farm:state
    coins: 0,
    q: null,             // the question on the table
    picked: [],          // order: tokens chosen so far
    result: null,        // the last farm:result, while it is being shown
    board: null,
    pickingSeedFor: -1,  // house: the plot waiting for a seed
    shipQty: {},         // ship: item -> quantity chosen
  };
  let data = null;
  loadFarmData().then((d) => { data = d; if (dialog.open) render(); });
  const item = (id) => {
    if (!data) return null;
    return data.crops.find((c) => c.id === id) || data.products.find((p) => p.id === id) || data.recipes.find((r) => r.id === id) || data.animals.find((a) => a.id === id) || data.tools.find((x) => x.id === id) || null;
  };
  const spotDef = (id) => data?.island?.spots.find((s) => s.id === id) || null;

  const dialog = document.createElement('dialog');
  dialog.id = 'farm-dialog';
  dialog.innerHTML = `<header class="farm-head">
      <div><small id="farm-place">ぼくじょう島</small><h2 id="farm-title">ぼくじょう</h2></div>
      <div class="farm-meta"><span id="farm-season"></span><span class="farm-coins">◈ <b id="farm-coins">0</b></span><button type="button" id="farm-close" aria-label="とじる">×</button></div>
    </header>
    <div class="farm-body">
      <section class="farm-main" id="farm-main"></section>
      <aside class="farm-side">
        <div id="farm-q" class="farm-q" translate="no" hidden></div>
        <div id="farm-villager" class="farm-villager"></div>
        <div id="farm-bag" class="farm-bag"></div>
      </aside>
    </div>`;
  document.body.append(dialog);
  $('#farm-close', dialog).onclick = () => dialog.close();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); dialog.close(); });

  // ---- talking to the room ----------------------------------------------------------
  const act = (name, params = {}) => {
    if (!isOnline()) { toast(tr('ぼくじょうは オンラインで あそべます。クラスに 入ってね。')); return; }
    if (state.q) { toast(tr('まず いまの もんだいに こたえよう。')); return; }
    send('farm:act', { act: name, spot: state.spot, params });
  };
  const answer = (value) => {
    if (!state.q) return;
    send('farm:answer', { qid: state.q.id, answer: value });
    state.q = { ...state.q, sent: true };
    renderQuestion();
  };

  // ---- the screen ---------------------------------------------------------------------
  function render() {
    if (!dialog.open) return;
    const def = spotDef(state.spot);
    $('#farm-place', dialog).textContent = def ? `${def.tone} ${isJa() ? def.name : def.en}` : tr('ぼくじょう島');
    $('#farm-title', dialog).textContent = def ? (isJa() ? def.ja : TITLE_EN[def.kind] || def.en) : tr('ぼくじょう');
    $('#farm-coins', dialog).textContent = state.coins;
    const f = state.farm;
    const s = f ? SEASON[f.season] : null;
    $('#farm-season', dialog).innerHTML = s ? `<span translate="no">${s.emoji} ${esc(isJa() ? s.ja : s.en)}</span> · <span>${esc(tr('{n}にちめ', { n: (f.day % 1000) + 1 }))}</span>` : '';
    const main = $('#farm-main', dialog);
    if (!f || !data) { main.innerHTML = `<p class="farm-note">${tr('よみこんで います…')}</p>`; return; }
    switch (def?.kind) {
      case 'shop': main.innerHTML = renderShop(f); break;
      case 'field': main.innerHTML = renderField(f); break;
      case 'barn': main.innerHTML = renderBarn(f); break;
      case 'ship': main.innerHTML = renderShip(f); break;
      case 'kitchen': main.innerHTML = renderKitchen(f); break;
      default: main.innerHTML = '';
    }
    renderVillager(f, def);
    renderBag(f);
    renderQuestion();
  }
  const TITLE_EN = { shop: 'Buy seeds and animals', field: 'Tend the field', barn: 'Care for the animals', ship: 'Ship and earn', kitchen: 'Cook something' };
  const word = (it) => `<b class="farm-en" translate="no">${esc(it.emoji || '')} ${esc(it.en)}</b><i class="farm-ja" translate="no">${esc(it.ja)}</i>`;
  const lockNote = (it, who) => (it.locked ? `<small class="farm-lock">🔒 ${tr('{who}の ハート {n} から', { who, n: it.hearts })}</small>` : '');

  function renderShop(f) {
    const c = f.catalog;
    const hana = spotDef('seeds')?.character || 'Hana';
    const taro = spotDef('barn')?.character || 'Taro';
    return `<h3>${tr('たね（この きせつ）')}</h3><div class="farm-grid">${c.seeds.map((cr) => `
      <div class="farm-card ${cr.locked ? 'locked' : ''}">${word(cr)}<span class="farm-price">◈ ${cr.seed} <small>${tr('/ 1ふくろ')}</small></span>
        <small>${tr('{d}かいの みずやりで できる', { d: cr.days })}${cr.regrow ? ` · ${tr('また なる')}` : ''}</small>${lockNote(cr, hana)}
        <div class="farm-row">${[1, 3, 5].map((n) => `<button type="button" data-buy="${cr.id}" data-qty="${n}" ${cr.locked || state.coins < cr.seed * n ? 'disabled' : ''}>${n}</button>`).join('')}</div>
      </div>`).join('')}</div>
      <h3>${tr('どうぶつ')}</h3><div class="farm-grid">${c.animals.map((a) => `
      <div class="farm-card ${a.locked ? 'locked' : ''}">${word(a)}<span class="farm-price">◈ ${a.price}</span><small>${tr('まいにち {p} を くれる', { p: '' })}<span translate="no">${esc(item(a.product)?.emoji || '')} ${esc(item(a.product)?.en || a.product)}</span></small>${lockNote(a, taro)}
        <div class="farm-row"><input type="text" maxlength="12" placeholder="${tr('なまえ')}" data-name="${a.id}" class="farm-name"><button type="button" data-buy="${a.id}" data-qty="1" ${a.locked || a.full || state.coins < a.price ? 'disabled' : ''}>${a.full ? tr('小屋が いっぱい') : tr('かう')}</button></div>
      </div>`).join('')}</div>
      <h3>${tr('ジョウロ')}</h3><div class="farm-grid">${c.tools.map((tl) => `
      <div class="farm-card ${tl.locked ? 'locked' : ''} ${tl.owned ? 'owned' : ''}">${word(tl)}<span class="farm-price">◈ ${tl.price}</span><small>${tr('1もんで {n}マスに みずやり', { n: tl.can })}</small>${lockNote(tl, hana)}
        <div class="farm-row"><button type="button" data-tool="${tl.id}" ${tl.locked || tl.owned || state.coins < tl.price ? 'disabled' : ''}>${tl.owned ? tr('もっている') : tr('かう')}</button></div>
      </div>`).join('')}</div>`;
  }

  function renderField(f) {
    const dry = f.plots.filter((p) => p && !p.wilted && !p.watered && p.growth < p.days).length;
    const seeds = Object.entries(f.seeds);
    const cols = data.island.plots.cols;
    const grid = f.plots.map((p, i) => {
      if (!p) return `<button type="button" class="farm-plot empty ${state.pickingSeedFor === i ? 'picking' : ''}" data-plot="${i}"><span>＋</span><small>${tr('うえる')}</small></button>`;
      const it = item(p.crop);
      const stage = p.wilted ? 4 : p.ready ? 3 : p.growth >= Math.ceil(p.days / 2) ? 2 : 1;
      const face = stage === 3 ? it?.emoji : STAGE[stage];
      const label = p.wilted ? tr('かれた') : p.ready ? tr('とれる！') : `${p.growth}/${p.days}`;
      return `<button type="button" class="farm-plot s${stage} ${p.watered ? 'wet' : ''}" data-plot="${i}"><span translate="no">${esc(face)}</span><small>${label}</small>${p.watered && !p.ready ? '<em>💧</em>' : ''}</button>`;
    }).join('');
    return `<div class="farm-fieldbar">
        <button type="button" class="primary" id="farm-water" ${dry ? '' : 'disabled'}>💧 ${tr('みずを やる')} <small>${dry ? tr('{n}マス が かわいている', { n: dry }) : tr('きょうは ぜんぶ やった')}</small></button>
        <span class="farm-can">${tr('ジョウロ Lv{n}', { n: f.can })} · ${tr('1もんで {n}マス', { n: f.can })}</span>
      </div>
      <div class="farm-plots" style="grid-template-columns:repeat(${cols},1fr)">${grid}</div>
      ${state.pickingSeedFor >= 0 ? `<div class="farm-seedpick"><b>${tr('どの たねを うえる？')}</b>${seeds.length ? seeds.map(([id, n]) => { const it = item(id); return `<button type="button" data-plant="${id}">${word(it)}<span>×${n}</span></button>`; }).join('') : `<p>${tr('たねが ない。たねやで かおう。')}</p>`}<button type="button" data-plant="">${tr('やめる')}</button></div>` : ''}
      <p class="farm-note">${tr('1日に 1かい みずを やると そだつ。1日は そらが ひとまわり する あいだ。')}</p>`;
  }

  function renderBarn(f) {
    if (!f.animals.length) return `<p class="farm-note">${tr('まだ どうぶつが いない。たねやで ニワトリを かおう。')}</p>`;
    return `<div class="farm-grid">${f.animals.map((a) => {
      const it = item(a.kind); const prod = item(a.product);
      return `<div class="farm-card animal">${word({ ...it, en: a.name, ja: it.ja })}<span class="farm-hearts">${'❤'.repeat(Math.min(10, a.hearts))}${'♡'.repeat(Math.max(0, 5 - a.hearts))}</span>
        <div class="farm-row">
          <button type="button" data-animal="${a.i}" data-do="feed" ${a.fed ? 'disabled' : ''}>🌾 ${a.fed ? tr('たべた') : tr('エサ')}</button>
          <button type="button" data-animal="${a.i}" data-do="brush" ${a.brushed ? 'disabled' : ''}>🧹 ${a.brushed ? tr('ブラシ ずみ') : tr('ブラシ')}</button>
          <button type="button" data-animal="${a.i}" data-do="collect" ${a.got || !a.fed ? 'disabled' : ''}><span translate="no">${esc(prod?.emoji || '')}</span> ${a.got ? tr('もらった') : !a.fed ? tr('エサが さき') : tr('とる')}</button>
        </div></div>`;
    }).join('')}</div>
      <p class="farm-note">${tr('エサと ブラシを おなじ日に すると ハートが ふえる。ハートが ふえると、たまごや ぎゅうにゅうが たかく うれる。')}</p>`;
  }

  function renderShip(f) {
    const items = Object.entries(f.items);
    const b = state.board;
    return `<h3>${tr('しゅっかばこ')}</h3>${items.length ? `<div class="farm-grid">${items.map(([id, n]) => {
      const it = item(id); const q = Math.min(n, state.shipQty[id] || n);
      return `<div class="farm-card">${word(it)}<span class="farm-price">◈ ${it.sell ?? ''}${it.sell ? ` <small>${tr('/ 1こ')}</small>` : ''}</span>
        <div class="farm-row"><button type="button" data-qty-of="${id}" data-d="-1">−</button><b>${q}</b> / ${n}<button type="button" data-qty-of="${id}" data-d="1">＋</button><button type="button" class="primary" data-ship="${id}">📦 ${tr('しゅっか')}</button></div></div>`;
    }).join('')}</div>` : `<p class="farm-note">${tr('しゅっかする ものが ない。はたけや 小屋で とってこよう。')}</p>`}
      <h3>${tr('クラスの しゅうかくさい（こんしゅう）')}</h3>
      ${b ? `<div class="farm-board"><p>${tr('クラス ぜんいんで')} <b>◈ ${b.total}</b> · ${tr('{n}人が しゅっか', { n: b.farmers })}</p><ol>${b.top.map((r) => `<li><span>${esc(r.name)}</span><b>◈ ${r.coins}</b></li>`).join('')}</ol><p>${tr('あなた')}: <b>◈ ${b.me.coins}</b></p></div>` : `<p class="farm-note">${tr('よみこんで います…')}</p>`}
      <p class="farm-note">${tr('しゅっかで もらえる コインは 1日 {n} まで。', { n: data.dailyCoinCap })}</p>`;
  }

  function renderKitchen(f) {
    const mia = spotDef('kitchen')?.character || 'Mia';
    return `<div class="farm-grid">${f.catalog.recipes.map((r) => {
      const needs = Object.entries(r.needs);
      const ok = !r.locked && needs.every(([id, n]) => (f.items[id] || 0) >= n);
      return `<div class="farm-card ${r.locked ? 'locked' : ''}">${word(r)}<small>${needs.map(([id, n]) => { const it = item(id); const have = f.items[id] || 0; return `<span class="${have >= n ? 'has' : 'lacks'}" translate="no">${esc(it.emoji)} ${esc(it.en)} ${have}/${n}</span>`; }).join(' ')}</small>${lockNote(r, mia)}
        <div class="farm-row"><button type="button" data-cook="${r.id}" ${ok ? '' : 'disabled'}>🍳 ${tr('つくる')}</button></div></div>`;
    }).join('')}</div>
      <p class="farm-note">${tr('りょうりは ざいりょうの 2ばいで うれる。プレゼントにも なる。')}</p>`;
  }

  function renderVillager(f, def) {
    const box = $('#farm-villager', dialog);
    if (!def) { box.innerHTML = ''; return; }
    const hearts = f.hearts[def.id] || 0;
    const talked = !!f.talked[def.id];
    const gifted = !!f.gifted[def.id];
    const items = Object.entries(f.items);
    box.innerHTML = `<div class="farm-who"><b translate="no">${esc(def.character)}</b><span class="farm-hearts">${'❤'.repeat(Math.min(10, hearts))}${'♡'.repeat(Math.max(0, 3 - hearts))} ${hearts}</span></div>
      <div class="farm-row"><button type="button" id="farm-talk" ${talked ? 'disabled' : ''}>💬 ${talked ? tr('きょうは はなした') : tr('はなす')}</button>
      <select id="farm-gift-pick" ${gifted || !items.length ? 'disabled' : ''}>${items.map(([id, n]) => { const it = item(id); return `<option value="${id}">${esc(it.emoji)} ${esc(it.en)} ×${n}</option>`; }).join('') || `<option value="">${tr('あげる ものが ない')}</option>`}</select>
      <button type="button" id="farm-gift" ${gifted || !items.length ? 'disabled' : ''}>🎁 ${gifted ? tr('あげた') : tr('あげる')}</button></div>`;
  }

  function renderBag(f) {
    const seeds = Object.entries(f.seeds); const items = Object.entries(f.items);
    $('#farm-bag', dialog).innerHTML = `<h4>${tr('もちもの')}</h4><p>${[...seeds.map(([id, n]) => `<span translate="no">🌱${esc(item(id)?.en || id)} ×${n}</span>`), ...items.map(([id, n]) => `<span translate="no">${esc(item(id)?.emoji || '')}${esc(item(id)?.en || id)} ×${n}</span>`)].join(' ') || tr('なにも もっていない')}</p>
      <h4>${tr('つかった ことば')} <b>${f.dex.length}</b></h4><p class="farm-dex" translate="no">${f.dex.slice(-12).map(esc).join(' · ')}</p>`;
  }

  // ---- the question --------------------------------------------------------------------
  function renderQuestion() {
    const box = $('#farm-q', dialog);
    const q = state.q;
    const r = state.result;
    if (!q && !r) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    if (r) {
      box.innerHTML = `<div class="farm-verdict ${r.correct ? 'ok' : 'ng'}">${r.correct ? '○' : '×'}</div>
        <p class="farm-answer"><b>${esc(r.answer)}</b></p>
        ${r.effect ? `<p class="farm-effect">${esc(isJa() ? r.effect.ja : r.effect.en)}</p>` : `<p class="farm-effect">${esc(isJa() ? 'もう いちど やってみよう。' : 'Try again!')}</p>`}
        ${r.coins ? `<p class="farm-effect">+${r.coins} ◈${r.capped ? ` <small>${esc(isJa() ? 'きょうの 上限' : "today's limit")}</small>` : ''}</p>` : ''}${r.xp ? `<p class="farm-effect">+${r.xp} XP</p>` : ''}
        <button type="button" class="primary" id="farm-next">${esc(isJa() ? 'つぎへ' : 'Next')}</button>`;
      return;
    }
    const sent = q.sent ? 'disabled' : '';
    const prompt = `<p class="farm-prompt">${esc(q.prompt.en)}${q.prompt.ja ? `<small>${esc(q.prompt.ja)}</small>` : ''}</p>`;
    if (q.kind === 'order') {
      const left = q.tokens.map((tk, i) => ({ tk, i })).filter(({ i }) => !state.picked.includes(i));
      box.innerHTML = `${prompt}<div class="farm-sentence ${q.steps ? 'steps' : ''}">${state.picked.map((i) => `<button type="button" data-unpick="${i}" ${sent}>${esc(q.tokens[i])}</button>`).join('') || `<span class="farm-ghost">${esc(isJa() ? 'したの カードを じゅんばんに おしてね' : 'Tap the cards in order')}</span>`}</div>
        <div class="farm-tokens">${left.map(({ tk, i }) => `<button type="button" data-pick="${i}" ${sent}>${esc(tk)}</button>`).join('')}</div>
        <div class="farm-row"><button type="button" id="farm-order-clear" ${sent}>↺</button><button type="button" class="primary" id="farm-order-ok" ${sent || left.length ? 'disabled' : ''}>${esc(isJa() ? 'これで いい' : 'Done')}</button></div>`;
      return;
    }
    if (q.kind === 'spell') {
      box.innerHTML = `${prompt}<p class="farm-hint">${esc(q.hint || '')}</p><div class="farm-row"><input id="farm-spell" type="text" inputmode="latin" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="24" ${sent}><button type="button" class="primary" id="farm-spell-ok" ${sent}>${esc(isJa() ? 'かく' : 'Write')}</button></div>`;
      setTimeout(() => $('#farm-spell', dialog)?.focus(), 30);
      return;
    }
    box.innerHTML = `${prompt}<div class="farm-choices">${q.choices.map((c) => `<button type="button" data-choice="${esc(c)}" ${sent}>${esc(c)}</button>`).join('')}</div>`;
  }

  // ---- clicks ----------------------------------------------------------------------------
  dialog.addEventListener('click', (e) => {
    const b = e.target.closest('button, [data-plot]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.buy !== undefined) { const name = $(`input[data-name="${d.buy}"]`, dialog)?.value || ''; act('buy', { item: d.buy, qty: Number(d.qty) || 1, name }); return; }
    if (d.tool !== undefined) { act('tool', { item: d.tool }); return; }
    if (b.id === 'farm-water') { act('water'); return; }
    if (d.plot !== undefined) {
      const i = Number(d.plot); const p = state.farm?.plots[i];
      if (!p) { state.pickingSeedFor = state.pickingSeedFor === i ? -1 : i; render(); return; }
      if (p.wilted) { act('clear', { plot: i }); return; }
      if (p.ready) { act('harvest', { plot: i }); return; }
      if (!p.watered) { act('water'); return; }
      toast(tr('きょうは みずを やった。あしたまで まとう。'));
      return;
    }
    if (d.plant !== undefined) { const i = state.pickingSeedFor; state.pickingSeedFor = -1; if (d.plant) act('plant', { plot: i, crop: d.plant }); else render(); return; }
    if (d.animal !== undefined) { act(d.do, { animal: Number(d.animal) }); return; }
    if (d.qtyOf !== undefined) { const n = state.farm.items[d.qtyOf] || 1; const cur = Math.min(n, state.shipQty[d.qtyOf] || n); state.shipQty[d.qtyOf] = Math.max(1, Math.min(n, cur + Number(d.d))); render(); return; }
    if (d.ship !== undefined) { const n = state.farm.items[d.ship] || 1; act('ship', { item: d.ship, qty: Math.min(n, state.shipQty[d.ship] || n) }); return; }
    if (d.cook !== undefined) { act('cook', { recipe: d.cook }); return; }
    if (b.id === 'farm-talk') { act('talk'); return; }
    if (b.id === 'farm-gift') { const it = $('#farm-gift-pick', dialog)?.value; if (it) act('gift', { item: it }); return; }
    // the question
    if (d.choice !== undefined) { answer(d.choice); return; }
    if (d.pick !== undefined) { state.picked.push(Number(d.pick)); renderQuestion(); return; }
    if (d.unpick !== undefined) { state.picked = state.picked.filter((i) => i !== Number(d.unpick)); renderQuestion(); return; }
    if (b.id === 'farm-order-clear') { state.picked = []; renderQuestion(); return; }
    if (b.id === 'farm-order-ok') { answer(state.picked.map((i) => state.q.tokens[i])); return; }
    if (b.id === 'farm-spell-ok') { const v = $('#farm-spell', dialog)?.value.trim(); if (v) answer(v); return; }
    if (b.id === 'farm-next') { state.result = null; render(); }
  });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'farm-spell') { e.preventDefault(); $('#farm-spell-ok', dialog)?.click(); }
    e.stopPropagation();
  });
  onLangChange(() => { if (dialog.open) render(); });

  // ---- messages from the room ----------------------------------------------------------
  function onState(m) {
    state.farm = m.farm;
    if (m.wallet) state.coins = m.wallet.coins;
    if (m.farm?.pending && !state.q) { state.q = m.farm.pending; state.picked = []; }
    onFarm?.(m.farm);
    if (m.spot && dialog.open && m.spot === state.spot) render();
    else if (dialog.open) render();
  }
  function onAsk(q) { state.q = q; state.picked = []; state.result = null; renderQuestion(); }
  function onResult(m) {
    state.q = null; state.picked = [];
    state.result = m;
    if (m.farm) { state.farm = m.farm; onFarm?.(m.farm); }
    if (m.wallet) state.coins = m.wallet.coins;
    if (dialog.open) render();
    if (state.spot === 'ship' && m.correct && m.act === 'ship') send('farm:board', {});
  }
  function onError(m) {
    const why = {
      'too far': tr('その たてものの なかで やろう。'), 'not enough coins': tr('コインが たりない。'), locked: tr('まだ ハートが たりない。はなして ふやそう。'),
      'out of season': tr('いまの きせつでは そだたない。'), 'nothing to water': tr('みずを やる はたけが ない。'), 'already fed': tr('きょうは もう たべた。'),
      'already brushed': tr('きょうは もう ブラシを した。'), 'already collected': tr('きょうは もう もらった。'), hungry: tr('さきに エサを あげよう。'),
      'already talked': tr('きょうは もう はなした。'), 'already gifted': tr('きょうは もう あげた。'), 'barn full': tr('小屋が いっぱい。'), 'no seeds': tr('その たねが ない。'),
      'missing ingredients': tr('ざいりょうが たりない。'), 'too fast': tr('ちょっと まってね。'), 'no question': tr('もんだいが きえた。もういちど。'),
    };
    state.q = null;
    renderQuestion();
    toast(why[m.reason] || tr('できなかった: {why}', { why: m.reason }));
  }
  function onBoard(m) { state.board = m; if (dialog.open && state.spot === 'ship') render(); }

  return {
    state, dialog,
    open(spotId) {
      if (!isOnline()) { toast(tr('ぼくじょうは オンラインで あそべます。クラスに 入ってね。')); return; }
      state.spot = spotId; state.result = null; state.pickingSeedFor = -1; state.board = null;
      if (!dialog.open) dialog.showModal();
      render();
      send('farm:open', { spot: spotId });
      if (spotId === 'ship') send('farm:board', {});
    },
    label(spot) {
      const k = { shop: tr('たねを かう'), field: tr('はたけを せわする'), barn: tr('どうぶつの せわ'), ship: tr('しゅっかする'), kitchen: tr('りょうりを つくる') };
      return k[spot?.kind] || tr('{who} と 話す', { who: spot?.character || '' });
    },
    onState, onAsk, onResult, onError, onBoard,
  };
}
