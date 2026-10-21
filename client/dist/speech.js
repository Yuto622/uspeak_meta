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

// ---- 自然な 声（サーバーの /api/tts）--------------------------------------------------------
// **端末の 声は 端末しだい**（iPad の 一部は ロボットの よう）。サーバーが 作った 声（mp3）を
// 先に ためし、だめなら（鍵が ない・オフライン・file:・4 秒 こない）いつもの 端末の 声で 読む。
// 同じ 文は ブラウザにも のこる（Cache-Control: immutable と、ここの 小さな 箱）。
let player = null; let token = 0; let off = false; let fails = 0;
const blobs = new Map(); // 文 → objectURL（さいきんの 60 こ）
const canServe = () => !off && typeof Audio === 'function' && typeof fetch === 'function' && /^https?:$/.test(globalThis.location?.protocol || '');
function silentWav() {
  // **iPad の 解錠。** さいしょに さわった ときに 同じ Audio で 無音を ならして おくと、
  // あとから（fetch の あと＝タップの 外でも）鳴らせる。
  const n = 160; const b = new Uint8Array(44 + n); const v = new DataView(b.buffer);
  const tag = (o, t) => { for (let i = 0; i < 4; i += 1) b[o + i] = t.charCodeAt(i); };
  tag(0, 'RIFF'); v.setUint32(4, 36 + n, true); tag(8, 'WAVE'); tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); tag(36, 'data'); v.setUint32(40, n, true);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function getPlayer() {
  if (player) return player;
  player = new Audio(); player.preload = 'auto';
  const unlock = () => {
    removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true);
    if (player.src) return;
    try { player.src = silentWav(); player.play()?.catch(() => {}); } catch { /* 解錠 できなくても 端末の 声が ある */ }
  };
  addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);
  return player;
}
if (canServe()) { try { getPlayer(); } catch { off = true; } }

export function stopVoice() {
  token += 1;
  try { player?.pause(); } catch { /* なにも ならして いない */ }
}

// サーバーの 声で 読む。読めなければ fallback()。onend は 読みおわり（とちゅうで 止めたときは よばない）。
export function playVoice(text, { japanese = isJapanese(text), onend, fallback } = {}) {
  const said = forSpeech(text, japanese);
  if (!said) return;
  if (!canServe()) { fallback?.(); return; }
  const me = (token += 1);
  const audio = getPlayer();
  let gave = false;
  const giveUp = () => { if (gave || me !== token) return; gave = true; try { audio.pause(); } catch { /* */ } fallback?.(); };
  const timer = setTimeout(giveUp, 4000);
  const key = `${japanese ? 'ja' : 'en'}|${said}`;
  const ready = blobs.has(key) ? Promise.resolve(blobs.get(key)) : fetch(`/api/tts?lang=${japanese ? 'ja' : 'en'}&t=${encodeURIComponent(said)}`).then(async (res) => {
    // 503 ＝ この サーバーには 声が ない。この あとは 聞きに いかない。
    if (res.status === 503 || res.status === 404) { off = true; throw new Error('no tts'); }
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    blobs.set(key, url);
    if (blobs.size > 60) { const [k, u] = blobs.entries().next().value; blobs.delete(k); URL.revokeObjectURL(u); }
    return url;
  });
  ready.then((url) => {
    if (me !== token || gave) return;
    audio.onended = () => { if (me === token) onend?.(); };
    audio.onerror = () => giveUp();
    audio.src = url;
    const p = audio.play();
    (p?.then ? p : Promise.resolve()).then(() => { clearTimeout(timer); fails = 0; }, () => giveUp());
  }).catch(() => { clearTimeout(timer); if ((fails += 1) >= 3) off = true; giveUp(); });
}

// 読み上げる。`japanese` を渡さなければ、文字を見て自分で決める。
export function createSpeech({ isMuted, onUnavailable }) {
  return function speak(text, options = {}) {
    if (isMuted?.()) return;
    const synth = globalThis.speechSynthesis;
    const japanese = options.japanese ?? JA.test(String(text));
    const said = forSpeech(text, japanese);
    if (!said) return;
    try { synth?.cancel(); } catch { /* */ }
    playVoice(text, { japanese, fallback: () => device(said, japanese, options) });
  };
  function device(said, japanese, options) {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') { onUnavailable?.(); return; }
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
  }
  return speak;
}
