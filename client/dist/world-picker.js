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
    const sub = r.id === 'main' && !big ? `${r.yomi || r.name} · はしで U-Speak島へ` : (r.yomi || r.name);
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
  host.innerHTML = `<section class="wm">
    <header class="wm-head">
      <h2><b class="en">Choose a World</b><i class="ja">せかいを えらぼう</i></h2>
      <button type="button" class="wm-close" aria-label="とじる" data-t-label="とじる">✕</button>
    </header>
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
  const book = host.querySelector('.wm-book'); if (book) book.onclick = () => onBook?.();
  host.querySelectorAll('[data-world]').forEach((b) => { b.onclick = () => onPick?.(b.dataset.world); });
}
