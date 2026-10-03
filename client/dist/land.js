// 土地島の画面 — the estate office (buy the next island), and the board of everyone's.
//
// The office shows the six islands as cards from land.json — the one a child has, the
// next one with its price, the rest to look forward to — and one button. Buying is two
// taps on purpose ("この しまに する？ ◈ 600" and then yes): nothing a child only looks
// at costs anything. The price on the button is read from the same file the room
// charges from, so the two cannot disagree; the charge itself only ever happens there.
import { t as tr, isJa, onLangChange } from './i18n.js';
import { loadLandData } from './land-island.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createLandUI({ send, toast, isOnline, world }) {
  const state = { mode: 'office', land: null, coins: 0, board: null, confirm: false, busy: false };
  let data = null;
  loadLandData().then((d) => { data = d; if (dialog.open) render(); });

  const dialog = document.createElement('dialog');
  dialog.id = 'land-dialog';
  dialog.setAttribute('aria-labelledby', 'land-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">LAND ISLAND</span><h2 id="land-title">土地島</h2></div>
      <span class="land-coins">◈ <b id="land-coins">0</b></span>
      <button type="button" id="land-close" aria-label="閉じる">×</button>
    </div><div id="land-body"></div>`;
  document.body.append(dialog);
  const close = () => { try { dialog.close(); } catch { /* already closed */ } };
  $('#land-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dialog.addEventListener('keydown', (e) => e.stopPropagation());

  const tierName = (t) => (isJa() ? t.name : t.en);

  function render() {
    if (!dialog.open) return;
    $('#land-coins', dialog).textContent = state.coins;
    $('#land-title', dialog).textContent = state.mode === 'board' ? tr('みんなの しま') : tr('しまの ふどうさん');
    const body = $('#land-body', dialog);
    if (state.mode === 'board') { body.innerHTML = renderBoard(); return; }
    const L = state.land;
    if (!L || !data) { body.innerHTML = `<p class="land-note">${tr('よみこんで います…')}</p>`; return; }
    const mine = L.tier;
    body.innerHTML = `<p class="land-lead">${mine ? tr('いまの しまは {name}。つぎの しまに ひっこせるよ。', { name: `<b>${esc(tierName(L.island))}</b>` }) : tr('じぶんだけの しまを かおう。まずは すなはまの しまから。')}</p>
      <div class="land-tiers">${L.tiers.map((t) => {
        const owned = t.tier <= mine; const next = L.next && t.tier === L.next.tier; const can = next && state.coins >= t.price;
        return `<div class="land-card ${owned ? 'owned' : ''} ${next ? 'next' : ''} ${t.tier === mine ? 'mine' : ''}" data-theme="${esc(t.theme)}">
          <span class="land-emoji" translate="no">${esc(t.emoji)}</span>
          <b>${esc(tierName(t))}</b><small>${esc(isJa() ? t.ja : t.blurb)}</small>
          <span class="land-price">${owned ? (t.tier === mine ? `✔ ${tr('いまの しま')}` : `✔ ${tr('かった')}`) : `◈ ${t.price}`}</span>
          ${next ? (state.confirm
            ? `<div class="land-row"><button type="button" class="primary" data-buy="${t.tier}" ${state.busy ? 'disabled' : ''}>${tr('はい、かう！')}</button><button type="button" data-cancel="1">${tr('やめる')}</button></div>`
            : `<button type="button" class="primary" data-ask="${t.tier}" ${can ? '' : 'disabled'}>${can ? tr('この しまに する') : tr('あと {n} コイン', { n: t.price - state.coins })}</button>`) : ''}
          ${!owned && !next ? `<span class="land-lock">🔒 ${tr('まえの しまの つぎ')}</span>` : ''}
        </div>`;
      }).join('')}</div>
      <p class="land-note">${tr('しまは じゅんばんに かう。かった しまは ⛵ の いえから いけるよ。えいごの もんだいや コインの もらいかたは かわらない。')}</p>`;
  }

  function renderBoard() {
    const b = state.board;
    if (!b || !data) return `<p class="land-note">${tr('よみこんで います…')}</p>`;
    const tierOf = (n) => data.tiers.find((t) => t.tier === n) || null;
    return `<p class="land-lead">${tr('クラスの {n}人が しまを もっています。', { n: b.owners })}</p>
      <ul class="land-board">${b.rows.map((r) => { const t = tierOf(r.tier); return `<li class="${r.name === b.me.name ? 'me' : ''}"><span class="land-emoji" translate="no">${t ? esc(t.emoji) : '🌊'}</span><b>${esc(r.name)}</b><span>${t ? esc(tierName(t)) : tr('まだ')}</span></li>`; }).join('')}</ul>
      <p class="land-note">${tr('なまえの じゅん。しまは じまんの ために あるので、ならべかえは しない。')}</p>`;
  }

  dialog.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.ask) { state.confirm = true; render(); return; }
    if (b.dataset.cancel) { state.confirm = false; render(); return; }
    if (b.dataset.buy) { state.busy = true; render(); send('land:buy', {}); }
  });
  onLangChange(() => { if (dialog.open) render(); });

  // ---- the doorways -----------------------------------------------------------------
  function label(spot) {
    if (spot.kind === 'office') return tr('しまを かう');
    if (spot.kind === 'ferry') return tr('じぶんの しまへ');
    if (spot.kind === 'board') return tr('みんなの しまを 見る');
    return tr('{who} と 話す', { who: spot.character || '' });
  }

  function enter(spot) {
    if (!isOnline()) { toast(tr('土地島は オンラインで あそべます。クラスに 入ってね。')); return false; }
    if (spot.kind === 'ferry') { send('land:enter', {}); return true; }
    state.mode = spot.kind === 'board' ? 'board' : 'office';
    state.confirm = false; state.busy = false;
    if (!dialog.open) dialog.showModal();
    render();
    send(spot.kind === 'board' ? 'land:board' : 'land:open', {});
    return true;
  }

  // ---- the room's answers -------------------------------------------------------------
  function onState(m) { state.land = m; if (m.wallet) state.coins = m.wallet.coins; state.busy = false; render(); }
  function onBought(m) {
    state.land = m; if (m.wallet) state.coins = m.wallet.coins; state.busy = false; state.confirm = false;
    render();
    toast(tr('{emoji} {name}を かった！ ⛵ の いえから いこう。', { emoji: m.island?.emoji || '', name: tierName(m.island || { name: '', en: '' }) }));
  }
  function onBoard(m) { state.board = m; render(); }
  function onIsland(m) { close(); world.enter(m); }
  function onError(m) {
    state.busy = false;
    const said = {
      'too far': tr('その たてものの いりぐちで やろう。'), 'not enough coins': tr('コインが たりない。'), 'biggest already': tr('もう いちばん おおきな しま！'),
      'no island': tr('まだ しまを もっていない。ふどうさんで かおう。'),
    }[m?.reason];
    if (said) toast(said);
    render();
  }

  return { state, dialog, label, enter, onState, onBought, onBoard, onIsland, onError, close };
}
