// iPhone で ブラウザの まま あそんでいる 子に、1 回だけ「ホーム画面に 追加すると 全画面」を 出す。
// iPhone には ページを 全画面に する しくみが ない（Apple が みとめていない）ので、ホーム画面の アイコン（PWA）が ただ 1 つの 道。
// iPad・Android・パソコン・アイコンから ひらいた ときは 出さない。出したら 二度と 出さない（`uspeak-ios-a2hs-v1`）。
import { applyDom } from './i18n.js';

const KEY = 'uspeak-ios-a2hs-v1';
const iphone = /iPhone|iPod/.test(navigator.userAgent);
const installed = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
let seen = true;
try { seen = !!localStorage.getItem(KEY); } catch { /* private mode: 出さない */ }

const SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

function show() {
  const box = document.createElement('div');
  box.id = 'install-hint';
  box.setAttribute('role', 'dialog');
  box.innerHTML = `<div class="ih-card">
    <div class="ih-head"><img src="assets/app/icon-192.png" alt="" width="44" height="44"><div>
      <b data-t="ホーム画面に ついかすると、ぜんがめんで あそべるよ">ホーム画面に ついかすると、ぜんがめんで あそべるよ</b>
      <small data-t="つぎから アイコンを おすだけで ひらけるよ。">つぎから アイコンを おすだけで ひらけるよ。</small></div></div>
    <ol class="ih-steps">
      <li><span class="ih-ic">${SHARE}</span><span><b data-t="「きょうゆう」ボタンを おす">「きょうゆう」ボタンを おす</b><small data-t="みつからない ときは「•••」の なか">みつからない ときは「•••」の なか</small></span></li>
      <li><span class="ih-ic">${PLUS}</span><b data-t="「ホーム画面に追加」を おす">「ホーム画面に追加」を おす</b></li>
      <li><span class="ih-ic ih-add" data-t="追加">追加</span><b data-t="みぎうえの「追加」を おす">みぎうえの「追加」を おす</b></li>
    </ol>
    <button type="button" class="ih-ok" data-t="わかった">わかった</button></div>`;
  applyDom(box);
  box.querySelector('.ih-ok').onclick = () => box.remove();
  document.body.append(box);
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
}

// 島に 入って 少し あそんでから（画面が 何も 開いていない とき）。読みこみ中・ダイアログ中・別ゲーム中は まつ。
if (iphone && !installed && !seen) {
  let calm = 0;
  const timer = setInterval(() => {
    const busy = document.getElementById('loading') || document.querySelector('dialog[open]')
      || document.body.dataset.main || document.body.dataset.arcade || document.body.dataset.race || document.body.dataset.gp;
    calm = busy ? 0 : calm + 1;
    if (calm >= 10) { clearInterval(timer); show(); }
  }, 1000);
}
