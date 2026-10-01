// 3D の看板・名札など **canvas に描く文字** の訳。
//
// `i18n-dom.js` は画面の DOM の文字を訳すが、canvas に描いた文字は DOM ではないので
// 届かない。看板は島を作るときに1回だけ描かれるので、ここでは
//   * `say(s)` … いまの言語で描く文字を返す（日本語モードならそのまま）
//   * `live(paint)` … 描き直す関数を覚えておき、言語が変わったら呼び直す
// の2つを用意する。看板を作る関数は、描く部分を `paint` にまとめて `live` に渡すだけ。
//
// **島の看板は辞書が読める前に作られる**（`loadDictionary` は非同期）。辞書が読めた
// ときにも言語の知らせが出るので、そのとき英語で描き直される。
import { isJa, translate, onLangChange } from './i18n.js';

// 「入口 · 森の図書室」のように ` · ` でつないだ札は、まるごとで当たらなければ部分ごとに引く。
export function say(text) {
  const s = String(text ?? '');
  if (isJa()) return s;
  const whole = translate(s);
  if (whole !== null) return whole;
  if (!s.includes(' · ')) return s;
  return s.split(' · ').map((part) => translate(part) ?? part).join(' · ');
}

const painters = new Set();
onLangChange(() => { for (const paint of painters) { try { paint(); } catch { /* 消えた看板 */ } } });

export function live(paint) {
  painters.add(paint);
  return () => painters.delete(paint);
}
