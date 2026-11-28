// しまの ちず — 「Choose a World」。色つきのカードを並べて、押すと そこへ とぶ。
//
// 前は海図（rpg-map.js の canvas）に島を置いていた。島が 19 になって 名前が読めなくなったので、
// Roblox の ワールド選び と同じ形にした：大きな絵・英語の名前（白い縁どり）・日本語の名前。
// **どこへ とべるか・何が ひらいているかは rpg.js が決める**（ここは並べるだけ）。
//
// 島の名前の定義元は rpg-data.js の HUBS / REGIONS（`en` / `name` / `yomi`）。ここに書くのは
// 絵と色だけ。新しい島を足したら LOOK に1行（無ければ 🏝 と 島の色で出る）。
import { isJa } from './i18n.js';
import { KIDS_ISLANDS, kidsOn } from './kids.js';
import { neighboursOf } from './bridges-data.js';
import { MAP_ISLANDS, mountWorldMap, shortName } from './world-map.js';

// 「🗺 ちず」（ぬった 地形の ちず＝world-paint.js・はじめは こちら）・「📍 あんない」（たいらな あんないの ちず＝world-map.js の SVG）・
// 「🃏 カード」（いままでの カード）。えらんだ ものを この 端末に 覚える。
const VIEW_KEY = 'uspeak-worldmap-view-v1';
const readView = () => { try { const v = globalThis.localStorage?.getItem(VIEW_KEY); return v === 'cards' || v === 'guide' ? v : 'map'; } catch { return 'map'; } };
const saveView = (v) => { try { globalThis.localStorage?.setItem(VIEW_KEY, v); } catch { /* 保存 できない 端末でも うごく */ } };
let mapCtl = null;
// せつめい（KEY）の 小さな 絵（ちずの 絵と 同じ 形）。
const KEY_ICONS = {
  here: '<svg viewBox="-10 -24 20 28"><path d="M0 2C-3-4-9-7-9-13a9 9 0 0 1 18 0c0 6-6 9-9 15Z" fill="#ffd246" stroke="#2b2118" stroke-width="1.4"/><path d="M0-18.4l1.9 3.9 4.3.6-3.1 3 .7 4.3L0-8.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" fill="#e27a2d"/></svg>',
  num: '<svg viewBox="-10 -10 20 20"><circle r="8.6" fill="#e04a2f" stroke="#fff4d6" stroke-width="2"/><text font-size="11" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central" y=".5">1</text></svg>',
  bridge: '<svg viewBox="0 -6 28 12"><rect x="0" y="-4" width="28" height="8" rx="1" fill="#c98a4b" stroke="#6b3f1c" stroke-width=".8"/><path d="M1 0H27" stroke="#9a6233" stroke-width="6" stroke-dasharray="1 2.2"/><path d="M0-3.3H28M0 3.3H28" stroke="#5a3418" stroke-width="1"/></svg>',
  premium: '<svg viewBox="-10 -12 20 24"><rect x="-8" y="-3" width="16" height="13" rx="3" fill="#f2b04a" stroke="#2b2118" stroke-width="1.3"/><path d="M-4.6-3v-3.6a4.6 4.6 0 0 1 9.2 0V-3" fill="none" stroke="#7a8a96" stroke-width="2.6"/><circle cy="3" r="1.8" fill="#2b2118"/></svg>',
  cloud: '<svg viewBox="-14 -10 28 18"><g fill="#f6fbfc" stroke="#9fb3bb" stroke-width="1"><circle cx="-6" cy="1" r="6"/><circle cx="6" cy="1" r="6"/><circle cy="-3" r="7"/></g><text font-size="9" font-weight="900" fill="#7a8f9a" text-anchor="middle" dominant-baseline="central" y="0">?</text></svg>',
  ferry: '<svg viewBox="-6 -8 12 11"><path d="M-5 0h10l-2 2.4h-6Z" fill="#fff4d6" stroke="#2b2118" stroke-width=".6"/><path d="M0 0V-7" stroke="#2b2118" stroke-width=".6"/><path d="M.4-7 4.4-.6H.4Z" fill="#e27a2d" stroke="#2b2118" stroke-width=".4"/></svg>',
  plane: '<svg viewBox="-8 -6 16 12"><path d="M-6 0h12l2-1-2-1H-6Z M-1.2 0-3.6 5H-1.7L2.4 0ZM-1.2-2-3.6-6H-1.7L2.4-2Z" fill="#fff" stroke="#2b2118" stroke-width=".6" transform="rotate(-20)"/></svg>',
};

