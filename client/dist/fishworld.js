// つり島の画面 — U-Speak島の釣りと同じ流れを、水辺で。
//
//   水辺に立つ → 🎣 → さおを なげる（画面が閉じて、島の上で うきが浮かぶ）→ うきが しずむ（！）→
//   問題（formats-ui）→ 正解：タイミングバー → 魚が水から はねる → つれた！ → 図鑑・うる。
//   不正解は同じ問題をもう一度、2回目も外すと魚は逃げる。✕ でいつでもやめる。
//
// ページは答えも確率も知らない。`fw:cast` → `fw:ask`、`fw:answer` → `fw:result`、
// `fw:reel {grade}` → `fw:catch`、`fw:sell` → `fw:sold`。コインは部屋が払う。
// 島の演出（さお・うき・しぶき）は fishworld-island.js の startCast / bite / splash / endCast。
import { t as tr, onLangChange, isJa } from './i18n.js';
import { renderFormat, confetti } from './formats-ui.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const GRADE = { perfect: ['PERFECT!', 'かんぺき！'], nice: ['NICE!', 'いいね！'], ok: ['CLOSE…', 'おしい'] };
const RARITY = { C: ['Common', 'ふつう'], U: ['Uncommon', 'ちょっと めずらしい'], R: ['Rare', 'レア'], S: ['Super Rare', 'スーパーレア'], L: ['Legendary', 'でんせつ'] };
const ZONE_ICON = { 1: '🪷', 2: '🏞', 3: '🌊' };
const WAIT_MIN = 1600;   // うきが しずむまでの いちばん短い時間（さおを なげて すぐ問題、にしない）

function photo(f, cls = 'fw-photo') {
  if (f.have === false) return `<span class="${cls} unknown">${f.photo ? `<img src="assets/fish/${esc(f.photo)}.jpg" alt="" loading="lazy" decoding="async">` : ''}<em>?</em></span>`;
  return f.photo
    ? `<span class="${cls}"><img src="assets/fish/${esc(f.photo)}.jpg" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="${cls} emoji">${esc(f.emoji || '🐟')}</span>`;
}

