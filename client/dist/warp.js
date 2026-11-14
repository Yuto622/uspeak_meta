// ひこうきの ワープ演出（warp.css）。#warp-fx の 中に 輪を 3 本 だけ 並べ、
// startWarp() / stopWarp() で body[data-warp] を 立てたり 消したりする。強さは setWarp(u)（0..1 の 進みぐあい）。
// 2026-11：重いと 言われて 軽くした（光の すじ・つぶ・ぼかし・走査線・パネルの すりガラスを やめた）。
let built = false;
function build() {
  if (built) return;
  const root = document.getElementById?.('warp-fx');
  if (!root) return;
  built = true;
  root.innerHTML = `<div class="wf-tunnel">${[0, 1, 2].map((i) => `<i style="--i:${i}"></i>`).join('')}</div><div class="wf-edge"></div>`;
}
// 検査（tests/regression.mjs）の 作りものの document でも 落ちないように、ない 物は だまって とばす。
const body = () => (typeof document !== 'undefined' ? document.body : null);
export function startWarp() { try { build(); } catch { /* 演出だけ */ } const b = body(); if (b?.dataset) b.dataset.warp = '1'; setWarp(0); }
export function stopWarp() { const b = body(); if (b?.dataset) delete b.dataset.warp; }
export function setWarp(u) { body()?.style?.setProperty?.('--warp', Math.max(0.5, Math.sin(Math.min(1, Math.max(0, u)) * Math.PI)).toFixed(3)); }
