// 「ABC と おと」の 絵カード（じぶんたちで かいた 絵・abc-art-words/）を Roblox へ 上げる ための 小さな 部品。
//
// ・上げるのは **ことばの 絵カードだけ**（1 ことば 1 まい・512×512 の PNG）。もじは 上げない（Roblox の 画面で 字として 出す）。
// ・絵本と 同じ 道具（book-assets.js の BookAssets）で 上げる：1 ことばを「ページの ない 1 冊」（id は abc-<ことば>）として わたすので、
//   「同じ 絵は 1 回だけ」「とちゅうから つづける」「絵が かわったら 上げなおす」「おくりすぎない」「審査の ようす」は 絵本と まったく 同じ。
// ・**Roblox には 出さない ことば**（ROBLOX_BLOCKED）：絵が Roblox の 審査（Community Standards）に ひっかかりそうな もの。
//   上げないし、Roblox 版の 問題にも 使わない（Web 版は かわらない）。表を かえたら ABC_SAFE_VERSION を 上げる。
import { createHash } from 'node:crypto';
import { allWords } from '../game/abc.js';
import { wordSvg, ABC_ART_VERSION } from '../game/abc-art.js';

export const ABC_SAFE_VERSION = 1;
export const ABC_PNG = 512;
// ことば → 出さない 理由（管理ページに 出す）。
export const ROBLOX_BLOCKED = Object.freeze({
  bath: 'おふろに 入って いる 子（はだかに 見える）',
  underwear: '下着',
  mouth: 'くちびるの アップ',
  hug: 'だきあう 2 人と ハート（れんあいに 見える おそれ）',
  leg: 'はだしの 足だけの 絵（はだの 色の アップ）',
  foot: 'はだしの 足だけの 絵（はだの 色の アップ）',
});
export const abcBookId = (word) => `abc-${word}`;
export const isAbcBook = (b) => !!b && b.abc === true;

// Roblox に 上げる ことば（出さない ものを のぞく）。
export function robloxWords() { return allWords().filter((w) => !ROBLOX_BLOCKED[w]); }
// BookAssets に わたす「本」の 形（ページなし＝絵は n=0 の 1 まい）。group で 管理ページの 1 行に まとまる。
export function abcBooks() {
  const m = new Map();
  for (const w of robloxWords()) m.set(abcBookId(w), { id: abcBookId(w), abc: true, word: w, title: `ABC ${w}`, stage: 'A', pages: [], group: 'abc', groupTitle: '🔤 ABC と おと（ことばの 絵カード）' });
  return m;
}
export function abcHash(b) {
  const svg = wordSvg(b.word);
  return svg ? createHash('sha256').update(`abc|${ABC_ART_VERSION}|${ABC_SAFE_VERSION}|${ABC_PNG}|${svg}`).digest('hex').slice(0, 32) : '';
}
let Resvg = null; let tried = false;
export async function abcPng(b) {
  if (!tried) { tried = true; try { ({ Resvg } = await import('@resvg/resvg-js')); } catch { Resvg = null; } }
  const svg = wordSvg(b.word);
  if (!Resvg || !svg) return null;
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: ABC_PNG }, background: '#ffffff', font: { loadSystemFonts: false } }).render().asPng());
}

// 絵本と ABC を 1 つの BookAssets で あつかう ための 3 つ（index.js・CLI・テストが 同じ ものを 使う）。
export function withAbc({ books, render, hash }) {
  return {
    books: () => new Map([...books(), ...abcBooks()]),
    render: (b, n) => (isAbcBook(b) ? (n === 0 ? abcPng(b) : null) : render(b, n)),
    hash: (b, n) => (isAbcBook(b) ? (n === 0 ? abcHash(b) : '') : hash(b, n)),
  };
}
