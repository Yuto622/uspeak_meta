// 画面に出た文字を、英語モードのあいだ辞書で英語にする層。
//
// **なぜこれが要るか。** ゲームの文は1,800か所以上あり、`t()` を書いた場所だけが英語に
// なっていた。冒険ノート・クエスト・リーグ・地図の地名……書き忘れたところは日本語のまま
// 出る（教室から写真で指摘された）。全部の場所に `t()` を書いて回るのは、漏れが出続ける。
//
// そこで**画面に出た文字のほうを見る**。テキストと、目に見える属性（placeholder・title・
// aria-label・alt）が変わるたびに辞書（`lang.json`）で引き、当たれば英語に差し替える。
// 当たらなければそのまま（訳し忘れが日本語で見える。`tests/e2e/browser-english.mjs` が数える）。
//
// **学習の中身は触らない。** 英検の「かく」の日本語文、リスニングの日本語の選択肢、
// 単語の意味は、日本語であることが問題そのもの。そういう場所には `translate="no"` を
// 付けてあり、その中は一切さわらない（ブラウザーの自動翻訳も同じ印で止まる）。
//
// **日本語に戻すと、元の日本語に戻る。** 差し替えた文字は元の日本語を覚えておく。
//
// **自分の書きかえで自分を呼ばない。** 差し替えると、その変化がまた監視に届く。
// 1回分の処理のあとで `takeRecords()` を呼び、自分の書きかえの知らせは捨てる。
import { translate, isJa, onLangChange } from './i18n.js';

const JA = /[\u3040-\u30fa\u30fc-\u30ff\u3400-\u9fff]/;   // 「・」は数えない
// **学習の中身の場所。** ここは日本語であることが問題そのもの（答えの選択肢・
// 日本語から英語にする問題の日本語・英文の訳）なので、英語モードでも訳さない。
// `translate="no"` を各画面に書いて回るかわりに、**ここに1か所で並べる**（漏れを
// 探すときに、見る場所が1つで済む）。子どもの書いたチャットと名前も訳さない。
//
// 辞書には「とけい」「雨」「ピアノ」のように、画面の言葉としても学習の中身としても
// 出てくる語がある（家具の名前・天気・ジムの絵の答え）。それが学習の場所で訳されない
// ことは、この一覧が守っている。`tests/regression.mjs` は、学習の中身と辞書が
// ぶつかる語を名指しで数え、**新しくぶつかった語があれば止める**。
export const LEARNING = [
  // 英検の島・きょうの5ふん（同じ部品）
  '.eiken-q', '.eiken-passage', '.eiken-choices', '.eiken-line', '.eiken-tiles', '.eiken-said', '.eiken-hint p',
  // ことばの小屋・ジム・アリーナ
  '#quiz-q', '.quiz-choices', '.gym-cards', '.gym-speak .gym-emoji', '#battle-q', '.battle-choices',
  // つり（英単語の意味）・のりもののアイテム（日本語→英語）
  '.word-challenge strong', '.fish-answers', '.catch-word span', '.race-box-word', '.race-box-choices',
  // RPG（物語の訳・答え・覚えたことばの一覧）
  '.ad-question small', '.ad-question h3', '.rpg-answers', '.ad-word-list',
  // 会話・面接・おつかい・島の人との会話（英文の訳）
  '.conv-log', '.iv-ja', '.iv-comment-ja', '.iv-q', '.iv-passage', '.mission-hint', '#mission-line', '.speech p',
  // チャット：定型文の訳と、子どもが書いたもの
  '#net-chat-phrases small', '#net-chat-log',
  // ぼくじょう島：もんだい・ならべる カード・つづり・作物と どうぶつの 英語（.farm-q は translate=no でも書いてある）
  '.farm-q', '.farm-en', '.farm-ja', '.farm-dex',
  '#race-next-ja',   // のりもの島：つぎの ゲートの ことばの いみ（英語で答えるもの）
];
// 触らない場所。`.ja` は日本語モード用の行（英語モードでは見えない）、`.en` は最初から英語。
const SKIP = ['[translate="no"]', 'script', 'style', 'textarea', 'noscript', '.ja', '.en', '[contenteditable="true"]', ...LEARNING].join(',');
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

const texts = new WeakMap();     // Text → { ja, en }
const attrs = new WeakMap();     // Element → { [name]: { ja, en } }
let observer = null;

const skipped = (el) => !el || !!el.closest?.(SKIP);

function doText(node) {
  const cur = node.data;
  const was = texts.get(node);
  if (was && cur === was.en) return;
  if (!JA.test(cur)) { if (was) texts.delete(node); return; }
  if (skipped(node.parentElement)) return;
  const en = translate(cur);
  if (en === null) return;
  texts.set(node, { ja: cur, en });
  node.data = en;
}

function doAttr(el, name) {
  const cur = el.getAttribute(name);
  if (cur === null) return;
  const map = attrs.get(el);
  const was = map?.[name];
  if (was && cur === was.en) return;
  if (!JA.test(cur) || skipped(el)) return;
  const en = translate(cur);
  if (en === null) return;
  const next = map || {};
  next[name] = { ja: cur, en };
  attrs.set(el, next);
  el.setAttribute(name, en);
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  const el = root.nodeType === 1 ? root : null;
  if (el && skipped(el)) return;
  const doc = root.ownerDocument || root;
  const tw = doc.createTreeWalker(root, 1 | 4, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches?.(SKIP) ? 2 : 1),   // 2 = その下ごと飛ばす
  });
  for (let n = tw.currentNode; n; n = tw.nextNode()) {
    if (n.nodeType === 3) doText(n);
    else if (n.nodeType === 1) for (const a of ATTRS) if (n.hasAttribute(a)) doAttr(n, a);
  }
}

// 日本語に戻す：覚えている元の日本語を書き戻す（そのあと画面が書き直した所は、そのまま）。
function restore(root = document.documentElement) {
  const tw = document.createTreeWalker(root, 1 | 4);
  for (let n = tw.currentNode; n; n = tw.nextNode()) {
    if (n.nodeType === 3) {
      const was = texts.get(n);
      if (was) { if (n.data === was.en) n.data = was.ja; texts.delete(n); }
    } else if (n.nodeType === 1) {
      const map = attrs.get(n);
      if (!map) continue;
      for (const [name, was] of Object.entries(map)) if (n.getAttribute(name) === was.en) n.setAttribute(name, was.ja);
      attrs.delete(n);
    }
  }
}

function onRecords(records) {
  if (isJa()) return;
  for (const r of records) {
    if (r.type === 'characterData') doText(r.target);
    else if (r.type === 'attributes') { if (!skipped(r.target)) doAttr(r.target, r.attributeName); }
    else for (const n of r.addedNodes) walk(n);
  }
  observer.takeRecords();   // 自分の書きかえの知らせは捨てる
}

export function startDomTranslation(root = document.documentElement) {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(onRecords);
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  if (!isJa()) { walk(root); observer.takeRecords(); }
  onLangChange(() => {
    if (isJa()) restore(root);
    else walk(root);
    observer.takeRecords();
  });
}

// 検査用：いま英語モードで、`translate="no"` の外に見えている日本語を集める。
export function untranslated(root = document.body) {
  const out = [];
  const tw = document.createTreeWalker(root, 4);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!JA.test(n.data) || skipped(n.parentElement)) continue;
    const el = n.parentElement;
    const box = el.getBoundingClientRect?.();
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    if (!box || box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.display === 'none') continue;
    if (el.closest('dialog:not([open]),[hidden]')) continue;
    out.push(n.data.trim());
  }
  return out;
}
