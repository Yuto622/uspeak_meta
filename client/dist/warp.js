// ひこうきの ワープ演出（warp.css）。#warp-fx の 中に 輪と 光の つぶを 並べ、
// startWarp() / stopWarp() で body[data-warp] を 立てたり 消したりする。強さは setWarp(u)（0..1 の 進みぐあい）。
let built = false;
function build() {
  if (built) return;
  const root = document.getElementById?.('warp-fx');
  if (!root) return;
  built = true;
  const rings = Array.from({ length: 6 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  const COL = ['#ffffff', '#8affef', '#ff9be8', '#b9a4ff'];
  const dust = Array.from({ length: 48 }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const d = 60 + Math.random() * 640;
    return `<b style="--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d)}px;--c:${COL[i % 4]};--d:${(1 + Math.random() * 1.6).toFixed(2)}s;--w:${(-Math.random() * 3).toFixed(2)}s"></b>`;
  }).join('');
  root.innerHTML = `<div class="wf-streaks"></div><div class="wf-streaks"></div><div class="wf-tunnel"><div>${rings}</div></div>`
    + `<div class="wf-dust">${dust}</div><div class="wf-core"></div><div class="wf-edge"></div>`;
}
// 検査（tests/regression.mjs）の 作りものの document でも 落ちないように、ない 物は だまって とばす。
const body = () => (typeof document !== 'undefined' ? document.body : null);
export function startWarp() { try { build(); } catch { /* 演出だけ */ } const b = body(); if (b?.dataset) b.dataset.warp = '1'; setWarp(0); }
export function stopWarp() { const b = body(); if (b?.dataset) delete b.dataset.warp; }
export function setWarp(u) { body()?.style?.setProperty?.('--warp', Math.max(0.5, Math.sin(Math.min(1, Math.max(0, u)) * Math.PI)).toFixed(3)); }
