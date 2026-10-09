// 共通の問題部品（Roblox の USpeakFormatUI と同じ考え方）。
//
// 7つの形式を「作る → 見せる用に答えを抜く → 判定する」の3つの口で扱う。
//   build*(…)          問題を作る（答えを含む。サーバーが持つ）
//   publicFormat(fmt)  画面に渡す形（答えを抜く）
//   checkFormat(fmt, answer)  判定（サーバーで行う。画面は同じ関数で見た目だけ合わせる）
//   revealFormat(fmt)  2回目も外したときに見せる答え
//
// **この文件は DOM を触らない。** サーバー（server/src/game/fishworld.js）と画面
// （formats-ui.js）の両方から import される。乱数は引数で受けるので、試験で固定できる。
//
// 形式：
//   mc      3択（英単語 → 日本語）
//   match   線つなぎ（英語4 ⇔ 日本語4）。正解の線が全部平行にならないよう並べる
//   spell   つづり並べ替え（文字カード）。判定は並んだ文字列（"added" の d はどちらでも可）
//   type    タイピング（空の枠から。2回目は最初の文字のヒント）
//   order   ならべかえ（文の単語カード）
//   fill    あなうめ（文の空欄に単語カード）
//   listen  きいて えらぶ（🔊 → 英単語4つ）

export const FORMATS = ['mc', 'match', 'spell', 'type', 'order', 'fill', 'listen'];

// ヘッダーの色・アイコン・題（英語大＋日本語小）。Roblox 版と同じ値。
export const FORMAT_META = {
  mc: { color: '#1B3A2F', icon: '🧩', en: 'Choose', ja: 'えらぶ' },
  match: { color: '#3CA06E', icon: '🔗', en: 'Match', ja: 'せんつなぎ' },
  spell: { color: '#28A0AA', icon: '🔤', en: 'Spell It', ja: 'つづり' },
  type: { color: '#8C50D2', icon: '⌨', en: 'Type the Word', ja: 'タイピング' },
  order: { color: '#4682DC', icon: '↔', en: 'Put in Order', ja: 'ならべかえ' },
  fill: { color: '#E27A2D', icon: '✏', en: 'Fill the Blank', ja: 'あなうめ' },
  listen: { color: '#E66496', icon: '🔊', en: 'Listen', ja: 'きいて えらぶ' },
};

// 変換できる問題か：spell は英字 3〜10 文字、type は英字 12 文字まで。
export const canSpell = (w) => /^[A-Za-z]{3,10}$/.test(String(w || ''));
export const canType = (w) => /^[A-Za-z]{1,12}$/.test(String(w || ''));

// 試験で固定できる乱数（mulberry32）。
export function makeRng(seed = Date.now()) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const norm = (s) => String(s ?? '').trim().toLowerCase();
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean);
const key = (s) => words(s).map(norm).join(' ');

let seq = 0;
const newId = (rng) => `f${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.floor(rng() * 1e6).toString(36)}`;

// 形式の抽選：重みリスト（同じ名前が多いほど出やすい）。変換できない問題は mc に。
export function pickFormat(weights, q, rng = Math.random) {
  const list = Array.isArray(weights) && weights.length ? weights : ['mc'];
  let kind = pick(list, rng);
  if (kind === 'spell' && !canSpell(q?.q)) kind = 'mc';
  if (kind === 'type' && !canType(q?.q)) kind = 'mc';
  if (!FORMATS.includes(kind)) kind = 'mc';
  return kind;
}

// ---- 作る ---------------------------------------------------------------------------------
// q = { q: 英単語, a: 日本語の正解, o: [日本語の選択肢] }、pool = 同じゾーンの他の問題。
export function buildMc(q, rng = Math.random) {
  const others = (q.o || []).filter((x) => x !== q.a);
  const choices = shuffle([q.a, ...others].slice(0, 4), rng);
  return { id: newId(rng), kind: 'mc', word: q.q, answer: q.a, choices };
}

