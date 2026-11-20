// フォニックス（もじの「おと」）の 表 — ページと サーバーが 同じ ものを 読む。
//
// フォニックスは、もじの「なまえ」（エー・ビー・シー）では なく、ことばの 中で 出る「おと」（/æ/ /b/ /k/）を
// おぼえて、おとを つなげて ことばを よむ ための きまり。c-a-t → /k/ /æ/ /t/ → cat。
//
// 合成の 声（TTS）は ことばや もじの なまえは 言えるが、おと 1 つだけ（/s/ や /æ/）は 正しく 言えない。
// だから おとは 1 つずつ 音の ファイルに して ある（assets/phonics/<id>.mp3・docs/make-phonics.py が 作る
// U-Speak Lab の 自作の 音）。運営が /admin/abc で じぶんの 声を ろくおん すると、そちらが 鳴る（/phonics/<id>）。
//
// この ファイルは きまりだけ（DOM も 音も なし）：
//   PHONEMES       おとの 一覧（id → れいの ことば・れいの つづり）
//   letterSound(l) もじ 1 つ・2 もじの つづり（sh・ck…）の いちばん ふつうの おと
//   soundsOf(word, parts)  ことばを つづりの かたまりに わけた ものの、かたまりごとの おと（だまる e は null）

export const PHONEMES = {
  // しいん（子音）
  s: { ex: 'sun', g: 's' }, z: { ex: 'zebra', g: 'z' }, f: { ex: 'fish', g: 'f' }, v: { ex: 'van', g: 'v' },
  th: { ex: 'thumb', g: 'th' }, sh: { ex: 'ship', g: 'sh' }, h: { ex: 'hat', g: 'h' },
  m: { ex: 'moon', g: 'm' }, n: { ex: 'nut', g: 'n' }, ng: { ex: 'ring', g: 'ng' },
  l: { ex: 'lion', g: 'l' }, r: { ex: 'rabbit', g: 'r' }, w: { ex: 'window', g: 'w' }, y: { ex: 'yellow', g: 'y' },
  p: { ex: 'pig', g: 'p' }, b: { ex: 'bus', g: 'b' }, t: { ex: 'tent', g: 't' }, d: { ex: 'dog', g: 'd' },
  k: { ex: 'cat', g: 'c k ck' }, g: { ex: 'goat', g: 'g' }, ch: { ex: 'chick', g: 'ch' }, j: { ex: 'juice', g: 'j' },
  ks: { ex: 'box', g: 'x' }, kw: { ex: 'queen', g: 'qu' },
  // みじかい ぼいん
  a: { ex: 'apple', g: 'a' }, e: { ex: 'egg', g: 'e' }, i: { ex: 'insect', g: 'i' }, o: { ex: 'octopus', g: 'o' }, u: { ex: 'up', g: 'u' },
  // ながい ぼいん・2 もじの ぼいん
  ay: { ex: 'cake', g: 'a_e' }, ee: { ex: 'sheep', g: 'ee' }, ie: { ex: 'bike', g: 'i_e' }, oa: { ex: 'bone', g: 'o_e' },
  oo: { ex: 'tooth', g: 'oo u_e' }, yoo: { ex: 'cube', g: 'u_e' }, ow: { ex: 'mouth', g: 'ou' }, air: { ex: 'chair', g: 'air' },
};
export const PHONEME_IDS = Object.keys(PHONEMES);

// つづり → おと（ことばの 中の ふつうの 読み）。
const CHUNK = {
  a: 'a', e: 'e', i: 'i', o: 'o', u: 'u',
  b: 'b', c: 'k', d: 'd', f: 'f', g: 'g', h: 'h', j: 'j', k: 'k', l: 'l', m: 'm', n: 'n', p: 'p', q: 'kw', r: 'r', s: 's', t: 't', v: 'v', w: 'w', x: 'ks', y: 'y', z: 'z',
  sh: 'sh', ch: 'ch', th: 'th', ng: 'ng', ck: 'k', wh: 'w', ph: 'f', qu: 'kw',
  ll: 'l', rr: 'r', ss: 's', ff: 'f', zz: 'z', mb: 'm', se: 'z',
  ee: 'ee', oo: 'oo', ou: 'ow', air: 'air',
};
// ながい ぼいん（さいごの e が ぼいんを ながく する）。u_e は つぎの ことばで /uː/ と /juː/ に わかれる。
const LONG = { a: 'ay', e: 'ee', i: 'ie', o: 'oa', u: 'yoo' };
// ことばごとの 例外（つづりの きまりだけでは 読めない もの）。
const WORD = {
  nose: { 2: 'z' }, rose: { 2: 'z' },     // s が /z/
  rice: { 2: 's' }, dice: { 2: 's' },     // e の 前の c は /s/（やわらかい c）
  cherry: { 3: 'ee' },                     // おわりの y は /iː/
  tube: { 1: 'oo' }, flute: { 2: 'oo' }, tune: { 1: 'oo' }, dune: { 1: 'oo' },   // アメリカしきの u_e＝/uː/
};
const VOWEL = /^[aeiou]$/;

export function letterSound(l) {
  const k = String(l || '').toLowerCase();
  return CHUNK[k] && PHONEMES[CHUNK[k]] ? CHUNK[k] : null;
}

// parts（つづりの かたまり）ごとの おとの id。だまって いる かたまり（cake の さいごの e）は null。
export function soundsOf(word, parts) {
  const w = String(word || '').toLowerCase();
  const ps = (Array.isArray(parts) ? parts : []).map((p) => String(p).toLowerCase());
  const out = ps.map((p) => CHUNK[p] || null);
  // さいごの e で ぼいんが ながく なる（a_e・i_e・o_e・u_e）：ぼいん＋しいん＋e。
  const n = ps.length;
  if (n >= 3 && ps[n - 1] === 'e' && !VOWEL.test(ps[n - 2]) && VOWEL.test(ps[n - 3])) {
    out[n - 3] = LONG[ps[n - 3]] || out[n - 3];
    out[n - 1] = null;
  }
  for (const [i, s] of Object.entries(WORD[w] || {})) if (Number(i) < out.length) out[Number(i)] = s;
  return out;
}
