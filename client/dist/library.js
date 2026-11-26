// としょかんの 中（2026-11：「広場の 横に 図書館。中では 読み物島の 教材が 読める。自習室が ある」）。
//
// ・マイルーム（room-world.js）・なかよしの 住民の いえ（npc-home.js）と 同じ 作り：**自分の シーン 1 つ**を `rpg.attachLibrary()` で つなぐ。
//   カメラ・当たり判定・ミニマップ・描画（rpg.interiorScene）は その しくみが そのまま 見る。WebGL は ふやさない。
// ・入る：メインの島の としょかんの だんを のぼって 戸口へ（main_island.json の spots の `library` → main-island.js の walkIn → ここの enter）。
//   出る：げんかん（南）を 歩いて 出る か、上の 帯の「そとへ」。だんの 下に もどる（戸口の 外＝すぐには 入りなおさない）。
// ・中の 3 つの 場所（library-interior.js の spots）：
//     ほんだな（西の としょしつ）… よみもの島の 本だな（`openReading`＝reading.open()）
//     つくえ（東の じしゅうしつ）… べんきょうの メニュー（しゅくだい・ふくしゅう・たんごちょう。どれも 前から ある 画面を ひらくだけ）
//     としょかんの ひと … ひとこと（トースト）
//   そばに 立つと 下に ボタン（#lib-near。`.near` と 同じ 場所）。E / Enter でも、指でも おせる。
// ・カメラは いつも 南（手前）から。へやは 南がわの かべを 切りとった 模型なので、まわりこむと かべの うらが 見える。
//   だから 向き（yaw）を ±0.7 に とめる（`look` で ゲームの yaw ごと とめる＝歩く 向きと ずれない）。一人称の ときは てんじょうを 出す。
// ・光は 足さない（半球光と 太陽 1 つ＝ほかの 内装と 同じ。まど・ランプは 自分で 光る 材質）。へやは はじめて 入る ときに 1 回だけ 作る。
// ・場所の 名前（`in:library`）は みんな 同じ＝中に いる ともだちが 見える。通話には ならない（部屋の voiceRoomOf は `in:島:建物` だけ）。
import * as THREE from './three.module.js';
import { buildLibraryInterior } from './library-interior.js';
import { buildVillager } from './villager.js';
import { isJa, onLangChange } from './i18n.js';

const YAW_LIMIT = 0.7;            // カメラが まわれる はば（左右 40 度）
const LIBRARIAN = { color: 0x2f5d48, seed: 'Ms. Shiori:library:librarian' };
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;

// そばに 立った ときの ボタンの 文。
const PROMPT = {
  reading: ['📚 Read a book', '📚 ほんを よむ'],
  study: ['✏️ Study at the desk', '✏️ つくえで べんきょう する'],
  npc: ['💬 Talk to the librarian', '💬 としょかんの ひとと はなす'],
};
// としょかんの ひとの ひとこと（じゅんばんに）。
const GREETINGS = [
  ['Welcome to the library! The books are right here.', 'としょかんへ ようこそ！ ほんは ここに あるよ。'],
  ['Shh… The study room is on the east side.', 'しーっ。じしゅうしつは ひがしの へやだよ。'],
  ['Read a little every day. You will love English!', 'まいにち すこしずつ よもう。えいごが すきに なるよ！'],
];

