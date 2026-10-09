// つり島の画面 — Roblox の釣りワールドの流れをそのまま。
//
//   ゾーン（小屋）に入る → さおを なげる → 問題（formats-ui）→ 正解：タイミングバー → 魚 →
//   図鑑・ふくろ・売る。不正解は同じ問題をもう一度、2回目も外すと魚は逃げる。✕ でいつでもやめる。
//
// ページは答えも確率も知らない。`fw:cast` → `fw:ask`、`fw:answer` → `fw:result`、
// `fw:reel {grade}` → `fw:catch`、`fw:sell` → `fw:sold`。コインは部屋が払う。
import { t as tr, onLangChange, isJa } from './i18n.js';
import { renderFormat, confetti } from './formats-ui.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GRADE_JA = { perfect: ['PERFECT!', 'かんぺき！'], nice: ['NICE!', 'いいね！'], ok: ['CLOSE…', 'おしい'] };

export function createFishworldUI({ send, toast, speak, isOnline }) {
  const state = { spot: '', zone: 0, view: 'zone', data: null, ask: null, ctl: null, catch: null, timing: null, tab: 'zone' };

  const dialog = document.createElement('dialog');
  dialog.id = 'fw-dialog';
  dialog.setAttribute('aria-labelledby', 'fw-title');
  dialog.innerHTML = `<div class="fw-head">
      <div><small>FISHING WORLD · <span id="fw-stars">★</span></small><h2 id="fw-title">つり島</h2></div>
      <div class="fw-meta"><span class="fw-coins">◈ <b id="fw-coins">0</b></span><button type="button" id="fw-close" aria-label="とじる" data-t-label="とじる">×</button></div>
    </div>
    <nav class="fw-tabs" aria-label="つり島のメニュー" data-t-label="つり島のメニュー">
      <button type="button" data-fw-tab="zone" class="active"><b class="en">🎣 Fish</b><i class="ja">🎣 つる</i></button>
      <button type="button" data-fw-tab="dex"><b class="en">📖 Fish Dex</b><i class="ja">📖 さかな ずかん</i></button>
      <button type="button" data-fw-tab="bag"><b class="en">🧺 Sell</b><i class="ja">🧺 うる</i></button>
    </nav>
    <div id="fw-body"></div>`;
  document.body.append(dialog);
  const body = $('#fw-body', dialog);
  $('#fw-close', dialog).onclick = () => close();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.querySelectorAll('[data-fw-tab]').forEach((b) => { b.onclick = () => { if (state.view === 'ask' || state.view === 'reel') return; state.tab = b.dataset.fwTab; render(); }; });

  function close() {
    if (state.view === 'ask' || state.view === 'reel') { send('fw:cancel', {}); toast(tr('さかなは にげて いきました…')); }
    state.ctl?.destroy?.(); state.ctl = null; state.ask = null; state.view = 'zone'; state.tab = 'zone';
    stopTiming();
    if (dialog.open) dialog.close();
  }

  function enter(spot) {
    if (!isOnline()) { toast(tr('つり島は オンラインで あそべます。')); return false; }
    state.spot = spot.id;
    state.zone = spot.zone;
    state.view = 'zone'; state.tab = 'zone';
    send('fw:open', { spot: spot.id });
    return true;
  }

  function zoneOf() { return state.data?.zones?.find((z) => z.zone === state.zone) || { stars: '★', en: 'Pond', ja: 'いけ', grade: '', gradeEn: '' }; }
  function head() {
    const z = zoneOf();
    $('#fw-stars', dialog).textContent = `${z.stars} ${z.en.toUpperCase()}`;
    $('#fw-title', dialog).innerHTML = `<b class="en">${esc(z.en)}</b><i class="ja">${esc(z.ja)}</i> <small class="fw-grade">${isJa() ? esc(z.grade) : esc(z.gradeEn)}</small>`;
    dialog.querySelectorAll('[data-fw-tab]').forEach((b) => { b.classList.toggle('active', b.dataset.fwTab === state.tab); b.disabled = state.view === 'ask' || state.view === 'reel'; });
  }

  // ---- 画面 ----
  function render() {
    if (!state.data) return;
    head();
    if (state.view === 'ask' || state.view === 'reel' || state.view === 'catch') return;
    if (state.tab === 'dex') return renderDex();
    if (state.tab === 'bag') return renderBag();
    return renderZone();
  }

  function renderZone() {
    const z = zoneOf();
    const c = state.data.counts?.[state.zone] || { have: 0, total: 0 };
    body.innerHTML = `<div class="fw-zone" style="--zone:${esc(z.color || '#78C882')}">
      <div class="fw-zone-card">
        <div class="fw-zone-stars">${esc(z.stars)}</div>
        <h3 class="fw-learn" translate="no">${esc(z.en)} <small>${esc(z.ja)}</small></h3>
        <p class="fw-sub">${isJa() ? esc(z.grade) : esc(z.gradeEn)} · <span data-t="ずかん">ずかん</span> ${c.have} / ${c.total}</p>
        <button type="button" class="primary fw-cast"><b class="en">🎣 Cast!</b><i class="ja">🎣 さおを なげる</i></button>
        <p class="fw-fine" data-t="えいごに こたえると さかなが かかるよ。まちがえても もういちど。">えいごに こたえると さかなが かかるよ。まちがえても もういちど。</p>
      </div>
      <ul class="fw-howto">
        <li><i>1</i>📝 <span data-t="もんだいに こたえる">もんだいに こたえる</span></li>
        <li><i>2</i>🎯 <span data-t="バーが まんなかで ストップ！">バーが まんなかで ストップ！</span></li>
        <li><i>3</i>🐟 <span data-t="さかなを ゲット・ずかんに とうろく">さかなを ゲット・ずかんに とうろく</span></li>
      </ul></div>`;
    $('.fw-cast', body).onclick = () => { send('fw:cast', { spot: state.spot }); };
  }

  function card(f, extra = '') {
    return `<div class="fw-fish ${f.have === false ? 'unknown' : ''}" style="--c:${esc(f.color)}"><span class="fw-emoji">${f.have === false ? '❔' : esc(f.emoji)}</span>
      <b class="fw-learn" translate="no">${f.have === false ? '???' : esc(f.en)}</b><small class="fw-learn" translate="no">${f.have === false ? '' : esc(f.ja)}</small><span class="fw-stars">${esc(f.stars)}</span>${extra}</div>`;
  }

  function renderDex() {
    const d = state.data;
    const z = (n) => d.zones.find((x) => x.zone === n);
    body.innerHTML = `<div class="fw-dexhead">${[1, 2, 3].map((n) => `<span><b>${esc(z(n).stars)} ${esc(z(n).en)}</b> ${d.counts[n].have}/${d.counts[n].total}</span>`).join('')}</div>
      ${[1, 2, 3].map((n) => `<h3 class="fw-h3">${esc(z(n).stars)} <span class="fw-learn" translate="no">${esc(z(n).en)}</span> <small>${esc(z(n).ja)}</small></h3><div class="fw-grid">${d.dex.filter((f) => f.zone === n).map((f) => card(f)).join('')}</div>`).join('')}
      <p class="fw-fine" data-t="はじめての さかなは ずかんに とうろく ＋10 コイン。">はじめての さかなは ずかんに とうろく ＋10 コイン。</p>`;
  }

  function renderBag() {
    const d = state.data;
    body.innerHTML = `<div class="fw-bagtop"><p><span data-t="もっている さかな">もっている さかな</span> <b>${d.bag.reduce((s, f) => s + f.n, 0)}</b> · <span data-t="ぜんぶ うると">ぜんぶ うると</span> <b class="fw-price">◈ ${d.bagValue}</b></p>
      <button type="button" class="primary fw-sellall" ${d.bag.length ? '' : 'disabled'}><b class="en">Sell all · ◈ ${d.bagValue}</b><i class="ja">ぜんぶ うる · ◈ ${d.bagValue}</i></button></div>
      <div class="fw-grid">${d.bag.map((f) => card({ ...f, have: true }, `<em>×${f.n}</em><button type="button" class="fw-sell" data-en="${esc(f.en)}">◈ ${f.sell} <span data-t="うる">うる</span></button>`)).join('') || `<p class="fw-fine" data-t="まだ さかなは ありません。さおを なげよう！">まだ さかなは ありません。さおを なげよう！</p>`}</div>
      <p class="fw-fine" data-t="うっても ずかんには のこります。">うっても ずかんには のこります。</p>`;
    $('.fw-sellall', body).onclick = () => send('fw:sell', { spot: state.spot, all: true });
    body.querySelectorAll('.fw-sell').forEach((b) => { b.onclick = () => send('fw:sell', { spot: state.spot, en: b.dataset.en }); });
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
      setTimeout(() => renderReel(), 1100);
    } else if (m.escaped) {
      setTimeout(() => { toast(tr('さかなは にげて いきました…')); state.view = 'zone'; state.ctl?.destroy?.(); state.ctl = null; render(); }, 2600);
    } else if (m.format) {
      // 同じ問題を、同じ形式で、もう一度。type は「さいしょの もじ」のヒントつき。
      setTimeout(() => renderAsk({ ...state.ask, attempt: 2, format: m.format }), 1600);
    }
  }

  // ---- タイミングバー ----
  function renderReel() {
    state.view = 'reel';
    head();
    body.innerHTML = `<div class="fw-reel">
      <h3><b class="en">Reel it in!</b><i class="ja">まんなかで ストップ！</i></h3>
      <div class="fw-bar"><span class="fw-nice"></span><span class="fw-perfect"></span><i class="fw-marker"></i></div>
      <button type="button" class="primary fw-stop"><b class="en">🎣 STOP!</b><i class="ja">🎣 ストップ！</i></button>
      <p class="fw-fine" data-t="まんなかの みどりで とめると レアな さかなが きやすい。">まんなかの みどりで とめると レアな さかなが きやすい。</p></div>`;
    const marker = $('.fw-marker', body);
    let t0 = performance.now(); let pos = 0; let dir = 1; let raf = 0;
    const SPEED = 1.15; // full sweeps per second
    const tick = (now) => {
      const dt = (now - t0) / 1000; t0 = now;
      pos += dir * dt * SPEED * 2;
      if (pos > 1) { pos = 2 - pos; dir = -1; } else if (pos < 0) { pos = -pos; dir = 1; }
      marker.style.left = `${pos * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const stop = () => {
      cancelAnimationFrame(raf);
      state.timing = null;
      const d = Math.abs(pos - 0.5);
      const grade = d <= 0.08 ? 'perfect' : d <= 0.2 ? 'nice' : 'ok';
      $('.fw-stop', body).disabled = true;
      $('.fw-stop', body).innerHTML = `<b>${GRADE_JA[grade][0]}</b><small>${GRADE_JA[grade][1]}</small>`;
      send('fw:reel', { grade });
    };
    $('.fw-stop', body).onclick = stop;
    state.timing = { stop: () => cancelAnimationFrame(raf), key: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } } };
    window.addEventListener('keydown', state.timing.key);
  }
  function stopTiming() { if (state.timing) { state.timing.stop(); window.removeEventListener('keydown', state.timing.key); state.timing = null; } }

  function onCatch(m) {
    stopTiming();
    state.view = 'catch';
    const f = m.fish;
    head();
    body.innerHTML = `<div class="fw-catch" style="--c:${esc(f.color)}">
      <div class="fw-catch-label"><b>${esc(f.label?.en || 'GET!')}</b><small>${esc(f.label?.ja || 'ゲット！')}</small></div>
      <div class="fw-catch-fish"><span class="fw-emoji">${esc(f.emoji)}</span><b class="fw-learn" translate="no">${esc(f.en)}</b><small class="fw-learn" translate="no">${esc(f.ja)}</small><span class="fw-stars">${esc(f.stars)}</span></div>
      <p class="fw-sub">${GRADE_JA[m.grade]?.[isJa() ? 1 : 0] || ''}${m.first ? ` · <b class="fw-new">${isJa() ? 'ずかんに とうろく！' : 'New in your Fish Dex!'} +${m.coins}</b>` : ''}${f.kind === 'treasure' ? ` · ${isJa() ? 'おたから！' : 'Treasure!'}` : ''}</p>
      <div class="fw-actions"><button type="button" class="primary fw-again"><b class="en">🎣 Again</b><i class="ja">🎣 もう いっかい</i></button><button type="button" class="fw-todex"><b class="en">📖 Fish Dex</b><i class="ja">📖 ずかん</i></button></div></div>`;
    confetti($('.fw-catch', body));
    if (speak) speak(f.en, { japanese: false, rate: 0.85 });
    $('.fw-again', body).onclick = () => { state.view = 'zone'; send('fw:cast', { spot: state.spot }); };
    $('.fw-todex', body).onclick = () => { state.view = 'zone'; state.tab = 'dex'; render(); };
  }

  // ---- 部屋からの返事 ----
  function onState(m) {
    state.data = m;
    if (m.zone) state.zone = m.zone;
    if (m.spot) state.spot = m.spot;
    $('#fw-coins', dialog).textContent = (m.wallet?.coins ?? 0).toLocaleString();
    if (!dialog.open) dialog.showModal();
    if (state.view === 'zone') render(); else head();
  }
  function onAsk(m) { if (!dialog.open) dialog.showModal(); renderAsk(m); }
  function onCaught(m) { state.data = { ...state.data, ...m }; $('#fw-coins', dialog).textContent = (m.wallet?.coins ?? state.data?.wallet?.coins ?? 0).toLocaleString(); onCatch(m); }
  function onSold(m) { state.data = { ...state.data, ...m }; $('#fw-coins', dialog).textContent = (m.wallet?.coins ?? 0).toLocaleString(); toast(tr('◈ {n} コインに なりました！', { n: m.coins })); render(); }
  function onError(m) {
    const why = { 'too far': 'こやの 入口に たってね。', 'no question': 'さおを なげなおそう。', 'nothing on the line': 'さおを なげなおそう。', 'nothing to sell': 'うる さかなが ないよ。', 'too fast': 'ちょっと まってね。' }[m.reason] || m.reason;
    toast(tr(why));
    if (m.reason === 'too far') close();
  }

  onLangChange(() => { if (dialog.open && (state.view === 'zone' || state.view === 'catch')) render(); });

  return { enter, close, onState, onAsk, onResult, onCatch: onCaught, onSold, onError, get isOpen() { return dialog.open; }, state };
}