export function createFishworldUI({ send, toast, speak, isOnline, island }) {
  const state = { spot: '', zone: 0, view: 'zone', data: null, ask: null, ctl: null, tab: 'zone', timing: null, castAt: 0, pending: null, wait: 0 };
  // メインの島（2D）の つり場では 3D の島が無い：うきは 画面の中で うかべる（flat）。
  let flat = false;
  const isl = () => (flat ? null : island);

  const dialog = document.createElement('dialog');
  dialog.id = 'fw-dialog';
  dialog.setAttribute('aria-labelledby', 'fw-title');
  dialog.innerHTML = `<div class="fw-head">
      <div class="fw-head-text"><small><span class="fw-icon" aria-hidden="true">🎣</span> FISHING WORLD · <span id="fw-stars">★</span></small><h2 id="fw-title">つり島</h2></div>
      <div class="fw-meta"><span class="fw-coins"><i aria-hidden="true">◈</i> <b id="fw-coins">0</b></span><button type="button" id="fw-close" aria-label="とじる" data-t-label="とじる">✕</button></div>
      <svg class="fw-waves" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22 Q 75 8 150 22 T 300 22 T 450 22 T 600 22 T 750 22 T 900 22 T 1050 22 T 1200 22 V40 H0Z"/><path d="M0 28 Q 75 16 150 28 T 300 28 T 450 28 T 600 28 T 750 28 T 900 28 T 1050 28 T 1200 28 V40 H0Z"/></svg>
    </div>
    <nav class="fw-tabs" aria-label="つり島のメニュー" data-t-label="つり島のメニュー">
      <button type="button" data-fw-tab="zone" class="active">${bi('🎣 Fish', '🎣 つる')}</button>
      <button type="button" data-fw-tab="dex">${bi('📖 Fish Dex', '📖 ずかん')}</button>
      <button type="button" data-fw-tab="bag">${bi('🧺 Sell', '🧺 うる')}</button>
    </nav>
    <div id="fw-body"></div>`;
  document.body.append(dialog);
  const body = $('#fw-body', dialog);

  // 島の上で うきを見ている間の小さな札（✕ で やめられる）。
  const hud = document.createElement('div');
  hud.id = 'fw-hud';
  hud.hidden = true;
  hud.innerHTML = `<span class="fw-hud-bob" aria-hidden="true"></span><p>${bi('Watch the float…', 'うきを みてね…')}</p><button type="button" class="fw-hud-quit" aria-label="やめる" data-t-label="やめる">✕</button>`;
  document.body.append(hud);
  $('.fw-hud-quit', hud).onclick = () => close();

  $('#fw-close', dialog).onclick = () => close();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.querySelectorAll('[data-fw-tab]').forEach((b) => { b.onclick = () => { if (busy()) return; if (state.view === 'catch') state.view = 'zone'; state.tab = b.dataset.fwTab; render(); }; });

  const busy = () => ['cast', 'ask', 'reel', 'splash'].includes(state.view);
  const show = () => { if (!dialog.open) dialog.showModal(); };
  const hide = () => { if (dialog.open) dialog.close(); };

  function close() {
    if (busy()) { send('fw:cancel', {}); toast(tr('さかなは にげて いきました…')); }
    clearTimeout(state.wait);
    state.ctl?.destroy?.(); state.ctl = null; state.ask = null; state.pending = null; state.view = 'zone'; state.tab = 'zone'; state.auto = false;
    stopTiming();
    isl()?.endCast?.();
    hud.hidden = true;
    hide();
  }

  // `auto`：水辺に来たら そのまま さおを なげる（つり場の ページは 出さない）。ずかん・うるは 左下の 📖 から。
  function enter(spot, { flat: noIsland = false, tab = 'zone', auto = false } = {}) {
    if (!isOnline()) { toast(tr('つり島は オンラインで あそべます。')); return false; }
    if (busy()) return false;
    flat = !!noIsland;
    state.spot = spot.id;
    state.zone = spot.zone;
    state.view = 'zone'; state.tab = tab;
    state.auto = auto && tab === 'zone';
    send('fw:open', { spot: spot.id });
    return true;
  }

  function zoneOf(n = state.zone) { return state.data?.zones?.find((z) => z.zone === n) || { zone: n, stars: '★', en: 'Pond', ja: 'いけ', grade: '', gradeEn: '', color: '#78C882' }; }
  function head() {
    const z = zoneOf();
    dialog.style.setProperty('--zc', z.color || '#78C882');
    dialog.dataset.zone = String(state.zone || 1);
    dialog.dataset.view = state.view;
    $('#fw-stars', dialog).textContent = `${z.stars} ${z.en.toUpperCase()}`;
    $('#fw-title', dialog).innerHTML = `${bi(esc(z.en), esc(z.ja))} <small class="fw-grade">${isJa() ? esc(z.grade) : esc(z.gradeEn)}</small>`;
    dialog.querySelectorAll('[data-fw-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.fwTab === state.tab); b.disabled = busy(); });
  }

  // ---- 画面 ----
  function render() {
    if (!state.data) return;
    head();
    if (busy() || state.view === 'catch') return;
    if (state.tab === 'dex') return renderDex();
    if (state.tab === 'bag') return renderBag();
    return renderZone();
  }

  function renderZone() {
    const z = zoneOf();
    const c = state.data.counts?.[state.zone] || { have: 0, total: 0 };
    const pct = c.total ? Math.round((c.have / c.total) * 100) : 0;
    const here = (state.data.dex || []).filter((f) => f.zone === state.zone || f.zone === 0).slice(0, 10);
    body.innerHTML = `<div class="fw-zone">
      <section class="fw-hero">
        <div class="fw-ring" style="--p:${pct}"><span>${ZONE_ICON[state.zone] || '🎣'}</span></div>
        <div class="fw-hero-text">
          <p class="fw-hero-stars">${esc(z.stars)}</p>
          <h3 class="fw-learn" translate="no">${esc(z.en)} <small>${esc(z.ja)}</small></h3>
          <p class="fw-chipline"><span class="fw-chip">${isJa() ? esc(z.grade) : esc(z.gradeEn)}</span><span class="fw-chip">📖 ${c.have} / ${c.total}</span></p>
        </div>
      </section>
      <button type="button" class="fw-cast">${bi('🎣 Cast!', '🎣 さおを なげる')}<span class="fw-shine" aria-hidden="true"></span></button>
      <ol class="fw-steps">
        <li><i>1</i><span class="fw-step-ic">🎣</span>${bi('Cast and watch the float', 'なげて うきを みる')}</li>
        <li><i>2</i><span class="fw-step-ic">📝</span>${bi('Answer in English', 'えいごで こたえる')}</li>
        <li><i>3</i><span class="fw-step-ic">🎯</span>${bi('Stop the bar in the middle', 'まんなかで ストップ')}</li>
      </ol>
      <div class="fw-peek"><p>${bi('Fish here', 'ここの さかな')}</p><div class="fw-peek-row">${here.map((f) => `<span class="fw-peek-fish r-${esc(f.rarity)}" title="${f.have ? esc(f.en) : '?'}">${photo(f, 'fw-photo sm')}</span>`).join('')}</div></div>
    </div>`;
    $('.fw-cast', body).onclick = cast;
  }

  function card(f, extra = '') {
    const known = f.have !== false;
    return `<div class="fw-fish r-${esc(f.rarity)} ${known ? '' : 'unknown'}" style="--c:${esc(f.color)}">
      ${photo(f)}
      <b class="fw-learn" translate="no">${known ? esc(f.en) : '???'}</b><small class="fw-learn" translate="no">${known ? esc(f.ja) : ''}</small>
      <span class="fw-stars">${esc(f.stars)}</span>${extra}</div>`;
  }

  function renderDex() {
    const d = state.data;
    body.innerHTML = `<div class="fw-dexhead">${[1, 2, 3].map((n) => { const z = zoneOf(n); const c = d.counts[n]; return `<div class="fw-dexstat" style="--zc:${esc(z.color)}"><span>${ZONE_ICON[n]}</span><b>${esc(z.stars)} ${esc(z.en)}</b><em>${c.have}/${c.total}</em><i style="--p:${c.total ? (c.have / c.total) * 100 : 0}%"></i></div>`; }).join('')}</div>
      ${[1, 2, 3].map((n) => { const z = zoneOf(n); return `<h3 class="fw-h3" style="--zc:${esc(z.color)}">${ZONE_ICON[n]} ${esc(z.stars)} <span class="fw-learn" translate="no">${esc(z.en)}</span> <small>${esc(z.ja)}</small></h3><div class="fw-grid">${d.dex.filter((f) => f.zone === n).map((f) => card(f)).join('')}</div>`; }).join('')}
      ${d.dex.some((f) => f.zone === 0) ? `<h3 class="fw-h3">🎁 ${bi('Anywhere', 'どこでも')}</h3><div class="fw-grid">${d.dex.filter((f) => f.zone === 0).map((f) => card(f)).join('')}</div>` : ''}
      <p class="fw-fine">${bi('A new fish in your Dex gives +10 coins.', 'はじめての さかなは ずかんに とうろく ＋10 コイン。')}</p>`;
  }

  function renderBag() {
    const d = state.data;
    const count = d.bag.reduce((s, f) => s + f.n, 0);
    body.innerHTML = `<div class="fw-bagtop">
        <div class="fw-bagsum"><span>🧺</span><p>${bi('In your basket', 'かごの さかな')} <b>${count}</b></p><p class="fw-price">◈ ${d.bagValue}</p></div>
        <button type="button" class="fw-sellall" ${d.bag.length ? '' : 'disabled'}>${bi(`Sell all · ◈ ${d.bagValue}`, `ぜんぶ うる · ◈ ${d.bagValue}`)}</button></div>
      <div class="fw-grid">${d.bag.map((f) => card({ ...f, have: true }, `<em class="fw-count">×${f.n}</em><button type="button" class="fw-sell" data-en="${esc(f.en)}">◈ ${f.sell} ${bi('Sell', 'うる')}</button>`)).join('') || `<div class="fw-empty"><span>🎣</span><p>${bi('No fish yet. Go and cast!', 'まだ さかなは ありません。さおを なげよう！')}</p></div>`}</div>
      <p class="fw-fine">${bi('Sold fish stay in your Dex.', 'うっても ずかんには のこります。')}</p>`;
    $('.fw-sellall', body).onclick = () => send('fw:sell', { spot: state.spot, all: true });
    body.querySelectorAll('.fw-sell').forEach((b) => { b.onclick = () => send('fw:sell', { spot: state.spot, en: b.dataset.en }); });
  }

  // ---- さおを なげる（島の上で）----
  function cast() {
    if (busy()) return;
    state.view = 'cast';
    state.pending = null;
    state.castAt = performance.now();
    state.ctl?.destroy?.(); state.ctl = null;
    send('fw:cast', { spot: state.spot });
    if (flat) {
      head();
      body.innerHTML = `<div class="fw-wait"><div class="fw-pond"><span class="fw-line"></span><span class="fw-bob"></span><span class="fw-ring1"></span><span class="fw-ring2"></span><b class="fw-bang">！</b></div>
        <p>${bi('Watch the float…', 'うきを みてね…')}</p><button type="button" class="fw-todex fw-wait-quit">${bi('✕ Stop', '✕ やめる')}</button></div>`;
      $('.fw-wait-quit', body).onclick = () => close();
      return;
    }
    hide();
    isl()?.startCast?.(state.spot);
    const near = document.querySelector('#near'); if (near) near.style.display = 'none'; // 「ここで つる」は もう いらない
    hud.hidden = false;
    hud.classList.remove('bite');
  }
  // 問題が届いても、うきが しずむまでは出さない。しずんだら「！」、少しして問題。
  function spring() {
    if (state.view !== 'cast' || !state.pending) return;
    const wait = Math.max(0, WAIT_MIN + Math.random() * 1100 - (performance.now() - state.castAt));
    clearTimeout(state.wait);
    state.wait = setTimeout(() => {
      if (state.view !== 'cast' || !state.pending) return;
      isl()?.bite?.();
      if (flat) { $('.fw-wait', body)?.classList.add('bite'); const p = $('.fw-wait p', body); if (p) p.innerHTML = bi('A bite!', 'かかった！'); } else hud.classList.add('bite');
      $('p', hud).innerHTML = bi('A bite!', 'かかった！');
      state.wait = setTimeout(() => {
        if (state.view !== 'cast' || !state.pending) return;
        hud.hidden = true;
        $('p', hud).innerHTML = bi('Watch the float…', 'うきを みてね…');
        const m = state.pending; state.pending = null;
        show(); renderAsk(m);
      }, 750);
    }, wait);
  }

  // ---- 問題 ----
  function renderAsk(m) {
    state.view = 'ask';
    state.ask = m;
    head();
    state.ctl?.destroy?.();
    body.innerHTML = '';
    state.ctl = renderFormat(body, m.format, {
      speak,
      onQuit: () => close(),
      onCheck: (answer) => send('fw:answer', { qid: m.qid, answer }),
    });
  }

  function onResult(m) {
    if (!state.ctl || !state.ask || m.qid !== state.ask.qid) return;
    state.ctl.showResult(m.correct, { diff: m.diff, reveal: m.reveal, escaped: m.escaped });
    if (m.correct) {
      setTimeout(() => { if (state.view === 'ask') renderReel(); }, 1100);
    } else if (m.escaped) {
      setTimeout(() => {
        if (state.view !== 'ask') return;
        toast(tr('さかなは にげて いきました…'));
        isl()?.endCast?.();
        state.view = 'zone'; state.ctl?.destroy?.(); state.ctl = null; render();
      }, 2600);
    } else if (m.format) {
      // 同じ問題を、同じ形式で、もう一度。type は「さいしょの もじ」のヒントつき。
      setTimeout(() => { if (state.view === 'ask') renderAsk({ ...state.ask, attempt: 2, format: m.format }); }, 1600);
    }
  }

  // ---- タイミングバー ----
  function renderReel() {
    state.view = 'reel';
    state.ctl?.destroy?.(); state.ctl = null;
    head();
    body.innerHTML = `<div class="fw-reel">
      <p class="fw-reel-kicker">${bi('A fish is on the line!', 'さかなが かかった！')}</p>
      <h3>${bi('Reel it in!', 'まんなかで ストップ！')}</h3>
      <div class="fw-gauge" role="button" tabindex="0" aria-label="STOP">
        <div class="fw-track"><span class="fw-nice"></span><span class="fw-perfect"></span><span class="fw-ticks"></span></div>
        <i class="fw-marker"><b>🐟</b></i>
        <span class="fw-burst" hidden></span>
      </div>
      <div class="fw-legend"><span class="ok">${bi('Close', 'おしい')}</span><span class="nice">NICE</span><span class="perfect">PERFECT</span><span class="nice">NICE</span><span class="ok">${bi('Close', 'おしい')}</span></div>
      <button type="button" class="fw-stop">${bi('🎣 STOP!', '🎣 ストップ！')}</button>
      <p class="fw-fine">${bi('Stop on the green for rarer fish.', 'まんなかの みどりで とめると レアな さかなが きやすい。')}</p></div>`;
    const marker = $('.fw-marker', body);
    let t0 = performance.now(); let pos = 0; let dir = 1; let raf = 0; let done = false;
    const SPEED = 1.15; // full sweeps per second
    const tick = (now) => {
      const dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
      pos += dir * dt * SPEED * 2;
      if (pos > 1) { pos = 2 - pos; dir = -1; } else if (pos < 0) { pos = -pos; dir = 1; }
      marker.style.left = `${pos * 100}%`;
      marker.classList.toggle('flip', dir < 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      const d = Math.abs(pos - 0.5);
      const grade = d <= 0.08 ? 'perfect' : d <= 0.2 ? 'nice' : 'ok';
      const btn = $('.fw-stop', body);
      btn.disabled = true;
      btn.innerHTML = `<b>${GRADE[grade][0]}</b><small>${GRADE[grade][1]}</small>`;
      const burst = $('.fw-burst', body); burst.hidden = false; burst.className = `fw-burst ${grade}`; burst.textContent = GRADE[grade][isJa() ? 1 : 0]; burst.style.left = `${pos * 100}%`;
      $('.fw-gauge', body).classList.add('stopped', grade);
      stopTiming();
      send('fw:reel', { grade });
    };
    $('.fw-stop', body).onclick = stop;
    $('.fw-gauge', body).onclick = stop;
    state.timing = { stop: () => cancelAnimationFrame(raf), key: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } } };
    window.addEventListener('keydown', state.timing.key);
  }
  function stopTiming() { if (state.timing) { state.timing.stop(); window.removeEventListener('keydown', state.timing.key); state.timing = null; } }

  // ---- つれた！ 魚が水から はねるのを見せてから、カードを出す ----
  function onCatch(m) {
    stopTiming();
    state.view = 'splash';
    if (!flat) hide();
    isl()?.splash?.(m.fish);
    if (speak) speak(m.fish.en, { japanese: false, rate: 0.85 });
    setTimeout(() => { isl()?.endCast?.(); showCatch(m); }, isl()?.splash ? 1500 : 0);
  }
  function showCatch(m) {
    state.view = 'catch';
    const f = m.fish;
    const r = RARITY[f.rarity] || RARITY.C;
    show(); head();
    body.innerHTML = `<div class="fw-catch r-${esc(f.rarity)}" style="--c:${esc(f.color)}">
      <div class="fw-rays" aria-hidden="true"></div>
      <div class="fw-catch-label"><b>${esc(f.label?.en || 'GET!')}</b><small>${esc(f.label?.ja || 'ゲット！')}</small></div>
      <div class="fw-catch-photo">${photo({ ...f, have: true }, 'fw-photo xl')}</div>
      <h3 class="fw-learn" translate="no">${esc(f.en)}</h3>
      <p class="fw-catch-ja fw-learn" translate="no">${esc(f.ja)}</p>
      <p class="fw-chipline">
        <span class="fw-chip rare">${esc(f.stars)} ${bi(r[0], r[1])}</span>
        <span class="fw-chip">◈ ${f.sell}</span>
        <span class="fw-chip grade ${esc(m.grade)}">${GRADE[m.grade]?.[isJa() ? 1 : 0] || ''}</span>
        ${f.kind === 'treasure' ? `<span class="fw-chip">${bi('Treasure!', 'おたから！')}</span>` : ''}
      </p>
      ${m.first ? `<p class="fw-new">📖 ${bi('New in your Fish Dex!', 'ずかんに とうろく！')} <b>+${m.coins} ◈</b></p>` : ''}
      <div class="fw-actions">
        <button type="button" class="fw-again">${bi('🎣 Cast again', '🎣 もう いっかい')}</button>
        <button type="button" class="fw-todex">${bi('📖 Fish Dex', '📖 ずかん')}</button>
        <button type="button" class="fw-speak" aria-label="よみあげる" data-t-label="よみあげる">🔊</button>
      </div></div>`;
    confetti($('.fw-catch', body));
    $('.fw-again', body).onclick = () => { state.view = 'zone'; cast(); };
    $('.fw-todex', body).onclick = () => { state.view = 'zone'; state.tab = 'dex'; render(); };
    $('.fw-speak', body).onclick = () => speak?.(f.en, { japanese: false, rate: 0.85 });
  }

  // ---- 部屋からの返事 ----
  function onState(m) {
    state.data = m;
    if (m.zone) state.zone = m.zone;
    if (m.spot) state.spot = m.spot;
    $('#fw-coins', dialog).textContent = (m.wallet?.coins ?? 0).toLocaleString();
    if (busy()) { head(); return; }
    if (state.auto && state.view === 'zone') { state.auto = false; if (flat) show(); cast(); return; }
    show();
    if (state.view === 'zone') render(); else head();
  }
  function onAsk(m) {
    if (state.view === 'cast') { state.pending = m; spring(); return; }
    show(); renderAsk(m);
  }
  function onCaught(m) { state.data = { ...state.data, ...m }; $('#fw-coins', dialog).textContent = (m.wallet?.coins ?? state.data?.wallet?.coins ?? 0).toLocaleString(); onCatch(m); }
  function onSold(m) { state.data = { ...state.data, ...m }; $('#fw-coins', dialog).textContent = (m.wallet?.coins ?? 0).toLocaleString(); toast(tr('◈ {n} コインに なりました！', { n: m.coins })); render(); }
  function onError(m) {
    const why = { 'too far': 'つりばに たってね。', 'no question': 'さおを なげなおそう。', 'nothing on the line': 'さおを なげなおそう。', 'nothing to sell': 'うる さかなが ないよ。', 'too fast': 'ちょっと まってね。' }[m.reason] || m.reason;
    toast(tr(why));
    if (state.view === 'cast') { clearTimeout(state.wait); isl()?.endCast?.(); hud.hidden = true; state.view = 'zone'; if (m.reason !== 'too far') { show(); render(); } }
    if (m.reason === 'too far') close();
  }

  // 左下の 📖：つり島に いる間だけ。どこからでも ずかん（と うる）を ひらける（位置のいらない つり場 "main" で開く）。
  const dock = document.createElement('div');
  dock.className = 'guest-dock fw-dexdock';
  dock.hidden = true;
  dock.innerHTML = `<button type="button" class="guest-launch fw-dexbtn"><span class="guest-launch-badge">📖</span><span class="guest-launch-name"><strong>${bi('Fish Dex', 'さかな ずかん')}</strong><small>${bi('Your fish · sell', 'つった さかな・うる')}</small></span><b>›</b></button>`;
  document.body.append(dock);
  $('.fw-dexbtn', dock).onclick = () => enter({ id: 'main', zone: state.zone || 1 }, { flat: true, tab: 'dex' });
  setInterval(() => { dock.hidden = !(island?.visible && isOnline()) || dialog.open || busy(); }, 400);

  onLangChange(() => { if (dialog.open && (state.view === 'zone' || state.view === 'catch')) render(); });

  return { enter, close, cast, onState, onAsk, onResult, onCatch: onCaught, onSold, onError, get isOpen() { return dialog.open; }, get busy() { return busy(); }, state };
}
