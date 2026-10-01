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

// **ブラウザーの外でも読み込まれる。** `tests/regression.mjs` は DOM を模擬してから
// モジュールを import するし、サーバーも判定データを通して間接的に読むことがある。
// `document` が無いときは「何もしないで日本語を返す」に落ちる（訳が要るのは画面だけ）。
const dom = () => (typeof document === 'undefined' ? null : document);

const KEY = 'uspeak-lang-v1';
const DEFAULT = 'en';            // **既定は英語。** 日本語は ボタンで選ぶもの。
const EVENT = 'uspeak:lang';

let lang = DEFAULT;
let dict = null;                 // { '日本語の文': 'English' }

try {
  const saved = globalThis.localStorage?.getItem(KEY);
  if (saved === 'en' || saved === 'ja') lang = saved;
} catch { /* プライベートウィンドウなど。既定のまま */ }

export function getLang() { return lang; }
export function isJa() { return lang === 'ja'; }

// ---- 画面ぜんぶを訳すための引き方（`i18n-dom.js` が使う） ---------------------------
//
// `t()` は「この文を訳して」と**書いた場所**でしか効かない。ゲームの文は1,800か所以上あり、
// 全部に `t()` を書いて回ると必ず漏れる（実際に画面の半分が日本語のまま残った）。
// そこで、**画面に出た文字をあとから辞書で引く**口を作る。
//
// 引き方は2つ：
//   1. **完全一致** — 「冒険ノート」→「Adventure Notes」
//   2. **型つき** — 鍵に `{0}` `{n}` のような穴があるもの。「{0}問中 {1}問正解。」は
//      「6問中 3問正解。」に当たり、訳の「{1} of {0} correct.」の穴に同じものを入れる。
//      穴に入ったものが日本語なら、それも完全一致で引く（地名が文に入っているときなど）。
//
// **型は乱暴に当たらないように**、穴の外に日本語の文字が2つ以上ある鍵だけを型にする
// （「{0}の{1}」のような鍵は、学習の中身にまで当たってしまう）。
// 「・」（中黒）だけは日本語に数えない（「Grade 5・4」は英語の文）。
const JA = /[\u3040-\u30fa\u30fc-\u30ff\u3400-\u9fff]/;
const HOLE = /\{[A-Za-z0-9_]+\}/g;
let patterns = [];               // [{ re, names, en, weight }]
const cache = new Map();         // 文 → 訳（無ければ null）。毎フレーム同じ文が来るので。

