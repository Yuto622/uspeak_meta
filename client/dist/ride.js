// のりもの島 — the gate dialog and the course HUD.
//
// Nothing here decides anything: whether a gate opens, whether a checkpoint counts and
// what a lap pays all come back from the server. This screen shows the price, the level
// and the gold sign, and the HUD shows which word to drive to next.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const secs = (ms) => `${(ms / 1000).toFixed(1)}秒`;

export function createRideUI({ send, toast, speak, isOnline, learn, onRiding, onCourse }) {
  const state = { garage: null, spot: null, lap: null, next: null, best: 0 };

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

  // The course HUD: one word at a time, big, plus the clock.
  const hud = document.createElement('div');
  hud.id = 'ride-hud';
  hud.hidden = true;
  hud.innerHTML = '<span id="ride-hud-stage">NEXT</span><strong id="ride-hud-word"></strong><small id="ride-hud-ja"></small><b id="ride-hud-clock">0.0秒</b>';
  document.body.append(hud);
  let clockTimer = 0;

  function label(spot) {
    // The start line is only a start line once a child is on something. On foot it is
    // where they choose, so it says so rather than promising a race it will refuse.
    if (spot.kind === 'start') {
      if (state.lap) return '🚦 コースを やめる';
      return state.garage?.riding ? '🚦 コースを はしる' : '🚦 のりものを えらぶ';
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
    if (spot.kind === 'start' && (state.lap || state.garage?.riding)) { toggleCourse(); return; }
    render('よみこみ中…');
    if (!dialog.open) dialog.showModal();
    send('ride:list', {});
  }

  function toggleCourse() {
    if (state.lap) { stopLap('やめました'); return; }
    send('course:start', {});
  }

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
        ? 'のりたい のりものを えらんで、「コースを はしる」。'
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
        ${g.best ? `いちばん はやい ラップ：<b>${secs(g.best)}</b>。` : 'スタートラインで コースに ちょうせん できます。'}</p>
      <div class="quiz-actions">
        ${g.riding ? '<button type="button" id="ride-walk">おりる</button>' : ''}
        ${atStart && g.riding ? '<button type="button" class="primary" id="ride-go">🚦 コースを はしる</button>' : ''}
        <button type="button" ${atStart && g.riding ? '' : 'class="primary"'} id="ride-done">とじる</button>
      </div>`;
    for (const b of body().querySelectorAll('[data-buy]')) b.onclick = () => { b.disabled = true; send('ride:buy', { id: b.dataset.buy }); };
    for (const b of body().querySelectorAll('[data-equip]')) b.onclick = () => send('ride:equip', { id: b.dataset.equip });
    const walk = $('#ride-walk', dialog);
    if (walk) walk.onclick = () => send('ride:equip', { id: '' });
    const go = $('#ride-go', dialog);
    if (go) go.onclick = () => { close(); toggleCourse(); };
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
      'on foot': 'コースは のりもので はしります。まず のりものを えらぼう。',
      'not started': 'スタートラインから はじめよう。',
      'not next': m.want ? `つぎは ${m.want.word}（${m.want.ja}）だよ。` : 'じゅんばんに とおろう。',
    }[m.reason];
    if (said) toast(said);
    if (dialog.open) render();
  }

  // ---- the course ------------------------------------------------------------------

  function showHud() {
    hud.hidden = !state.lap;
    if (!state.lap) return;
    $('#ride-hud-word', hud).textContent = state.next?.word || '';
    $('#ride-hud-ja', hud).textContent = state.next?.ja || '';
  }

  function onStarted(m) {
    close();
    state.lap = { at: Date.now(), of: m.gates.length, done: 0 };
    state.next = m.gates[0];
    onCourse(state.next?.id || '');
    showHud();
    speak(state.next.word);
    toast(`スタート！ つぎは ${state.next.word}（${state.next.ja}）。`);
    clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (!state.lap) return;
      $('#ride-hud-clock', hud).textContent = secs(Date.now() - state.lap.at);
    }, 100);
  }

  function onGate(m) {
    if (!state.lap) return;
    state.lap.done = m.order;
    state.next = m.next;
    onCourse(m.next?.id || '');
    showHud();
    learn(m.word, m.ja);
    if (m.next) { speak(m.next.word); toast(`${m.word}（${m.ja}）· つぎは ${m.next.word}`); }
  }

  function stopLap(reason) {
    state.lap = null;
    state.next = null;
    clearInterval(clockTimer);
    onCourse('');
    showHud();
    if (reason) toast(reason);
  }

  function onFinished(m) {
    stopLap('');
    for (const w of m.words || []) learn(w.word, w.ja);
    state.best = m.bestMs;
    if (state.garage) state.garage.best = m.bestMs;
    toast(`ゴール！ ${secs(m.ms)}${m.best ? '（さいそく記録！）' : ''} ✧ ${m.xp} XP ${m.coins ? `◈ ${m.coins}` : ''}`);
    speak('goal');
  }

  return {
    state, enter, label, onGarage, onBought, onError, onStarted, onGate, onFinished,
    // The world calls this when the avatar drives into a checkpoint ring. The server
    // still decides whether it counted.
    cross(id) {
      if (!state.lap || !state.next || state.next.id !== id) return;
      send('course:gate', { id });
    },
    quit() { if (state.lap) stopLap(''); },
    get riding() { return state.garage?.riding || ''; },
  };
}
