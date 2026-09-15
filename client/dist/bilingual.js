// 画面の文字は、英語と日本語を いつも いっしょに出す。
//
// **理由が2つある。**
//   1. レッスンは外国人の先生が進める。先生がボタンの意味をその場で分かる必要がある。
//   2. 読むのは小学1年生。**日本語はひらがな**にして、英語の下に小さく添える。
//      そうすると、子どもは毎回「Map ＝ しまの ちず」を目にすることになる。
//
// **`textContent` で書き換えないこと。** 2行のうち片方が消えて、英語だけ・日本語だけの
// ボタンが混ざる（実際 atmosphere.js がそうしていた）。書き換えるときは必ず label() を通す。
export function label(el, en, ja) {
  const node = typeof el === 'string' ? document.querySelector(el) : el;
  if (!node) return;
  node.innerHTML = `<b class="en">${en}</b><i class="ja">${ja}</i>`;
}
