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
import { createAnimalStage } from './farm-preview.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEASON = { spring: { ja: 'はる', en: 'Spring', emoji: '🌸' }, summer: { ja: 'なつ', en: 'Summer', emoji: '🌻' }, autumn: { ja: 'あき', en: 'Autumn', emoji: '🍁' }, winter: { ja: 'ふゆ', en: 'Winter', emoji: '⛄' } };
const STAGE = ['', '🌱', '🌿', '', '🥀'];
const LEVEL = { new: { ja: 'しりあい', en: 'New friend' }, friend: { ja: 'ともだち', en: 'Friend' }, close: { ja: 'なかよし', en: 'Good friend' }, best: { ja: 'しんゆう', en: 'Best friend' } };

// What to do next, worked out from the farm the room sent. The first thing that is
// possible and useful wins, in the order a farmer would do them in the morning.
export function nextStep(f) {
  if (!f) return null;
  const plots = f.plots || [];
  const step = (spot, ja, en) => ({ spot, ja, en });
  // 2026-10: the field and the pen are walked onto — the light stands there, not over a door.
  if (plots.some((p) => p && p.ready)) return step('field', 'とれる やさいが あるよ！ はたけで マスの 上に たって E 🧺', 'Something is ready! Stand on the plot and press E 🧺');
  if (plots.some((p) => p && p.wilted)) return step('field', 'かれた マスの 上に たって かたづけよう 🥀', 'Stand on the dead plot and clear it 🥀');
  // A festival day, or a villager's birthday, comes before the chores: it will not wait.
  if (f.event && !f.event.joined) return step(f.event.host, `${f.event.emoji} ${f.event.ja}！ ${f.event.hostName}の ところへ いこう`, `${f.event.emoji} ${f.event.en}! Go and see ${f.event.hostName}`);
  const bday = Object.entries(f.villagers || {}).find(([, v]) => v.birthday?.today && !v.talked);
  if (bday) return step(bday[0], `🎂 きょうは ${bday[1].character}の たんじょうび！ はなしに いこう`, `🎂 It's ${bday[1].character}'s birthday! Go and say hello`);
  if (plots.some((p) => p && !p.wilted && !p.watered && p.growth < p.days)) return step('field', 'はたけの マスの 上に たって みずを やろう 💧', 'Stand on the plot and water it 💧');
  if (Object.keys(f.seeds || {}).length && plots.some((p) => !p)) return step('field', 'はたけの あいている マスに たって たねを うえよう 🌱', 'Stand on an empty plot and plant a seed 🌱');
  const animals = f.animals || [];
  if (animals.some((a) => !a.fed)) return step('pen', 'さくの 中に 入って どうぶつに エサを あげよう 🐄', 'Walk into the pen and feed your animals 🐄');
  // Rain fills every trough (the room marks them `wet`), so this step only shows on a dry day.
  if (animals.some((a) => !a.wet)) return step('pen', 'さくの 中で どうぶつに みずを あげよう 💧', 'In the pen, give your animals water 💧');
  if (animals.some((a) => a.fed && a.wet && !a.got)) return step('pen', 'さくの 中で たまごや ぎゅうにゅうを もらおう 🥚', 'In the pen, collect eggs and milk 🥚');
  if (Object.keys(f.items || {}).length) return step('ship', 'しゅっか小屋で うって コインに しよう 📦', 'Ship your things for coins 📦');
  if (!plots.some((p) => p)) return step('seeds', 'たねやで たねを かおう 🌱', 'Buy seeds at the Seed Shop 🌱');
  if (f.weather === 'rain') return step('', 'きょうは あめ。みずやりは おやすみ！ そらが ひとまわり すると あしたに なるよ。', 'Rain today, so no watering! Tomorrow comes when the sky turns.');
  const talk = Object.entries(f.villagers || {}).find(([, v]) => !v.talked);
  if (talk) return step(talk[0], `${talk[1].character}に はなしかけよう。ハートが ふえるよ 💬`, `Say hello to ${talk[1].character} for a heart 💬`);
  return step('', 'きょうの しごとは おわり！ そらが ひとまわり すると あしたに なるよ。', "All done today! Tomorrow comes when the sky turns.");
}

