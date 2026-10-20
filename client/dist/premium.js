// ⭐ プレミアムの おしらせ：🔒 の 島（や お店）を おすと、「ひらくと こんな ことが できるよ」を 写真つきで 見せる。
// 入れるか どうかは 部屋が 決める（admin の 名簿の「プレミアム」）。ここは 見せるだけ。
// どこからでも `uspeak:premium`（detail: 島の id）を 投げれば ひらく（rpg.js の しまの ちず・main-island.js の お店）。
import { t as tr, applyDom } from './i18n.js';

const G = 'assets/guide/';
const PROMO = {
  conv: {
    icon: '🗣', title: 'えいかいわじま', en: 'Conversation Island',
    shots: ['island-conv.jpg', 'screen-convtalk.jpg'],
    points: ['ウーピーと えいごで おしゃべり', 'カフェ・おかいもの など 4つの ばめん', 'できた ことが ふえると コインと XP'],
  },
  talk: {
    icon: '💬', title: 'みんなで はなす しま', en: 'Talk Island',
    shots: ['island-talk.jpg', 'screen-talk.jpg'],
    points: ['クラスの みんなと かおを みて はなせる', 'せんせいと いっしょの ビデオつうわ', 'えらんだ フレーズでも はなせる'],
  },
  eiken: {
    icon: '📗', title: 'えいけんの しま（5・4・3きゅう）', en: 'Eiken Islands',
    shots: ['island-eiken5.jpg', 'screen-interview.jpg'],
    points: ['よむ・きく・かく・はなす の 4つの やかた', 'めんせつの れんしゅう（ウーピーが しけんかん）', 'ごうかくの めやすが マイページで わかる'],
  },
  talkshops: {
    icon: '🛍', title: 'えいかいわの おみせ', en: 'Talk shops',
    shots: ['screen-convtalk.jpg', 'main-3d.jpg'],
    points: ['ほんや・ピザや・バーガーや など 5けん', 'おみせの ひとと えいごで やりとり', 'ちゅうもんや かいものを えいごで できる'],
  },
};
const keyOf = (id) => (/^eiken/.test(id) ? 'eiken' : id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createPremiumPromo({ offline = () => false } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'premium-dialog';
  dialog.setAttribute('aria-labelledby', 'premium-title');
  document.body.append(dialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-premium-close]')) dialog.close(); });

  function open(id) {
    const p = PROMO[keyOf(id)];
    if (!p) return false;
    dialog.innerHTML = `<div class="pr-card">
      <div class="pr-top"><span class="pr-badge">⭐ ${esc(tr('プレミアム'))}</span>
        <button type="button" class="pr-x" data-premium-close aria-label="${esc(tr('とじる'))}">×</button></div>
      <h2 id="premium-title"><span aria-hidden="true">${p.icon}</span> ${esc(tr(p.title))}</h2>
      <p class="pr-lead">${esc(tr('プレミアムに すると、こんな ことが できるよ！'))}</p>
      <div class="pr-shots">${p.shots.map((s) => `<img src="${G}${s}" alt="" loading="lazy" decoding="async">`).join('')}</div>
      <ul class="pr-points">${p.points.map((x) => `<li>✨ ${esc(tr(x))}</li>`).join('')}</ul>
      <p class="pr-ask">🔒 ${esc(offline() ? tr('プレミアムの しまは クラスに はいって いる ときだけ 行けるよ。') : tr('おうちの ひとか せんせいに「プレミアムに したい」と はなしてね。'))}</p>
      <button type="button" class="pr-ok" data-premium-close>${esc(tr('わかった'))}</button>
    </div>`;
    applyDom(dialog);
    if (!dialog.open) dialog.showModal();
    return true;
  }
  addEventListener('uspeak:premium', (e) => open(e.detail));
  return { open, get isOpen() { return dialog.open; } };
}
