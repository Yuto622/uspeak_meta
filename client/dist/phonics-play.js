// フォニックスの おとを 鳴らす（/phonics/<id>・phonics.js の 一覧）。
//
//   import { playSounds, blendSounds, stopSounds, preloadSounds, setPhonicsVersion } from './phonics-play.js';
//   await playSounds(['k', 'a', 't'], { gap: 0.3, onStep: (i) => … });   // 1 つずつ（i は いま 鳴って いる ばんごう）
//   await blendSounds(['k', 'a', 't'], { onStep });                         // ゆっくり → つなげて（フォニックスの 「よむ」）
//
// ・音は WebAudio で ならべて 鳴らす（つぎの 音を ぴったりの 時刻に 予約できる＝つなげて よむ ときに すきまが 出ない）。
//   AudioContext は sfx.js と 同じ ものを つかう。♫ を 切って いる ときは 鳴らさず、ばんごうだけ 同じ はやさで すすむ。
// ・null の おと（cake の だまる e）は 音を 出さずに すこし 待つ。
// ・どこで 失敗しても 例外を 外に 出さない（音が 出なくても 画面は すすむ）。
import { sfxContext, sfxMuted } from './sfx.js';

let version = 'b1';
const cache = new Map();   // id → Promise<AudioBuffer|null>
let token = 0;
let nodes = [];
let timers = [];

export function setPhonicsVersion(v) {
  const next = String(v || 'b1');
  if (next !== version) { version = next; cache.clear(); }
}
const url = (id) => `/phonics/${encodeURIComponent(id)}?v=${encodeURIComponent(version)}`;

function context() { try { return sfxMuted() ? null : sfxContext(); } catch { return null; } }

function load(id) {
  if (!id) return Promise.resolve(null);
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const ctx = context(); if (!ctx) return null;
    const res = await fetch(url(id)); if (!res.ok) return null;
    const data = await res.arrayBuffer();
    return await new Promise((resolve) => { try { ctx.decodeAudioData(data, resolve, () => resolve(null)); } catch { resolve(null); } });
  })().catch(() => null);
  cache.set(id, p);
  p.then((b) => { if (!b) cache.delete(id); });
  return p;
}
export function preloadSounds(ids) { for (const id of new Set((ids || []).filter(Boolean))) load(id); }

export function stopSounds() {
  token += 1;
  for (const t of timers) clearTimeout(t);
  timers = [];
  for (const n of nodes) { try { n.stop(); } catch { /* もう 止まって いる */ } try { n.disconnect(); } catch { /* */ } }
  nodes = [];
}
const later = (fn, ms) => { timers.push(setTimeout(fn, Math.max(0, ms))); };

// ids を ならべて 鳴らす。gap＝音と 音の あいだ（秒・マイナスなら かさねる）。おわると resolve。
export async function playSounds(ids, { gap = 0.3, onStep, overlap = 0 } = {}) {
  stopSounds();
  const me = token;
  const list = (Array.isArray(ids) ? ids : [ids]).slice(0, 12);
  const step = (i) => { if (me === token) { try { onStep?.(i); } catch { /* 画面の 都合で 止めない */ } } };
  const ctx = context();
  const bufs = ctx ? await Promise.all(list.map(load)) : list.map(() => null);
  if (me !== token) return;
  // 鳴らせない（♫ オフ・読めない）ときも、ばんごうは 同じ はやさで すすめる。
  const lens = bufs.map((b, i) => (b ? b.duration : list[i] ? 0.4 : 0.25));
  let at = 0;
  const start = ctx ? ctx.currentTime + 0.05 : 0;
  list.forEach((id, i) => {
    const b = bufs[i];
    if (ctx && b) {
      try {
        const src = ctx.createBufferSource(); const g = ctx.createGain();
        src.buffer = b; g.gain.value = 0.95; src.connect(g); g.connect(ctx.destination);
        src.start(start + at); nodes.push(src, g);
      } catch { /* この 音だけ とばす */ }
    }
    later(() => step(i), at * 1000 + 50);
    at += lens[i] * (1 - overlap) + (i < list.length - 1 ? gap : 0);
  });
  await new Promise((r) => later(r, at * 1000 + 120));
  step(-1);
}

// フォニックスの「つなげて よむ」：1 つずつ ゆっくり → すこし まって → かさねて つなげる。
export async function blendSounds(ids, { onStep } = {}) {
  const me = token + 1;
  await playSounds(ids, { gap: 0.32, onStep });
  if (token !== me) return;
  await new Promise((r) => later(r, 350));
  if (token !== me) return;
  await playSounds(ids, { gap: -0.02, overlap: 0.3, onStep: (i) => onStep?.(i < 0 ? -1 : 'all') });
}
