// 絵本の 絵（SVG）→ PNG。Roblox は SVG を うけとらないので、サーバーで 画像に する（お金の かからない 部品：@resvg/resvg-js）。
// 大きさは 1024×768：Roblox は 画像を 長い 辺 1024 までに ちぢめるので、これより 大きく しても 同じ。絵は 4:3（800×600）で かいて いる。
// うごきの ない 絵（still）で かく。部品が 入って いない 環境では null を 返す（サーバーは 止めない）。
import { createHash } from 'node:crypto';
import { renderScene } from '../game/reading-art/render.js';
import { ART_VERSION } from '../game/reading.js';

export const PNG_WIDTH = 1024; export const PNG_HEIGHT = 768;
let Resvg = null; let tried = false;
async function load() {
  if (!tried) { tried = true; try { ({ Resvg } = await import('@resvg/resvg-js')); } catch { Resvg = null; } }
  return Resvg;
}
export const pngReady = async () => !!(await load());

// 本の n ばんめの 絵（0＝表紙、1〜＝ページ）の SVG。ない ときは null。
export function sceneSvg(book, n) {
  const scene = n === 0 ? book.cover : book.pages[n - 1]?.scene;
  return scene ? renderScene(scene, { seed: book.id, still: true }) : null;
}
// 絵の しるし（同じ 絵は 同じ しるし）。絵の かき方（ART_VERSION）か 場面が かわると かわる＝上げなおす。
export function artHash(book, n) {
  const svg = sceneSvg(book, n);
  return svg ? createHash('sha256').update(`${ART_VERSION}|${PNG_WIDTH}x${PNG_HEIGHT}|${svg}`).digest('hex').slice(0, 32) : '';
}
export async function renderPng(book, n) {
  const R = await load(); const svg = sceneSvg(book, n);
  if (!R || !svg) return null;
  const out = new R(svg, { fitTo: { mode: 'width', value: PNG_WIDTH }, background: '#ffffff', font: { loadSystemFonts: false } }).render();
  return Buffer.from(out.asPng());
}
// PNG の 大きさ（IHDR）。
export function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