export function createLibrary({
  player, camera, toast = () => {}, rpg = null, isOnline = () => true,
  openReading = () => false, openHomework = () => false, openReview = () => false, openWordbook = () => false,
  look = null,                    // (yaw, pitch) → ゲームの カメラの 向きを かえる（game.js の view.look）
}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1a13);                 // へやの 外＝ふかい みどりの くらがり
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x9a7550, 1.9)); // 下からの 光は あたたかい 色
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.35);
  sun.position.set(5, 12, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 80 }); sun.shadow.bias = -0.0008;
  scene.add(sun);

  const state = { active: false, near: null, sig: '' };
  let lib = null, librarian = null, greet = 0;
  let parent = null, cooldown = 0, whereWas = null;

  function ensure() {
    if (lib) return true;
    lib = buildLibraryInterior();
    scene.add(lib.group);
    const at = lib.spots.find((s) => s.kind === 'npc');
    if (at) {
      try {
        librarian = new THREE.Group();
        buildVillager(null, librarian, LIBRARIAN);
        librarian.position.set(at.x, 0, at.z); librarian.rotation.y = at.ry ?? 0;
        librarian.userData.home = at.ry ?? 0;
        librarian.traverse((m) => { if (m.isMesh) m.castShadow = true; });
        scene.add(librarian);
      } catch { librarian = null; }
    }
    return true;
  }

  // ---- 画面の 部品：下の ボタン・上の 帯・べんきょうの メニュー ----
  let nearEl = null, bar = null, menu = null;
  try {
    nearEl = document.createElement('div'); nearEl.id = 'lib-near'; nearEl.className = 'near'; nearEl.hidden = true; nearEl.setAttribute('translate', 'no');
    nearEl.innerHTML = '<button type="button"><kbd>E</kbd> <span></span> <span>↗</span></button>';
    document.body.appendChild(nearEl);
    nearEl.querySelector('button').onclick = () => interact();
    bar = document.createElement('div'); bar.id = 'lib-bar'; bar.hidden = true; bar.setAttribute('translate', 'no');
    bar.innerHTML = `<span>📚 ${bi('Library', 'としょかん')}</span><button type="button">🚪 ${bi('Go out', 'そとへ')}</button>`;
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = () => leave();
    menu = document.createElement('dialog'); menu.id = 'library-dialog'; menu.setAttribute('translate', 'no'); menu.setAttribute('aria-labelledby', 'lib-title');
    menu.innerHTML = `<header class="lib-head"><div><small>STUDY ROOM</small><h2 id="lib-title">✏️ ${bi('Study room', 'じしゅうしつ')}</h2></div>
        <button type="button" class="lib-x" aria-label="Close">×</button></header>
      <p class="lib-lead">${bi('What will you study today?', 'きょうは なにを べんきょう する？')}</p>
      <div class="lib-acts">
        <button type="button" class="lib-act" data-act="homework"><i>📝</i><span>${bi('Homework', 'しゅくだい')}<small>${bi('From your teacher', 'せんせいからの しゅくだいを する')}</small></span></button>
        <button type="button" class="lib-act" data-act="review"><i>🔁</i><span>${bi('Review', 'ふくしゅう')}<small>${bi('Practice your weak words', 'にがてな たんごを もう いちど')}</small></span></button>
        <button type="button" class="lib-act" data-act="wordbook"><i>📒</i><span>${bi('Word Book', 'たんごちょう')}<small>${bi('Words you have learned', 'おぼえた ことばを 見る')}</small></span></button>
      </div>`;
    document.body.appendChild(menu);
    menu.querySelector('.lib-x').onclick = () => menu.close();
    menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });
    for (const b of menu.querySelectorAll('.lib-act')) {
      b.onclick = () => {
        const act = b.dataset.act;
        menu.close();
        // どれも 前から ある 画面（宿題・苦手単語の 復習・たんごちょう）。ここは ひらくだけ。
        if (act === 'homework') openHomework();
        else if (act === 'review') { if (isOnline()) openReview(); else toast(isJa() ? 'ふくしゅうは クラスに はいって いる ときに できるよ。' : 'Join your class to review.'); }
        else if (act === 'wordbook') openWordbook();
      };
    }
    for (const el of [nearEl, bar]) for (const ev of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation());
    // E / Enter：そばの 場所を つかう。ほかの 画面が ひらいて いる・文字を 打って いる ときは なにも しない。
    addEventListener('keydown', (e) => {
      if (!state.active || !state.near || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = String(e.key || '').toLowerCase();
      if (k !== 'e' && k !== 'enter') return;
      if (document.querySelector('dialog[open]') || /^(input|textarea|select)$/i.test(e.target?.tagName || '')) return;
      e.preventDefault(); e.stopPropagation();
      interact();
    }, true);
    onLangChange(() => { state.sig = ''; });
  } catch { nearEl = null; bar = null; menu = null; }

  const dialogOpen = () => { try { return !!document.querySelector('dialog[open]'); } catch { return false; } };

  function paintNear() {
    if (!nearEl) return;
    const at = state.active && !dialogOpen() ? state.near : null;
    const sig = at ? `${at.kind}|${isJa()}` : '';
    if (sig === state.sig) return;
    state.sig = sig;
    nearEl.hidden = !at;
    if (at) { const [en, ja] = PROMPT[at.kind] || PROMPT.study; nearEl.querySelector('span').textContent = isJa() ? ja : en; }
  }

  // そばの 場所を つかう（ボタン・E）。
  function interact(spot = state.near) {
    if (!state.active || !spot || dialogOpen()) return false;
    if (spot.kind === 'reading') return openReading() !== false;
    if (spot.kind === 'study') { try { if (!menu.open) menu.showModal(); } catch { return false; } return true; }
    if (spot.kind === 'npc') { const [en, ja] = GREETINGS[greet % GREETINGS.length]; greet += 1; toast(`📚 ${isJa() ? ja : en}`); return true; }
    return false;
  }

  // 外の どこに 出るか：としょかんの だんの 下（戸口の 外）。メインの島が まだ なければ 入る 前の 場所。
  let back = null;
  function outside() {
    const main = rpg?.main, ext = main?.library;
    if (ext && typeof main.origin === 'function') { const o = main.origin(); return { x: o.x + ext.x, z: o.z + ext.z + ext.steps.z1 + 1.5, r: 0 }; }
    return back;
  }

  function enter() {
    if (state.active) return false;
    try { ensure(); } catch (err) { try { console.warn('[library] へやが 作れない', err); } catch { /* */ } toast(isJa() ? 'いまは 入れないよ。' : 'You cannot go in now.'); return false; }
    state.active = true; state.near = null; state.sig = '';
    parent = player.parent;
    back = { x: player.position.x, z: player.position.z + 3.6, r: 0 };
    scene.add(player);
    player.position.set(lib.spawn.x, 0, lib.spawn.z);
    player.rotation.y = lib.spawn.ry;
    camera.position.set(lib.spawn.x, 15, lib.spawn.z + 17);       // 外の カメラの 場所から すべって 来ない ように、はじめから 中に
    cooldown = 1.2;
    try {
      document.body.classList.add('in-building', 'in-library');
      const where = document.querySelector('.location');
      whereWas = where ? where.innerHTML : null;
      if (where) where.innerHTML = `<span>✦</span> ${bi('LIBRARY', 'としょかん')}`;
      if (bar) bar.hidden = false;
      const outer = document.querySelector('#near'); if (outer) outer.style.display = 'none';   // 外の「はいる」ボタン（game.js は 8 フレームに 1 回 見なおす）を すぐ 消す
    } catch { /* */ }
    return true;
  }

  // restore＝外の だんの 下に 立たせる。島が かわった あと（ひこうき・先生の「いっしょに いどう」）は 場所を さわらない。
  function leave(silent = false, restore = true) {
    if (!state.active) return false;
    state.active = false; state.near = null;
    try { if (menu?.open) menu.close(); } catch { /* */ }
    (parent || null)?.add(player);
    const out = restore ? outside() : null;
    if (out) { player.position.set(out.x, 0, out.z); player.rotation.y = out.r; }
    if (lib?.group.userData.ceiling) lib.group.userData.ceiling.visible = false;
    try {
      document.body.classList.remove('in-building', 'in-library');
      const where = document.querySelector('.location');
      if (where && whereWas !== null && restore) where.innerHTML = whereWas;
      whereWas = null;
      if (bar) bar.hidden = true;
    } catch { /* */ }
    paintNear();
    return true;
  }

  function blocked(x, z) {
    if (!state.active || !lib) return null;
    if (librarian && Math.hypot(x - librarian.position.x, z - librarian.position.z) < 0.8) return true;
    return lib.blocked(x, z, 0.34);
  }

  function nearSpot() {
    let best = null, bestD = Infinity;
    for (const s of lib.spots) {
      const d = Math.hypot(player.position.x - s.x, player.position.z - s.z);
      if (d <= s.r + 0.45 && d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  function update(t, dt) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active) return;
    // ひこうきで 飛ぶ・ほかの 島へ うつった：だまって 出る。
    const flying = rpg?.state?.mode === 'flight', moved = !!rpg && rpg.state?.current !== 'main';
    if (flying || moved) { leave(true, !moved); return; }
    lib.update(t);
    if (librarian) {
      librarian.position.y = Math.abs(Math.sin(t * 1.6)) * 0.03;
      const dx = player.position.x - librarian.position.x, dz = player.position.z - librarian.position.z;
      const want = Math.hypot(dx, dz) < 7 ? Math.atan2(dx, dz) : librarian.userData.home;
      const d = Math.atan2(Math.sin(want - librarian.rotation.y), Math.cos(want - librarian.rotation.y));
      librarian.rotation.y += d * Math.min(1, dt * 5);
    }
    state.near = nearSpot();
    paintNear();
    // げんかんを 歩いて 出る（ほかの 戸口と 同じ）。
    const ex = lib.exit;
    if (!cooldown && !dialogOpen() && Math.abs(player.position.x - ex.x) < ex.r && player.position.z > ex.z - 0.45) leave();
  }

  const focus = new THREE.Vector3(), desired = new THREE.Vector3();
  function updateCamera({ yaw, pitch, zoom, dt, firstPerson }) {
    if (!state.active) return false;
    camera.aspect = globalThis.innerWidth / globalThis.innerHeight || camera.aspect;
    camera.updateProjectionMatrix();
    const ceiling = lib.group.userData.ceiling;
    if (ceiling) ceiling.visible = !!firstPerson;
    if (firstPerson) {
      camera.position.set(player.position.x, 2.05 + player.position.y, player.position.z);
      camera.lookAt(player.position.x - Math.sin(yaw) * Math.cos(pitch) * 10, camera.position.y + Math.sin(pitch) * 10, player.position.z - Math.cos(yaw) * Math.cos(pitch) * 10);
      return true;
    }
    // 南（手前）の 上から。向きは ±0.7 に とめて、ゲームの yaw も 同じ 数に する（歩く 向きは yaw で 決まるので、ここだけ とめると 操作が ずれる）。
    const norm = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const a = Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, norm));
    if (Math.abs(a - yaw) > 1e-4) { try { look?.(a, pitch); } catch { /* */ } }
    const px = player.position.x, pz = player.position.z;
    // 大広間は 少し 引く（17）、東西の 部屋は 近く（14：部屋は ひくい）。ホイールの zoom（32 が ふつう）で 0.8〜1.15 倍。
    const side = THREE.MathUtils.smoothstep(Math.abs(px), 11, 16);
    const distance = (17 - 3 * side) * THREE.MathUtils.clamp(zoom / 32, 0.8, 1.15) * (camera.aspect > 1.9 ? 0.94 : 1);
    focus.set(px, 1.1, pz - 1);
    desired.set(px + Math.sin(a) * distance * 0.9, 1.2 + distance * 0.8, pz - 1 + Math.cos(a) * distance);
    camera.position.lerp(desired, 1 - Math.exp(-dt * 6));
    camera.lookAt(focus);
    return true;
  }

  // 右上の 小さな 地図：八角の 大広間・東西の 部屋・げんかん。場所の まる（本＝オレンジ・つくえ＝ミント）と じぶん。
  function minimap(ctx) {
    if (!state.active || !lib) return false;
    const k = 3.3, ox = 90, oz = 62, X = (x) => ox + x * k, Z = (z) => oz + z * k;
    ctx.clearRect(0, 0, 180, 140);
    ctx.fillStyle = '#0c241c'; ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = '#c98f66';
    ctx.fillRect(X(-24.6), Z(-6.6), 49.2 * k, 13.2 * k);                       // 東西の 部屋
    ctx.fillRect(X(-2), Z(0), 4 * k, 17.8 * k);                                // げんかん
    ctx.beginPath();                                                           // 八角の 大広間
    for (let i = 0; i < 8; i += 1) { const an = Math.PI / 8 + i * Math.PI / 4, r = 13 / Math.cos(Math.PI / 8); const x = X(Math.cos(an) * r), z = Z(Math.sin(an) * r); if (i) ctx.lineTo(x, z); else ctx.moveTo(x, z); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8ff0c8'; ctx.fillRect(X(-2), Z(17.8) - 3, 4 * k, 5);     // 出口
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '9px sans-serif';
    const books = lib.spots.find((s) => s.kind === 'reading'), desk = lib.spots.find((s) => s.id === 'study4') || lib.spots.find((s) => s.kind === 'study');
    for (const [s, c, icon] of [[books, '#ffb066', '📚'], [desk, '#8ff0c8', '✏️']]) {
      if (!s) continue;
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(icon, X(s.x), Z(s.z) + 0.5);
    }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(X(player.position.x), Z(player.position.z), 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e27a2d'; ctx.beginPath(); ctx.arc(X(player.position.x), Z(player.position.z), 3, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff4d6'; ctx.font = 'bold 9px sans-serif';
    ctx.fillText(isJa() ? 'としょかん' : 'LIBRARY', 6, 8);
    return true;
  }

  return {
    scene, state, enter, leave, blocked, update, updateCamera, minimap, interact,
    get active() { return state.active; },
    get near() { return state.near; },
    get spots() { return lib?.spots || []; },
    get menu() { return menu; },
  };
}
