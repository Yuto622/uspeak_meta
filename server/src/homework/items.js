// 宿題の 1 問 — 形を そろえて、いまの 7 形式（formats-core.js）の どれで 出すかを 決める。
//
// 1 問の 形（保存する もの。答えつき。**サーバーにだけ 置く**）：
//   { id, kind, en, ja, sentence, blank, wrong: [まちがいの 候補] }
//   kind が mc / match / spell / type / listen …… en（英単語・短い 句）と ja（意味）
//   kind が order ……………………………………… sentence（英文）と ja（訳。なくても よい）
//   kind が fill …………………………………………… sentence と blank（文の 中の 1 語）。wrong が あれば カードに 使う
//   kind が mc で prompt が ある ……………… 問題文つきの えらぶ（Kahoot・Blooket・Aiken の 形）。answer が 正解、wrong が ほかの 選択肢
// 出題の たびに formats-core の build* で 作りなおす（ならびが 毎回 かわる）。判定も 同じ ファイルの checkFormat。
import {
  canSpell, canType, buildMc, buildMatch, buildSpell, buildType, buildOrder, buildFill, buildListen, shuffle,
} from '../../../client/dist/formats-core.js';

export const KINDS = ['mc', 'match', 'spell', 'type', 'order', 'fill', 'listen'];
export const KIND_JA = { mc: 'えらぶ', match: 'せんつなぎ', spell: 'つづり', type: 'タイピング', order: 'ならべかえ', fill: 'あなうめ', listen: 'きいて えらぶ' };
export const MAX_ITEMS = 60;
const WORD_KINDS = new Set(['mc', 'match', 'spell', 'type', 'listen']);
// ことばの 問題は 形を まぜる（同じ 形が つづくと あきる）。できない 形は とばす。
const ROTATION = ['mc', 'spell', 'listen', 'type', 'match'];

const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = (s) => str(s).toLowerCase();
const wordsOf = (s) => str(s, 300).split(' ').filter(Boolean);
const hasJa = (s) => /[぀-ヿ㐀-鿿]/.test(String(s || ''));
const isEnglish = (s) => /^[A-Za-z][A-Za-z '.,!?’'-]*$/.test(str(s));

// 1 行を きれいに する（形が わからない・中身が 足りない ときは reason つきで かえす）。
export function cleanItem(raw, i = 0) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const item = {
    id: str(r.id, 24) || `q${i + 1}`,
    kind: KINDS.includes(r.kind) ? r.kind : '',
    en: str(r.en, 60), ja: str(r.ja, 80), sentence: str(r.sentence, 200), blank: str(r.blank, 30),
    prompt: str(r.prompt, 300), answer: str(r.answer, 120),
    wrong: (Array.isArray(r.wrong) ? r.wrong : String(r.wrong || '').split(/[,、/／]/)).map((w) => str(w, 60)).filter(Boolean).slice(0, 6),
  };
  if (item.blank && !item.sentence && item.en) { item.sentence = item.en; item.en = ''; }
  if (item.prompt && item.answer) item.kind = 'mc';
  if (!item.kind) item.kind = item.blank ? 'fill' : item.sentence ? 'order' : 'mc';
  return item;
}

