// 「ABC と おと」の 絵を サーバーで かく（SVG）。中身は abc-data.json（文字 26・3 文字の ことば・2 文字の おと・ながい おと）。
//
// ・文字の つみき（letterSvg）：文字は **じぶんで かいた 線**（球と 棒の 学校の 字：a・g は 1 かいだて）。端末の フォントに たよらないので
//   どの iPad でも 同じ 形。色は 文字ごとに ちがう。
// ・ことばの 絵カード（wordSvg）：絵文字（reading-art/emoji の Twemoji・CC-BY 4.0）を 大きく。**字は 入れない**
//   （「この おとで はじまる 絵は どれ？」の 選択肢に そのまま 使える）。
// ・ホームの カードの 絵（coverSvg）：A・B・C の つみき。
// お金は かからない（画像生成の API を 呼ばない）。かき方を 変えたら ABC_ART_VERSION を 上げる。
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EMOJI_DIR = path.resolve(HERE, 'reading-art', 'emoji');
export const ABC_DATA_FILE = path.resolve(HERE, 'abc-data.json');
export const ABC_ART_VERSION = 1;
export const artPath = { letter: (l) => `/abc-art/letter/${l}.svg`, word: (w) => `/abc-art/word/${w}.svg`, cover: () => '/abc-art/cover.svg' };

