// 島に ついたら すぐ 出る「どれに する？」（2026-11）。しまの ちず（Choose a World）と 同じ 形の 大きな カード。
// ミニゲーム島＝どっちの ゲーム、英会話島＝どの 家。とじれば 島を 歩ける（家に 入れば いつもどおり ひらく）。
// 文字は 英語・日本語を 両方 書く（CSS が えらぶ＝辞書に 入れない）。カードは { icon, en, ja, subEn, subJa, color?, tag?, value }。
export function createIslandPick() {
  const dialog = document.createElement('dialog');
  dialog.id = 'mini-pick';
  dialog.setAttribute('translate', 'no');
  document.body.append(dialog);
  const close = () => { if (dialog.open) dialog.close(); };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const both = (en, ja) => `<b class="en">${esc(en || ja)}</b><i class="ja">${esc(ja || en)}</i>`;
  function show({ title, cards, onPick }) {
    if (dialog.open || document.querySelector('dialog[open]')) return false;
    dialog.dataset.count = String(cards.length);
    dialog.innerHTML = `
      <button type="button" class="mp-close" aria-label="とじる">✕</button>
      <h2>${both(title.en, title.ja)}</h2>
      <div class="mp-cards">${cards.map((c, i) => `<button type="button" class="mp-card ${esc(c.cls || '')}" data-i="${i}" ${c.color ? `style="--c:${esc(c.color)}"` : ''}>${c.tag ? `<span class="mp-tag">${esc(c.tag)}</span>` : ''}<em aria-hidden="true">${esc(c.icon || '✨')}</em><strong>${both(c.en, c.ja)}</strong><small>${both(c.subEn, c.subJa)}</small></button>`).join('')}</div>
      <button type="button" class="mp-walk">${both('Walk around the island', 'しまを あるく')}</button>`;
    dialog.querySelector('.mp-close').onclick = close;
    dialog.querySelector('.mp-walk').onclick = close;
    dialog.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { close(); onPick(cards[Number(b.dataset.i)]); }; });
    dialog.showModal();
    return true;
  }
  return { show, close, get isOpen() { return dialog.open; } };
}