const LOOK = {
  willow: ['🏡', '#5aae78'], park: ['🎡', '#e27a2d'], errand: ['🛍️', '#e0a526'], school: ['🏫', '#5b97e6'],
  arena: ['⚔️', '#c8573e'], pet: ['🐣', '#f0b43c'], ride: ['🏁', '#4f86d9'], town: ['🏗️', '#7db65a'],
  eiken5: ['📗', '#4fae6b'], eiken4: ['📙', '#e08a2c'], eiken3: ['📘', '#3f6fb8'], eikenp2: ['📕', '#d9663a'], eiken2: ['📗', '#2f7a6f'], eikenp1: ['📓', '#6a4fa8'], eiken1: ['👑', '#b8902a'], talk: ['💬', '#3baacb'],
  conv: ['🗣️', '#e0668e'], wear: ['👕', '#b06fc4'], mini: ['🎮', '#7a5cc8'], homework: ['📝', '#d9763a'], reading: ['📚', '#6b4c9c'], abc: ['🔤', '#e0a800'], farm: ['🐄', '#8dbe45'],
  land: ['🏝️', '#2fa3b8'], fishworld: ['🎣', '#3b9fd4'], main: ['🏠', '#e27a2d'],
  meadow: ['🌼', '#86b85c'], forest: ['🌲', '#3f8a5c'], reef: ['🪸', '#2fb3b0'], canyon: ['🏜️', '#c8783e'],
  snow: ['🏔️', '#5fa7d8'], storm: ['⛈️', '#5b6fb8'], desert: ['🐪', '#d6a03a'], ruins: ['🏛️', '#8a8f86'],
  moon: ['🌙', '#7a5cc8'], sky: ['🕊️', '#e0a526'],
};
const hex = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 「Fishing Island」→「Fishing」、「FIRSTLIGHT MEADOW」→「Firstlight Meadow」。カードの名前は短く。
const title = (r) => {
  const en = String(r.en || r.name);
  const short = r.hub ? en.replace(/\s+Island$/i, '') : en;
  // ぜんぶ 大文字の 名前は 読みやすく（FIRSTLIGHT MEADOW → Firstlight Meadow）。「ABC」の ような 3 文字までの 略語は そのまま。
  return short === short.toUpperCase() && short.length > 3 ? short.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : short;
};

// おすすめ（大きな カード・上の 1 れつ）。Roblox の Choose a World と 同じ ならび。
export const RECOMMENDED = ['main', 'abc', 'reading', 'homework', 'wear', 'ride', 'fishworld', 'eiken5'];
// 🎮 あそび・📖 えいご の ほし（1〜3）。どんな 島かを 子どもに 1 目で つたえる ため（判定には つかわない）。
const STARS = {
  main: [2, 3], abc: [2, 3], reading: [2, 3], homework: [1, 3], ride: [3, 2], fishworld: [2, 3], park: [3, 1], errand: [2, 3], school: [1, 3], arena: [3, 2], pet: [3, 1],
  town: [3, 1], talk: [1, 3], conv: [1, 3], wear: [2, 1], mini: [3, 2], farm: [2, 2], land: [3, 1],
  eiken5: [1, 3], eiken4: [1, 3], eiken3: [1, 3], eikenp2: [1, 3], eiken2: [1, 3], eikenp1: [1, 3], eiken1: [1, 3],
};
const starsOf = (r) => STARS[r.id] || (r.hub ? [2, 2] : [3, 2]);
const row = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

export function lookOf(r) { return LOOK[r.id] || ['🏝', hex(r.color ?? 0x5aae78)]; }