// The two places that are not buildings. They are opened by standing there (E), and the
// card that opens is small: one plot, or the animals, and the question.
const PLACES = {
  field: { id: 'field', kind: 'plot', tone: '🌱', name: 'わたしの はたけ', ja: 'はたけで', en: 'My Field', character: '' },
  pen: { id: 'pen', kind: 'pen', tone: '🐄', name: 'どうぶつの さく', ja: 'さくの なかで', en: 'The Pen', character: '' },
};

// How each building is used, in three steps a child can follow without reading English.
const HOWTO = {
  shop: [['🔢', 'かずを えらぶ', 'Pick how many'], ['🃏', 'カードを じゅんばんに おす', 'Tap the cards in order'], ['🛒', 'かえた！', 'Bought!']],
  field: [['🟫', 'あいている マスを おす → たねを えらぶ', 'Tap an empty plot → pick a seed'], ['💧', '「みずを やる」を おす', 'Tap "Water"'], ['🧺', 'できたら マスを おして とる', 'Tap a ripe plot to pick it']],
  barn: [['🛒', 'ここで どうぶつを かう', 'Buy an animal here'], ['🌾💧', 'まいにち エサと みず', 'Feed and water every day'], ['🥚', 'そのあと とる', 'Then collect']],
  ship: [['📦', 'うる ものを えらぶ', 'Pick what to ship'], ['🔤', 'もじを ならべて つづる', 'Spell it with the letters'], ['🪙', 'コインに なる！', 'Coins!']],
  kitchen: [['🍳', 'りょうりを えらぶ', 'Pick a dish'], ['🥚', 'なにが いるか えらぶ', 'Pick what goes in'], ['🎁', 'うる・あげる', 'Ship it or give it']],
  plot: [['🚶', 'マスの 上に たつ', 'Stand on a plot'], ['🅴', 'E か タップ', 'Press E or tap'], ['✅', 'こたえると そだつ！', 'Answer and it grows!']],
  pen: [['🚶', 'さくの 中に 入る', 'Walk into the pen'], ['🅴', 'E か タップ', 'Press E or tap'], ['▶', 'おおきい ボタンを おす', 'Tap the big button']],
};

