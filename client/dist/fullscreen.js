// 全画面（ブラウザの バーを 消す）。2026-11：アカウントを 作る ときも、サインイン ずみで 全画面に なって いない ときも
// 「ぜんがめんに する」ボタンを 出し、さわったら 全画面に する。ぬけても つぎに さわった ときに もどす。
//
// ・全画面は「指で さわった」あとでないと ブラウザが みとめない。だから 画面の どこを さわっても たのむ。
//   アカウントを 作る（すがた えらび）・ロビーの「クラスに はいる」の 1 タップめで 全画面に なる。
//   **pointerdown では ことわられる**（Chrome は「ユーザーの 操作では ない」と 言う）。ゆびを はなした とき（pointerup・touchend）と キーで たのむ。
// ・iPhone は Apple が ページの 全画面を みとめて いない（requestFullscreen が ない）。ボタンは「ホーム画面に 追加」の 案内を 出す。
// ・ホーム画面の アイコンから ひらいた とき（standalone）は もう バーが ないので 何も 出さない。
// ・自動の 検査（navigator.webdriver）では 出さない（レイアウト検査の 画面を かえない。?fs=1 で 出す）。
import { applyDom } from './i18n.js';
import { showInstallHint } from './install-hint.js';

const root = document.documentElement;
const request = root.requestFullscreen || root.webkitRequestFullscreen;
const ua = navigator.userAgent;
const iphone = /iPhone|iPod/.test(ua);
const installed = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 500;
const testing = navigator.webdriver && !/[?&]fs=1\b/.test(location.search);
const offer = !installed && !testing && (!!request || iphone);

export const isFull = () => installed || !!(document.fullscreenElement || document.webkitFullscreenElement);

// 横で 固定する（Android の Chrome は 全画面か ホーム画面の アイコンの ときだけ みとめる）。
const lockSideways = () => { if (!phone) return; try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* not allowed here */ } };

export function goFullscreen() {
  if (!request || isFull()) return;
  try {
    const p = request.call(root, { navigationUI: 'hide' });
    if (p && p.then) p.then(lockSideways, () => {}); else lockSideways();   // 古い Safari は Promise を かえさない
  } catch { /* ことわられた：つぎの タップで また たのむ */ }
}

// ボタンを おしたとき：全画面に できる 端末は 全画面、iPhone は ホーム画面に 追加の 案内。
function press() { if (request) goFullscreen(); else showInstallHint(); }

if (installed) lockSideways();

if (offer) {
  // さいしょの タップ（アカウント作成・サインイン）と、ぬけた あとの つぎの タップで 全画面に。
  if (request) for (const type of ['pointerup', 'touchend', 'keydown']) document.addEventListener(type, goFullscreen, true);

  // 島の 上の ボタン（サインイン ずみで 全画面で ない とき）。
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'fs-button';
  button.className = 'fs-button';
  button.innerHTML = '<span aria-hidden="true">⛶</span> <span data-t="ぜんがめんに する">ぜんがめんに する</span>';
  button.addEventListener('click', (e) => { e.stopPropagation(); press(); });
  document.body.append(button);
  applyDom(button);

  // アカウントを 作る 画面（すがた えらび）の ボタン。ダイアログは 島の ボタンより 上に 出るので、中にも 置く。
  // 右の ボタンの 列は いっぱいなので、左の すがたの 下に 置く。
  const actions = document.querySelector('#avatar-dialog .avatar-stage');
  if (actions && !document.getElementById('avatar-fs')) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'avatar-fs'; b.className = 'net-fs'; b.dataset.fsButton = '';
    b.innerHTML = '<span aria-hidden="true">⛶</span> <span data-t="ぜんがめんに する">ぜんがめんに する</span>';
    actions.append(b); applyDom(b);
  }

  // ダイアログの 中の ボタン（すがた えらび・ロビー）。ロビーは lobby.js が あとから 建てるので、出るたびに つなぐ。
  const wire = () => {
    const list = [...document.querySelectorAll('[data-fs-button]')];
    for (const b of list) if (!b.dataset.wired) { b.dataset.wired = '1'; b.addEventListener('click', press); }
    return list;
  };

  const paint = () => {
    const full = isFull();
    button.hidden = full || !!document.getElementById('loading');
    for (const b of wire()) b.hidden = full;
  };
  document.addEventListener('fullscreenchange', paint);
  document.addEventListener('webkitfullscreenchange', paint);
  setInterval(paint, 1000);   // 読みこみ画面が きえた・ロビーが できた を ひろう（かるい）
  paint();
}
