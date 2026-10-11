// 下の バーの「2 たんごちょう」。おぼえた ことば（game.js の words）を、うちゅうの カードで 見せる。
//
// カードを おすと うらがえって 日本語、🔊 で 英語を よむ。上で たんご／フレーズ を わけ、さがせる。
// ことばの 中身は 学習の 中身なので 訳さない（translate="no"）。画面の 文字は 英語と 日本語の 2 つ（.en / .ja）。
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
// 1 つの ことばに 1 つの 色（いつ 見ても 同じ 色）。
const hue = (w) => { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const isPhrase = (w) => /\s/.test(w.trim());

export function createWordbook({ getWords, speak, onOpen = () => {} }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'wordbook-dialog';
  dialog.innerHTML = `<div class="wb-sky" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="wb-head">
      <div class="wb-title"><small>WORD COSMOS · YOUR COLLECTION</small><h2>${bi('Word Book', 'たんごちょう')}</h2></div>
      <div class="wb-orbs">
        <span class="wb-orb"><b id="wb-n-all">0</b>${bi('all', 'ぜんぶ')}</span>
        <span class="wb-orb w"><b id="wb-n-word">0</b>${bi('words', 'たんご')}</span>
        <span class="wb-orb p"><b id="wb-n-phrase">0</b>${bi('phrases', 'フレーズ')}</span>
      </div>
      <button type="button" class="wb-x" aria-label="とじる" data-t-label="とじる">✕</button>
    </div>
    <div class="wb-tools">
      <div class="wb-tabs" role="tablist">
        <button type="button" data-tab="all" class="on">${bi('All', 'ぜんぶ')}</button>
        <button type="button" data-tab="word">${bi('Words', 'たんご')}</button>
        <button type="button" data-tab="phrase">${bi('Phrases', 'フレーズ')}</button>
      </div>
      <label class="wb-search"><span aria-hidden="true">🔍</span><input type="search" id="wb-q" autocomplete="off" placeholder="search · さがす"></label>
    </div>
    <p class="wb-hint">${bi('Tap a card to flip it. 🔊 reads it aloud.', 'カードを おすと うらがえるよ。🔊 で よみあげ。')}</p>
    <div class="wb-grid" id="wb-grid"></div>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  const state = { tab: 'all', q: '' };

  function paint() {
    const all = getWords().slice().reverse(); // あたらしい じゅん
    $('#wb-n-all').textContent = all.length;
    $('#wb-n-word').textContent = all.filter(([w]) => !isPhrase(w)).length;
    $('#wb-n-phrase').textContent = all.filter(([w]) => isPhrase(w)).length;
    const q = state.q.trim().toLowerCase();
    const list = all.filter(([w, m]) => (state.tab === 'all' || (state.tab === 'phrase') === isPhrase(w)) && (!q || w.toLowerCase().includes(q) || m.includes(state.q.trim())));
    const grid = $('#wb-grid');
    if (!all.length) { grid.innerHTML = `<div class="wb-empty"><span>🪐</span><p>${bi('Talk to people and answer quizzes — your words will float in here.', '人と はなしたり クイズに こたえたり すると、ここに ことばが ふえて いくよ。')}</p></div>`; return; }
    if (!list.length) { grid.innerHTML = `<div class="wb-empty"><span>🔭</span><p>${bi('Nothing found.', 'みつからないよ。')}</p></div>`; return; }
    grid.innerHTML = list.map(([w, m], i) => `<div class="wb-card${isPhrase(w) ? ' phrase' : ''}" style="--h:${hue(w)};--i:${Math.min(i, 24)}" data-i="${i}">
        <button type="button" class="wb-flip" aria-label="${esc(w)}"><span class="wb-face front"><small>${isPhrase(w) ? 'PHRASE' : 'WORD'}</small><b translate="no">${esc(w)}</b></span>
        <span class="wb-face back"><small translate="no">${esc(w)}</small><b translate="no">${esc(m)}</b></span></button>
        <button type="button" class="wb-say" data-say="${i}" aria-label="よみあげ" data-t-label="よみあげ">🔊</button></div>`).join('');
    grid.querySelectorAll('.wb-flip').forEach((b) => { b.onclick = () => b.parentElement.classList.toggle('flipped'); });
    grid.querySelectorAll('[data-say]').forEach((b) => { b.onclick = () => { speak(list[+b.dataset.say][0]); b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping'); }; });
  }
  dialog.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { state.tab = b.dataset.tab; dialog.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); paint(); }; });
  $('#wb-q').addEventListener('input', (e) => { state.q = e.target.value; paint(); });
  $('.wb-x').onclick = () => dialog.close();
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  return {
    open() { onOpen(); paint(); if (!dialog.open) dialog.showModal(); },
    close() { dialog.close(); },
    refresh() { if (dialog.open) paint(); },
    dialog,
  };
}
