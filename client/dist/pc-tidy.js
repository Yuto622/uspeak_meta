// パソコン（マウス・タッチパッド・幅 1001px 以上）だけ：右がわを 1 つの 列に まとめる（見た目は pc-tidy.css）。
// .top-dock（net-client.js が つくる）は オンラインに なってから できるので、できるまで まつ。
// .pc-ui は index.html が つける（タッチ画面の パソコンも パソコン あつかい）。
const wide = matchMedia('(min-width: 1001px)');
const pc = { get matches() { return document.documentElement.classList.contains('pc-ui') && wide.matches; }, addEventListener: (t, f) => wide.addEventListener?.(t, f) };
const rail = document.querySelector('.right-rail');
if (rail) {
  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'pc-view-toggle';
  view.dataset.t = '⚙ みえかた（ひるま・カメラ・え）';
  view.textContent = '⚙ みえかた（ひるま・カメラ・え）';
  view.setAttribute('aria-expanded', 'false');
  view.onclick = () => { const on = document.body.classList.toggle('pc-view-open'); view.setAttribute('aria-expanded', String(on)); };
  rail.append(view);
  const tidy = () => {
    rail.classList.toggle('pc-tidy', pc.matches);
    const dock = document.querySelector('main > .top-dock');
    if (dock && pc.matches) rail.querySelector('.map-panel')?.after(dock);
  };
  tidy();
  pc.addEventListener?.('change', tidy);
  // .top-dock は 入室の あとに できる
  const watch = new MutationObserver(() => { if (document.querySelector('main > .top-dock')) tidy(); });
  const main = document.querySelector('main');
  if (main) watch.observe(main, { childList: true });
}
// WASD の ヒントは うごいたら（または 20 秒で）きえる
const moved = () => document.body.classList.add('pc-moved');
addEventListener('keydown', (e) => { if (/^(w|a|s|d|arrow)/i.test(e.key)) moved(); }, { passive: true });
setTimeout(moved, 20000);