function compilePatterns() {
  patterns = [];
  cache.clear();
  for (const [ja, en] of Object.entries(dict || {})) {
    if (!ja.includes('{') || typeof en !== 'string') continue;
    const names = [...ja.matchAll(HOLE)].map((m) => m[0].slice(1, -1));
    if (!names.length) continue;
    const literal = ja.replace(HOLE, '');
    // 決まった日本語が1文字でもあれば型にする（「絆 {0}」）。短い型は穴が訳せるときしか
    // 使わない（`whole()`）ので、「{0}問」が「質問」に当たって壊れることはない。
    if (!JA.test(literal)) continue;
    const src = ja.split(HOLE).map((part) => part.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('(.+?)');
    patterns.push({ re: new RegExp(`^${src}$`, 's'), names, en, weight: literal.length });
  }
  // 決まった文字の多い型が先（「{0}問中 {1}問正解」は「{0}問」より先に試す）。
  patterns.sort((a, b) => b.weight - a.weight);
}

// 1行を訳す。**訳せなければ null**（呼ぶ側はそのまま残す）。前後の空白は保つ。
export function translate(text) {
  if (lang === 'ja' || !dict) return null;
  const s = String(text ?? '');
  if (!JA.test(s)) return null;
  if (cache.has(s)) return cache.get(s);
  const lead = s.match(/^\s*/)[0];
  const tail = s.slice(lead.length).match(/\s*$/)[0];
  const core = s.slice(lead.length, s.length - tail.length);
  let out = whole(core, 0);
  // 「No.001 · まだ」「Damage 18 · もんだい」のように **画面で ` · ` でつないだ文** は、
  // 1つずつ訳す。訳せたところだけ英語にして、残りは日本語のまま（検査で見える）。
  // 区切りは残す（「好奇心いっぱい · 」のように、後ろが別の要素で終わる文もある）。
  if (out === null && core.includes('·')) {
    let changed = false;
    const parts = core.split(/(\s*·\s*)/).map((part) => {
      if (!JA.test(part)) return part;
      const got = whole(part.trim(), 0);
      if (got === null) return part;
      changed = true;
      return part.replace(part.trim(), got);
    });
    if (changed) out = parts.join('');
  }
  // HTML で2文を1つの段落に書いたもの（「いまは あるいています。\n  スタートラインから…」）は
  // 1文ずつ訳す。**全部の文が訳せたときだけ**英語にする（半分英語の段落は読みにくい）。
  if (out === null && /[。！？]\s*\S/.test(core)) {
    const sentences = core.split(/(?<=[。！？])\s*/).filter(Boolean);
    if (sentences.length > 1) {
      const got = sentences.map((x) => (JA.test(x) ? whole(x.trim(), 0) : x.trim()));
      if (got.every((x) => x !== null)) out = got.join(' ');
    }
  }
  const result = out === null ? null : lead + out + tail;
  if (cache.size > 5000) cache.clear();
  cache.set(s, result);
  return result;
}

// 1つの文を、辞書そのまま → 型（`{0}`）の順に訳す。型の穴に入った日本語も訳す。
// **決まった文字が3文字以下の型は、穴の日本語が訳せないと使わない**（「オオ{0}」が
// 「オオカミ」を「Great カミ」にしないため）。長い型の穴は名前のことがあるので、そのまま通す。
function whole(core, depth) {
  if (typeof dict[core] === 'string' && !core.includes('{')) return dict[core];
  if (depth > 2) return null;
  // HTML の中で折り返してある文（改行と字下げ入り）は、空白を1つにして引く。
  if (/\s{2,}|\n/.test(core)) {
    const flat = core.replace(/\s+/g, ' ');
    const got = whole(flat, depth + 1);
    if (got !== null) return got;
  }
  // 「☕ であいのカフェ」「🐟 おさかな道場」— 頭の絵文字・記号は残して、あとを訳す。
  const head = core.match(/^([^\p{L}\p{N}\s]+\s*)(\S[\s\S]*)$/u);
  if (head && JA.test(head[2])) {
    const got = whole(head[2], depth + 1);
    if (got !== null) return head[1] + got;
  }
  for (const p of patterns) {
    const m = p.re.exec(core);
    if (!m) continue;
    let en = p.en;
    let ok = true;
    p.names.forEach((name, i) => {
      const got = m[i + 1];
      let word = got;
      if (JA.test(got)) {
        const g = got.trim();
        const tr = whole(g, depth + 1);
        if (tr !== null) word = got.replace(g, tr);
        else if (p.weight < 4) ok = false;   // 短い型だけ（子どもの名前は長い型の穴に入る）
      }
      en = en.split(`{${name}}`).join(word);
    });
    if (ok) return en;
  }
  // 「リオ「風で散らばった…」」— 話す人の名前と、話したこと。両方訳せたら英語の形にする。
  const said = core.match(/^([^\s「」]{1,12})「([^「」]+)」$/);
  if (said) {
    const who = JA.test(said[1]) ? whole(said[1], depth + 1) : said[1];
    const what = whole(said[2], depth + 1);
    if (who !== null && what !== null) return `${who}: “${what}”`;
  }
  return null;
}

// 訳す。**見つからなければ日本語のまま返す**（壊れるより、訳し忘れが見えるほうがいい）。
// `vars` を渡すと `{n}` を差し替える。数や名前を文に混ぜるときに使う。
export function t(ja, vars) {
  let s = lang === 'ja' || !dict ? String(ja) : (dict[ja] ?? String(ja));
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// 静的な HTML のための入口。`data-t` を持つ要素の文字を入れ替える。
// **元の日本語は data-t に残しておく**ので、何度切り替えても戻せる。
export function applyDom(root = dom()) {
  if (!root) return;
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
  const d = dom();
  if (!d?.documentElement) return;
  d.documentElement.lang = lang === 'ja' ? 'ja' : 'en';
  d.documentElement.dataset.lang = lang;
}

function announce() { dom()?.dispatchEvent?.(new CustomEvent(EVENT, { detail: { lang } })); }

// 「あ」が押されたときに呼ばれる。**やめかたを返す**（同じ聞き役を何度も足すところが
// あるため — 同梱ゲームは開くたびに `settle()` が走り、前の iframe はもう死んでいる）。
export function onLangChange(fn) {
  const d = dom();
  d?.addEventListener?.(EVENT, fn);
  return () => d?.removeEventListener?.(EVENT, fn);
}

export function setLang(next) {
  const want = next === 'ja' ? 'ja' : 'en';
  if (want === lang) return;
  lang = want;
  cache.clear();
  try { globalThis.localStorage?.setItem(KEY, lang); } catch { /* 覚えられなくても今回は効く */ }
  mark();
  applyDom();
  // 開いている画面に「描き直して」と伝える。各画面は自分が開いているときだけ描き直す。
  announce();
}

// 辞書は起動時に1回だけ読む。**読めなくても日本語で動く**ので、待たずに始めてよい。
export async function loadDictionary(src = 'lang.json') {
  try {
    const raw = await (await globalThis.fetch(src)).json();
    dict = raw.words || raw;
  } catch {
    dict = {};
  }
  compilePatterns();
  mark();
  applyDom();
  announce();
  return dict;
}

// 辞書を待たずに、いますぐ `<html data-lang>` を立てておく。**2行で書いてある
// ボタンは辞書を使わない**ので、これだけで正しい言語で最初の1枚が描ける。
mark();

// 検査用：辞書を外から渡す（ブラウザーの外では fetch できないため）。
export function useDictionary(words) { dict = words || {}; compilePatterns(); }