// 線つなぎ：その問題 ＋ 同じゾーンから3組。左右の並びで正解の線が全部平行にならないよう
// （2本以上は交差するよう）並べ替える。
export function buildMatch(q, pool, rng = Math.random) {
  const used = new Set([q.q.toLowerCase(), q.a]);
  const pairs = [{ en: q.q, ja: q.a }];
  for (const cand of shuffle(pool || [], rng)) {
    if (pairs.length >= 4) break;
    if (used.has(cand.q.toLowerCase()) || used.has(cand.a)) continue;
    used.add(cand.q.toLowerCase()); used.add(cand.a);
    pairs.push({ en: cand.q, ja: cand.a });
  }
  const left = shuffle(pairs, rng).map((p) => p.en);
  let right = shuffle(pairs, rng).map((p) => p.ja);
  const parallel = (r) => r.filter((ja, i) => pairs.find((p) => p.en === left[i])?.ja === ja).length;
  // 2本以上が交差する ＝ 平行な線が n-2 本以下。
  for (let tries = 0; tries < 30 && parallel(right) > Math.max(0, pairs.length - 2); tries += 1) right = shuffle(right, rng);
  if (parallel(right) > Math.max(0, pairs.length - 2) && right.length >= 2) [right[0], right[1]] = [right[1], right[0]];
  return { id: newId(rng), kind: 'match', word: q.q, pairs, left, right, answer: Object.fromEntries(pairs.map((p) => [p.en, p.ja])) };
}

// つづり：文字カードをシャッフル（元の順と同じにならないように）。
export function buildSpell(q, rng = Math.random) {
  const word = String(q.q);
  const letters = word.split('');
  let tiles = shuffle(letters, rng);
  for (let tries = 0; tries < 20 && tiles.join('') === word && new Set(letters).size > 1; tries += 1) tiles = shuffle(letters, rng);
  if (tiles.join('') === word && letters.length > 1 && new Set(letters).size > 1) tiles = [...letters.slice(1), letters[0]];
  return { id: newId(rng), kind: 'spell', word, ja: q.a, letters: tiles, answer: word };
}

export function buildType(q, rng = Math.random) {
  const word = String(q.q);
  return { id: newId(rng), kind: 'type', word, ja: q.a, length: word.length, answer: word };
}

// ならべかえ：英文（3〜8語）の単語カード。
export function buildOrder(sentence, ja, rng = Math.random) {
  const list = words(sentence);
  let cards = shuffle(list, rng);
  for (let tries = 0; tries < 20 && cards.join(' ') === list.join(' ') && list.length > 1; tries += 1) cards = shuffle(list, rng);
  if (cards.join(' ') === list.join(' ') && list.length > 1) cards = [...list.slice(1), list[0]];
  return { id: newId(rng), kind: 'order', sentence: list.join(' '), ja, words: cards, answer: list.join(' ') };
}

