// 宿題の 読みとり — 先生が 入れた 文（または 写真）から 問題と 答えを 取りだし、7 形式に ふりわける。
//
// 2 つの 道：
//   * AI（OPENAI_API_KEY が ある とき）：文・写真（プリントの 写真も）を 読んで 1 問ずつ JSON に する。
//   * きまり（キーが ない・AI が こけた とき）：「apple = りんご」「apple	りんご」「I (play) soccer.」などの 行を 読む。
// どちらで 読んでも、**先生が admin で たしかめて「くばる」を 押すまで 子どもには 出ない**（AI は 答えを まちがえる ことが ある）。
import { config } from '../config.js';
import { assignKinds, KINDS, MAX_ITEMS } from './items.js';
import { readFile, parseAiken, parseGift } from './files.js';

const JA = /[぀-ヿ㐀-鿿]/;
const cut = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// 「1.」「(1)」「①」「Q1」などの 番号を とる
const unnumber = (s) => cut(s).replace(/^(?:[QＱ]?\s*\d{1,3}\s*[.．)）:：、]|[（(]\s*\d{1,3}\s*[)）]|[①-⑳])\s*/, '');

// ---- きまりで 読む -----------------------------------------------------------------------------
export function parseRules(text) {
  const items = [];
  let title = '';
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(cut).filter(Boolean);
  for (let i = 0; i < lines.length && items.length < MAX_ITEMS; i += 1) {
    const raw = lines[i];
    if (!title && /^(?:#|title[:：]|だい[:：]|題[:：])/i.test(raw)) { title = raw.replace(/^(?:#+|title[:：]|だい[:：]|題[:：])\s*/i, ''); continue; }
    const line = unnumber(raw);
    // 「Unit 5 しゅくだい」「Lesson 3」「第2回」などは 題（問題では ない）
    if (/^(?:unit|lesson|chapter|part|week|day|step|program)\s*\d+\b/i.test(line) || /^第\s*\d+\s*[回課章]/.test(line)) { if (!title) title = line; continue; }
    // Q: … / A: …（2 行で 1 問）
    const q = line.match(/^Q[:：]\s*(.+)$/i);
    if (q && /^A[:：]/i.test(unnumber(lines[i + 1] || ''))) {
      const a = unnumber(lines[i + 1]).replace(/^A[:：]\s*/i, '');
      i += 1;
      items.push(JA.test(q[1]) && !JA.test(a) ? { en: a, ja: q[1] } : { en: q[1], ja: a });
      continue;
    }
    // あなうめ：I (play) soccer. ／ I ( ) soccer. [play] ／ I ___ soccer. [play]
    const blankIn = line.match(/^(.*?)[(（]\s*([A-Za-z'-]+)\s*[)）](.*)$/);
    if (blankIn && !JA.test(blankIn[2])) {
      const [en, ja = ''] = splitJa(`${blankIn[1]}${blankIn[2]}${blankIn[3]}`);
      items.push({ kind: 'fill', sentence: en, blank: blankIn[2], ja });
      continue;
    }
    const blankOut = line.match(/^(.*?)(?:[(（]\s*[)）]|_{2,}|＿{2,})(.*?)\s*[[［]\s*([A-Za-z'-]+)\s*(?:[,、/／]\s*([^\]］]+))?[\]］]\s*(.*)$/);
    if (blankOut) {
      const sentence = cut(`${blankOut[1]}${blankOut[3]}${blankOut[2]}`);
      items.push({ kind: 'fill', sentence, blank: blankOut[3], wrong: blankOut[4] ? blankOut[4].split(/[,、/／]/).map(cut) : [], ja: cut(blankOut[5]) });
      continue;
    }
    // ことばと 意味：区切り（= : タブ － → ,）か、英語の あとに 日本語
    const pair = line.match(/^([^=:：\t→⇒,，]+?)\s*(?:=|:|：|\t|→|⇒|,|，|\s[-－–]\s)\s*(.+)$/) || splitPair(line);
    if (pair) {
      let [, a, b] = pair;
      a = cut(a); b = cut(b);
      if (JA.test(a) && !JA.test(b)) [a, b] = [b, a];
      if (!a || JA.test(a)) continue;
      const words = a.split(' ').length;
      // 長い 英文＋訳 は ならべかえ。短い ものは ことば。
      items.push(words >= 3 && /[A-Za-z]/.test(a) ? { kind: 'order', sentence: a, ja: b } : { en: a, ja: b });
      continue;
    }
    // 英文だけ（3 語 以上）は ならべかえ
    if (!JA.test(line) && line.split(' ').length >= 3 && /^[A-Za-z]/.test(line)) items.push({ kind: 'order', sentence: line, ja: '' });
  }
  return { title, items };
}
function splitJa(s) {
  const at = s.search(JA);
  return at < 0 ? [cut(s), ''] : [cut(s.slice(0, at)), cut(s.slice(at))];
}
function splitPair(line) {
  const at = line.search(JA);
  if (at <= 0) return null;
  const en = line.slice(0, at);
  if (!/[A-Za-z]/.test(en)) return null;
  return [line, en, line.slice(at)];
}

// ---- AI で 読む ---------------------------------------------------------------------------------
const SCHEMA = {
  name: 'homework', strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['title', 'items'],
    properties: {
      title: { type: 'string' },
      items: {
        type: 'array', maxItems: MAX_ITEMS,
        items: {
          type: 'object', additionalProperties: false, required: ['kind', 'en', 'ja', 'sentence', 'blank', 'prompt', 'answer', 'wrong'],
          properties: {
            kind: { type: 'string', enum: KINDS },
            en: { type: 'string' }, ja: { type: 'string' }, sentence: { type: 'string' }, blank: { type: 'string' },
            prompt: { type: 'string' }, answer: { type: 'string' },
            wrong: { type: 'array', items: { type: 'string' }, maxItems: 4 },
          },
        },
      },
    },
  },
};
const PROMPT = `You turn a Japanese primary-school English homework sheet into quiz items for a children's learning game.
Read the text and/or the photo. Take every question together with its correct answer. If the sheet has no answer key, work out the correct answer yourself; never leave an answer empty.
Each item is one of these kinds:
- mc: an English word or short phrase (en) and its Japanese meaning (ja). Child picks the meaning.
- spell: a single English word of 3-10 letters (en) and its meaning (ja). Child arranges the letters.
- type: a single English word of up to 12 letters (en) and its meaning (ja). Child types it.
- listen: an English word (en) and meaning (ja). Child hears it and picks the word.
- match: an English word (en) and meaning (ja). Used when there are 4 or more word pairs.
- order: an English sentence of 2-10 words (sentence) and its Japanese translation (ja). Child puts the words in order.
- fill: an English sentence (sentence) with one word (blank) that the child must choose; that word must appear in the sentence exactly. Put up to 3 plausible wrong words in wrong.
- mc with prompt: any other question that has one correct choice (e.g. "What color is the sky?" or a Japanese question about English). Put the question in prompt, the correct choice in answer and the other choices (1-3, from the sheet or plausible) in wrong. Leave en/ja empty.
Rules: keep English exactly as on the sheet but fix obvious typos; Japanese in simple hiragana-leaning words; use empty strings for fields a kind does not use; mix word kinds when there are many word pairs; do not invent items that are not on the sheet; title is a short Japanese name for the homework.`;

let clientPromise = null;
async function openai() {
  if (!clientPromise) clientPromise = import('openai').then(({ default: OpenAI }) => new OpenAI({ apiKey: config.ai.apiKey, timeout: Math.max(config.ai.timeoutMs, 60000), maxRetries: 1 }));
  return clientPromise;
}

export async function parseWithAi({ text = '', images = [], pdfs = [] }, { client = null } = {}) {
  const ai = client || await openai();
  const content = [{ type: 'text', text: text ? `Homework text:\n${String(text).slice(0, 30000)}` : 'The homework is in the attached photo or PDF.' }];
  for (const url of images.slice(0, 8)) content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  // PDF は そのまま わたす（写真だけの PDF・手書きの 答えも モデルが 読む）。
  pdfs.slice(0, 3).forEach((p, i) => content.push({ type: 'file', file: { filename: p.name || `homework-${i + 1}.pdf`, file_data: p.data } }));
  const res = await ai.chat.completions.create({
    model: config.ai.homeworkModel || config.ai.model,
    max_completion_tokens: 8000,
    messages: [{ role: 'system', content: PROMPT }, { role: 'user', content }],
    response_format: { type: 'json_schema', json_schema: SCHEMA },
  });
  const parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
  return { title: cut(parsed.title).slice(0, 60), items: Array.isArray(parsed.items) ? parsed.items : [] };
}

const IMAGE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_FILE = 25 * 1024 * 1024;

// 読みとって、7 形式に ふりわけた 下書きを かえす。
//   text：はりつけた 文。files：[{ name, type, data(base64 か data URL) }]。images：data URL（むかしの 呼びかた）。
// 形の きまった ファイル（表・Aiken・GIFT・Moodle XML・JSON）は AI を 通さない。のこり（文・写真・PDF）を AI か きまりで 読む。
export async function extractHomework({ text = '', files = [], images = [] } = {}, { useAi = !!config.ai.apiKey, client = null, log = console } = {}) {
  const warnings = [];
  const sources = [];
  let items = [];
  let title = '';
  const texts = text.trim() ? [text] : [];
  const pics = (Array.isArray(images) ? images : []).filter((u) => typeof u === 'string' && IMAGE.test(u));
  const pdfs = [];
  for (const f of (Array.isArray(files) ? files : []).slice(0, 12)) {
    if (!f || typeof f.data !== 'string') continue;
    if (f.data.length > MAX_FILE * 1.4) { warnings.push(`${f.name}: 大きすぎます（25MB まで）`); continue; }
    let got;
    try { got = await readFile(f); } catch (err) { warnings.push(`${f.name}: 読めませんでした（${err.message}）`); continue; }
    if (got.error) { warnings.push(got.error); continue; }
    if (got.items) {
      if (!got.items.length) warnings.push(`${f.name}: 問題が 見つかりませんでした`);
      items = items.concat(got.items); sources.push(`${f.name}（${got.format}）`);
      if (got.title && !title) title = got.title;
      continue;
    }
    if (got.image) { pics.push(got.image); sources.push(`${f.name}（写真）`); }
    if (got.pdf) { pdfs.push({ name: f.name, data: got.pdf }); sources.push(`${f.name}（PDF）`); }
    if (got.text?.trim()) { texts.push(got.text); if (!got.pdf) sources.push(`${f.name}（文）`); }
  }
  const allText = texts.join('\n\n');
  let via = items.length ? 'file' : 'rules';
  // 文・写真・PDF を 読む
  if (allText.trim() || pics.length || pdfs.length) {
    let got = null;
    if (useAi || client) {
      try { got = await parseWithAi({ text: allText, images: pics, pdfs }, { client }); via = items.length ? 'file+ai' : 'ai'; }
      catch (err) { log.warn('[homework] AI read failed:', err.message); warnings.push('AI で 読めなかったので、きまりで 読みました'); }
    } else if (pics.length || (pdfs.length && !allText.trim())) {
      warnings.push('写真・文字の ない PDF を 読むには OPENAI_API_KEY が いります');
    }
    if (!got || !got.items.length) {
      // Aiken・GIFT を はりつけた ときも ここで 読める
      const aiken = /^\s*ANSWER\s*:/im.test(allText) ? parseAiken(allText) : [];
      const gift = !aiken.length && /\{[^}]*[=~][^}]*\}/.test(allText) ? parseGift(allText) : [];
      got = aiken.length ? { title: '', items: aiken } : gift.length ? { title: '', items: gift } : parseRules(allText);
    }
    items = items.concat(got.items);
    if (!title) title = got.title || '';
  }
  if (!items.length) warnings.push('問題が 見つかりませんでした。「ことば = 意味」の 形で 1 行ずつ 書くか、写真・PDF を 入れて ください');
  if (items.length > MAX_ITEMS) warnings.push(`問題は 1 つの 宿題に ${MAX_ITEMS} 問までです（のこりは 入れませんでした）`);
  return { ok: true, via, title, sources, items: assignKinds(items.slice(0, MAX_ITEMS)), warnings };
}
