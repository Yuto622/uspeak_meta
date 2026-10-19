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

// スマホは さいしょに さわった とき、だまって 全画面に する（ブラウザの バーを 消す）。
// 全画面は「指で さわった」あとでないと ブラウザが みとめないので、1 回目の タッチで たのむ。
// 一度 じぶんで ぬけた 子には もう たのまない（もどるたびに 全画面に されると こまる）。
// iPhone は Apple が ページの 全画面を みとめていない（requestFullscreen が ない）ので 何も しない
// ＝ iPhone は ホーム画面の アイコン（PWA）から ひらくと バーが 出ない。iPad・パソコンも 何も しない。
const root = document.documentElement;
const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 500;
const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
if (phone && !installed && root.requestFullscreen) {
  const ask = () => {
    removeEventListener('pointerup', ask, true);
    removeEventListener('touchend', ask, true);
    if (document.fullscreenElement) return;
    root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  };
  addEventListener('pointerup', ask, true);
  addEventListener('touchend', ask, true);
}
