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

// ホーム画面に 追加（2026-11：「ボタンを おすと、ホーム画面にも 追加できるように」）。
// Chrome・Edge（Android・パソコン）は ブラウザが じぶんで「インストール」の 画面を 出せる（beforeinstallprompt）。
// とって おいて、ボタンを おした ときに 出す。出せない ブラウザ（Safari・まだ 条件が そろって いない とき）は やりかたの 案内。
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });
addEventListener('appinstalled', () => { installEvent = null; });
const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const kind = () => (apple ? 'ios' : /Android/.test(ua) ? 'android' : 'pc');
// パソコン（Windows の Chrome・Edge）で「インストール」を おすと、デスクトップと スタートメニューに アイコンが できる
// （Edge は その あとの 画面で「デスクトップに ショートカット」を えらぶ）。ページから じかに デスクトップへ 置く 方法は ない。
// **全画面と いっしょに 出すと ことわられる**：全画面は タップ 1 回ぶんの「ゆるし」を つかって しまい、つぎの prompt() は
// 「ユーザーの 操作では ない」で 何も 出ない。だから 出せる ときは インストールを 先に して、全画面は その タップでは たのまない
// （インストールした アプリは じぶんの まどで ひらく。出さなかった ときは つぎの タップで 全画面に なる）。
const canPrompt = () => !installed && !!installEvent;
function prompt() {
  const e = installEvent; installEvent = null;
  try {
    const p = e.prompt();
    if (p && p.catch) p.catch(() => showInstallHint(kind()));
  } catch { showInstallHint(kind()); }
}
const isButton = (t) => !!t?.closest?.('#fs-button, [data-fs-button]');

// ボタンを おしたとき：インストールの 画面を 出せる ときは それ。出せない ときは 全画面に して、やりかたの 案内。
// パソコンで ブラウザが インストールの 画面を 出せない とき（もう インストール ずみ・まだ 条件が そろわない・Firefox など）は、
// 全画面に するだけ。やりかたの 案内は この ブラウザで 1 回だけ（2026-11：「パソコンでも これ 出てきた」。毎回 ゲームの 上に かぶさって じゃま）。
const PC_HINT_KEY = 'uspeak-pc-install-hint-v1';
function pcHintOnce() {
  try { if (localStorage.getItem(PC_HINT_KEY)) return; localStorage.setItem(PC_HINT_KEY, '1'); } catch { return; }
  showInstallHint('pc');
}
function press() {
  if (installed) return;
  if (canPrompt()) { prompt(); return; }
  if (request) goFullscreen();
  if (kind() === 'pc') pcHintOnce(); else showInstallHint(kind());
}

if (installed) lockSideways();

if (offer) {
  // さいしょの タップ（アカウント作成・サインイン）と、ぬけた あとの つぎの タップで 全画面に。
  // ボタンの 上の タップは ここで 全画面に しない（インストールの 画面を 先に 出すため。press() が きめる）。
  const tap = (e) => { if (canPrompt() && isButton(e.target)) return; goFullscreen(); };
  if (request) for (const type of ['pointerup', 'touchend', 'keydown']) document.addEventListener(type, tap, true);

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
