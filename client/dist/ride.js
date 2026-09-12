// のりもの島 — the garage: which vehicle, and what it costs.
//
// Nothing here decides anything: whether a gate opens and what a vehicle costs come back
// from the server. This screen shows the price, the level and the gold sign. The race
// itself is race.js — the start line hands over to it.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const secs = (ms) => `${(ms / 1000).toFixed(1)}秒`;

export function createRideUI({ send, toast, speak, isOnline, learn, onRiding, onRace, racing }) {
  const state = { garage: null, spot: null, best: 0 };

  const dialog = document.createElement('dialog');
  dialog.id = 'ride-dialog';
  dialog.setAttribute('aria-labelledby', 'ride-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">RIDE ISLAND</span><h2 id="ride-title">のりもの島</h2></div>
      <button type="button" id="ride-close" aria-label="閉じる">×</button>
    </div><div id="ride-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#ride-body', dialog);
  const close = () => { try { dialog.close(); } catch { /* already closed */ } };
  $('#ride-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  function label(spot) {
    // The start line is only a start line once a child is on something. On foot it is
    // where they choose, so it says so rather than promising a race it will refuse.
    if (spot.kind === 'start') {
      if (racing()) return '🚦 レースを やめる';
      return state.garage?.riding ? '🚦 レースに でる' : '🚦 のりものを えらぶ';
    }
    const v = state.garage?.vehicles.find((x) => x.id === spot.vehicle);
    if (!v) return `${spot.tone || '🛞'} ${spot.name}`;
    if (v.owned) return `${spot.tone} ${v.name}（もっている）`;
    return v.ready ? `${spot.tone} ${v.name} を かう ◈ ${v.price}` : `${spot.tone} ${v.name} ◈ ${v.price}`;
  }

  function enter(spot) {
    if (!isOnline()) { toast('のりもの島は オンラインで あそべます。'); return; }
    state.spot = spot;
    // Riding already: the start line starts the lap. On foot: it opens the garage, so
    // the answer to "choose a vehicle first" is in the place that said it.
    if (spot.kind === 'start' && (racing() || state.garage?.riding)) { toggleRace(); return; }
    render('よみこみ中…');
    if (!dialog.open) dialog.showModal();
    send('ride:list', {});
  }

  // On the line: joining the grid, or leaving a race already joined.
  function toggleRace() { onRace(racing() ? 'quit' : 'join'); }

  function render(note = '') {
    const g = state.garage;
    if (!g) { body().innerHTML = `<p class="daily-note">${esc(note)}</p>`; return; }
    const here = state.spot?.vehicle;
    const atStart = state.spot?.kind === 'start';
    const owned = g.vehicles.filter((v) => v.owned);
    // Where to walk to for the cheapest one they could actually buy, so "go and get one"
    // names a building rather than being advice.
    const nextUp = g.vehicles.find((v) => !v.owned && v.ready) || g.vehicles.find((v) => !v.owned);
    body().innerHTML = `${note ? `<p class="ride-flash">${esc(note)}</p>` : ''}
      ${atStart ? `<p class="ride-lead">${owned.length
        ? 'のりたい のりものを えらんで、「レースに でる」。'
        : `コースは のりもので はしります。${nextUp ? `まずは <b>${esc(nextUp.name)}</b>（◈ ${nextUp.price}${nextUp.needLevel ? ` · Lv.${nextUp.level} から` : ''}）。この島の その ゲートまで あるいて、そこで かいます。` : ''}`}</p>` : ''}
      <div class="ride-list">${g.vehicles.map((v) => `
        <article class="ride-card ${v.owned ? 'owned' : v.ready ? 'ready' : ''} ${v.id === here ? 'here' : ''}" style="--ride:#${Number(v.color).toString(16).padStart(6, '0')}">
          <div class="ride-tier">${'★'.repeat(v.tier)}</div>
          <div class="ride-name"><strong>${esc(v.name)}</strong><small>${esc(v.en)} · ${esc(v.word)}（${esc(v.ja)}）</small></div>
          <div class="ride-need">${v.owned ? '<b>もっている</b>'
            : `<span>◈ ${v.price}</span><small>Lv.${v.level} から</small>${v.needCoins ? `<small>あと ◈ ${v.needCoins}</small>` : ''}${v.needLevel ? `<small>あと Lv.${v.needLevel}</small>` : ''}`}</div>
          <div class="ride-act">${v.owned
            ? `<button type="button" data-equip="${v.id}" ${v.riding ? 'disabled' : ''}>${v.riding ? '✓ のっている' : 'これに のる'}</button>`
            : v.id === here
              ? `<button type="button" class="primary" data-buy="${v.id}" ${v.ready ? '' : 'disabled'}>${v.ready ? 'かう' : 'まだ かえない'}</button>`
              : '<small class="ride-elsewhere">この のりものは べつの ゲート</small>'}</div>
        </article>`).join('')}</div>
      <p class="daily-note">${g.riding ? `いま のっているのは <b>${esc(g.vehicles.find((v) => v.id === g.riding)?.name || '')}</b>。` : 'いまは あるいています。'}
        ${g.best ? `いちばん はやい ラップ：<b>${secs(g.best)}</b>。` : 'スタートラインから 3しゅうの レースに でられます。'}</p>
      <div class="quiz-actions">
        ${g.riding ? '<button type="button" id="ride-walk">おりる</button>' : ''}
        ${atStart && g.riding ? '<button type="button" class="primary" id="ride-go">🚦 レースに でる</button>' : ''}
        <button type="button" ${atStart && g.riding ? '' : 'class="primary"'} id="ride-done">とじる</button>
      </div>`;
    for (const b of body().querySelectorAll('[data-buy]')) b.onclick = () => { b.disabled = true; send('ride:buy', { id: b.dataset.buy }); };
    for (const b of body().querySelectorAll('[data-equip]')) b.onclick = () => send('ride:equip', { id: b.dataset.equip });
    const walk = $('#ride-walk', dialog);
    if (walk) walk.onclick = () => send('ride:equip', { id: '' });
    const go = $('#ride-go', dialog);
    if (go) go.onclick = () => { close(); toggleRace(); };
    $('#ride-done', dialog).onclick = close;
  }

  // ---- what the server says ------------------------------------------------------

  function onGarage(m) {
    const wasRiding = state.garage?.riding || '';
    state.garage = m;
    state.best = m.best || 0;
    onRiding(m.riding, m.vehicles.find((v) => v.id === m.riding)?.speed || 1);
    if (dialog.open) render(state.spot?.kind === 'start' && m.riding && m.riding !== wasRiding
      ? `${m.vehicles.find((v) => v.id === m.riding)?.name || ''} に のりました。`
      : '');
  }

  function onBought(m) {
    onGarage(m);
    speak(m.word);
    learn(m.word, m.ja);
    render(`${m.name} を かいました！ ${m.word}（${m.ja}）`);
  }

  function onError(m) {
    const said = {
      'too far': 'その のりものは べつの ゲートに あります。',
      'already yours': 'もう もっています。',
      'level too low': `レベル ${m.need} から かえます。`,
      'not enough coins': `あと ◈ ${Math.max(0, (m.need || 0) - (m.coins || 0))} たりません。`,
      'not yours': 'まだ もっていません。',
      'on foot': 'レースは のりもので はしります。まず のりものを えらぼう。',
    }[m.reason];
    if (said) toast(said);
    if (dialog.open) render();
  }

  return {
    state, enter, label, onGarage, onBought, onError,
    // A best lap comes back from a finished race, and belongs on the garage screen.
    setBest(msValue) { state.best = msValue; if (state.garage) state.garage.best = msValue; },
    get riding() { return state.garage?.riding || ''; },
  };
}