// `state`: { current, unlocked(id), cleared(id), count(id) } — どれも rpg.js の store から。
export function renderWorldPicker(host, { destinations, state, onPick, onClose, onBook }) {
  const card = (r, big = false) => {
    const [icon, color] = lookOf(r);
    const open = state.unlocked(r.id);
    const here = r.id === state.current || (r.id === 'main' && state.current === 'willow');
    const done = !r.hub && open && state.cleared(r.id);
    // いま いる 島から 橋 1 本で 歩いて 行ける 島（bridges-data.js）には 🌉 を そえる。
    const walk = !here && neighboursOf(state.current).includes(r.id) ? ` · 🌉 ${isJa() ? 'あるいても 行ける' : 'Walk there'}` : '';
    const sub = (r.id === 'main' && !big ? `${r.yomi || r.name} · はしで U-Speak島へ` : (r.yomi || r.name)) + walk;
    const [play, eng] = starsOf(r);
    return `<button type="button" class="wm-card${big ? ' big' : ''}${open ? '' : ' locked'}${here ? ' here' : ''}" data-world="${esc(r.id)}" style="--wc:${color}"
        aria-label="${esc(isJa() ? r.name : title(r))}">
      ${big ? `<em class="wm-rib"><b class="en">★ Pick</b><i class="ja">★ おすすめ</i></em>` : ''}
      <span class="wm-icon" aria-hidden="true">${icon}</span>
      <span class="wm-stars" aria-label="${isJa() ? `あそび ${play}・えいご ${eng}` : `Play ${play}, English ${eng}`}"><span>🎮<i class="p">${row(play)}</i></span><span>📖<i class="e">${row(eng)}</i></span></span>
      <b class="wm-name">${esc(title(r))}</b>
      <small class="wm-ja" translate="no">${esc(sub)}</small>
      ${here ? `<em class="wm-badge here"><b class="en">📍 You are here</b><i class="ja">📍 いま ここ</i></em>` : ''}
      ${done ? '<em class="wm-badge done">✓</em>' : ''}
      ${open ? '' : '<span class="wm-lock" aria-hidden="true">🔒</span>'}
      ${state.premium?.(r.id) ? `<em class="wm-badge prem"><b class="en">⭐ Premium</b><i class="ja">⭐ プレミアム</i></em>` : ''}
    </button>`;
  };
  // U-Speak島（willow）は メインの島と 橋で つながっている（2026-10）。カードは 出さず、メインの島の カードに「橋で U-Speak島へ」。
  // 幼児モード：行ける 島を しぼる（メイン・よみもの・つり・きせかえ・じぶんの 島）。ぼうけんの ちいきと ずかんは 出さない。
  const kid = kidsOn();
  const hubs = destinations.filter((d) => d.hub && d.id !== 'willow' && (!kid || KIDS_ISLANDS.includes(d.id)));
  const regions = kid ? [] : destinations.filter((d) => !d.hub);
  const rec = RECOMMENDED.map((id) => hubs.find((d) => d.id === id)).filter(Boolean);
  const more = hubs.filter((d) => !RECOMMENDED.includes(d.id));
  const fresh = !host.querySelector('.wmap');
  let view = readView();
  // えの ちずに 出す 島（幼児モードは メイン・よみもの・つり・きせかえ・じぶんの 島 だけ 押せる）。番号は world-map.js の MAP_ISLANDS。
  const mapList = MAP_ISLANDS.filter((r) => !kid || KIDS_ISLANDS.includes(r.id));
  const listRow = (r) => {
    const open = state.unlocked(r.id), prem = state.premium?.(r.id), here = r.id === state.current;
    const mark = here ? '<em class="wl-st here" aria-hidden="true">★</em>' : !open ? `<em class="wl-st" aria-hidden="true">${prem ? '🔒' : '☁'}</em>` : '';
    return `<li><button type="button" class="${open ? '' : 'locked'}${here ? ' here' : ''}" data-wm-pick="${esc(r.id)}" translate="no">
      <i class="wl-n">${r.num}</i><span class="wl-name"><b class="en">${esc(shortName(r))}</b><i class="ja">${esc(r.yomi || r.name)}</i></span>${mark}</button></li>`;
  };
  const small = globalThis.matchMedia?.('(max-height: 500px), (max-width: 900px)').matches;   // スマホ・小さい 画面は パネルを たたんで はじめる
  const keyRow = (icon, en, ja) => `<li><span class="wk-i" aria-hidden="true">${KEY_ICONS[icon]}</span><span><b class="en">${en}</b><i class="ja">${ja}</i></span></li>`;
  host.innerHTML = `<section class="wm ${view === 'cards' ? 'is-cards' : 'is-map'}">
    <header class="wm-head">
      <div class="wm-views" role="group" aria-label="ちずの 見せかた" data-t-label="ちずの 見せかた">
        <button type="button" data-wm-view="map" aria-pressed="${view === 'map'}"><b class="en">🗺 Map</b><i class="ja">🗺 ちず</i></button>
        <button type="button" data-wm-view="guide" aria-pressed="${view === 'guide'}"><b class="en">📍 Guide</b><i class="ja">📍 あんない</i></button>
        <button type="button" data-wm-view="cards" aria-pressed="${view === 'cards'}"><b class="en">🃏 Cards</b><i class="ja">🃏 カード</i></button>
      </div>
      <h2><b class="en">Choose a World</b><i class="ja">せかいを えらぼう</i></h2>
      <button type="button" class="wm-close" aria-label="とじる" data-t-label="とじる">✕</button>
    </header>
    <div class="wmap">
      <div class="wmap-view" tabindex="0" role="region" aria-label="せかいの ちず（ひっぱって うごかす・ゆびで 大きく）" data-t-label="せかいの ちず（ひっぱって うごかす・ゆびで 大きく）"></div>
      <div class="wmap-loading" role="status" data-t="ちずの えを かいて います…">ちずの えを かいて います…</div>
      <div class="wmap-title" aria-hidden="true"><span class="wt-in"><b>U-SPEAK WORLD</b><small translate="no">ユースピーク ワールド</small></span></div>
      <details class="wmap-panel wmap-list"${small ? '' : ' open'}>
        <summary><b class="en">Islands</b><i class="ja">しまの いちらん</i></summary>
        <ol>${mapList.map(listRow).join('')}</ol>
      </details>
      <details class="wmap-panel wmap-key"${small ? '' : ' open'}>
        <summary><b class="en">KEY</b><i class="ja">せつめい</i></summary>
        <ul>${keyRow('here', 'You are here', 'きみは ここ')}${keyRow('num', 'Island number', 'しまの ばんごう')}${keyRow('bridge', 'Bridge (walk)', 'はし（あるいて 行ける）')}${keyRow('premium', 'Premium', 'プレミアム')}${keyRow('cloud', 'Not open yet', 'まだ ひらいて いない')}${keyRow('ferry', 'Boat', 'ふね')}${keyRow('plane', 'Airport', 'ひこうきの のりば')}</ul>
      </details>
      <div class="wmap-tools">
        <button type="button" data-wm-zoom="in" aria-label="ちかづける" data-t-label="ちかづける">＋</button>
        <button type="button" data-wm-zoom="out" aria-label="とおざける" data-t-label="とおざける">－</button>
        <button type="button" data-wm-zoom="main" aria-label="メインの島を 見る" data-t-label="メインの島を 見る">⌂</button>
        <button type="button" data-wm-zoom="all" aria-label="ぜんぶ 見る" data-t-label="ぜんぶ 見る">⤢</button>
        ${kid ? '' : '<button type="button" class="wmap-book" aria-label="なかま ずかん" data-t-label="なかま ずかん">📖</button>'}
      </div>
    </div>
    <div class="wm-scroll">
      <div class="wm-sechead"><h3 class="wm-section big"><b class="en">⭐ Recommended</b><i class="ja">⭐ おすすめ</i></h3>
        <span class="wm-legend">🎮 <b class="en">Play</b><i class="ja">あそび</i>　📖 <b class="en">English</b><i class="ja">えいご</i></span></div>
      <div class="wm-rec${rec.length > 6 ? ' two' : ''}" style="--wm-n:${rec.length > 6 ? Math.ceil(rec.length / 2) : rec.length}">${rec.map((r) => card(r, true)).join('')}</div>
      ${more.length ? `<h3 class="wm-section"><b class="en">More</b><i class="ja">ほかの ワールド</i></h3>
      <div class="wm-grid small">${more.map((r) => card(r)).join('')}</div>` : ''}
      ${kid ? '' : `<h3 class="wm-section"><b class="en">⛰ Adventure</b><i class="ja">⛰ ぼうけんの ちいき</i></h3>
      <div class="wm-grid small">${regions.map((r) => card(r)).join('')}</div>
      <button type="button" class="wm-book"><b class="en">📖 Creature Book</b><i class="ja">📖 なかま ずかん</i></button>`}
    </div>
  </section>`;
  host.querySelector('.wm-close').onclick = () => onClose?.();
  host.querySelectorAll('.wm-book, .wmap-book').forEach((b) => { b.onclick = () => onBook?.(); });
  host.querySelectorAll('[data-world]').forEach((b) => { b.onclick = () => onPick?.(b.dataset.world); });
  host.querySelectorAll('[data-wm-pick]').forEach((b) => { b.onclick = () => onPick?.(b.dataset.wmPick); });
  // えの ちず：下絵は 1 回だけ 作って 使いまわす。ここで かくのは「いま ここ」・🔒・くもだけ（world-map.js）。
  mapCtl?.destroy(); mapCtl = null;
  const wm = host.querySelector('.wm');
  const mount = (first) => {
    if (mapCtl) return;
    mapCtl = mountWorldMap(host.querySelector('.wmap'), { state: { ...state, isJa: isJa() }, onPick, kid, kids: KIDS_ISLANDS, fresh: first, style: view === 'guide' ? 'guide' : 'paint' });
  };
  const setView = (v, save) => {
    view = v; wm.classList.toggle('is-map', v !== 'cards'); wm.classList.toggle('is-cards', v === 'cards');
    host.querySelectorAll('[data-wm-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wmView === v)));
    if (save) saveView(v);
    if (v !== 'cards') { mount(fresh); mapCtl.setStyle(v === 'guide' ? 'guide' : 'paint'); }
  };
  host.querySelectorAll('[data-wm-view]').forEach((b) => { b.onclick = () => setView(b.dataset.wmView, true); });
  host.querySelectorAll('[data-wm-zoom]').forEach((b) => { b.onclick = () => { const z = b.dataset.wmZoom; if (!mapCtl) return; z === 'in' ? mapCtl.zoom(1.5) : z === 'out' ? mapCtl.zoom(1 / 1.5) : z === 'main' ? mapCtl.focus('main') : mapCtl.reset(); }; });
  setView(view, false);
}
