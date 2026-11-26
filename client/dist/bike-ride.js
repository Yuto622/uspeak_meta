// じてんしゃに のる（2026-11）。買うのは じてんしゃや（bike-shop.js）、もって いるかは 部屋の さいふ（wallet.owned）。
//
// ・のる／おりる は 部屋に `bike:ride {id}`（'' ＝ おりる）。部屋は もって いる じてんしゃ だけ みとめ、姿の 文字（player.avatar）の
//   `bike` に 入れて くばる ＝ となりの 子にも じてんしゃが 見える（remote-players.js が 同じ `poseRider` を 使う）。
// ・はやさ：`bikePace(id)`（走る はやさの 1.5〜2.2 ばい）。ふむと だんだん 速く なり、はなすと 少し ころがって 止まる（`step`）。
//   むきは いつもの スティック／WASD、当たり判定も いつもの `blocked`（game.js が この はやさで 歩かせる）。
// ・のれるのは 外だけ（`canRide`＝net-client.js が きめる）。戸口・家の 中・ひこうき・つり・レース・全画面の ゲーム・授業の ストップ・
//   住民との 会話では じぶんで おりる（`update` が 毎こま 見る）。
// ・画面の ボタン `#bike-toggle`（🚲 のる／おりる・パソコンは B キー）。じてんしゃを もって いて 外に いる ときだけ 出る。
import * as THREE from './three.module.js';
import { bikeModel, SADDLE_Y } from './bike-models.js';
import { BIKE_BY_ID, BIKES, bikePace, isBike } from './bikes-data.js';
import { isJa, onLangChange } from './i18n.js';

const LAST_KEY = 'uspeak-bike-last-v1';
export const BIKE_KEY = 'b';
const ACCEL_S = 0.7;     // 止まって いる ところから いちばん 速く なるまでの 秒
const COAST_S = 0.5;     // はなして から 止まるまでの 秒

const bodyOf = (holder) => holder.children.find((c) => c.userData?.limbs) || null;

// 体の 大きさに 合わせた じてんしゃの 大きさと、体を もちあげる 高さ。まるい 体（あしの つけね 0.56）が きほん。
function fit(body) {
  const hip = body?.userData?.limbs?.[0]?.position.y || 0.56;
  const scale = Math.min(1.6, Math.max(1, hip / 0.56)) * 1.15;   // 頭の 大きい 体に 合わせて 少し 大きく
  const seat = SADDLE_Y * scale;                 // サドルの 上
  const bottom = hip - 0.13;                     // 体の いちばん 下（おしり）
  return { scale, lift: seat - bottom + 0.02 };
}

// のって いる 体の かたち：サドルに すわって 前へ かたむき、うでは ハンドルへ、あしは ペダルを こぐ（phase で まわる）。
// 歩く うごき（毎こま limbs の rotation.x を 書く）の あとに 呼ぶ こと。
export function poseRider(body, phase = 0, moving = false) {
  if (!body) return;
  const f = fit(body);
  body.position.set(0, f.lift, -0.1 * f.scale);
  body.rotation.x = 0.16;
  const limbs = body.userData.limbs || [];
  const k = moving ? 0.42 : 0;
  if (limbs[0]) limbs[0].rotation.x = -0.62 + Math.sin(phase) * k;
  if (limbs[1]) limbs[1].rotation.x = -0.62 + Math.sin(phase + Math.PI) * k;
  if (limbs[2]) limbs[2].rotation.x = -1.2;
  if (limbs[3]) limbs[3].rotation.x = -1.2;
}
export function unposeRider(body) {
  if (!body) return;
  body.position.set(0, 0, 0); body.rotation.x = 0;
  for (const l of body.userData.limbs || []) l.rotation.x = 0;
}
// holder（player か となりの 子の Group）に じてんしゃを つける。返すのは bikeModel の Group（外すのは removeBike）。
export function attachBike(holder, id) {
  const bike = bikeModel(id); if (!bike) return null;
  bike.scale.setScalar(fit(bodyOf(holder)).scale);
  bike.userData.isBike = true;
  holder.add(bike);
  return bike;
}
export function removeBike(holder, bike) { if (bike) holder.remove(bike); unposeRider(bodyOf(holder)); }