export function createFarmUI({ send, toast, isOnline, onFarm, speak }) {
  const state = {
    spot: null, farm: null, coins: 0,
    q: null, picked: [], result: null, board: null,
    pickingSeedFor: -1, shipQty: {},
    plot: -1,           // the plot the child is standing on (the small card)
    auto: false,        // on opening a plot, do the obvious thing without a second tap
  };
  let data = null;
  loadFarmData().then((d) => { data = d; if (dialog.open) render(); });
  const item = (id) => {
    if (!data) return null;
    return data.crops.find((c) => c.id === id) || data.products.find((p) => p.id === id) || data.recipes.find((r) => r.id === id) || data.animals.find((a) => a.id === id) || data.tools.find((x) => x.id === id) || null;
  };
  const spotDef = (id) => data?.island?.spots.find((s) => s.id === id) || PLACES[id] || null;
  const mini = () => !!PLACES[state.spot];
  const stage = createAnimalStage();   // the 3D animals on the cards and in the paddock
  const say = (text) => { if (text && speak) speak(String(text).replace(/[^\x20-\x7E’]/g, ' ').replace(/___/g, 'blank').trim()); };

  const dialog = document.createElement('dialog');
  dialog.id = 'farm-dialog';
  dialog.innerHTML = `<header class="farm-head">
      <div><small id="farm-place">ぼくじょう島</small><h2 id="farm-title">ぼくじょう</h2></div>
      <div class="farm-meta"><span id="farm-season"></span><span class="farm-coins">◈ <b id="farm-coins">0</b></span><button type="button" id="farm-close" aria-label="とじる">×</button></div>
    </header>
    <div class="farm-next" id="farm-next-step"></div>
    <div class="farm-sky" id="farm-sky" hidden><span class="farm-calendar" id="farm-calendar" hidden></span><span class="farm-weather" id="farm-weather" hidden></span></div>
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
  dialog.addEventListener('close', () => stage.stop());

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
  const TITLE_EN = { shop: 'Buy seeds and animals', field: 'Tend the field', barn: 'Care for the animals', ship: 'Ship and earn', kitchen: 'Cook something', plot: 'On the plot', pen: 'With the animals' };
  function render() {
    if (!dialog.open) return;
    const def = spotDef(state.spot);
    dialog.classList.toggle('mini', mini());
    dialog.classList.toggle('pen', def?.kind === 'pen' || def?.kind === 'barn');
    $('#farm-place', dialog).textContent = def ? `${def.tone} ${isJa() ? def.name : def.en}` : tr('ぼくじょう島');
    $('#farm-title', dialog).textContent = def ? (isJa() ? def.ja : TITLE_EN[def.kind] || def.en) : tr('ぼくじょう');
    $('#farm-coins', dialog).textContent = state.coins;
    const f = state.farm;
    const s = f ? SEASON[f.season] : null;
    $('#farm-season', dialog).innerHTML = s ? `<span translate="no">${s.emoji} ${esc(isJa() ? s.ja : s.en)}${f.calendar ? ` ${f.calendar.seasonDay}/${f.calendar.seasonDays}` : ''}${f.weather ? ` · ${f.weather === 'rain' ? '🌧' : '☀'}` : ''}</span>` : '';
    renderNext(f, def);
    renderWeather(f);
    renderCalendar(f);
    $('#farm-sky', dialog).hidden = $('#farm-weather', dialog).hidden && $('#farm-calendar', dialog).hidden;
    $('#farm-howto', dialog).innerHTML = (HOWTO[def?.kind] || []).map(([icon, ja, en], i) => `<li><b>${i + 1}</b><span>${icon}</span>${esc(isJa() ? ja : en)}</li>`).join('');
    const main = $('#farm-main', dialog);
    if (!f || !data) { main.innerHTML = `<p class="farm-note">${tr('よみこんで います…')}</p>`; return; }
    switch (def?.kind) {
      case 'shop': main.innerHTML = renderShop(f); break;
      case 'field': main.innerHTML = renderField(f); break;
      case 'barn': main.innerHTML = renderBarn(f); break;
      case 'ship': main.innerHTML = renderShip(f); break;
      case 'kitchen': main.innerHTML = renderKitchen(f); break;
      case 'plot': main.innerHTML = renderPlot(f); break;
      case 'pen': main.innerHTML = renderBarn(f); break;
      default: main.innerHTML = '';
    }
    // The 3D animals: pictures on the cards, and the live paddock in the pen and the barn.
    const paddock = $('#farm-stage', main);
    if (paddock) stage.show(paddock, f.animals); else stage.stop();
    stage.fill(main);
    // Opened by standing on a plot: the plot says what to do, so do it. Only an empty plot
    // needs a choice (which seed), and that is the card.
    if (def?.kind === 'plot' && state.auto) {
      state.auto = false;
      const p = f.plots[state.plot];
      if (p && p.wilted) act('clear', { plot: state.plot });
      else if (p && p.ready) act('harvest', { plot: state.plot });
      else if (p && !p.watered && p.growth < p.days) act('water');
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

  // The sky today: rain does the watering (plots and troughs alike); a dry day asks for it,
  // and says how many dry days a plant survives and when the next rain comes.
  function renderWeather(f) {
    const box = $('#farm-weather', dialog);
    if (!f || !f.weather) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const rain = f.weather === 'rain';
    box.className = `farm-weather ${rain ? 'rain' : 'sun'}`;
    const soon = f.rainIn ? (f.rainIn === 1 ? tr('あしたは あめ。') : tr('つぎの あめは {n}日後。', { n: f.rainIn })) : '';
    box.innerHTML = rain
      ? `<b>🌧 ${tr('あめ')}</b><span>${tr('みずやりは いらない。あめが やってくれる')}</span>`
      : `<b>☀ ${tr('はれ')}</b><span>${tr('みずを やろう（{n}日 やらないと かれる）', { n: f.dryDays || 3 })} ${soon}</span>`;
  }

  // The calendar: the season and its day, when it turns, and the festival — today's at
  // whose house, or the next one and in how many days.
  function renderCalendar(f) {
    const box = $('#farm-calendar', dialog);
    const c = f?.calendar;
    if (!c) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const s = SEASON[c.season]; const nextS = SEASON[['spring', 'summer', 'autumn', 'winter'][(['spring', 'summer', 'autumn', 'winter'].indexOf(c.season) + 1) % 4]];
    const seasonTxt = `<b translate="no">${s.emoji} ${esc(isJa() ? s.ja : s.en)}</b><span>${tr('{n}日め / {d}日', { n: c.seasonDay, d: c.seasonDays })} · ${c.left === 1 ? tr('あしたから {s}', { s: isJa() ? nextS.ja : nextS.en }) : c.left === 2 ? tr('あさってから {s}', { s: isJa() ? nextS.ja : nextS.en }) : tr('あと {n}日で {s}', { n: c.left - 1, s: isJa() ? nextS.ja : nextS.en })}</span>`;
    let fest = '';
    if (f.event) {
      const e = f.event;
      fest = `<em class="on" translate="no">${e.emoji} ${esc(isJa() ? e.ja : e.en)}</em><span>${e.joined ? tr('さんか ずみ！ {w}の いえで {items} が たかく うれる', { w: e.hostName, items: e.wants.map((id) => item(id)?.emoji || '').join('') }) : tr('{w}の いえで やってるよ（あと {n}日）', { w: e.hostName, n: e.daysLeft })}</span>`;
    } else if (f.nextEvent) {
      const e = f.nextEvent;
      fest = `<em translate="no">${e.emoji} ${esc(isJa() ? e.ja : e.en)}</em><span>${tr('あと {n}日', { n: e.inDays })}</span>`;
    }
    box.className = `farm-calendar ${c.season} ${f.event ? 'fest' : ''}`;
    box.innerHTML = `${seasonTxt}${fest}`;
  }

  const word = (it) => `<b class="farm-en" translate="no">${esc(it.emoji || '')} ${esc(it.en)}</b><i class="farm-ja" translate="no">${esc(it.ja)}</i>`;
  const lockNote = (it, who) => (it.locked ? `<small class="farm-lock">🔒 ${tr('{who}の ハート {n} から', { who, n: it.hearts })}</small>` : '');

  function renderShop(f) {
    const c = f.catalog;
    const hana = spotDef('seeds')?.character || 'Hana';
    const taro = spotDef('barn')?.character || 'Taro';
    return `<h3>${tr('たね（この きせつ）')} <small>${tr('なんこ かう？ ボタンを おしてね')}</small></h3><div class="farm-grid">${c.seeds.map((cr) => `
      <div class="farm-card ${cr.locked ? 'locked' : ''}"><span class="farm-big" translate="no">${esc(cr.emoji)}</span>${word(cr)}<span class="farm-price">◈ ${cr.seed} <small>${tr('/ 1ふくろ')}</small></span>
        <small>${tr('{d}かいの みずやりで できる', { d: cr.days })}${cr.regrow ? ` · ${tr('また なる')}` : ''}</small>${f.calendar && cr.days > f.calendar.left ? `<small class="farm-late">⏳ ${tr('この きせつには まにあわないかも')}</small>` : ''}${lockNote(cr, hana)}
        <div class="farm-row farm-qty">${[1, 2, 3].map((n) => `<button type="button" data-buy="${cr.id}" data-qty="${n}" ${cr.locked || state.coins < cr.seed * n ? 'disabled' : ''}>🛒 ${n}</button>`).join('')}</div>
      </div>`).join('')}</div>
      <h3>${tr('どうぶつ')}</h3><div class="farm-grid">${c.animals.map((a) => `
      <div class="farm-card ${a.locked ? 'locked' : ''}"><span class="farm-look"><img class="farm-shot" data-shot="${esc(a.id)}:0" alt="" hidden><span class="farm-big" translate="no">${esc(a.emoji)}</span></span>${word(a)}<span class="farm-price">◈ ${a.price}</span><small>${tr('まいにち {p} を くれる', { p: '' })}<span translate="no">${esc(item(a.product)?.emoji || '')} ${esc(item(a.product)?.en || a.product)}</span></small>${lockNote(a, taro)}
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
      <p class="farm-note">${tr('1日に 1かい みずを やると そだつ。1日は そらが ひとまわり する あいだ。')} ${tr('あめの 日は あめが みずを やってくれる。{n}日 みずが ないと かれてしまう。', { n: f.dryDays || 3 })}</p>`;
  }

  // The barn and the pen: the paddock in 3D on top (always — an empty one says so), then
  // one card per animal with today's care as three steps and ONE big button that does
  // the next one, and the animals for sale, in 3D, right here (Taro sells them too).
  function renderBarn(f) {
    const rain = f.weather === 'rain';
    const limit = data.animalLimit || 4;
    const paddock = `<div class="farm-stage ${f.animals.length ? '' : 'empty'}" id="farm-stage"><small>${f.animals.length ? tr('ゆびで まわせる') : tr('まだ だれも いない')}</small></div>`;
    const cards = f.animals.map((a) => {
      const it = item(a.kind); const prod = item(a.product);
      const steps = [
        { do: 'feed', icon: '🌾', ja: 'エサ', en: 'Feed', done: a.fed, can: !a.fed, doneJa: 'たべた', doneEn: 'Fed' },
        { do: 'trough', icon: '💧', ja: 'みず', en: 'Water', done: a.wet, can: !a.wet, doneJa: rain ? 'あめで のんだ' : 'のんだ', doneEn: rain ? 'Rain did it' : 'Had a drink' },
        { do: 'collect', icon: prod?.emoji || '🎁', ja: 'とる', en: 'Collect', done: a.got, can: a.fed && a.wet && !a.got, doneJa: 'もらった', doneEn: 'Collected', waitJa: !a.fed ? 'エサが さき' : 'みずが さき', waitEn: !a.fed ? 'Feed first' : 'Water first' },
      ];
      const next = steps.find((st) => st.can);
      const chips = steps.map((st) => {
        const state = st.done ? 'done' : st === next ? 'now' : st.can ? 'can' : 'wait';
        const label = st.done ? (isJa() ? st.doneJa : st.doneEn) : st.can ? (isJa() ? st.ja : st.en) : (isJa() ? st.waitJa || st.ja : st.waitEn || st.en);
        return `<button type="button" class="farm-step ${state}" data-animal="${a.i}" data-do="${st.do}" ${st.can ? '' : 'disabled'}><i>${st.done ? '✓' : state === 'now' ? '▶' : state === 'wait' ? '⏳' : ''}</i><span translate="no">${esc(st.icon)}</span>${label}</button>`;
      }).join('<em class="farm-arrow">›</em>');
      const big = next
        ? `<button type="button" class="primary farm-bigdo" data-animal="${a.i}" data-do="${next.do}"><span translate="no">${esc(next.icon)}</span> ${next.do === 'feed' ? tr('エサを あげる') : next.do === 'trough' ? tr('みずを あげる') : tr('{p}を もらう', { p: isJa() ? prod?.ja || '' : prod?.en || '' })}</button>`
        : `<div class="farm-alldone">✅ ${tr('きょうの せわは おわり！')}</div>`;
      return `<div class="farm-card animal ${next ? '' : 'done'}">
        <div class="farm-animal-head"><span class="farm-look"><img class="farm-shot" data-shot="${esc(stage.key(a.kind, a.hearts))}" alt="" hidden><span class="farm-big" translate="no">${esc(it.emoji)}</span></span>
          <div><b class="farm-en" translate="no">${esc(a.name)}</b><small translate="no">${esc(isJa() ? it.ja : it.en)}</small><span class="farm-hearts">${'❤'.repeat(Math.min(10, a.hearts))}${'♡'.repeat(Math.max(0, 5 - a.hearts))}</span></div></div>
        <div class="farm-steps">${chips}</div>
        ${big}
        <div class="farm-row farm-acts"><button type="button" data-animal="${a.i}" data-do="brush" ${a.brushed ? 'disabled' : ''}>🧹 ${a.brushed ? tr('ブラシ ずみ') : tr('ブラシ（ハートが ふえる）')}</button></div>
      </div>`;
    }).join('');
    const taro = spotDef('barn')?.character || 'Taro';
    const shop = f.animals.length < limit ? `<h3>${f.animals.length ? tr('もっと かう') : tr('どうぶつを かおう')} <small>${tr('{n}ひきまで', { n: limit })}</small></h3><div class="farm-grid farm-buy">${f.catalog.animals.map((a) => `
      <div class="farm-card ${a.locked ? 'locked' : ''}"><span class="farm-look"><img class="farm-shot" data-shot="${esc(a.id)}:0" alt="" hidden><span class="farm-big" translate="no">${esc(a.emoji)}</span></span>${word(a)}<span class="farm-price">◈ ${a.price}</span><small>${tr('まいにち {p} を くれる', { p: '' })}<span translate="no">${esc(item(a.product)?.emoji || '')} ${esc(isJa() ? item(a.product)?.ja || '' : item(a.product)?.en || a.product)}</span></small>${lockNote(a, taro)}
        <div class="farm-row"><input type="text" maxlength="12" placeholder="${tr('なまえ')}" data-name="${a.id}" class="farm-name"><button type="button" class="primary" data-buy="${a.id}" data-qty="1" ${a.locked || a.full || state.coins < a.price ? 'disabled' : ''}>${a.full ? tr('小屋が いっぱい') : state.coins < a.price && !a.locked ? tr('コインが たりない') : `🛒 ${tr('かう')}`}</button></div>
      </div>`).join('')}</div>` : '';
    const note = f.animals.length
      ? `<p class="farm-note">${tr('エサと みずを あげると、たまごや ぎゅうにゅうが もらえる。あめの 日は みずは いらない。エサと ブラシを おなじ日に すると ハートが ふえる。ハートが ふえると、たまごや ぎゅうにゅうが たかく うれる。')}</p>`
      : `<p class="farm-note big">🐔 ${tr('どうぶつは そとの さくに すむよ。かうと、さくの 中に 3Dで あらわれる。')}</p>`;
    return `${paddock}${cards ? `<div class="farm-grid farm-animals">${cards}</div>` : ''}${shop}${note}`;
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

  // The one plot under the child's feet, big, with the one thing it wants.
  function renderPlot(f) {
    const i = state.plot; const p = f.plots[i];
    const seeds = Object.entries(f.seeds);
    if (!p) {
      return `<div class="farm-plotcard empty"><span class="farm-big" translate="no">🟫</span><b>${tr('あいている マス')}</b>
        <div class="farm-seedpick open"><b>${tr('どの たねを うえる？')}</b>${seeds.length ? seeds.map(([id, n]) => { const it = item(id); return `<button type="button" data-plant="${id}"><span class="farm-big" translate="no">${esc(it.emoji)}</span>${word(it)}<span>×${n}</span></button>`; }).join('') : `<p>${tr('たねが ない。たねやで かおう。')}</p>`}</div></div>`;
    }
    const it = item(p.crop);
    const stage = p.wilted ? 4 : p.ready ? 3 : p.growth >= Math.ceil(p.days / 2) ? 2 : 1;
    const face = stage === 3 ? it?.emoji : STAGE[stage];
    const says = p.wilted ? tr('かれて しまった。かたづけよう。') : p.ready ? tr('とれる！') : p.watered ? (f.weather === 'rain' ? tr('あめが みずを やってくれた。あしたまで まとう。') : tr('きょうは みずを やった。あしたまで まとう。')) : tr('みずが ほしい！');
    const bar = p.wilted || p.ready ? '' : `<i class="farm-grow"><i style="width:${Math.round((p.growth / p.days) * 100)}%"></i></i>`;
    const btn = p.wilted ? `<button type="button" class="primary" data-plot="${i}">🥀 ${tr('かたづける')}</button>`
      : p.ready ? `<button type="button" class="primary" data-plot="${i}">🧺 ${tr('とる')}</button>`
        : !p.watered ? `<button type="button" class="primary" id="farm-water">💧 ${tr('みずを やる')}</button>` : '';
    return `<div class="farm-plotcard s${stage} ${p.watered ? 'wet' : ''}"><span class="farm-big" translate="no">${esc(face)}</span>${word(it)}<small>${p.ready || p.wilted ? '' : `${p.growth}/${p.days}`}</small>${bar}<p>${says}</p><div class="farm-row">${btn}</div></div>`;
  }

  function renderVillager(f, def) {
    const box = $('#farm-villager', dialog);
    if (!def || !def.character) { box.innerHTML = ''; return; }
    const v = f.villagers?.[def.id] || {};
    const hearts = v.hearts ?? f.hearts[def.id] ?? 0;
    const talked = v.talked ?? !!f.talked[def.id];
    const gifted = v.gifted ?? !!f.gifted[def.id];
    const items = Object.entries(f.items);
    const lv = LEVEL[v.level] || LEVEL.new;
    const likes = (v.likes || []).map((id) => item(id)).filter(Boolean);
    const dislikes = (v.dislikes || []).map((id) => item(id)).filter(Boolean);
    const fest = v.festival ? f.event : null;
    const wants = fest ? new Set(fest.wants) : new Set();
    const bd = v.birthday;
    const bdTxt = bd ? (bd.today ? `<span class="farm-bday on">🎂 ${tr('きょうは たんじょうび！')}</span>` : `<span class="farm-bday" translate="no">🎂 ${esc(isJa() ? SEASON[bd.season].ja : SEASON[bd.season].en)} ${bd.day}${isJa() ? '日' : ''}</span>`) : '';
    const tag = (it, cls) => `<span class="${cls}" translate="no">${esc(it.emoji)}</span>`;
    box.innerHTML = `<div class="farm-who"><b translate="no">🧑‍🌾 ${esc(def.character)}</b><span class="farm-hearts">${'❤'.repeat(Math.min(10, hearts))}${'♡'.repeat(Math.max(0, 3 - hearts))} ${hearts}</span></div>
      <p class="farm-level"><b class="lv-${esc(v.level || 'new')}">${esc(isJa() ? lv.ja : lv.en)}</b> ${bdTxt}</p>
      <p class="farm-likes"><span>${tr('すき')}</span>${likes.map((it) => tag(it, 'like')).join('')} <span>${tr('きらい')}</span>${dislikes.map((it) => tag(it, 'dislike')).join('')}</p>
      ${fest ? `<div class="farm-fest"><b translate="no">${esc(fest.emoji)} ${esc(isJa() ? fest.ja : fest.en)}</b><span>${v.festival.joined ? tr('きょうは さんか した！ また らいねん') : tr('{w}の おまつりに さんか しよう（+{n} ◈、みんなの ハートも ふえる）', { w: def.character, n: fest.bonus })}</span><button type="button" id="farm-event" class="primary" ${v.festival.joined ? 'disabled' : ''}>🎉 ${v.festival.joined ? tr('さんか ずみ') : tr('さんか する')}</button></div>` : ''}
      <p class="farm-tip">${tr('まいにち はなすと ハートが ふえて、かえる ものが ふえるよ。すきな ものは ❤❤、きらいな ものは 💔。しばらく はなさないと ハートが へる。')}</p>
      <div class="farm-row"><button type="button" id="farm-talk" ${talked ? 'disabled' : ''}>${bd?.today && !talked ? '🎂' : '💬'} ${talked ? tr('きょうは はなした') : tr('はなす')}</button>
      <select id="farm-gift-pick" ${gifted || !items.length ? 'disabled' : ''}>${items.map(([id, n]) => { const it = item(id); const mark = wants.has(id) ? '🎉' : likes.includes(it) ? '❤' : dislikes.includes(it) ? '💔' : ''; return `<option value="${id}">${esc(it.emoji)} ${esc(it.en)} ×${n} ${mark}</option>`; }).join('') || `<option value="">${tr('あげる ものが ない')}</option>`}</select>
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
      toast(state.farm?.weather === 'rain' ? tr('あめが みずを やってくれた。あしたまで まとう。') : tr('きょうは みずを やった。あしたまで まとう。'));
      return;
    }
    if (d.plant !== undefined) { const i = mini() ? state.plot : state.pickingSeedFor; state.pickingSeedFor = -1; if (d.plant) act('plant', { plot: i, crop: d.plant }); else render(); return; }
    if (d.animal !== undefined) { act(d.do, { animal: Number(d.animal) }); return; }
    if (d.qtyOf !== undefined) { const n = state.farm.items[d.qtyOf] || 1; const cur = Math.min(n, state.shipQty[d.qtyOf] || n); state.shipQty[d.qtyOf] = Math.max(1, Math.min(n, cur + Number(d.d))); render(); return; }
    if (d.ship !== undefined) { const n = state.farm.items[d.ship] || 1; act('ship', { item: d.ship, qty: Math.min(n, state.shipQty[d.ship] || n) }); return; }
    if (d.cook !== undefined) { act('cook', { recipe: d.cook }); return; }
    if (b.id === 'farm-talk') { act('talk'); return; }
    if (b.id === 'farm-event') { act('event'); return; }
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
    // On the small card, OK is the end of the job: the dialog closes so the field itself
    // shows what happened (that is what the child came out here for).
    if (b.id === 'farm-next') { state.result = null; if (mini()) dialog.close(); else render(); }
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
      'too far': tr('その ばしょに たってから やろう。'), 'not enough coins': tr('コインが たりない。'), locked: tr('まだ ハートが たりない。はなして ふやそう。'),
      'out of season': tr('いまの きせつでは そだたない。'), 'nothing to water': tr('みずを やる はたけが ない。'), 'already fed': tr('きょうは もう たべた。'),
      'already brushed': tr('きょうは もう ブラシを した。'), 'already collected': tr('きょうは もう もらった。'), hungry: tr('さきに エサを あげよう。'),
      'no festival': tr('きょうは おまつりの 日じゃない。'), 'wrong house': tr('おまつりは べつの いえで やってるよ。'), 'already joined': tr('この おまつりには もう さんか した。'),
      thirsty: tr('さきに みずを あげよう。'), 'already watered': tr('きょうは もう みずを あげた。'), 'rain did it': tr('あめが ふった。きょうは みずは いらない。'),
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
      const k = { shop: tr('たねを かう'), field: tr('はたけを 見る'), barn: tr('どうぶつの せわ'), ship: tr('しゅっかする'), kitchen: tr('りょうりを つくる') };
      return k[spot?.kind] || tr('{who} と 話す', { who: spot?.character || '' });
    },
    // Standing on a plot (or in the pen): the card for that one place. What the plot wants
    // is done at once; an empty plot asks which seed.
    openAt(at) {
      if (!isOnline()) { toast(tr('ぼくじょうは オンラインで あそべます。クラスに 入ってね。')); return; }
      state.spot = at.kind === 'pen' ? 'pen' : 'field';
      state.plot = at.kind === 'plot' ? at.index : -1;
      state.auto = at.kind === 'plot';
      state.result = null; state.pickingSeedFor = -1; state.board = null;
      if (!dialog.open) dialog.showModal();
      render();
      send('farm:open', { spot: state.spot });
    },
    // The prompt over the child's head while standing there: what this plot wants.
    labelAt(at) {
      if (at.kind === 'pen') return tr('どうぶつの せわ');
      const p = state.farm?.plots?.[at.index];
      if (!p) return tr('たねを うえる');
      if (p.wilted) return tr('かたづける');
      if (p.ready) return tr('しゅうかく！');
      if (!p.watered && p.growth < p.days) return tr('みずを やる');
      return state.farm?.weather === 'rain' ? tr('あめで そだて中（あした）') : tr('そだて中（あした）');
    },
    onState, onAsk, onResult, onError, onBoard,
  };
}
