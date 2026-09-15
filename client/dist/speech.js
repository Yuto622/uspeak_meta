// 読み上げ — 日本語と英語で、声も速さも読点の扱いも変える。
//
// **前は どんな文でも `lang = 'en-US'` で読んでいた。** 英語の学習ゲームなので英語だけ
// 読むつもりだったが、実際には日本語も読み上げている（ことばの学校のもんだい文、英検の
// 「かく」の日本語、会話の訳）。英語の声に日本語を渡すと、**かなを一文字ずつ英語読みする**
// ので、教室から「ロボットみたい」と言われた。日本語には日本語の声を渡す。
//
// **記号は声に出る。** 「すきな 色は？」を読ませると、端末によって「クエスチョン」
// 「question mark」と言う。日本語の疑問は文の終わり（か・の）で分かるので、
// **声に渡す前に落とす。** 英語は逆で、`?` や `,` が抑揚を作るので落とさない。

// ひらがな・カタカナ・漢字が1文字でもあれば日本語として読む。
const JA = /[぀-ゟ゠-ヿ㐀-鿿]/;

// 声に出てしまう記号。**読点（、。）は残す** — あそこで息を継ぐので、むしろ自然になる。
const NOISY = /[？?！!「」『』（）()［］\[\]｛｝{}〈〉《》…‥・♪♫◈✦→←↑↓~〜\-–—_*#＊＃]/g;

// 日本語の声を選ぶ。**端末によって名前が違う**ので、名前ではなく lang で拾い、
// 知っている良い声があればそれを優先する（iPad の Kyoko、Chrome の Google 日本語）。
const GOOD_JA = ['Kyoko', 'O-ren', 'Google 日本語', 'Microsoft Nanami', 'Microsoft Ayumi', 'Otoya'];
const GOOD_EN = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex'];

let cache = null;
function voices() {
  const synth = globalThis.speechSynthesis;
  if (!synth) return [];
  // **1回目は空で返ってくることがある**（声はあとから読み込まれる）ので、毎回聞き直して
  // 取れたときだけ覚える。voiceschanged を待つと、最初の一言が無音になる。
  const list = synth.getVoices?.() || [];
  if (list.length) cache = list;
  return cache || [];
}

function pick(japanese) {
  const list = voices();
  if (!list.length) return null;
  const want = japanese ? 'ja' : 'en';
  const same = list.filter((v) => (v.lang || '').toLowerCase().startsWith(want));
  if (!same.length) return null;
  for (const name of japanese ? GOOD_JA : GOOD_EN) {
    const hit = same.find((v) => (v.name || '').includes(name));
    if (hit) return hit;
  }
  // 端末の既定（default: true）があればそれ。無ければ最初のもの。
  return same.find((v) => v.default) || same[0];
}

// 声に渡す文を作る。読み上げ用なので、見た目の文はそのままにしておくこと。
export function forSpeech(text, japanese = JA.test(String(text))) {
  let s = String(text ?? '');
  if (japanese) s = s.replace(NOISY, ' ');
  // 全角空白と連続空白をまとめる。ここを残すと、端末によっては変な間ができる。
  return s.replace(/[　\s]+/g, ' ').trim();
}

export function isJapanese(text) { return JA.test(String(text ?? '')); }

// 読み上げる。`japanese` を渡さなければ、文字を見て自分で決める。
export function createSpeech({ isMuted, onUnavailable }) {
  return function speak(text, options = {}) {
    if (isMuted?.()) return;
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') { onUnavailable?.(); return; }
    const japanese = options.japanese ?? JA.test(String(text));
    const said = forSpeech(text, japanese);
    if (!said) return;
    try {
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(said);
      utter.lang = japanese ? 'ja-JP' : 'en-US';
      const voice = pick(japanese);
      if (voice) utter.voice = voice;
      // **英語はゆっくり、日本語はふつうの速さ。** 英語は聞き取って真似るための音なので
      // 遅くする意味があるが、日本語はただの説明なので、遅いと間延びして機械っぽく聞こえる。
      utter.rate = options.rate ?? (japanese ? 1 : 0.84);
      utter.pitch = options.pitch ?? 1;
      synth.speak(utter);
    } catch { onUnavailable?.(); }
  };
}