export function createBikeRide({ player, store, send, isOnline, toast = () => {}, canRide = () => true }) {
  const state = { riding: '', v: 0, phase: 0, bike: null, body: null, last: '', lastPos: new THREE.Vector3(), why: '' };
  try { state.last = localStorage.getItem(LAST_KEY) || ''; } catch { /* おぼえて いなくても のれる */ }

  // もって いる じてんしゃ。store.state は 読む たびに まるごと 写しを 作るので、毎こまの 見はり（update）は 0.5 秒に 1 回だけ 読む。
  let ownedAt = -1e9, ownedList = [];
  const owned = (fresh = true) => {
    if (!isOnline()) return [];
    const now = performance.now();
    if (fresh || now - ownedAt > 500) { ownedList = (store.state.owned || []).filter(isBike); ownedAt = now; }
    return ownedList;
  };
  const best = () => { const o = owned(); return o.includes(state.last) ? state.last : BIKES.filter((b) => o.includes(b.id)).sort((a, b) => b.speed - a.speed)[0]?.id || ''; };
  const L = (en, ja) => (isJa() ? ja : en);

  // ---- 画面の ボタン ----
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'bike-toggle'; btn.hidden = true;
  btn.innerHTML = `<span class="bk-ico">🚲</span><span class="bk-lab"><b class="en"></b><i class="ja"></i></span><kbd>${BIKE_KEY.toUpperCase()}</kbd>`;
  document.body.append(btn);
  btn.addEventListener('click', (e) => { e.preventDefault(); btn.blur(); toggle(); });
  let shown = null;
  function paintButton() {
    const has = owned(false).length > 0;
    const show = has && (state.riding ? true : canRide());
    if (btn.hidden === show) btn.hidden = !show;
    const key = `${state.riding ? 1 : 0}`;
    if (key !== shown) {
      shown = key;
      btn.classList.toggle('on', !!state.riding);
      btn.querySelector('.en').textContent = state.riding ? 'Get off' : 'Ride';
      btn.querySelector('.ja').textContent = state.riding ? 'おりる' : 'のる';
      btn.setAttribute('aria-pressed', state.riding ? 'true' : 'false');
    }
  }

  function mount(id = best(), { quiet = false } = {}) {
    if (!id || !BIKE_BY_ID[id]) { if (!quiet) toast(L('You have no bike yet. Buy one at the Bike Shop!', 'じてんしゃを まだ もって いないよ。じてんしゃやで かえるよ。')); return false; }
    if (!owned().includes(id)) { if (!quiet) toast(L('You do not have that bike.', 'その じてんしゃは まだ もって いないよ。')); return false; }
    if (!canRide()) { if (!quiet) toast(L('You can ride outside.', 'じてんしゃは そとで のれるよ。')); return false; }
    if (state.riding === id) return true;
    if (state.bike) player.remove(state.bike);
    state.bike = attachBike(player, id);
    if (!state.bike) return false;
    state.riding = id; state.last = id; state.v = 0; state.body = bodyOf(player);
    state.lastPos.copy(player.position);
    try { localStorage.setItem(LAST_KEY, id); } catch { /* つぎも いちばん 速い じてんしゃから */ }
    send('bike:ride', { id });
    document.body.dataset.bike = id;
    paintButton();
    return true;
  }
  function dismount(why = '') {
    if (!state.riding) return false;
    removeBike(player, state.bike);
    state.bike = null; state.riding = ''; state.v = 0; state.why = why;
    send('bike:ride', { id: '' });
    delete document.body.dataset.bike;
    paintButton();
    return true;
  }
  function toggle() { return state.riding ? dismount('button') : mount(); }

  // game.js が 毎こま 呼ぶ：いまの はやさ（1 秒に すすむ 長さ）。pushing ＝ スティック／キーを たおして いる。
  // runPace ＝ いま 走ると 出る はやさ（のりもの島の のりものを もって いる 子は 速い）。じてんしゃは それより おそく ならない。
  function step(dt, pushing, push = 1, runPace = 0) {
    if (!state.riding) return 0;
    const top = Math.max(bikePace(state.riding), runPace * 1.15);
    if (pushing) state.v = Math.min(top * Math.max(0.25, push), state.v + (top / ACCEL_S) * dt);
    else state.v = Math.max(0, state.v - (top / COAST_S) * dt);
    // たおす 量を へらした とき（スティック）は その はやさへ ゆっくり おとす。
    if (pushing && state.v > top * Math.max(0.25, push)) state.v = Math.max(top * push, state.v - (top / COAST_S) * dt);
    return state.v;
  }
  // かべに 当たった：そこで 止まる。
  function bump() { state.v = Math.min(state.v, 2); }

  function update(t, dt) {
    paintButton();
    if (!state.riding) return;
    if (!isOnline() || !canRide() || !owned(false).includes(state.riding)) { dismount('auto'); return; }
    // 体を 建てなおした（すがたを かえた・きせかえ）：じてんしゃの 大きさも 合わせる。
    if (state.bike.parent !== player) player.add(state.bike);   // avatars.js の apply() は player.clear() する
    const body = bodyOf(player);
    if (body !== state.body) { state.body = body; state.bike.scale.setScalar(fit(body).scale); }
    const d = Math.hypot(player.position.x - state.lastPos.x, player.position.z - state.lastPos.z);
    state.lastPos.copy(player.position);
    const moved = d > 0.0005 && d < 6;
    if (moved) { state.bike.userData.spin(d / state.bike.scale.x); state.phase += d * 1.1; }
    state.bike.visible = body ? body.visible !== false : true;
    poseRider(body, state.phase, moved);
  }

  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== BIKE_KEY) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
    if (document.querySelector('dialog[open]') || btn.hidden) return;
    toggle();
  });
  onLangChange(() => { shown = null; paintButton(); });

  return {
    mount, dismount, toggle, step, bump, update, owned, best,
    get riding() { return state.riding; },
    get speed() { return state.v; },
    get top() { return state.riding ? bikePace(state.riding) : 0; },
    // つなぎなおした とき：部屋は のって いる ことを わすれて いるので、もう一度 つたえる。
    resync() { if (state.riding) send('bike:ride', { id: state.riding }); },
    // 部屋が ことわった（もって いない）：おりる。
    onRefused() { if (state.riding) { removeBike(player, state.bike); state.bike = null; state.riding = ''; state.v = 0; delete document.body.dataset.bike; paintButton(); } },
    state, button: btn,
  };
}
