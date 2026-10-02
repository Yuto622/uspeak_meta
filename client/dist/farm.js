// ぼくじょう島の画面 — the farm, one building at a time, and the English each job costs.
//
// Built for a seven-year-old. Three things make it so:
//   * "つぎに やること" — a banner at the top of every building, and a beam of light over
//     the building to go to next on the island (`nextStep`). Nobody has to know what a
//     farm does in what order; the island says.
//   * Every question is a big picture, one short English line, its Japanese, and a 🔊.
//     Cards submit themselves when the last one is placed; letter tiles spell a word.
//   * Asking for something new simply replaces the question on the table. A child who
//     changes their mind is never stuck behind "answer the last one first".
// Nothing on this page knows an answer, a price it did not read from farm.json, or
// whether a plot is ready — all of that arrives in `farm:state`.
import { t as tr, onLangChange, isJa } from './i18n.js';
import { loadFarmData } from './farm-island.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEASON = { spring: { ja: 'はる', en: 'Spring', emoji: '🌸' }, summer: { ja: 'なつ', en: 'Summer', emoji: '🌻' }, autumn: { ja: 'あき', en: 'Autumn', emoji: '🍁' }, winter: { ja: 'ふゆ', en: 'Winter', emoji: '⛄' } };
const STAGE = ['', '🌱', '🌿', '', '🥀'];

// What to do next, worked out from the farm the room sent. The first thing that is
// possible and useful wins, in the order a farmer would do them in the morning.
export function nextStep(f) {
  if (!f) return null;
  const plots = f.plots || [];
  const step = (spot, ja, en) => ({ spot, ja, en });
  if (plots.some((p) => p && p.ready)) return step('house', 'とれる やさいが あるよ！ ビニールハウスへ 🌿', 'Something is ready! Go to the Greenhouse 🌿');
  if (plots.some((p) => p && p.wilted)) return step('house', 'かれた はたけを かたづけよう 🌿', 'Clear the dead plants 🌿');
  if (plots.some((p) => p && !p.wilted && !p.watered && p.growth < p.days)) return step('house', 'ビニールハウスで みずを やろう 💧', 'Water the field in the Greenhouse 💧');
  if (Object.keys(f.seeds || {}).length && plots.some((p) => !p)) return step('house', 'ビニールハウスで たねを うえよう 🌱', 'Plant your seeds in the Greenhouse 🌱');
  const animals = f.animals || [];
  if (animals.some((a) => !a.fed)) return step('barn', 'どうぶつに エサを あげよう 🐄', 'Feed your animals in the Barn 🐄');
  if (animals.some((a) => a.fed && !a.got)) return step('barn', 'たまごや ぎゅうにゅうを もらおう 🥚', 'Collect eggs and milk in the Barn 🥚');
  if (Object.keys(f.items || {}).length) return step('ship', 'しゅっか小屋で うって コインに しよう 📦', 'Ship your things for coins 📦');
  if (!plots.some((p) => p)) return step('seeds', 'たねやで たねを かおう 🌱', 'Buy seeds at the Seed Shop 🌱');
  return step('', 'きょうの しごとは おわり！ そらが ひとまわり すると あしたに なるよ。', "All done today! Tomorrow comes when the sky turns.");
}

// How each building is used, in three steps a child can follow without reading English.
const HOWTO = {
  shop: [['🔢', 'かずを えらぶ', 'Pick how many'], ['🃏', 'カードを じゅんばんに おす', 'Tap the cards in order'], ['🛒', 'かえた！', 'Bought!']],
  field: [['🟫', 'あいている マスを おす → たねを えらぶ', 'Tap an empty plot → pick a seed'], ['💧', '「みずを やる」を おす', 'Tap "Water"'], ['🧺', 'できたら マスを おして とる', 'Tap a ripe plot to pick it']],
  barn: [['🌾', 'エサ：なきごえを えらぶ', 'Feed: pick its sound'], ['🧹', 'ブラシ：どうぶつの なまえ', 'Brush: name the animal'], ['🥚', 'とる：もらえる ものの なまえ', 'Collect: name what it gives']],
  ship: [['📦', 'うる ものを えらぶ', 'Pick what to ship'], ['🔤', 'もじを ならべて つづる', 'Spell it with the letters'], ['🪙', 'コインに なる！', 'Coins!']],
  kitchen: [['🍳', 'りょうりを えらぶ', 'Pick a dish'], ['🥚', 'なにが いるか えらぶ', 'Pick what goes in'], ['🎁', 'うる・あげる', 'Ship it or give it']],
};

