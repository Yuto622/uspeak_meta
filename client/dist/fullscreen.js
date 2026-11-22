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
// カードが 待って いる ときは、とどいた ところで［アイコンを つくる］を おせる ように する（ready）。
const ready = new Set();
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; for (const f of [...ready]) f(); });
addEventListener('appinstalled', () => { installEvent = null; });
const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const kind = () => (apple ? 'ios' : /Android/.test(ua) ? 'android' : 'pc');
// 2026-11：「全画面に する を おすと パソコンで インストールしようと する」→ ボタンは **いつも 全画面**。
// インストール（デスクトップ・ホーム画面の アイコン）は べつの えらぶ ことに する：全画面に なった あと、小さな カード
// 「デスクトップに アイコンを つくる？［つくる］［いまは しない］」。［つくる］の タップで ブラウザの インストールの 画面（prompt）を 出す。
// （1 回の タップで 全画面と prompt の 両方は できない：全画面が タップの「ゆるし」を つかって prompt が ことわられる。だから タップを 2 回に わける。）
// 出せる のは Chrome・Edge（パソコン・Android）が beforeinstallprompt を くれた ときだけ。［いまは しない］は 30 日 たつまで 出さない。
// iPhone・iPad は prompt が ないので、いままで どおり やりかたの 案内。パソコンで 出せない とき（もう インストール ずみ など）は 全画面だけ。
const canPrompt = () => !installed && !!installEvent;
const LATER_KEY = 'uspeak-install-later-v1';
const later = () => { try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < 30 * 864e5; } catch { return false; } };
function prompt() {
  const e = installEvent; installEvent = null;
  try {
    const p = e.prompt();
    if (p && p.catch) p.catch(() => {});
  } catch { /* ことわられた */ }
}
function offerInstall() {
  // ブラウザが インストールの 画面を 出せない とき（Firefox・Safari・まだ 条件が そろって いない など）も カードは 出す。
  // その ときの ボタンは「やりかたを 見る」＝やりかたの 案内（install-hint.js）。2026-11：「パソコンで インストールも 案内する ように」。
  if (later() || document.getElementById('install-offer')) return;
  const pc = kind() === 'pc'; const direct = canPrompt();
  const box = document.createElement('div');
  box.id = 'install-offer'; box.setAttribute('role', 'dialog');
  const q = pc ? 'デスクトップに アイコンを つくる？' : 'ホーム画面に アイコンを つくる？';
  box.innerHTML = `<b>${pc ? '🖥' : '📱'} <span data-t="${q}">${q}</span></b><small data-t="つぎから アイコンを おすだけで ひらけるよ。">つぎから アイコンを おすだけで ひらけるよ。</small>
    <span class="io-acts"><button type="button" class="io-yes" data-t="アイコンを つくる">アイコンを つくる</button><button type="button" class="io-no" data-t="いまは しない">いまは しない</button></span>`;
  // 2026-11：「やりかたじゃなくて インストール ボタンを」。Chrome は ページを しばらく つかって から（30 秒ほど）でないと
  // インストールの 画面を ゆるさない（beforeinstallprompt が まだ 来ない）。その あいだは ボタンを「じゅんび ちゅう…」で 待たせ、
  // とどいたら［アイコンを つくる］に もどす。45 秒 待っても 来ない（もう インストール ずみ・前に とじた・Firefox など）ときだけ［やりかたを 見る］。
  const btn = box.querySelector('.io-yes');
  const label = (t) => { btn.dataset.t = t; btn.textContent = t; applyDom(btn); };
  const onReady = () => { ready.delete(onReady); btn.disabled = false; label('アイコンを つくる'); };
  let timer = 0;
  const close = () => { ready.delete(onReady); clearTimeout(timer); box.remove(); };
  if (!direct) {
    btn.disabled = true; label('じゅんび ちゅう…'); ready.add(onReady);
    setTimeout(() => { if (!canPrompt() && box.isConnected) { ready.delete(onReady); btn.disabled = false; label('やりかたを 見る'); } }, 45000);
  }
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); close(); if (canPrompt()) prompt(); else showInstallHint(kind()); });
  box.querySelector('.io-no').addEventListener('click', (ev) => { ev.stopPropagation(); close(); try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* のこせない */ } });
  // すがた えらびや ロビー（modal の dialog）の 上でも おせる ように、いちばん 上の 層（popover）に 出す。古い ブラウザは ふつうに body へ。
  // modal の dialog は ほかを おせなく する（inert）ので、ひらいて いる dialog の 中に 入れて、そのうえで いちばん 上の 層へ。
  (document.querySelector('dialog[open]:modal') || document.body).append(box); applyDom(box);
  if (box.showPopover) { box.popover = 'manual'; try { box.showPopover(); } catch { /* ふつうの まま */ } }
  timer = setTimeout(close, direct ? 20000 : 60000);
}

// ボタンを おしたとき：全画面（できる 端末）。そのあと インストールを えらべる カード、iPhone・iPad は やりかたの 案内。
function press() {
  if (installed) return;
  if (request) goFullscreen();
  if (apple) showInstallHint('ios');
  else setTimeout(offerInstall, 600);
}

if (installed) lockSideways();

if (offer) {
  // さいしょの タップ（アカウント作成・サインイン）と、ぬけた あとの つぎの タップで 全画面に。
  // iPad の Safari が「ユーザーの 操作」と みとめる ものを ぜんぶ（click も）。どれかで 全画面に なれば あとは isFull() で 何も しない。
  if (request) for (const type of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(type, goFullscreen, true);

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
