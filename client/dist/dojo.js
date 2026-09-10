// おさかな道場 — teach yourself a move by feeding a fish.
//
// The fish is spent and the move replaces whatever you knew, so this is a trade, not a
// free upgrade. Which move a fish teaches is the server's to say; this screen shows the
// bag and sends an id.
import { FISH_BY_ID } from './fishing-data.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createDojoUI({ send, toast, isOnline, getWallet, getMove }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'dojo-dialog';
  dialog.setAttribute('aria-labelledby', 'dojo-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">FISH DOJO</span><h2 id="dojo-title">おさかな道場</h2></div>
      <button type="button" id="dojo-close" aria-label="閉じる">×</button>
    </div><div id="dojo-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#dojo-body', dialog);

  function render(learned = null) {
    const wallet = getWallet() || { inventory: {} };
    const move = getMove();
    const bag = Object.entries(wallet.inventory || {})
      .map(([id, n]) => ({ fish: FISH_BY_ID[id], n }))
      .filter((e) => e.fish)
      .sort((a, b) => b.fish.rarity - a.fish.rarity || b.fish.price - a.fish.price);

    body().innerHTML = `${learned ? `<div class="dojo-learned">
        <strong>${esc(learned.move.name)} を おぼえた！</strong>
        <span>${esc(learned.move.fishName)} から · ダメージ ${learned.move.damage}</span>
        ${learned.forgot ? `<small>${esc(learned.forgot.name)} は わすれました</small>` : ''}
      </div>` : ''}
      <p class="dojo-now">${move
        ? `いまの とくいわざ： <b>${esc(move.name)}</b>（ダメージ ${move.damage}）`
        : 'とくいわざは まだ ありません。'}</p>
      <p class="quiz-hut">おさかなを 1ぴき たべさせると、その子の わざを おぼえます。まえの わざは わすれます。</p>
      ${bag.length ? `<div class="dojo-bag">${bag.map(({ fish, n }) => `<button type="button" data-fish="${esc(fish.id)}">
          <strong>${esc(fish.name)}</strong>
          <small>${esc(fish.word)} · ${['ふつう', 'すこしレア', 'レア', 'とてもレア', 'でんせつ'][fish.rarity] || ''}</small>
          <span>×${n}</span></button>`).join('')}</div>`
        : '<p class="dojo-empty">カバンに おさかなが いません。ウィローとうで つってきてね。</p>'}
      <div class="quiz-actions"><button type="button" id="dojo-done">とじる</button></div>`;

    body().querySelectorAll('[data-fish]').forEach((b) => {
      b.onclick = () => {
        body().querySelectorAll('[data-fish]').forEach((x) => { x.disabled = true; });
        send('fish:feed', { id: b.dataset.fish });
      };
    });
    $('#dojo-done', dialog).onclick = close;
  }

  function open() { if (!dialog.open) dialog.showModal(); render(); }
  function close() { dialog.close(); }

  $('#dojo-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  return {
    label(spot) { return `${spot.tone} ${spot.name}`; },
    enter() {
      if (!isOnline()) { toast('道場は クラスに入っているときだけ 使えます。'); return; }
      open();
    },
    onLearned(m) { if (dialog.open) render(m); toast(`${m.move.name} を おぼえた！`); },
    onError(m) {
      if (m?.reason === 'too far') { toast('おさかな道場まで あるいて行こう。'); close(); return; }
      toast({ 'no fish': 'その おさかなを もっていません。', 'unknown fish': 'その おさかなは わかりません。' }[m?.reason] || 'うまくいきませんでした。');
      if (dialog.open) render();
    },
  };
}