export function createFarmUI({ send, toast, isOnline, onFarm, speak }) {
  const state = {
    spot: null, farm: null, coins: 0,
    q: null, picked: [], result: null, board: null,
    pickingSeedFor: -1, shipQty: {},
  };
  let data = null;
  loadFarmData().then((d) => { data = d; if (dialog.open) render(); });
  const item = (id) => {
    if (!data) return null;
    return data.crops.find((c) => c.id === id) || data.products.find((p) => p.id === id) || data.recipes.find((r) => r.id === id) || data.animals.find((a) => a.id === id) || data.tools.find((x) => x.id === id) || null;
  };
  const spotDef = (id) => data?.island?.spots.find((s) => s.id === id) || null;
  const say = (text) => { if (text && speak) speak(String(text).replace(/[^\x20-\x7E’]/g, ' ').replace(/___/g, 'blank').trim()); };

  const dialog = document.createElement('dialog');
  dialog.id = 'farm-dialog';
  dialog.innerHTML = `<header class="farm-head">
      <div><small id="farm-place">ぼくじょう島</small><h2 id="farm-title">ぼくじょう</h2></div>
      <div class="farm-meta"><span id="farm-season"></span><span class="farm-coins">◈ <b id="farm-coins">0</b></span><button type="button" id="farm-close" aria-label="とじる">×</button></div>
    </header>
    <div class="farm-next" id="farm-next-step"></div>
    <ol class="farm-howto" id="farm-howto"></ol>
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
  // A new request replaces whatever question was on the table (the room does the same).
  const act = (name, params = {}) => {
    if (!isOnline()) { toast(tr('ぼくじょうは オンラインで あそべます。クラスに 入ってね。')); return; }
    state.q = null; state.picked = []; state.result = null;
    renderQuestion();
    send('farm:act', { act: name, spot: state.spot, params });
  };
  const answer = (value) => {
    if (!state.q || state.q.sent) return;
    send('farm:answer', { qid: state.q.id, answer: value });
    state.q = { ...state.q, sent: true };
    renderQuestion();
  };

  // ---- the screen ---------------------------------------------------------------------
  const TITLE_EN = { shop: 'Buy seeds and animals', field: 'Tend the field', barn: 'Care for the animals', ship: 'Ship and earn', kitchen: 'Cook something' };
  function render() {
    if (!dialog.open) return;
    const def = spotDef(state.spot);
    $('#farm-place', dialog).textContent = def ? `${def.tone} ${isJa() ? def.name : def.en}` : tr('ぼくじょう島');
    $('#farm-title', dialog).textContent = def ? (isJa() ? def.ja : TITLE_EN[def.kind] || def.en) : tr('ぼくじょう');
    $('#farm-coins', dialog).textContent = state.coins;
    const f = state.farm;
    const s = f ? SEASON[f.season] : null;
    $('#farm-season', dialog).innerHTML = s ? `<span translate="no">${s.emoji} ${esc(isJa() ? s.ja : s.en)}</span>` : '';
    renderNext(f, def);
    $('#farm-howto', dialog).innerHTML = (HOWTO[def?.kind] || []).map(([icon, ja, en], i) => `<li><b>${i + 1}</b><span>${icon}</span>${esc(isJa() ? ja : en)}</li>`).join('');
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

  function renderNext(f, def) {
    const box = $('#farm-next-step', dialog);
    const step = nextStep(f);
    if (!step) { box.innerHTML = ''; return; }
    const here = step.spot && step.spot === def?.id;
    const there = step.spot ? spotDef(step.spot) : null;
    box.className = `farm-next ${here ? 'here' : ''}`;
    box.innerHTML = `<b>${esc(isJa() ? 'つぎに やること' : 'Next')}</b><span>${esc(isJa() ? step.ja : step.en)}</span>${here ? `<em>${esc(isJa() ? 'ここで できる！' : 'Do it here!')}</em>` : there ? `<em>${esc(isJa() ? `${there.tone} ${there.name}へ（ひかりの はしら）` : `${there.tone} ${there.en} (follow the light)`)}</em>` : ''}`;
  }

  const word = (it) => `<b class="farm-en" translate="no">${esc(it.emoji || '')} ${esc(it.en)}</b><i class="farm-ja" translate="no">${esc(it.ja)}</i>`;
  const lockNote = (it, who) => (it.locked ? `<small class="farm-lock">🔒 ${tr('{who}の ハート {n} から', { who, n: it.hearts })}</small>` : '');

  function renderShop(f) {
    const c = f.catalog;
    const hana = spotDef('seeds')?.character || 'Hana';
    const taro = spotDef('barn')?.character || 'Taro';
    return `<h3>${tr('たね（この きせつ）')} <small>${tr('なんこ かう？ ボタンを おしてね')}</small></h3><div class="farm-grid">${c.seeds.map((cr) => `
      <div class="farm-card ${cr.locked ? 'locked' : ''}"><span class="farm-big" translate="no">${esc(cr.emoji)}</span>${word(cr)}<span class="farm-price">◈ ${cr.seed} <small>${tr('/ 1ふくろ')}</small></span>
        <small>${tr('{d}かいの みずやりで できる', { d: cr.days })}${cr.regrow ? ` · ${tr('また なる')}` : ''}</small>${lockNote(cr, hana)}
        <div class="farm-row farm-qty">${[1, 2, 3].map((n) => `<button type="button" data-buy="${cr.id}" data-qty="${n}" ${cr.locked || state.coins < cr.seed * n ? 'disabled' : ''}>🛒 ${n}</button>`).join('')}</div>
      </div>`).join('')}</div>
      <h3>${tr('どうぶつ')}</h3><div class="farm-grid">${c.animals.map((a) => `
      <div class="farm-card ${a.locked ? 'locked' : ''}"><span class="farm-big" translate="no">${esc(a.emoji)}</span>${word(a)}<span class="farm-price">◈ ${a.price}</span><small>${tr('まいにち {p} を くれる', { p: '' })}<span translate="no">${esc(item(a.product)?.emoji || '')} ${esc(item(a.product)?.en || a.product)}</span></small>${lockNote(a, taro)}
        <div class="farm-row"><input type="text" maxlength="12" placeholder="${tr('なまえ')}" data-name="${a.id}" class="farm-name"><button type="button" data-buy="${a.id}" data-qty="1" ${a.locked || a.full || state.coins < a.price ? 'disabled' : ''}>${a.full ? tr('小屋が いっぱい') : `🛒 ${tr('かう')}`}</button></div>
      </div>`).join('')}</div>
      <h3>${tr('ジョウロ')}</h3><div class="farm-grid">${c.tools.map((tl) => `
      <div class="farm-card ${tl.locked ? 'locked' : ''} ${tl.owned ? 'owned' : ''}"><span class="farm-big" translate="no">${esc(tl.emoji)}</span>${word(tl)}<span class="farm-price">◈ ${tl.price}</span><small>${tr('1もんで {n}マスに みずやり', { n: tl.can })}</small>${lockNote(tl, hana)}
        <div class="farm-row"><button type="button" data-tool="${tl.id}" ${tl.locked || tl.owned || state.coins < tl.price ? 'disabled' : ''}>${tl.owned ? tr('もっている') : `🛒 ${tr('かう')}`}</button></div>
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
      const bar = p.wilted || p.ready ? '' : `<i class="farm-grow"><i style="width:${Math.round((p.growth / p.days) * 100)}%"></i></i>`;
      return `<button type="button" class="farm-plot s${stage} ${p.watered ? 'wet' : ''} ${p.ready ? 'ready' : ''}" data-plot="${i}"><span translate="no">${esc(face)}</span><small>${label}</small>${bar}${p.watered && !p.ready ? '<em>💧</em>' : ''}</button>`;
    }).join('');
    return `<div class="farm-fieldbar">
        <button type="button" class="primary farm-water" id="farm-water" ${dry ? '' : 'disabled'}>💧 ${tr('みずを やる')} <small>${dry ? tr('{n}マス が かわいている', { n: dry }) : tr('きょうは ぜんぶ やった')}</small></button>
        <span class="farm-can">🚿 ${tr('1もんで {n}マス', { n: f.can })}</span>
      </div>
      <div class="farm-plots" style="grid-template-columns:repeat(${cols},1fr)">${grid}</div>
      ${state.pickingSeedFor >= 0 ? `<div class="farm-seedpick"><b>${tr('どの たねを うえる？')}</b>${seeds.length ? seeds.map(([id, n]) => { const it = item(id); return `<button type="button" data-plant="${id}"><span class="farm-big" translate="no">${esc(it.emoji)}</span>${word(it)}<span>×${n}</span></button>`; }).join('') : `<p>${tr('たねが ない。たねやで かおう。')}</p>`}<button type="button" data-plant="">${tr('やめる')}</button></div>` : ''}
      <p class="farm-note">${tr('1日に 1かい みずを やると そだつ。1日は そらが ひとまわり する あいだ。')}</p>`;
  }

  function renderBarn(f) {
    if (!f.animals.length) return `<p class="farm-note big">🐔 ${tr('まだ どうぶつが いない。たねやで ニワトリを かおう。')}</p>`;
    return `<div class="farm-grid">${f.animals.map((a) => {
      const it = item(a.kind); const prod = item(a.product);
      return `<div class="farm-card animal"><span class="farm-big" translate="no">${esc(it.emoji)}</span><b class="farm-en" translate="no">${esc(a.name)}</b><span class="farm-hearts">${'❤'.repeat(Math.min(10, a.hearts))}${'♡'.repeat(Math.max(0, 5 - a.hearts))}</span>
        <div class="farm-row farm-acts">
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
      return `<div class="farm-card"><span class="farm-big" translate="no">${esc(it.emoji)}</span>${word(it)}
        <div class="farm-row"><button type="button" data-qty-of="${id}" data-d="-1">−</button><b>${q}</b> / ${n}<button type="button" data-qty-of="${id}" data-d="1">＋</button></div>
        <button type="button" class="primary farm-shipbtn" data-ship="${id}">📦 ${tr('しゅっか')}</button></div>`;
    }).join('')}</div>` : `<p class="farm-note big">📦 ${tr('しゅっかする ものが ない。はたけや 小屋で とってこよう。')}</p>`}
      <h3>${tr('クラスの しゅうかくさい（こんしゅう）')}</h3>
      ${b ? `<div class="farm-board"><p>${tr('クラス ぜんいんで')} <b>◈ ${b.total}</b> · ${tr('{n}人が しゅっか', { n: b.farmers })}</p><ol>${b.top.map((r) => `<li><span>${esc(r.name)}</span><b>◈ ${r.coins}</b></li>`).join('')}</ol><p>${tr('あなた')}: <b>◈ ${b.me.coins}</b></p></div>` : `<p class="farm-note">${tr('よみこんで います…')}</p>`}
      <p class="farm-note">${tr('しゅっかで もらえる コインは 1日 {n} まで。', { n: data.dailyCoinCap })}</p>`;
  }

  function renderKitchen(f) {
    const mia = spotDef('kitchen')?.character || 'Mia';
    return `<div class="farm-grid">${f.catalog.recipes.map((r) => {
      const needs = Object.entries(r.needs);
      const ok = !r.locked && needs.every(([id, n]) => (f.items[id] || 0) >= n);
      return `<div class="farm-card ${r.locked ? 'locked' : ''}"><span class="farm-big" translate="no">${esc(r.emoji)}</span>${word(r)}<small>${needs.map(([id, n]) => { const it = item(id); const have = f.items[id] || 0; return `<span class="${have >= n ? 'has' : 'lacks'}" translate="no">${esc(it.emoji)} ${have}/${n}</span>`; }).join(' ')}</small>${lockNote(r, mia)}
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
    box.innerHTML = `<div class="farm-who"><b translate="no">🧑‍🌾 ${esc(def.character)}</b><span class="farm-hearts">${'❤'.repeat(Math.min(10, hearts))}${'♡'.repeat(Math.max(0, 3 - hearts))} ${hearts}</span></div>
      <p class="farm-tip">${tr('まいにち はなすと ハートが ふえて、かえる ものが ふえるよ。')}</p>
      <div class="farm-row"><button type="button" id="farm-talk" ${talked ? 'disabled' : ''}>💬 ${talked ? tr('きょうは はなした') : tr('はなす')}</button>
      <select id="farm-gift-pick" ${gifted || !items.length ? 'disabled' : ''}>${items.map(([id, n]) => { const it = item(id); return `<option value="${id}">${esc(it.emoji)} ${esc(it.en)} ×${n}</option>`; }).join('') || `<option value="">${tr('あげる ものが ない')}</option>`}</select>
      <button type="button" id="farm-gift" ${gifted || !items.length ? 'disabled' : ''}>🎁 ${gifted ? tr('あげた') : tr('あげる')}</button></div>`;
  }

  function renderBag(f) {
    const seeds = Object.entries(f.seeds); const items = Object.entries(f.items);
    $('#farm-bag', dialog).innerHTML = `<h4>${tr('もちもの')}</h4><p>${[...seeds.map(([id, n]) => `<span translate="no">🌱${esc(item(id)?.emoji || '')} ×${n}</span>`), ...items.map(([id, n]) => `<span translate="no">${esc(item(id)?.emoji || '')} ×${n}</span>`)].join(' ') || tr('なにも もっていない')}</p>
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
      box.innerHTML = `<div class="farm-verdict ${r.correct ? 'ok' : 'ng'}">${r.correct ? '⭕' : '❌'}</div>
        <p class="farm-answer"><b>${esc(r.answer)}</b> <button type="button" class="farm-say" data-say="${esc(r.answer)}" aria-label="きく">🔊</button></p>
        ${r.effect ? `<p class="farm-effect">${esc(isJa() ? r.effect.ja : r.effect.en)}</p>` : `<p class="farm-effect">${esc(isJa() ? 'こたえを みて、もう いちど やってみよう。' : 'Look at the answer and try again!')}</p>`}
        ${r.coins ? `<p class="farm-effect">+${r.coins} ◈${r.capped ? ` <small>${esc(isJa() ? 'きょうの 上限' : "today's limit")}</small>` : ''}</p>` : ''}${r.xp ? `<p class="farm-effect">+${r.xp} XP</p>` : ''}
        <button type="button" class="primary" id="farm-next">${esc(isJa() ? 'OK' : 'OK')}</button>`;
      return;
    }
    const sent = q.sent ? 'disabled' : '';
    const en = q.prompt.en || '';
    const head = `<div class="farm-pic">${esc(q.pic || '')}</div>
      <p class="farm-prompt">${en ? `${esc(en)} <button type="button" class="farm-say" data-say="${esc(en)}" aria-label="きく">🔊</button>` : ''}${q.prompt.ja ? `<small>${esc(q.prompt.ja)}</small>` : ''}</p>`;
    if (q.kind === 'order' || q.kind === 'letters') {
      const letters = q.kind === 'letters';
      const left = q.tokens.map((tk, i) => ({ tk, i })).filter(({ i }) => !state.picked.includes(i));
      box.innerHTML = `${head}<div class="farm-sentence ${letters ? 'letters' : ''}">${state.picked.map((i) => `<button type="button" data-unpick="${i}" ${sent}>${esc(q.tokens[i])}</button>`).join('') || `<span class="farm-ghost">${esc(isJa() ? (letters ? 'もじを じゅんばんに おしてね' : 'カードを じゅんばんに おしてね') : (letters ? 'Tap the letters in order' : 'Tap the cards in order'))}</span>`}</div>
        <div class="farm-tokens ${letters ? 'letters' : ''}">${left.map(({ tk, i }) => `<button type="button" data-pick="${i}" ${sent}>${esc(tk)}</button>`).join('')}</div>
        <div class="farm-row"><button type="button" id="farm-order-clear" ${sent || !state.picked.length ? 'disabled' : ''}>↺ ${esc(isJa() ? 'やりなおす' : 'Undo')}</button></div>`;
      return;
    }
    box.innerHTML = `${head}<div class="farm-choices">${q.choices.map((c) => `<button type="button" data-choice="${esc(c)}" ${sent}>${esc(c)}</button>`).join('')}</div>`;
  }

  // ---- clicks ----------------------------------------------------------------------------
  dialog.addEventListener('click', (e) => {
    const b = e.target.closest('button, [data-plot]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.say !== undefined) { say(d.say); return; }
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
    if (d.pick !== undefined) {
      state.picked.push(Number(d.pick));
      // The last card placed is the answer: no "done" button to find.
      if (state.picked.length === state.q.tokens.length) answer(state.picked.map((i) => state.q.tokens[i]));
      else renderQuestion();
      return;
    }
    if (d.unpick !== undefined) { state.picked = state.picked.filter((i) => i !== Number(d.unpick)); renderQuestion(); return; }
    if (b.id === 'farm-order-clear') { state.picked = []; renderQuestion(); return; }
    if (b.id === 'farm-next') { state.result = null; render(); }
  });
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  onLangChange(() => { if (dialog.open) render(); });

  // ---- messages from the room ----------------------------------------------------------
  function onState(m) {
    state.farm = m.farm;
    if (m.wallet) state.coins = m.wallet.coins;
    onFarm?.(m.farm);
    if (dialog.open) render();
  }
  function onAsk(q) {
    state.q = q; state.picked = []; state.result = null;
    renderQuestion();
    if (q.prompt?.en) say(q.prompt.en);
  }
  function onResult(m) {
    state.q = null; state.picked = [];
    state.result = m;
    if (m.farm) { state.farm = m.farm; onFarm?.(m.farm); }
    if (m.wallet) state.coins = m.wallet.coins;
    if (dialog.open) render();
    say(m.answer);
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
