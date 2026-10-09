// しまの ちず — 「Choose a World」。色つきのカードを並べて、押すと そこへ とぶ。
//
// 前は海図（rpg-map.js の canvas）に島を置いていた。島が 19 になって 名前が読めなくなったので、
// Roblox の ワールド選び と同じ形にした：大きな絵・英語の名前（白い縁どり）・日本語の名前。
// **どこへ とべるか・何が ひらいているかは rpg.js が決める**（ここは並べるだけ）。
//
// 島の名前の定義元は rpg-data.js の HUBS / REGIONS（`en` / `name` / `yomi`）。ここに書くのは
// 絵と色だけ。新しい島を足したら LOOK に1行（無ければ 🏝 と 島の色で出る）。
import { isJa } from './i18n.js';

const LOOK = {
  willow: ['🏡', '#5aae78'], park: ['🎡', '#e27a2d'], errand: ['🛍️', '#e0a526'], school: ['🏫', '#5b97e6'],
  arena: ['⚔️', '#c8573e'], pet: ['🐣', '#f0b43c'], ride: ['🏁', '#4f86d9'], town: ['🏗️', '#7db65a'],
  eiken5: ['📗', '#4fae6b'], eiken4: ['📙', '#e08a2c'], eiken3: ['📘', '#3f6fb8'], talk: ['💬', '#3baacb'],
  conv: ['🗣️', '#e0668e'], wear: ['👕', '#b06fc4'], mini: ['🎮', '#7a5cc8'], farm: ['🐄', '#8dbe45'],
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
  return short === short.toUpperCase() ? short.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : short;
};

export function lookOf(r) { return LOOK[r.id] || ['🏝', hex(r.color ?? 0x5aae78)]; }

// `state`: { current, unlocked(id), cleared(id), count(id) } — どれも rpg.js の store から。
export function renderWorldPicker(host, { destinations, state, onPick, onClose, onBook }) {
  const card = (r) => {
    const [icon, color] = lookOf(r);
    const open = state.unlocked(r.id);
    const here = r.id === state.current;
    const done = !r.hub && open && state.cleared(r.id);
    const sub = r.yomi || r.name;
    return `<button type="button" class="wm-card${open ? '' : ' locked'}${here ? ' here' : ''}" data-world="${esc(r.id)}" style="--wc:${color}"
        aria-label="${esc(isJa() ? r.name : title(r))}">
      <span class="wm-icon" aria-hidden="true">${icon}</span>
      <b class="wm-name">${esc(title(r))}</b>
      <small class="wm-ja" translate="no">${esc(sub)}</small>
      ${here ? `<em class="wm-badge here"><b class="en">📍 You are here</b><i class="ja">📍 いま ここ</i></em>` : ''}
      ${done ? '<em class="wm-badge done">✓</em>' : ''}
      ${open ? '' : '<span class="wm-lock" aria-hidden="true">🔒</span>'}
    </button>`;
  };
  const hubs = destinations.filter((d) => d.hub);
  const regions = destinations.filter((d) => !d.hub);
  host.innerHTML = `<section class="wm">
    <header class="wm-head">
      <h2><b class="en">Choose a World</b><i class="ja">せかいを えらぼう</i></h2>
      <button type="button" class="wm-close" aria-label="とじる" data-t-label="とじる">✕</button>
    </header>
    <div class="wm-scroll">
      <h3 class="wm-section"><b class="en">🏝 Islands</b><i class="ja">🏝 しま</i></h3>
      <div class="wm-grid">${hubs.map(card).join('')}</div>
      <h3 class="wm-section"><b class="en">⛰ Adventure</b><i class="ja">⛰ ぼうけんの ちいき</i></h3>
      <div class="wm-grid">${regions.map(card).join('')}</div>
      <button type="button" class="wm-book"><b class="en">📖 Creature Book</b><i class="ja">📖 なかま ずかん</i></button>
    </div>
  </section>`;
  host.querySelector('.wm-close').onclick = () => onClose?.();
  host.querySelector('.wm-book').onclick = () => onBook?.();
  host.querySelectorAll('[data-world]').forEach((b) => { b.onclick = () => onPick?.(b.dataset.world); });
}