const n = (v) => Math.round(v * 10) / 10;
const fileOf = (e) => [...(e.includes('‍') ? e : e.replace(/️/g, ''))].map((c) => c.codePointAt(0).toString(16)).join('-');
const glyphs = new Map();
function emojiInner(e) {
  const id = fileOf(String(e || ''));
  if (!/^[0-9a-f-]{2,80}$/.test(id)) return null;
  if (!glyphs.has(id)) { const p = path.join(EMOJI_DIR, `${id}.svg`); glyphs.set(id, existsSync(p) ? readFileSync(p, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') : null); }
  return glyphs.get(id);
}

// ---- 中身 ------------------------------------------------------------------------------
let DATA = null; let WORDS = null;
export function loadAbcData(file = ABC_DATA_FILE) { return JSON.parse(readFileSync(file, 'utf8')); }
export function abcData() { return (DATA ||= loadAbcData()); }
// ことば → 絵文字（どの 表の ことばも）。
export function wordEmoji(word) {
  if (!WORDS) { WORDS = new Map(); for (const it of allWords(abcData())) if (!WORDS.has(it.w)) WORDS.set(it.w, it.e); }
  return WORDS.get(String(word || '')) || null;
}
function allWords(d) {
  return [...Object.values(d.letters || {}).flatMap((l) => l.words || []), ...(d.cvc || []), ...Object.values(d.digraphs || {}).flat(), ...Object.values(d.magicE || {}).flat()];
}
const ABC = 'abcdefghijklmnopqrstuvwxyz';
const VOWELS = 'aeiou';
// 中身の だめな ところ（なければ 空）。scripts/check-abc-data.mjs と テストが 同じ ものを 見る。
export function abcProblems(d) {
  const bad = [];
  if (!Array.isArray(d?.order) || [...d.order].sort().join('') !== ABC) bad.push('order は a〜z を 1 回ずつ');
  const seenLetterWords = new Set();
  for (const l of ABC) {
    const it = d?.letters?.[l];
    if (!it) { bad.push(`letters.${l} が ない`); continue; }
    if (it.say !== l.toUpperCase()) bad.push(`letters.${l}.say は "${l.toUpperCase()}"`);
    if (!it.sound || !/^[a-z]{1,4}$/.test(it.sound)) bad.push(`letters.${l}.sound`);
    if (!it.soundJa || !/^[぀-ヿ]{1,3}$/.test(it.soundJa)) bad.push(`letters.${l}.soundJa`);
    if (!Array.isArray(it.words) || it.words.length !== 3) { bad.push(`letters.${l}.words は 3 つ`); continue; }
    for (const w of it.words) {
      const plain = String(w.w || '').replace(/-/g, '');
      if (!/^[a-z]+(-[a-z]+)?$/.test(String(w.w || ''))) bad.push(`letters.${l}: "${w.w}"`);
      else if (it.end ? !plain.endsWith(l) : !plain.startsWith(l)) bad.push(`letters.${l}: "${w.w}" は ${l} で ${it.end ? 'おわらない' : 'はじまらない'}`);
      if (seenLetterWords.has(w.w)) bad.push(`letters: "${w.w}" が 2 回`);
      seenLetterWords.add(w.w);
    }
  }
  const list = (name, items, min, rule) => {
    if (!Array.isArray(items) || items.length < min) { bad.push(`${name} は ${min} こ 以上`); return; }
    const seen = new Set();
    for (const it of items) {
      if (!/^[a-z]+$/.test(String(it?.w || ''))) { bad.push(`${name}: "${it?.w}"`); continue; }
      if (seen.has(it.w)) bad.push(`${name}: "${it.w}" が 2 回`);
      seen.add(it.w);
      if (!Array.isArray(it.parts) || it.parts.join('') !== it.w || it.parts.some((p) => !/^[a-z]{1,3}$/.test(p))) bad.push(`${name}: "${it.w}" の parts が ことばに ならない`);
      else { const why = rule(it); if (why) bad.push(`${name}: "${it.w}" ${why}`); }
    }
  };
  list('cvc', d?.cvc, 45, (it) => (it.parts.length === 3 && it.w.length === 3 && !VOWELS.includes(it.w[0]) && VOWELS.includes(it.w[1]) && !VOWELS.includes(it.w[2]) ? '' : 'は 子音・母音・子音の 3 文字では ない'));
  for (const v of VOWELS) if (!(d?.cvc || []).some((it) => it.w?.[1] === v)) bad.push(`cvc: 母音 ${v} の ことばが ない`);
  for (const k of ['sh', 'ch', 'th', 'ck', 'ng']) list(`digraphs.${k}`, d?.digraphs?.[k], 5, (it) => (it.parts.includes(k) ? '' : `の parts に ${k} が ない`));
  for (const k of ['a_e', 'i_e', 'o_e', 'u_e']) {
    const v = k[0];
    list(`magicE.${k}`, d?.magicE?.[k], 5, (it) => (new RegExp(`${v}[a-z]e$`).test(it.w) ? '' : `は ${k} の 形では ない`));
  }
  // 1 つの ことばには 1 つの 絵、1 つの 絵には 1 つの ことば（絵を 見て まよわない）。絵は ぜんぶ かける もの。
  const byWord = new Map(); const byEmoji = new Map();
  for (const it of allWords(d || {})) {
    if (!it?.e || !emojiInner(it.e)) { bad.push(`"${it?.w}" の 絵 ${it?.e} が かけない（reading-art/emoji に 足す）`); continue; }
    if (byWord.has(it.w) && byWord.get(it.w) !== it.e) bad.push(`"${it.w}" の 絵が 2 しゅるい`);
    if (byEmoji.has(it.e) && byEmoji.get(it.e) !== it.w) bad.push(`絵 ${it.e} が "${byEmoji.get(it.e)}" と "${it.w}" の 2 つに 使われて いる`);
    byWord.set(it.w, it.e); byEmoji.set(it.e, it.w);
  }
  return bad;
}

// ---- 文字の 形（線）----------------------------------------------------------------------
// 大文字：はば 0〜100・上 20・下（基線）120。小文字：x の 高さ 70〜120・上 20・下 160。線の 太さは 外で きめる。
const UP = {
  A: 'M10,120 L50,20 L90,120 M26,84 L74,84', B: 'M18,120 L18,20 L52,20 A25,25 0 0 1 52,70 L18,70 M52,70 L58,70 A25,25 0 0 1 58,120 L18,120',
  C: 'M86,43.7 A40,50 0 1 0 86,96.3', D: 'M18,20 L18,120 L42,120 A48,50 0 0 0 42,20 L18,20', E: 'M82,20 L18,20 L18,120 L82,120 M18,70 L70,70',
  F: 'M82,20 L18,20 L18,120 M18,70 L68,70', G: 'M86,43.7 A40,50 0 1 0 88,94 L88,74 L58,74', H: 'M16,20 L16,120 M84,20 L84,120 M16,70 L84,70',
  I: 'M50,20 L50,120 M28,20 L72,20 M28,120 L72,120', J: 'M70,20 L70,92 A27,28 0 0 1 16,92', K: 'M18,20 L18,120 M82,20 L18,80 M42,58 L84,120',
  L: 'M20,20 L20,120 L80,120', M: 'M12,120 L12,20 L50,92 L88,20 L88,120', N: 'M16,120 L16,20 L84,120 L84,20',
  O: 'M50,20 A40,50 0 1 0 50,120 A40,50 0 1 0 50,20', P: 'M18,120 L18,20 L52,20 A27,27 0 0 1 52,74 L18,74',
  Q: 'M50,20 A40,50 0 1 0 50,120 A40,50 0 1 0 50,20 M62,96 L90,126', R: 'M18,120 L18,20 L52,20 A27,27 0 0 1 52,74 L18,74 M50,74 L84,120',
  S: 'M82,40 C70,12 20,14 20,44 C20,72 82,66 82,98 C82,128 26,128 16,100', T: 'M12,20 L88,20 M50,20 L50,120', U: 'M16,20 L16,86 A34,34 0 0 0 84,86 L84,20',
  V: 'M12,20 L50,120 L88,20', W: 'M6,20 L28,120 L50,48 L72,120 L94,20', X: 'M16,20 L84,120 M84,20 L16,120', Y: 'M14,20 L50,70 L86,20 M50,70 L50,120',
  Z: 'M16,20 L84,20 L16,120 L84,120',
};
const RING = (cx, cy = 95, r = 25) => `M${cx},${cy - r} A${r},${r} 0 1 0 ${cx},${cy + r} A${r},${r} 0 1 0 ${cx},${cy - r}`;
const LOW = {
  a: `${RING(46)} M71,70 L71,120`, b: `M22,20 L22,120 ${RING(47)}`, c: 'M66,80 A25,25 0 1 0 66,110', d: `${RING(45)} M70,20 L70,120`,
  e: 'M22,95 L70,95 A25,25 0 1 0 64,112', f: 'M72,26 Q46,18 46,46 L46,120 M26,70 L66,70', g: `${RING(45)} M70,70 L70,136 A23,22 0 0 1 24,140`,
  h: 'M22,20 L22,120 M22,96 A24,26 0 0 1 70,96 L70,120', i: 'M50,70 L50,120', j: 'M56,70 L56,138 A21,21 0 0 1 14,140', k: 'M24,20 L24,120 M68,70 L24,100 M40,90 L70,120',
  l: 'M50,20 L50,120', m: 'M12,70 L12,120 M12,92 A19,22 0 0 1 50,92 L50,120 M50,92 A19,22 0 0 1 88,92 L88,120', n: 'M22,70 L22,120 M22,96 A24,26 0 0 1 70,96 L70,120',
  o: RING(50), p: `M22,70 L22,160 ${RING(47)}`, q: `${RING(45)} M70,70 L70,160`, r: 'M28,70 L28,120 M28,96 Q32,72 66,74',
  s: 'M68,80 C58,66 28,68 28,82 C28,97 70,93 70,108 C70,124 34,124 26,110', t: 'M44,34 L44,104 Q44,120 64,118 M24,70 L66,70', u: 'M22,70 L22,96 A24,24 0 0 0 70,96 M70,70 L70,120',
  v: 'M22,70 L48,120 L74,70', w: 'M10,70 L28,120 L50,78 L72,120 L90,70', x: 'M24,70 L72,120 M72,70 L24,120', y: 'M22,70 L48,118 M74,70 L40,150 Q34,160 22,158',
  z: 'M24,70 L72,70 L24,120 L72,120',
};
const DOTS = { i: [50, 46], j: [56, 46] };
// 文字 1 つ（白い 線＋こい 影）。
function glyph(ch, x, y, k, { ink = '#fff', shade = '#00000040', w = 15 } = {}) {
  const d = UP[ch] || LOW[ch]; if (!d) return '';
  const dot = DOTS[ch] ? (c, dy = 0) => `<circle cx="${DOTS[ch][0]}" cy="${DOTS[ch][1] + dy}" r="${w * 0.62}" fill="${c}"/>` : () => '';
  return `<g transform="translate(${n(x)},${n(y)}) scale(${k})" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="${w}">`
    + `<path d="${d}" stroke="${shade}" transform="translate(0,5)"/>${dot(shade, 5)}<path d="${d}" stroke="${ink}"/>${dot(ink)}</g>`;
}
const hsl = (h, s, l) => `hsl(${Math.round(h)},${s}%,${l}%)`;
const hueOf = (letter) => (ABC.indexOf(letter) * 360 / 26 * 7) % 360; // となりの 文字は はなれた 色

// つみき 1 こ（x,y＝左上・size）。前の 面に 色、ふちは 木。
function block(x, y, size, hue, inner = '', id = 'b') {
  const r = size * 0.13; const pad = size * 0.085;
  return `<g transform="translate(${n(x)},${n(y)})">
    <rect x="${n(size * 0.03)}" y="${n(size * 0.06)}" width="${size}" height="${size}" rx="${n(r)}" fill="#000" opacity=".16"/>
    <rect width="${size}" height="${size}" rx="${n(r)}" fill="url(#wood${id})"/>
    <rect x="${n(pad)}" y="${n(pad)}" width="${n(size - pad * 2)}" height="${n(size - pad * 2)}" rx="${n(r * 0.7)}" fill="url(#face${id})"/>
    <rect x="${n(pad)}" y="${n(pad)}" width="${n(size - pad * 2)}" height="${n((size - pad * 2) * 0.46)}" rx="${n(r * 0.7)}" fill="#fff" opacity=".13"/>
    <rect x="1.5" y="1.5" width="${size - 3}" height="${size - 3}" rx="${n(r)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
    ${inner}</g>`;
}
const blockDefs = (hue, id = 'b') => `<linearGradient id="wood${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d7a0"/><stop offset="1" stop-color="#d9a45f"/></linearGradient>`
  + `<linearGradient id="face${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hsl(hue, 68, light(hue) + 14)}"/><stop offset="1" stop-color="${hsl(hue, 70, light(hue))}"/></linearGradient>`;
// 黄色〜黄緑は 白い 字が 見えにくいので 少し こく する。
function light(hue) { return hue > 35 && hue < 105 ? 36 : hue >= 105 && hue < 190 ? 40 : 44; }
const backdrop = (hue, w, h) => `<defs><radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="${hsl(hue, 90, 97)}"/><stop offset="1" stop-color="${hsl(hue, 70, 88)}"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/>`;
const svgOpen = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img">`;

// 文字の つみき。mode: both（大文字と 小文字）・upper・lower。
export function letterSvg(letter, mode = 'both') {
  const l = String(letter || '').toLowerCase();
  if (l.length !== 1 || !ABC.includes(l)) return null;
  const hue = hueOf(l); const U = l.toUpperCase();
  let inner;
  if (mode === 'upper') inner = glyph(U, 90, 46, 2.2);
  else if (mode === 'lower') inner = glyph(l, 105, 29, 1.9);
  else inner = glyph(U, 56, 96, 1.3) + glyph(l, 212, 96, 1.3);
  return `${svgOpen(400, 400)}${backdrop(hue, 400, 400)}<defs>${blockDefs(hue)}</defs>${block(22, 18, 356, hue, `<g transform="translate(-22,-18)">${inner}</g>`)}</svg>`;
}

// ことばの 絵カード（字は 入れない）。
export function wordSvg(word) {
  const e = wordEmoji(word); const inner = e && emojiInner(e);
  if (!inner) return null;
  let h = 0; for (const c of String(word)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `${svgOpen(400, 400)}${backdrop(h, 400, 400)}
    <rect x="30" y="36" width="340" height="340" rx="44" fill="#000" opacity=".1"/><rect x="26" y="26" width="348" height="340" rx="44" fill="#fff"/>
    <rect x="26" y="26" width="348" height="340" rx="44" fill="none" stroke="${hsl(h, 60, 78)}" stroke-width="6"/>
    <ellipse cx="200" cy="316" rx="96" ry="13" fill="#000" opacity=".12"/>
    <svg x="76" y="62" width="248" height="248" viewBox="0 0 36 36">${inner}</svg></svg>`;
}

// ホームの カードの 絵：A・B・C の つみき（上に 1 つ、下に 2 つ）。
export function coverSvg() {
  const one = (ch, x, y, size, rot, id) => {
    const hue = hueOf(ch.toLowerCase()); const k = size / 150;
    return `<defs>${blockDefs(hue, id)}</defs><g transform="rotate(${rot} ${x + size / 2} ${y + size / 2})">${block(x, y, size, hue, glyph(ch, size / 2 - 50 * k * 1.02, size / 2 - 70 * k * 1.02, n(k * 1.02), { w: 17 }), id)}</g>`;
  };
  const stars = [[52, 60, 1], [344, 48, 1.3], [366, 150, 0.8], [36, 170, 0.7]].map(([x, y, s]) => `<path transform="translate(${x},${y}) scale(${s})" d="M0,-14 L4,-4 L14,-4 L6,3 L9,13 L0,7 L-9,13 L-6,3 L-14,-4 L-4,-4 Z" fill="#ffd24a" stroke="#f0a92c" stroke-width="2" stroke-linejoin="round"/>`).join('');
  return `${svgOpen(400, 300)}${backdrop(48, 400, 300)}<ellipse cx="200" cy="274" rx="170" ry="14" fill="#000" opacity=".1"/>${stars}
    ${one('B', 70, 142, 128, -3, 'b')}${one('C', 204, 142, 128, 3, 'c')}${one('A', 136, 22, 128, -5, 'a')}</svg>`;
}