// あなうめ：文の中の1語を空欄に。カードは正解＋まちがい3つ。
export function buildFill(sentence, blank, ja, distractors, rng = Math.random) {
  const list = words(sentence);
  const at = list.findIndex((w) => norm(w.replace(/[^A-Za-z'-]/g, '')) === norm(blank));
  const index = at >= 0 ? at : 0;
  const answer = list[index].replace(/[^A-Za-z'-]/g, '') || list[index];
  const tail = list[index].slice(answer.length);
  const cards = shuffle([answer, ...(distractors || []).filter((d) => norm(d) !== norm(answer)).slice(0, 3)], rng);
  return { id: newId(rng), kind: 'fill', sentence: list.join(' '), ja, before: list.slice(0, index).join(' '), after: (tail + ' ' + list.slice(index + 1).join(' ')).trim(), cards, answer };
}

// きいて えらぶ：🔊 の英単語を、英単語4つから。まちがいは同じゾーンの他の単語。
export function buildListen(q, pool, rng = Math.random) {
  const others = [];
  for (const cand of shuffle(pool || [], rng)) { if (others.length >= 3) break; if (cand.q.toLowerCase() !== q.q.toLowerCase() && !others.includes(cand.q)) others.push(cand.q); }
  return { id: newId(rng), kind: 'listen', word: q.q, ja: q.a, choices: shuffle([q.q, ...others], rng), answer: q.q };
}

// ゾーンの問題から、形式を決めて作る（釣りワールドとクイズ小屋が使う）。
export function buildFor(kind, q, pool, rng = Math.random) {
  switch (kind) {
    case 'match': return buildMatch(q, pool, rng);
    case 'spell': return buildSpell(q, rng);
    case 'type': return buildType(q, rng);
    case 'listen': return buildListen(q, pool, rng);
    default: return buildMc(q, rng);
  }
}

// ---- 見せる・判定する ---------------------------------------------------------------------
// 画面に渡す形。答えは抜く。type の2回目だけ「さいしょの もじ」のヒントが付く。
export function publicFormat(fmt, { attempt = 1 } = {}) {
  const base = { id: fmt.id, kind: fmt.kind, attempt };
  switch (fmt.kind) {
    case 'mc': return { ...base, word: fmt.word, choices: [...fmt.choices] };
    case 'match': return { ...base, left: [...fmt.left], right: [...fmt.right] };
    case 'spell': return { ...base, ja: fmt.ja, letters: [...fmt.letters] };
    case 'type': return { ...base, ja: fmt.ja, length: fmt.length, ...(attempt >= 2 ? { hint: fmt.word[0] } : {}) };
    case 'order': return { ...base, ja: fmt.ja, words: [...fmt.words] };
    case 'fill': return { ...base, ja: fmt.ja, before: fmt.before, after: fmt.after, cards: [...fmt.cards] };
    case 'listen': return { ...base, word: fmt.word, choices: [...fmt.choices] };
    default: return base;
  }
}

export function checkFormat(fmt, answer) {
  switch (fmt.kind) {
    case 'mc': return String(answer ?? '') === fmt.answer;
    case 'match': {
      // 左の順に右の日本語を並べたもの（配列）か、{英語: 日本語}。4組すべて正しいとき正解。
      const map = Array.isArray(answer) ? Object.fromEntries(fmt.left.map((en, i) => [en, answer[i]])) : (answer && typeof answer === 'object' ? answer : {});
      return fmt.pairs.every((p) => map[p.en] === p.ja);
    }
    case 'spell': return norm(Array.isArray(answer) ? answer.join('') : answer) === norm(fmt.word);
    case 'type': return norm(answer) === norm(fmt.word);
    case 'order': return key(Array.isArray(answer) ? answer.join(' ') : answer) === key(fmt.sentence);
    case 'fill': return norm(answer) === norm(fmt.answer);
    case 'listen': return norm(answer) === norm(fmt.word);
    default: return false;
  }
}

// 2回目も外したときに見せる答え。
export function revealFormat(fmt) {
  switch (fmt.kind) {
    case 'match': return { pairs: fmt.pairs.map((p) => ({ en: p.en, ja: p.ja })) };
    case 'order': return { sentence: fmt.sentence };
    case 'mc': return { answer: fmt.answer };
    default: return { answer: fmt.word ?? fmt.answer };
  }
}

// 間違えたとき、どこが合っていたか（spell / type の枠の色、match の線の色）。
export function diffFormat(fmt, answer) {
  if (fmt.kind === 'spell' || fmt.kind === 'type') {
    const given = norm(Array.isArray(answer) ? answer.join('') : answer).split('');
    const want = norm(fmt.word).split('');
    return want.map((ch, i) => (given[i] === ch ? 'ok' : 'ng'));
  }
  if (fmt.kind === 'match') {
    const map = Array.isArray(answer) ? Object.fromEntries(fmt.left.map((en, i) => [en, answer[i]])) : (answer || {});
    return fmt.left.map((en) => (map[en] === fmt.answer[en] ? 'ok' : 'ng'));
  }
  if (fmt.kind === 'order') {
    const given = words(Array.isArray(answer) ? answer.join(' ') : answer);
    return words(fmt.sentence).map((w, i) => (norm(given[i]) === norm(w) ? 'ok' : 'ng'));
  }
  return [];
}
