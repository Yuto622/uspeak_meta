// スマホの 横もち だけ：上の バーの ボタンを「⋯」に しまう（見た目は mobile.css の 12）。
// iPad・パソコンでは ⋯ は 出ない（CSS が 出さない）ので、ここは 開け閉め だけ。
const stats = document.querySelector('header .stats');
if (stats) {
  const more = document.createElement('button');
  more.type = 'button';
  more.id = 'more-button';
  more.className = 'more-button';
  more.textContent = '⋯';
  more.setAttribute('aria-label', 'ほかの ボタン');
  more.dataset.tLabel = 'ほかの ボタン';
  more.setAttribute('aria-expanded', 'false');
  stats.append(more);
  const set = (on) => {
    if (on) document.body.dataset.more = '1'; else delete document.body.dataset.more;
    more.setAttribute('aria-expanded', String(on));
  };
  more.addEventListener('click', (e) => { e.stopPropagation(); set(!document.body.dataset.more); });
  // しまった ボタンを 押したら 閉じる。ほかの ところを さわっても 閉じる。
  stats.addEventListener('click', (e) => { if (e.target !== more && e.target.closest('button')) set(false); });
  document.addEventListener('pointerdown', (e) => { if (document.body.dataset.more && !stats.contains(e.target)) set(false); });
}

// 全画面（ブラウザの バーを 消す）と 横の 固定は fullscreen.js（ボタンと、さわった ときに たのむ ところ）。
const root = document.documentElement;
const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 500;

// **スマホは いつも 横で あそぶ。** 向きを 固定 できない 端末（iPhone は Apple が みとめていない）では、
// 縦に もっている 間 画面を かくして「よこに してね」だけ 出す（mobile.css の 17。`html.sideways-only`）。
// 自動の 検査（Playwright＝navigator.webdriver）と `?portrait=1` では 出さない（縦の レイアウト検査が ある）。
if (phone && !navigator.webdriver && !/[?&]portrait=1\b/.test(location.search)) root.classList.add('sideways-only');

// スマホの 横もち だけ：右の 列（🏠 ✈ 🎣 📖 📹 🏆）を「☰」1 つに しまう（mobile.css の 14）。
// 押すと 右に ならび、どれかを 押すか ほかを さわると しまう。
const railBtn = document.createElement('button');
railBtn.type = 'button';
railBtn.id = 'rail-toggle';
railBtn.className = 'rail-toggle';
railBtn.textContent = '☰';
railBtn.setAttribute('aria-label', 'しまの メニュー');
railBtn.dataset.tLabel = 'しまの メニュー';
railBtn.setAttribute('aria-expanded', 'false');
const rail = document.querySelector('.right-rail');
(rail || document.body).append(railBtn);
const setRail = (on) => {
  if (on) document.body.dataset.rail = '1'; else delete document.body.dataset.rail;
  railBtn.setAttribute('aria-expanded', String(on));
  railBtn.textContent = on ? '✕' : '☰';
};
railBtn.addEventListener('click', (e) => { e.stopPropagation(); setRail(!document.body.dataset.rail); });
rail?.addEventListener('click', (e) => { const b = e.target.closest('button, a'); if (b && b !== railBtn) setRail(false); });
document.addEventListener('pointerdown', (e) => { if (document.body.dataset.rail && !rail?.contains(e.target) && e.target !== railBtn) setRail(false); });
