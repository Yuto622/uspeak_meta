// まちづくり島 — the block shop, the かぐ屋, the estate agent, and the building HUD.
//
// Two places to put something down, and the HUD serves whichever one a child is in:
// furniture in マイルーム, blocks on the ひろば. Prices, ownership, capacity and every
// piece placed are the server's. This module shows them and sends what a child asks for.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (c) => `#${Number(c).toString(16).padStart(6, '0')}`;

export function createTownUI({ send, toast, speak, isOnline, learn, room, plaza }) {
  const state = { shop: null, props: null, spot: null, roomInfo: null };

  const dialog = document.createElement('dialog');
  dialog.id = 'town-dialog';
  dialog.setAttribute('aria-labelledby', 'town-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">TOWN ISLAND</span><h2 id="town-title">まちづくり島</h2></div>
      <button type="button" id="town-close" aria-label="閉じる">×</button>
    </div><div id="town-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#town-body', dialog);
  const close = () => { try { dialog.close(); } catch { /* already closed */ } };
  $('#town-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  // The building HUD: what is in hand, what is left, and the things you can do with it.
  // It has to work with a thumb, so all of them are buttons.
  const hud = document.createElement('aside');
  hud.id = 'room-hud';
  hud.hidden = true;
  hud.innerHTML = `<div class="room-hud-top"><b id="room-hud-name"></b><small id="room-hud-count"></small></div>
    <div id="room-palette" class="room-palette"></div>`;
  // The things you do, where a thumb already is. Minecraft puts them on the right of the
  // screen and so do we, because that is the game these children have already learned.
  const acts = document.createElement('div');
  acts.id = 'room-acts';
  acts.hidden = true;
  acts.innerHTML = `<button type="button" id="room-place">おく<small>E</small></button>
    <button type="button" id="room-remove">ほる<small>Q</small></button>
    <button type="button" id="room-turn" hidden>むき<small>R</small></button>
    <button type="button" id="room-exit">そとへ</button>`;
  document.querySelector('main').append(acts);
  document.querySelector('main').append(hud);
  // Whichever place a child is standing in is the one the buttons work on. Only one of
  // the two is ever active: a room is not the plaza.
  const builder = () => (room.active ? room : plaza.active ? plaza : null);
  $('#room-place', acts).onclick = () => builder()?.placeHere();
  $('#room-remove', acts).onclick = () => builder()?.removeHere();
  $('#room-turn', acts).onclick = () => { room.rotate(); refreshHud(); };
  $('#room-exit', acts).onclick = () => builder()?.leave();

  // The door and the square are walked into, so they never ask a child to press anything.
  function label(spot) {
    if (spot.kind === 'shop') return '🧱 ブロックを かう';
    if (spot.kind === 'furniture') return '🛋 かぐを かう';
    if (spot.kind === 'agent') return '🏠 ひっこしの そうだん';
    if (spot.kind === 'plaza') return '🧱 ひろばで つくる';
    return '🚪 マイルームに はいる';
  }

  function enter(spot) {
    if (!isOnline()) { toast('まちづくり島は オンラインで あそべます。'); return; }
    state.spot = spot;
    if (spot.kind === 'door') { send('room:enter', {}); return; }
    if (spot.kind === 'plaza') { send('plaza:enter', {}); return; }
    render('よみこみ中…');
    if (!dialog.open) dialog.showModal();
    send(spot.kind === 'furniture' ? 'prop:list' : 'block:list', {});
  }

  function render(note = '') {
    if (state.spot?.kind === 'agent') { renderAgent(note); return; }
    if (state.spot?.kind === 'furniture') { renderProps(note); return; }
    if (!state.shop) { body().innerHTML = `<p class="daily-note">${esc(note)}</p>`; return; }
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      <p class="daily-note">かった ブロックは、ひろばで いつでも つかえます。</p>
      <div class="town-blocks">${state.shop.blocks.map((b) => `
        <button type="button" class="town-block ${b.owned ? 'owned' : ''}" data-block="${b.id}" ${b.owned ? 'disabled' : ''}>
          <span class="town-swatch" style="background:${hex(b.color)}"></span>
          <strong>${esc(b.word)}</strong><small>${esc(b.ja)}</small>
          <b>${b.owned ? 'もっている' : b.price === 0 ? 'むりょう' : `◈ ${b.price}`}</b>
        </button>`).join('')}</div>
      <div class="quiz-actions"><button type="button" class="primary" id="town-done">とじる</button></div>`;
    for (const b of body().querySelectorAll('[data-block]')) {
      b.onclick = () => { b.disabled = true; send('block:buy', { id: b.dataset.block }); };
    }
    $('#town-done', dialog).onclick = close;
  }

  function renderProps(note = '') {
    if (!state.props) { body().innerHTML = `<p class="daily-note">${esc(note)}</p>`; return; }
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      <p class="daily-note">かった かぐは、マイルームに いつでも おけます。</p>
      <div class="town-blocks">${state.props.furniture.map((f) => `
        <button type="button" class="town-block ${f.owned ? 'owned' : ''}" data-prop="${f.id}" ${f.owned ? 'disabled' : ''}>
          <span class="town-swatch" style="background:${hex(f.color)}"></span>
          <strong>${esc(f.word)}</strong><small>${esc(f.ja)}</small>
          <b>${f.owned ? 'もっている' : f.price === 0 ? 'むりょう' : `◈ ${f.price}`}</b>
        </button>`).join('')}</div>
      <div class="quiz-actions"><button type="button" class="primary" id="town-done">とじる</button></div>`;
    for (const b of body().querySelectorAll('[data-prop]')) {
      b.onclick = () => { b.disabled = true; send('prop:buy', { id: b.dataset.prop }); };
    }
    $('#town-done', dialog).onclick = close;
  }

  function renderAgent(note = '') {
    const info = state.roomInfo;
    const next = info?.next;
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      <p class="daily-note">いまの へや：<b>${esc(info?.name || '—')}</b>${info ? `（${info.grid} × ${info.grid}・かぐ ${info.cap} こまで）` : ''}</p>
      ${next
        ? `<div class="town-move">
            <div><strong>${esc(next.name)}</strong><small>${next.grid} × ${next.grid}・かぐ ${next.props} こまで</small></div>
            <div class="town-move-need"><span>◈ ${next.price}</span><small>Lv.${next.level} から</small></div>
            <button type="button" class="primary" id="town-move">ひっこす</button>
          </div><p class="daily-note">いま おいた かぐは、そのまま ひっこし先にも のこります。</p>`
        : '<p class="daily-note">いちばん おおきな へやに すんでいます。</p>'}
      <div class="quiz-actions"><button type="button" id="town-done">とじる</button></div>`;
    const move = $('#town-move', dialog);
    if (move) move.onclick = () => { move.disabled = true; send('room:move', {}); };
    $('#town-done', dialog).onclick = close;
  }

  // ---- what the server says ---------------------------------------------------------

  function onShop(m) {
    state.shop = m;
    if (dialog.open && state.spot?.kind === 'shop') render();
  }

  function onBought(m) {
    speak(m.word);
    learn(m.word, m.ja);
    onShop(m);
    render(`${m.word}（${m.ja}）の ブロックを かいました！`);
  }

  function onPropShop(m) {
    state.props = m;
    if (dialog.open && state.spot?.kind === 'furniture') renderProps();
  }

  function onPropBought(m) {
    speak(m.word);
    learn(m.word, m.ja);
    onPropShop(m);
    renderProps(`${m.word}（${m.ja}）を かいました！`);
  }

  // The catalogue whatever is being built from: furniture in the room, blocks on the
  // plaza. Before a shop list has arrived, the palette a builder is already holding is
  // the best colour source there is.
  const catalogueFor = (which) => (which === 'furniture'
    ? state.props?.furniture || [...(room.state.palette?.values?.() || [])]
    : state.shop?.blocks || [...(plaza.state.palette?.values?.() || [])]);

  function paletteHtml() {
    const active = builder();
    if (!active) return '';
    const owned = active.state.owned || [];
    const list = catalogueFor(active === room ? 'furniture' : 'blocks');
    return owned.map((id) => {
      const item = list.find((x) => x.id === id) || active.state.palette.get(id);
      const color = item ? hex(item.color) : '#999';
      const slot = owned.indexOf(id) + 1;
      return `<button type="button" data-hand="${id}" class="${active.hand === id ? 'on' : ''}" title="${esc(item?.word || id)}">
        <i>${slot <= 9 ? slot : ''}</i><span style="background:${color}"></span><small>${esc(item?.word || id)}</small></button>`;
    }).join('');
  }

  function refreshHud() {
    const active = builder();
    acts.hidden = !active;
    if (!active) { hud.hidden = true; return; }
    hud.hidden = false;
    $('#room-turn', acts).hidden = active !== room;
    $('#room-remove', acts).firstChild.nodeValue = active === room ? 'かたづけ' : 'ほる';
    $('#room-hud-name', hud).textContent = active.state.room?.name || '';
    $('#room-hud-count', hud).textContent = `${active.state.used} / ${active.state.cap}`;
    const palette = $('#room-palette', hud);
    palette.innerHTML = paletteHtml();
    for (const b of palette.querySelectorAll('[data-hand]')) {
      b.onclick = () => { active.setHand(b.dataset.hand); refreshHud(); };
    }
  }

  // The door was walked into: build the room and show the HUD.
  function onRoomState(m) {
    state.roomInfo = m;
    close();
    room.enter(m, catalogueFor('furniture'));
    refreshHud();
    toast(`${m.name}。かぐを えらんで「おく」。`);
  }

  // The square was walked into: the child's own lot, and the blocks they have bought.
  function onPlazaState(m) {
    close();
    plaza.enter(m, catalogueFor('blocks'));
    refreshHud();
    toast('ひろば。ブロックを えらんで「おく」。');
  }

  function onMoved(m) {
    state.roomInfo = m.room;
    render(`${m.room.name} に ひっこしました！`);
    if (room.active) { room.enter(m.room, catalogueFor('furniture')); refreshHud(); }
  }

  function said(m) {
    return {
      'too far': m.spot ? `${m.spot.name} まで あるいて いこう。` : 'もっと 近づいてね。',
      'already yours': 'もう もっています。',
      'not enough coins': `あと ◈ ${Math.max(0, (m.need || 0) - (m.coins || 0))} たりません。`,
      'level too low': `レベル ${m.need} から ひっこせます。`,
      'biggest already': 'いちばん おおきな へやに すんでいます。',
      'no such block': 'そのブロックは ありません。',
      'no such furniture': 'その かぐは ありません。',
    }[m.reason];
  }

  function onError(m) {
    const text = said(m);
    if (text) { toast(text); if (dialog.open) render(); return; }
    room.onError(m);
  }

  function onPlazaError(m) {
    const text = said(m);
    if (text) { toast(text); return; }
    plaza.onError(m);
  }

  return {
    state, enter, label, onShop, onBought, onPropShop, onPropBought, onRoomState, onPlazaState,
    onMoved, onError, onPlazaError, refreshHud,
    // Anything arriving or leaving changes the count in the HUD.
    onPlaced(m) { room.onPlaced(m); refreshHud(); },
    onRemoved(m) { room.onRemoved(m); refreshHud(); },
    onPlazaPlaced(m) { plaza.onPlaced(m); refreshHud(); },
    onPlazaRemoved(m) { plaza.onRemoved(m); refreshHud(); },
    hideHud() { hud.hidden = true; acts.hidden = true; },
    // Number keys pick what is in hand, exactly as they do in the game this borrows from.
    pickSlot(n) {
      const active = builder();
      const id = (active?.state.owned || [])[n - 1];
      if (id) { active.setHand(id); refreshHud(); }
    },
    turn() { if (room.active) { room.rotate(); refreshHud(); } },
    // The two shop lists double as the palettes' colours, so ask for them once on
    // arrival. Asked for on joining, before the mode has settled to online: the send is a
    // no-op while there is no room, and the answers are what colour the palettes.
    prime() { if (!state.shop) send('block:list', {}); if (!state.props) send('prop:list', {}); },
  };
}
