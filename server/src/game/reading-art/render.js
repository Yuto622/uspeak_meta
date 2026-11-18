// 絵本の 絵を サーバーで かく — 場面（背景 1 つ＋登場人物・小物）→ 1 まいの SVG（800×600）。
//
// ・背景は backgrounds.js（4 そうの 図形）、人は people.js（体の ある 人物。顔の 絵文字は 気持ちとして 人の 顔に うつす）、
//   顔だけの どうぶつは 体を かいて のせる。小物は emoji/ の Twemoji（CC-BY 4.0・フォントに たよらないので どの 端末でも 同じ 絵）。
// ・お金は かからない（画像生成の API を 呼ばない）。同じ 場面は いつも 同じ SVG（キャッシュできる）。
// ・場面の 書き方は 前と 同じ（{ bg, items:[{ e, x, y, s, a, flip }] }）。本の JSON は 変えずに 絵だけ よく なる。
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { background, AIRY, DARK, HORIZON } from './backgrounds.js';
import { person, ROLES, MOODS } from './people.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'emoji');
export const W = 800; export const H = 600;
const n = (v) => Math.round(v * 10) / 10;
const fileOf = (e) => [...(e.includes('‍') ? e : e.replace(/️/g, ''))].map((c) => c.codePointAt(0).toString(16)).join('-');
const glyphs = new Map();
// 絵文字 1 つの 中身（<svg> の 中）。ない ものは null。
function glyph(e) {
  const id = fileOf(e);
  if (!/^[0-9a-f-]{2,80}$/.test(id)) return null;
  if (!glyphs.has(id)) {
    const p = path.join(DIR, `${id}.svg`);
    glyphs.set(id, existsSync(p) ? { id, inner: readFileSync(p, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') } : null);
  }
  return glyphs.get(id);
}

// 顔だけの どうぶつ → 体を かく（[体の 色, おなかの 色, しっぽ]）。
const BODIES = {
  '🐰': ['#e3e7ea', '#ffffff', 'puff'], '🦊': ['#f4900c', '#fff3e0', 'bushy'], '🐻': ['#c1694f', '#e6b8a0', 'stub'], '🐻‍❄️': ['#f2f6fa', '#ffffff', 'stub'],
  '🐸': ['#77b255', '#c6e5b3', ''], '🐱': ['#ffcc4d', '#fff0c2', 'long'], '🦁': ['#ffcc4d', '#fff0c2', 'tuft'], '🐨': ['#aab8c2', '#e1e8ed', 'stub'],
  '🐺': ['#8899a6', '#e1e8ed', 'bushy'], '🐶': ['#d99e82', '#f7dece', 'long'], '🐵': ['#b0764a', '#e8c4a0', 'long'], '🐭': ['#aab8c2', '#f4c7d0', 'thin'],
  '🐷': ['#f4abba', '#ffd7de', 'curl'], '🐹': ['#f4b46a', '#fff0d8', 'stub'], '🐼': ['#f5f8fa', '#ffffff', 'stub'], '🐯': ['#ffac33', '#fff0c2', 'long'], '🐮': ['#f2f2f2', '#ffd7de', 'thin'],
  '🤖': ['#8fa3b8', '#dfe8f0', ''],
};
function creature(e, mood) {
  const [c, belly, tail] = BODIES[e]; const robot = e === '🤖';
  let s = '<ellipse cx="0" cy="2" rx="50" ry="8" fill="#000" opacity=".16"/>';
  if (tail === 'bushy') s += `<path d="M30,-22 q52,-6 46,-58 q-4,-18 -18,-10 q10,34 -30,44 Z" fill="${c}"/><path d="M70,-84 q-6,-12 -14,-6 q8,10 14,22 Z" fill="#fff"/>`;
  if (tail === 'long') s += `<path d="M30,-16 q50,6 44,-44" stroke="${c}" stroke-width="11" fill="none" stroke-linecap="round"/>`;
  if (tail === 'thin' || tail === 'tuft') s += `<path d="M30,-16 q46,4 42,-40" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>${tail === 'tuft' ? '<circle cx="72" cy="-58" r="9" fill="#c1694f"/>' : ''}`;
  if (tail === 'curl') s += `<path d="M32,-30 q20,-4 14,-18 q-8,-8 -12,2" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  if (tail === 'puff') s += `<circle cx="36" cy="-20" r="13" fill="#fff"/>`;
  if (tail === 'stub') s += `<circle cx="34" cy="-22" r="9" fill="${c}"/>`;
  if (robot) {
    s += `<rect x="-30" y="-16" width="20" height="16" rx="5" fill="#6e8296"/><rect x="10" y="-16" width="20" height="16" rx="5" fill="#6e8296"/><rect x="-22" y="-30" width="12" height="18" fill="#8fa3b8"/><rect x="10" y="-30" width="12" height="18" fill="#8fa3b8"/>`;
    s += `<path d="M-44,-78 L-58,-44" stroke="#6e8296" stroke-width="11" stroke-linecap="round"/><path d="M44,-78 L58,-44" stroke="#6e8296" stroke-width="11" stroke-linecap="round"/><circle cx="-59" cy="-40" r="9" fill="#f4900c"/><circle cx="59" cy="-40" r="9" fill="#f4900c"/>`;
    s += `<rect x="-38" y="-92" width="76" height="66" rx="14" fill="${c}"/><rect x="-24" y="-78" width="48" height="30" rx="7" fill="${belly}"/><circle cx="-12" cy="-63" r="5" fill="#e2574c"/><circle cx="2" cy="-63" r="5" fill="#ffd24a"/><circle cx="16" cy="-63" r="5" fill="#5aae78"/><rect x="-6" y="-98" width="12" height="8" fill="#6e8296"/>`;
  } else {
    s += `<ellipse cx="-20" cy="-5" rx="19" ry="10" fill="${c}"/><ellipse cx="20" cy="-5" rx="19" ry="10" fill="${c}"/>`;
    s += `<path d="M0,-98 C44,-98 46,-8 0,-8 C-46,-8 -44,-98 0,-98 Z" fill="${c}"/><ellipse cx="0" cy="-42" rx="23" ry="28" fill="${belly}"/>`;
    s += `<ellipse cx="-36" cy="-58" rx="10" ry="19" fill="${c}" transform="rotate(${mood === 'happy' ? -150 : 18} -36 -72)"/><ellipse cx="36" cy="-58" rx="10" ry="19" fill="${c}" transform="rotate(${mood === 'happy' ? 150 : -18} 36 -72)"/>`;
  }
  return { svg: s, head: { size: 104, cx: 0, cy: robot ? -138 : -128 }, height: 190, width: 130 };
}

// その 絵文字を かけるか（人・体つきの どうぶつ・emoji/ に ある もの）。本の 検査が 使う。
export const canDraw = (e) => !!(ROLES[e] || BODIES[e] || glyph(String(e || '')));

// 空に ある もの・しるし・気持ちの しるし（影を つけない・地面に おかない）。
const FLOATY = new Set('☀️ 🌙 ⭐ ☁️ ✨ 💧 💦 💨 💤 💭 💬 💡 ❓ ❔ ❗ ❌ ⭕ ➡️ ⬅️ ⬆️ ⬇️ ↔️ 🎵 🎶 ❤️ 💓 💔 💚 💥 💢 💫 🌟 🌈 🌧️ ❄️ 🌬️ 🌫️ ⚡ 🔥 🚫 ✅ ➕ ➖ ➗ ✖️ 〰️ 🔄 🔊 📈 📉 📊 🕊️ 🐦 🐝 🦋 ✈️ 🚀 🛰️ 🛫 🛬 🎈 🎆 🌕 🌍 🌏 🌐 🪐 🌌 🔢 🔟 ⚠️ 👀 👂 👃 👄 🧠 👉 ☝️ ✌️ 👍 👏 ✋ 👋 🖐️ ✊ 💪 🤝 ♀️ ♂️ ⚫ ⚪ 🟡 🟢 🔵 🟦 🟨 🟥 🔺 🕙 🕛 🕕 ⏰ ⏱️ ⏳ 📅'.split(' '));
// 水の 上・中に いる もの（影の かわりに 水の 輪）。
const SWIMMY = new Set('⛵ 🚢 🚤 🐟 🐠 🐬 🐋 🐳 🦭 🐢 🦆 🏊 🛟 🍾 🦀 🐚 ⚓'.split(' '));

const SEASIDE = new Set('🌊 🐢 🐟 🐠 ⛵ 🚢 🐬 🐋 🦀 🐚'.split(' '));
const SKYLIGHT = new Set('☀️ 🌙 🌕 🌞 🌝 🌛 🌅 🌇'.split(' '));
const INDOOR = new Set(['room', 'kitchen', 'school', 'shop']);
const MOONS = new Set('🌙 🌕 🌛 🌝'.split(' '));
const STYLE = `<style>
.m{transform-box:fill-box;transform-origin:50% 100%}
.bob{animation:b 2.6s ease-in-out infinite}.float{animation:f 3.6s ease-in-out infinite}.sway{animation:s 3s ease-in-out infinite}
.hop{animation:h 1.5s ease-in-out infinite}.spin{animation:sp 7s linear infinite;transform-origin:50% 50%}.drift{animation:d 9s ease-in-out infinite}.pulse{animation:p 1.9s ease-in-out infinite;transform-origin:50% 50%}
@keyframes b{50%{transform:translateY(-9px)}}@keyframes f{50%{transform:translateY(-16px)}}@keyframes s{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes h{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-26px)}}@keyframes sp{to{transform:rotate(360deg)}}
@keyframes d{0%,100%{transform:translateX(-18px)}50%{transform:translateX(18px)}}@keyframes p{50%{transform:scale(1.12)}}
@media (prefers-reduced-motion:reduce){.m{animation:none!important}}
</style>`;

const POSE = { hop: 'cheer', bob: 'wave', pulse: 'cheer' };

// 場面 → SVG の 文字列。opts: { seed（本の id：同じ 本の 同じ 人は 同じ 見た目）, still（うごかさない：表紙の 小さい 絵） }。
export function renderScene(scene, { seed = '', still = false } = {}) {
  const raw = Array.isArray(scene?.items) ? scene.items : [];
  // よるの 場面に 海の ものが あれば よるの はまべ。場面に 太陽・月が あれば 背景の ほうは かかない（2 つ ならばない）。
  const bgName = scene?.bg === 'night' && raw.some((it) => SEASIDE.has(it?.e)) ? 'nightsea' : scene?.bg;
  const bg = background(bgName, { bare: raw.some((it) => SKYLIGHT.has(it?.e)) });
  const airy = AIRY.has(bgName); const horizon = (HORIZON[bgName] ?? 66) * 6;
  const items = raw.slice(0, 8).map((it, i) => ({ ...it, i, e: String(it.e || ''), px: 400 + (Number(it.x) - 50) * 8 * 0.86, py: Number(it.y) * 6, size: Number(it.s) * 54 }));
  const people = items.filter((it) => ROLES[it.e] || BODIES[it.e]);
  // 顔の 絵文字は いちばん 近い 人の 気持ちに する（人が いない 場面では そのまま 出す）。
  const moodOf = new Map(); const dropped = new Set();
  if (people.length) for (const it of items) {
    const mood = MOODS[it.e]; if (!mood) continue;
    let best = null; let bd = Infinity;
    for (const p of people) { const d = Math.hypot(p.px - it.px, (p.py - it.py) * 0.6); if (d < bd && !moodOf.has(p.i)) { bd = d; best = p; } }
    if (!best) best = people[0];
    moodOf.set(best.i, mood); dropped.add(it.i);
  }
  if (items.some((it) => it.e === '💤') && people.length === 1 && !moodOf.has(people[0].i)) moodOf.set(people[0].i, 'sleep');

  // 人の 背の 高さ。同じ 絵に 子どもと 大人が いたら、大人の ほうが 高く なるように そろえる。
  const tallOf = new Map();
  for (const it of items) {
    const role = ROLES[it.e]; if (!role) continue;
    tallOf.set(it.i, role.baby ? Math.max(110, Math.min(220, it.size * 1.2)) : Math.max(150, Math.min(role.kid ? 340 : 400, it.size * (role.kid ? 1.75 : 2.05))));
  }
  const kids = items.filter((it) => ROLES[it.e]?.kid && !ROLES[it.e].baby); const adults = items.filter((it) => ROLES[it.e] && !ROLES[it.e].kid);
  if (kids.length && adults.length) {
    const kidMax = Math.max(...kids.map((it) => tallOf.get(it.i))); let adultMin = Math.min(...adults.map((it) => tallOf.get(it.i)));
    if (adultMin < kidMax * 1.22) {
      const up = Math.min(kidMax * 1.22, 400) / adultMin;
      for (const it of adults) tallOf.set(it.i, Math.min(400, tallOf.get(it.i) * up));
      adultMin = Math.min(...adults.map((it) => tallOf.get(it.i)));
      if (adultMin < kidMax * 1.22) { const down = adultMin / 1.22 / kidMax; for (const it of kids) tallOf.set(it.i, Math.max(140, tallOf.get(it.i) * down)); }
    }
  }
  const defs = new Map(); const layers = [];
  const use = (e, x, y, size) => { const g = glyph(e); if (!g) return ''; defs.set(g.id, g.inner); return `<use href="#e${g.id}" x="${n(x - size / 2)}" y="${n(y - size / 2)}" width="${n(size)}" height="${n(size)}"/>`; };
  const wrap = (it, inner, cx, cy) => {
    const cls = !still && it.a && it.a !== 'none' ? ` class="m ${it.a}"` : '';
    const flip = it.flip ? ` transform="translate(${n(cx * 2)},0) scale(-1,1)"` : '';
    return `<g${flip}><g${cls}>${inner}</g></g>`;
  };
  for (const it of items) {
    if (dropped.has(it.i)) continue;
    if (ROLES[it.e]) {
      const mood = moodOf.get(it.i) || 'smile';
      const pose = mood === 'sad' || mood === 'cry' || mood === 'sleep' ? 'droop' : mood === 'happy' && !it.a ? 'wave' : POSE[it.a] || 'stand';
      const fig = person({ emoji: it.e, seed, mood, pose });
      const tall = tallOf.get(it.i);
      const k = tall / fig.height;
      const feet = airy ? Math.min(590, it.py + tall * 0.5) : Math.max(Math.min(horizon + 40, 560), Math.min(580, it.py + tall * 0.52));
      layers.push({ z: feet, svg: wrap(it, `<g transform="translate(${n(it.px)},${n(feet)}) scale(${n(k * 100) / 100})">${fig.svg}</g>`, it.px, feet) });
      continue;
    }
    if (BODIES[it.e]) {
      const mood = moodOf.get(it.i) || (it.a === 'hop' ? 'happy' : 'smile');
      const fig = creature(it.e, mood);
      const tall = Math.max(130, Math.min(320, it.size * 1.5)); const k = tall / fig.height;
      const feet = airy ? Math.min(590, it.py + tall * 0.5) : Math.max(Math.min(horizon + 40, 560), Math.min(580, it.py + tall * 0.5));
      const head = use(it.e, fig.head.cx, fig.head.cy, fig.head.size);
      layers.push({ z: feet, svg: wrap(it, `<g transform="translate(${n(it.px)},${n(feet)}) scale(${n(k * 100) / 100})">${fig.svg}${head}</g>`, it.px, feet) });
      continue;
    }
    const size = Math.max(40, it.size * 0.96); const bottom = it.py + size / 2;
    const floaty = airy || FLOATY.has(it.e) || bottom < horizon - 6;
    let extra = '';
    if (!floaty) {
      extra = SWIMMY.has(it.e) && (bgName === 'sea' || bgName === 'river' || bgName === 'beach')
        ? `<ellipse cx="${n(it.px)}" cy="${n(bottom - size * 0.06)}" rx="${n(size * 0.56)}" ry="${n(size * 0.09)}" fill="none" stroke="#fff" stroke-width="3" opacity=".6"/>`
        : `<ellipse cx="${n(it.px)}" cy="${n(bottom - size * 0.03)}" rx="${n(size * 0.42)}" ry="${n(size * 0.075)}" fill="#000" opacity=".17"/>`;
    }
    const pic = use(it.e, it.px, it.py, size);
    if (!pic) continue;
    // しるし（？・！・ふきだし など）は 白い ふちで 絵から うかせる。
    const sticker = FLOATY.has(it.e) && !airy ? ` filter="url(#lift)"` : '';
    layers.push({ z: floaty ? -1000 + it.i : bottom, svg: `${extra}${wrap(it, `<g${sticker}>${pic}</g>`, it.px, it.py)}`, front: floaty && FLOATY.has(it.e) && /[❓❔❗💬💭💡❌⭕➡⬅⬆⬇💤💢💥❤💓💔🎵🎶✨💦💨]/u.test(it.e) });
  }
  // へやの 場面に 月が あれば よる：へやを うす暗く する（まどの 外が 昼の ままに 見えない）。
  const dusk = INDOOR.has(bgName) && raw.some((it) => MOONS.has(it?.e)) ? `<rect width="${W}" height="${H}" fill="#1a2350" opacity=".34"/>` : '';
  const back = layers.filter((l) => !l.front).sort((a, b) => a.z - b.z); const front = layers.filter((l) => l.front);
  const symbols = [...defs].map(([id, inner]) => `<symbol id="e${id}" viewBox="0 0 36 36">${inner}</symbol>`).join('');
  const lift = `<filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="${DARK.has(bgName) ? '#000' : '#3a2410'}" flood-opacity=".3"/></filter>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img">${still ? '' : STYLE}<defs>${bg.defs}${lift}${symbols}</defs>${bg.body}${dusk}${back.map((l) => l.svg).join('')}${front.map((l) => l.svg).join('')}</svg>`;
}