// その 1 問が いまの 形で 出せるか（pool ＝ 同じ 宿題の ことばの 問題）。だめなら 理由。
export function problemOf(item, pool) {
  if (item.prompt) {
    if (item.kind !== 'mc') return '問題文つきの 問題は「えらぶ」だけ';
    if (!item.answer) return '正解が ありません';
    const opts = new Set(item.wrong.map((w) => w.toLowerCase()).filter((w) => w !== item.answer.toLowerCase()));
    return opts.size >= 1 ? '' : 'まちがいの 選択肢が いります';
  }
  const others = pool.filter((p) => p !== item && p.en && p.ja && norm(p.en) !== norm(item.en));
  if (WORD_KINDS.has(item.kind)) {
    if (!item.en || !isEnglish(item.en)) return '英語の ことばが ありません';
    if (item.kind !== 'type' && item.kind !== 'spell' && !item.ja) return '日本語の 意味が ありません';
  }
  switch (item.kind) {
    case 'spell': return canSpell(item.en) ? '' : 'つづりは 英字 3〜10 文字の ことばだけ';
    case 'type': return canType(item.en) ? '' : 'タイピングは 英字 12 文字までの ことばだけ';
    case 'mc': return (new Set([...others.map((p) => p.ja), ...item.wrong.filter(hasJa)]).size >= 1) ? '' : 'まちがいの 選択肢が 作れません（ことばを 2 つ 以上に）';
    case 'listen': return (new Set([...others.map((p) => norm(p.en)), ...item.wrong.filter(isEnglish).map(norm)]).size >= 2) ? '' : 'まちがいの 選択肢が 作れません（ことばを 3 つ 以上に）';
    case 'match': return new Set(others.map((p) => p.ja)).size >= 3 ? '' : 'せんつなぎは ことばが 4 つ 以上 いります';
    case 'order': {
      const n = wordsOf(item.sentence).length;
      return !item.sentence || !isEnglish(item.sentence) ? '英文が ありません' : n < 2 || n > 10 ? 'ならべかえは 2〜10 語の 文だけ' : '';
    }
    case 'fill': {
      if (!item.sentence || !item.blank) return '文と あなに する ことばが いります';
      const inside = wordsOf(item.sentence).some((w) => norm(w.replace(/[^A-Za-z'-]/g, '')) === norm(item.blank));
      if (!inside) return 'あなに する ことばが 文の 中に ありません';
      const cards = new Set([...item.wrong.filter(isEnglish).map(norm), ...others.map((p) => norm(p.en)).filter((w) => !w.includes(' '))]);
      cards.delete(norm(item.blank));
      return cards.size >= 1 ? '' : 'まちがいの カードが 作れません';
    }
    default: return '形が わかりません';
  }
}

// 形を 決めて いない（または 出せない）ことばの 問題に、出せる 形を わりあてる。決めて あって 出せる 形は そのまま。
export function assignKinds(list, { respect = true } = {}) {
  const items = list.map((r, i) => cleanItem(r, i));
  // 形が 書いて あった 行だけ その 形を まもる（書いて いない ことばの 行は まぜて わりあてる）
  const given = list.map((r) => !!r && KINDS.includes(r.kind));
  const pool = items.filter((it) => WORD_KINDS.has(it.kind) && !it.prompt);
  let turn = 0;
  for (const [i, it] of items.entries()) {
    if (!WORD_KINDS.has(it.kind) || it.prompt) continue;
    if (respect && given[i] && !problemOf(it, pool)) continue;
    let picked = 'mc';
    for (let k = 0; k < ROTATION.length; k += 1) {
      const kind = ROTATION[(turn + k) % ROTATION.length];
      if (!problemOf({ ...it, kind }, pool)) { picked = kind; break; }
    }
    it.kind = picked;
    turn += 1;
  }
  // id が かさなったら つけなおす
  const seen = new Set();
  items.forEach((it, i) => { if (seen.has(it.id)) it.id = `q${i + 1}`; seen.add(it.id); });
  return items;
}

// 宿題 ぜんぶを たしかめる：出せる 問題と、出せない 問題の 理由。
export function checkItems(list) {
  const items = (Array.isArray(list) ? list : []).slice(0, MAX_ITEMS).map((r, i) => cleanItem(r, i));
  const pool = items.filter((it) => WORD_KINDS.has(it.kind) && !it.prompt);
  const problems = [];
  items.forEach((it, i) => { const p = problemOf(it, pool); if (p) problems.push({ index: i, id: it.id, reason: p }); });
  return { items, problems, ok: items.length > 0 && problems.length === 0 };
}

// 出題の ための 形（答えつき）。毎回 ならびを まぜる。
export function buildItem(item, items, rng = Math.random) {
  const pool = items.filter((p) => p !== item && WORD_KINDS.has(p.kind) && !p.prompt && p.en && p.ja && norm(p.en) !== norm(item.en));
  const q = { q: item.en, a: item.ja };
  if (item.prompt) {
    const wrong = [...new Set(item.wrong)].filter((w) => w.toLowerCase() !== item.answer.toLowerCase()).slice(0, 3);
    return buildMc({ q: item.en || '', a: item.answer, o: [item.answer, ...wrong], prompt: item.prompt }, rng);
  }
  switch (item.kind) {
    case 'mc': {
      const wrong = [...new Set([...item.wrong.filter(hasJa), ...shuffle(pool.map((p) => p.ja), rng)])].filter((x) => x !== item.ja).slice(0, 3);
      return buildMc({ ...q, o: [item.ja, ...wrong] }, rng);
    }
    case 'match': return buildMatch(q, pool.map((p) => ({ q: p.en, a: p.ja })), rng);
    case 'spell': return buildSpell(q, rng);
    case 'type': return buildType(q, rng);
    case 'listen': {
      const extra = item.wrong.filter(isEnglish).map((w) => ({ q: w, a: '' }));
      return buildListen(q, [...extra, ...pool.map((p) => ({ q: p.en, a: p.ja }))], rng);
    }
    case 'order': return buildOrder(item.sentence, item.ja, rng);
    case 'fill': {
      const cards = [...new Set([...item.wrong.filter(isEnglish), ...shuffle(pool.map((p) => p.en).filter((w) => !w.includes(' ')), rng)])];
      return buildFill(item.sentence, item.blank, item.ja, cards, rng);
    }
    default: return buildMc({ ...q, o: [item.ja] }, rng);
  }
}

// 苦手単語の 復習（review.js）が 数えられる 1 語（英単語 1 つの ときだけ）。
export function wordOf(item) {
  if (item.prompt) return /^[A-Za-z'-]+$/.test(item.answer) ? item.answer.toLowerCase() : '';
  const w = item.kind === 'fill' ? item.blank : item.en;
  return /^[A-Za-z'-]+$/.test(w || '') ? w.toLowerCase() : '';
}
