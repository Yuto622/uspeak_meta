// えいご スイカゲーム — a whole other game, opened from ミニゲーム島.
//
// The frame, the exit and the reasons for both live in arcade.js. Like PUYO this one is
// single player and talks to nothing, so all it needs is a way home among its own buttons.
//
// **画面の文字は英語で出し、「あ」で日本語に戻せる。** 訳は `suika-en.js` にあり、
// **同梱フォルダ（`suika/`）には1バイトも触っていない** — あそこは無改変で置いてあり、
// `tests/guests-manifest.mjs` が SHA-256 を照合している。同一オリジンの iframe に
// 外から手を入れるのは、BLOCKWILD のパレットを間引いているのと同じやり方。
import { createArcade, homeButton } from './arcade.js';
import { isJa, onLangChange } from './i18n.js';
import { toEnglish } from './suika-en.js';

// 置き換えた文字は、元の日本語を そのノードに ぶら下げておく。**戻せないと、
// 日本語に切り替えたときに 訳の訳（英語のまま）になる。**
const KEEP = '__suikaJa';

function walk(doc, english) {
  const it = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let n = it.nextNode(); n; n = it.nextNode()) nodes.push(n);
  for (const n of nodes) {
    if (english) {
      const en = toEnglish(n.nodeValue);
      if (en !== null) { if (n[KEEP] === undefined) n[KEEP] = n.nodeValue; n.nodeValue = en; }
    } else if (n[KEEP] !== undefined) { n.nodeValue = n[KEEP]; n[KEEP] = undefined; }
  }
  // 読み上げ・ふりがなのボタンは文字を持たないので、説明のほうを替える。
  for (const el of doc.querySelectorAll('[title],[aria-label]')) {
    for (const attr of ['title', 'aria-label']) {
      const now = el.getAttribute(attr);
      if (now === null) continue;
      const key = `${KEEP}:${attr}`;
      if (english) {
        const en = toEnglish(now);
        if (en !== null) { if (el[key] === undefined) el[key] = now; el.setAttribute(attr, en); }
      } else if (el[key] !== undefined) { el.setAttribute(attr, el[key]); el[key] = undefined; }
    }
  }
}

export function createSuika({ toast, onOpen, onClose }) {
  return createArcade({
    id: 'suika',
    home: './suika/index.html',
    name: 'えいご スイカゲーム',
    hint: 'えいご スイカゲーム。「← U-Speak」で 島に もどれます。',
    toast,
    onOpen,
    onClose,
    settle: (doc, { close }) => {
      const bar = doc.querySelector('.topbar-btns') || doc.querySelector('.topbar');
      const ok = homeButton(doc, bar, close);

      // **あちらの画面は あとから 自分で 書きかえる**（ミッション・クイズ・結果）。
      // 一度訳して終わりにすると、遊びはじめた瞬間に日本語が戻ってくる。増えた
      // ところだけ訳し直す。**自分の書き換えで自分が起きないように**、いったん止める。
      let english = !isJa();
      let busy = false;
      const paint = () => {
        if (busy) return;
        busy = true;
        try { walk(doc, english); } finally { busy = false; }
      };
      paint();
      const seen = new MutationObserver(() => { if (!busy) paint(); });
      seen.observe(doc.body, { childList: true, subtree: true, characterData: true });

      // 親の「あ」に ついていく。ゲームを開いたまま切り替えても、そろって変わる。
      // **前に開いたときの聞き役は、もう死んだ iframe を指している。** 開くたびに
      // 足しっぱなしにすると、3回目には3つの doc を塗りに行く。窓が消えていたら外す。
      const off = onLangChange(() => {
        if (!doc.defaultView) { off(); return; }
        english = !isJa();
        paint();
        syncLabel();
      });

      // このゲームの中だけの切り替え。**親のボタンは島に隠れて押せない**ので、
      // ここにも要る（子どもが自分で日本語に戻せること）。
      let langBtn = null;
      const syncLabel = () => { if (langBtn) langBtn.textContent = english ? '日本語' : 'English'; };
      if (bar) {
        langBtn = doc.createElement('button');
        langBtn.type = 'button';
        // **借りるのは、こちらが足したボタン以外から。** 帰り道のボタン（`.arcade-home`）から
        // 借りると `arcade-home` まで付いてきて、`arcade.js` の「出口はどれか」に この
        // ボタンが先に当たる＝押しても島に戻らない（実際に e2e が落ちた）。
        const model = [...bar.querySelectorAll('button')]
          .find((b) => ![...b.classList].some((c) => c.startsWith('arcade-')));
        langBtn.className = `${model?.className || ''} arcade-lang`.trim();
        langBtn.onclick = () => { english = !english; paint(); syncLabel(); };
        syncLabel();
        bar.prepend(langBtn);
      }
      return ok;
    },
  });
}
