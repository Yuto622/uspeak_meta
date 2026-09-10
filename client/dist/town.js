// まちづくり島 — the block shop, the estate agent, and the building HUD.
//
// Prices, ownership, capacity and every placed block are the server's. This module shows
// them and sends what a child asks for.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (c) => `#${Number(c).toString(16).padStart(6, '0')}`;

export function createTownUI({ send, toast, speak, isOnline, learn, room }) {
  const state = { shop: null, spot: null, roomInfo: null };

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

  // The building HUD: which block is in hand, what is left, and the two things you can
  // do with a block. It has to work with a thumb, so both are buttons.
  const hud = document.createElement('aside');
  hud.id = 'room-hud';
  hud.hidden = true;
  hud.innerHTML = `<div class="room-hud-top"><b id="room-hud-name"></b><small id="room-hud-count"></small></div>
    <div id="room-palette" class="room-palette"></div>`;
  // The two things you do with a block, where a thumb already is. Minecraft puts them
  // on the right of the screen and so do we, because that is the game these children
  // have already learned.
  const acts = document.createElement('div');
  acts.id = 'room-acts';
  acts.hidden = true;
  acts.innerHTML = `<button type="button" id="room-place">おく<small>E</small></button>
    <button type="button" id="room-remove">ほる<small>Q</small></button>
    <button type="button" id="room-exit">そとへ</button>`;
  document.querySelector('main').append(acts);
  document.querySelector('main').append(hud);
  $('#room-place', acts).onclick = () => room.placeHere();
  $('#room-remove', acts).onclick = () => room.removeHere();
  $('#room-exit', acts).onclick = () => room.leave();

  function label(spot) {
    if (spot.kind === 'shop') return '🧱 ブロックを かう';
    if (spot.kind === 'agent') return '🏠 ひっこしの そうだん';
    return '🚪 マイルームに はいる';
  }

  function enter(spot) {
    if (!isOnline()) { toast('まちづくり島は オンラインで あそべます。'); return; }
    state.spot = spot;
    if (spot.kind === 'door') { send('room:enter', {}); return; }
    render('よみこみ中…');
    if (!dialog.open) dialog.showModal();
    send('block:list', {});
  }

  function render(note = '') {
    if (!state.shop) { body().innerHTML = `<p class="daily-note">${esc(note)}</p>`; return; }
    if (state.spot?.kind === 'agent') { renderAgent(note); return; }
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      <p class="daily-note">かった ブロックは、マイルームで いつでも つかえます。</p>
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

  function renderAgent(note = '') {
    const info = state.roomInfo;
    const next = info?.next;
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      <p class="daily-note">いまの へや：<b>${esc(info?.name || '—')}</b>${info ? `（${info.grid} × ${info.grid}・ブロック ${info.cap} こまで）` : ''}</p>
      ${next
        ? `<div class="town-move">
            <div><strong>${esc(next.name)}</strong><small>${next.grid} × ${next.grid}・ブロック ${next.cap} こまで</small></div>
            <div class="town-move-need"><span>◈ ${next.price}</span><small>Lv.${next.level} から</small></div>
            <button type="button" class="primary" id="town-move">ひっこす</button>
          </div><p class="daily-note">いま つくったものは、そのまま ひっこし先にも のこります。</p>`
        : '<p class="daily-note">いちばん おおきな へやに すんでいます。</p>'}
      <div class="quiz-actions"><button type="button" id="town-done">とじる</button></div>`;
    const move = $('#town-move', dialog);
    if (move) move.onclick = () => { move.disabled = true; send('room:move', {}); };
    $('#town-done', dialog).onclick = close;
  }

  // ---- what the server says ---------------------------------------------------------

  function onShop(m) {
    state.shop = m;
    if (dialog.open) render();
  }

  function onBought(m) {
    speak(m.word);
    learn(m.word, m.ja);
    onShop(m);
    render(`${m.word}（${m.ja}）の ブロックを かいました！`);
  }

  function paletteHtml() {
    const owned = room.state.owned || [];
    return owned.map((id) => {
      const b = state.shop?.blocks.find((x) => x.id === id) || room.state.palette.get(id);
      const color = b ? hex(b.color) : '#999';
      const slot = owned.indexOf(id) + 1;
      return `<button type="button" data-hand="${id}" class="${room.hand === id ? 'on' : ''}" title="${esc(b?.word || id)}">
        <i>${slot <= 9 ? slot : ''}</i><span style="background:${color}"></span><small>${esc(b?.word || id)}</small></button>`;
    }).join('');
  }

  function refreshHud() {
    acts.hidden = !room.active;
    if (!room.active) { hud.hidden = true; return; }
    hud.hidden = false;
    $('#room-hud-name', hud).textContent = room.state.room?.name || '';
    $('#room-hud-count', hud).textContent = `${room.state.used} / ${room.state.cap}`;
    const palette = $('#room-palette', hud);
    palette.innerHTML = paletteHtml();
    for (const b of palette.querySelectorAll('[data-hand]')) {
      b.onclick = () => { room.setHand(b.dataset.hand); refreshHud(); };
    }
  }

  // The door was opened: build the room and show the HUD.
  function onRoomState(m) {
    state.roomInfo = m;
    close();
    room.enter(m, state.shop?.blocks || [...(room.state.palette?.values?.() || [])]);
    refreshHud();
    toast(`${m.name}。ブロックを えらんで「おく」。`);
  }

  function onMoved(m) {
    state.roomInfo = m.room;
    render(`${m.room.name} に ひっこしました！`);
    if (room.active) { room.enter(m.room, state.shop?.blocks || []); refreshHud(); }
  }

  function onError(m) {
    const said = {
      'too far': m.spot ? `${m.spot.name} まで あるいて いこう。` : 'もっと 近づいてね。',
      'already yours': 'もう もっています。',
      'not enough coins': `あと ◈ ${Math.max(0, (m.need || 0) - (m.coins || 0))} たりません。`,
      'level too low': `レベル ${m.need} から ひっこせます。`,
      'biggest already': 'いちばん おおきな へやに すんでいます。',
      'no such block': 'そのブロックは ありません。',
    }[m.reason];
    if (said) { toast(said); if (dialog.open) render(); return; }
    room.onError(m);
  }

  return {
    state, enter, label, onShop, onBought, onRoomState, onMoved, onError, refreshHud,
    // Blocks arriving and leaving both change the count in the HUD.
    onPlaced(m) { room.onPlaced(m); refreshHud(); },
    onRemoved(m) { room.onRemoved(m); refreshHud(); },
    hideHud() { hud.hidden = true; acts.hidden = true; },
    // Number keys pick a block, exactly as they do in the game this borrows from.
    pickSlot(n) { const owned = room.state.owned || []; const id = owned[n - 1]; if (id) { room.setHand(id); refreshHud(); } },
    // The shop list doubles as the palette's colours, so ask for it once on arrival.
    // Asked for on joining, before the mode has settled to online: the send is a no-op
    // while there is no room, and the answer is what colours the palette.
    prime() { if (!state.shop) send('block:list', {}); },
  };
}
