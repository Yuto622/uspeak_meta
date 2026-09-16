// 画面の言語 — 英語が主、「日本語」ボタンで小学生が読める日本語に切り替わる。
//
// **鍵はいまの日本語の文そのもの。** `t('つぎへ →')` と書くと、英語のときは
// lang.json の "つぎへ →" を引いて "Next →" を返し、日本語のときはそのまま返す。
//
// なぜ英語の文を鍵にしなかったか：
//   * このゲームの文は**もう全部 日本語で書かれている**（1,800か所）。鍵を英語にすると、
//     その1,800か所を全部 書き換えることになる。中身は同じなのに、差分だけが大きい。
//   * **訳が抜けたとき、日本語がそのまま出る。** 画面が空になったり `missing.key` が
//     出たりしない。抜けている場所が日本語で見えるので、そこだけ足せばよい。
//   * 日本語のほうは**すでに小学1年生が読める文に直してある**（ひらがな寄り・分かち書き）。
//     わざわざ書き直さずに、そのまま「日本語モード」になる。
//
// **学習の中身は訳さない。** 英検の「かく」の日本語文、釣りの4択の意味、会話の訳は、
// 日本語であることが問題そのもの。訳してしまうと問題が成立しない。ここを通すのは
// **画面の文字（ボタン・見出し・説明・お知らせ）だけ**。

const KEY = 'uspeak-lang-v1';
const DEFAULT = 'en';            // **既定は英語。** 日本語は ボタンで選ぶもの。
const EVENT = 'uspeak:lang';

let lang = DEFAULT;
let dict = null;                 // { '日本語の文': 'English' }

try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'en' || saved === 'ja') lang = saved;
} catch { /* プライベートウィンドウなど。既定のまま */ }

export function getLang() { return lang; }
export function isJa() { return lang === 'ja'; }

// 訳す。**見つからなければ日本語のまま返す**（壊れるより、訳し忘れが見えるほうがいい）。
// `vars` を渡すと `{n}` を差し替える。数や名前を文に混ぜるときに使う。
export function t(ja, vars) {
  let s = lang === 'ja' || !dict ? String(ja) : (dict[ja] ?? String(ja));
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// 静的な HTML のための入口。`data-t` を持つ要素の文字を入れ替える。
// **元の日本語は data-t に残しておく**ので、何度切り替えても戻せる。
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll('[data-t-label]')) el.setAttribute('aria-label', t(el.dataset.tLabel));
  for (const el of root.querySelectorAll('[data-t-ph]')) el.setAttribute('placeholder', t(el.dataset.tPh));
  for (const el of root.querySelectorAll('[data-t-content]')) el.setAttribute('content', t(el.dataset.tContent));
}

// **2行で書いてあるボタンは CSS で切り替える。** bilingual.js の label() が
// `<b class="en">…</b><i class="ja">…</i>` を書くので、文字はもう両方そこにある。
// どちらを見せるかは `<html data-lang>` 1か所で決まる（style.css の「12.」を参照）。
// こうすると、開いている画面を描き直さなくても 切り替えがその場で効く。
function mark() {
  document.documentElement.lang = lang === 'ja' ? 'ja' : 'en';
  document.documentElement.dataset.lang = lang;
}

export function onLangChange(fn) { document.addEventListener(EVENT, fn); }

export function setLang(next) {
  const want = next === 'ja' ? 'ja' : 'en';
  if (want === lang) return;
  lang = want;
  try { localStorage.setItem(KEY, lang); } catch { /* 覚えられなくても今回は効く */ }
  mark();
  applyDom();
  // 開いている画面に「描き直して」と伝える。各画面は自分が開いているときだけ描き直す。
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { lang } }));
}

// 辞書は起動時に1回だけ読む。**読めなくても日本語で動く**ので、待たずに始めてよい。
export async function loadDictionary(src = 'lang.json') {
  try {
    const raw = await (await fetch(src)).json();
    dict = raw.words || raw;
  } catch {
    dict = {};
  }
  mark();
  applyDom();
  document.dispatchEvent(new CustomEvent(EVENT, { detail: { lang } }));
  return dict;
}

// 辞書を待たずに、いますぐ `<html data-lang>` を立てておく。**2行で書いてある
// ボタンは辞書を使わない**ので、これだけで正しい言語で最初の1枚が描ける。
mark();
