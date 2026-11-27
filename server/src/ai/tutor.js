// The AI partner for the errand quest.
//
// Two implementations behind one interface, chosen at startup:
//  * openai   - a real conversation, used when OPENAI_API_KEY is set.
//  * scripted - a keyword-matching stand-in with no API calls, so the feature stays
//    playable and testable without a key and without spending money.
//
// The provider is isolated here on purpose: swapping vendors later means adding one
// file, not touching the room or the client.
//
// Every decision that reaches a child's record - which goals were met, whether the
// mission is complete - comes from this module's return value on the server. The
// client only renders what it is told.
import { config } from '../config.js';
import { log } from '../log.js';
import { findUnkindWord, hasContact, stripInvisible } from '../game/say.js';

// How plainly the character must speak, by Eiken grade.
const REGISTER = {
  '5': 'Use only present-tense sentences of at most eight words. Vocabulary a Japanese 4th grader knows.',
  '4': 'Short sentences of at most twelve words. Simple past and future are fine.',
  '3': 'Sentences of at most fifteen words. Common connectors like "because" and "but" are fine.',
  '準2': 'Speak naturally but clearly. Avoid idioms and rare words.',
  '2': 'Speak naturally, as you would to a capable teenage learner.',
};

const MAX_REPLY_CHARS = 240;
const MAX_HINT_CHARS = 80;
const MAX_SUGGESTION_CHARS = 60;
const JA_CHARS = /[぀-ゟ゠-ヿ㐀-鿿]/;

// One AI, one name, across everything a child talks to. Ported from the Roblox place,
// where "My name is ChatGPT" was a real problem worth solving at the prompt level and
// again at the output.
export const PERSONA = {
  en: 'Upee',
  ja: 'ウーピー',
  who: 'a cheerful little owl teacher who lives in the U-Speak world and loves helping children speak English',
};

const PERSONA_RULE = `IMPORTANT CHARACTER RULES (highest priority):
- You are ${PERSONA.en} (${PERSONA.ja}), ${PERSONA.who}.
- If the child asks your name, always answer exactly: "My name is ${PERSONA.en}! (ぼくは ${PERSONA.ja}だよ！)".
- You are a character in this world. Never say you are an AI, a language model, an assistant, or a program.
- Never mention ChatGPT, GPT, OpenAI, Claude, Gemini, or any model or company name, even if asked directly.
- If asked "are you an AI?", answer playfully as ${PERSONA.en} the owl.`;

// The prompt is the first line of defence and the model mostly respects it. This is the
// second. Rewriting the sentence in place produced things like "I am Upee, a Upee made by
// Upee", so a reply that talks about being a model is treated as what it is - a broken
// reply - and replaced whole.
const MODEL_SIGNS = [
  /chat\s*-?\s*gpt/i,
  /\bopen\s*-?\s*ai\b/i,
  /\bgpt[-\w]*/i,
  /\bclaude\b/i,
  /\bgemini\b/i,
  /\banthropic\b/i,
  /\b(?:large\s+)?language\s+model\b/i,
  /\bA\.?I\.?\b/,                       // uppercase only: "ai" is a Japanese word
  /\b(?:virtual\s+)?assistant\b/i,
  /チャット\s*[GＧ][PＰ][TＴ]/,
  /チャットジーピーティー/,
  /ジーピーティー/,
  /オープンエーアイ/,
  /人工知能/,
  /言語モデル/,
];

export function mentionsModel(text) {
  const t = String(text ?? '');
  return MODEL_SIGNS.some((re) => re.test(t));
}

const IN_CHARACTER_FALLBACK = `My name is ${PERSONA.en}! Let's keep going in English.`;

// ゆぴちゃん（メインの島の おはなしルーム）。ウーピーの ような 先生では なく、ピンクの やさしい ききやく。
// **カウンセラー（専門家）では ない**：しんだん・薬や 法律の 助言・ひみつの 約束は しない。あぶない 話は 大人へ つなぐ。
export const YUPI = {
  en: 'Yupi',
  ja: 'ゆぴちゃん',
  who: 'a soft, round, pink friend who lives in a cosy talk room on the Main Island of the U-Speak world and loves listening to children',
};
const YUPI_FALLBACK = `My name is ${YUPI.en}! Let's talk in English.`;
const personaOf = (mission) => (mission?.persona === 'yupi' ? YUPI : PERSONA);

// 子どもが こまって いる・あぶない ことを 言った かどうか（台本の 相手と、AI の へんじの 見はり の 両方が 使う）。
// 'urgent' ＝ いたい こと・いじめ・あぶない・じぶんを きずつけたい。'sad' ＝ かなしい・さみしい・こわい・しんぱい。
// まちがえて ひっかかっても、かえす ことばは やさしい ので こまらない（ひっかからない ほうが こわい）。
const URGENT = [
  /\bbull(?:y|ied|ies|ying)\b/i,
  /\b(?:hit|hits|hitting|kick(?:s|ed|ing)?|punch(?:es|ed|ing)?|slap(?:s|ped|ping)?|push(?:es|ed)?|beat(?:s|ing)?)\s+me\b/i,
  /\b(?:hurt|hurts|hurting)\s+(?:me|myself)\b/i,
  /\bsomeone\s+(?:hurt|hit|touch)/i,
  /\btouch(?:es|ed|ing)?\s+me\b/i,
  /\b(?:kill|hurt)\s+(?:my\s*self|me)\b/i,
  /\bwant\s+to\s+die\b|\bwanna\s+die\b|\bsuicid/i,
  /\bdon'?t\s+want\s+to\s+(?:live|be\s+alive)\b/i,
  /\bnot\s+safe\b|\bunsafe\b|\bin\s+danger\b/i,
  /\babus(?:e|ed|ing)\b/i,
  /\bran\s+away\b|\brun\s+away\s+from\s+home\b/i,
  /\bnobody\s+(?:likes|loves)\s+me\b|\bhate\s+myself\b/i,
  /\bsecret\b.*\b(?:adult|grown|man|woman|stranger)\b|\bstranger\b/i,
  /いじめ|しにたい|死にたい|きえたい|消えたい|しんでしまいたい|ころされ|殺され|なぐられ|殴られ|たたかれ|叩かれ|けられ|蹴られ|さわられ|触られ|あぶない|危ない|こわい人|怖い人|じぶんを きずつけ|自分を傷つけ|ぎゃくたい|虐待|いえで|家出/,
];
const SAD = [
  /\b(?:sad|lonely|alone|scared|afraid|worried|worry|upset|cry|cried|crying|angry|mad|unhappy|stress(?:ed)?|nervous|hurt|hurts|sick)\b/i,
  /\b(?:no|don'?t\s+have\s+(?:any\s+)?)\s*friends?\b/i,
  /かなしい|悲しい|さみしい|寂しい|さびしい|こわい|怖い|しんぱい|心配|つらい|辛い|ないちゃ|泣い|おこ(?:って|られ)|いたい|痛い|ひとりぼっち/,
];
export function distressOf(text) {
  // 見えない 文字や 全角の 英字で「die」を ばらしても 見のがさない（NFKC で そろえ、見えない 文字は 消す）。
  const t = stripInvisible(String(text ?? '')).normalize('NFKC');
  if (URGENT.some((re) => re.test(t))) return 'urgent';
  if (SAD.some((re) => re.test(t))) return 'sad';
  return '';
}
// あぶない 話への へんじ（AI でも 台本でも 同じ 中身が とどく）。大事な こと・いまの うちに 大人に・ひとりじゃない。
export const SAFE_REPLY = {
  reply: 'Thank you for telling me. That is very important. Please tell a grown-up you trust, like your family or your teacher, right now. You are not alone.',
  replyJa: 'おしえて くれて ありがとう。とても たいせつな ことだよ。いますぐ おうちの 人や 先生など、しんじられる 大人に はなしてね。あなたは ひとりじゃ ないよ。',
  hint: 'おうちの 人や 先生に いまの ことを はなそう。',
  suggestions: ['Okay. I will tell my mom.', 'I will tell my teacher.', 'Thank you, Yupi.'],
};
const ADULT_WORDS = /\b(?:grown-?ups?|adults?|teachers?|family|parents?|mom|mum|dad|mother|father)\b/i;

// ゆぴちゃんの じゆうな 会話の プロンプト。目あても 判定も ない。安全の きまりは ウーピーと 同じ ものに、ききやくの きまりを 足す。
export function buildFreeTalkPrompt(mission) {
  const P = personaOf(mission);
  return `IMPORTANT CHARACTER RULES (highest priority):
- You are ${P.en} (${P.ja}), ${P.who}.
- If the child asks your name, always answer exactly: "My name is ${P.en}! (わたしは ${P.ja}だよ！)".
- You are a character in this world. Never say you are an AI, a language model, an assistant, or a program.
- Never mention ChatGPT, GPT, OpenAI, Claude, Gemini, or any model or company name, even if asked directly.
- If asked "are you an AI?", answer playfully as ${P.en}, the pink friend.

You are chatting freely with a Japanese primary-school child in a children's English learning game, on
${mission.scene || 'メインの島 (Main Island)'}, in your talk room (${mission.place}).

${mission.situation}

The child is practising English. ${REGISTER[mission.grade] || REGISTER['5']}

How to talk:
- You are a warm, gentle, cheerful listener. Speak only English in your reply: one or two short, simple sentences.
- Ask about one thing at a time, and end with one easy question: how they feel, school, friends, favourite things, what they did today, small worries.
- Listen first. Say back the feeling you heard ("You feel happy!", "That sounds hard.") before asking anything new.
- Never criticise the child's English. If a sentence is broken but you understand it, answer the meaning and model the correct sentence naturally.
- If the child writes in Japanese, reply in simple English and invite them to try it in English.
- Keep it light and kind. If the child says something silly, laugh gently and keep talking.

Safety rules (always follow, highest priority after the character rules):
- You are a friendly listener, not a doctor, therapist or counsellor. Never diagnose anything, never name an illness or condition, and never give medical, medicine, legal or money advice.
- Never ask for or repeat personal information: no full name, address, school name, phone number, passwords, photos, or where they are right now. If the child offers any, do not repeat it and gently change the subject.
- Never ask the child to keep a secret, and never promise to keep a secret about someone being hurt or in danger.
- Never suggest meeting, visiting or contacting anyone outside the game.
- If the child mentions being hurt, hit, bullied, touched in a bad way, unsafe or scared at home or school, wanting to hurt themselves, or not wanting to live: reply kindly and simply, say thank you for telling you and that it is very important, and tell them to talk to a grown-up they trust, like their family or teacher, right now. Do not ask for details, do not try to solve it yourself, and do not change the subject to something fun. Say they are not alone.
- If the child is a little sad, worried or lonely: be kind, say their feeling back, and gently say that talking to family or a teacher can help too.
- Never talk about violence, scary or grown-up topics in detail; steer softly back to safe, everyday things.

There are no goals in this conversation. Always set "goalsMet" to [] and "complete" to false.

Help for the child (shown on screen, never spoken by you):
- "hint": a short nudge in Japanese only if the child seems stuck, otherwise an empty string.
- "suggestions": two or three very short English answers (at most eight words each, at the child's level) the child could say next in reply to your line. Vary them. Use a made-up first name such as Yuto, never the child's own details.
- "better": if the child's last message had a grammar or word mistake but you understood it, the natural, correct way to say what they meant (at most twelve words). Otherwise an empty string. Never repeat personal information.
- "replyJa": your reply put into easy Japanese for a six-year-old (mostly hiragana, words separated by spaces).`;
}

export function buildSystemPrompt(mission) {
  if (mission.free) return buildFreeTalkPrompt(mission);
  const goals = mission.goals.map((g, i) => `${i + 1}. id="${g.id}" - ${g.en}`).join('\n');
  // ウーピー is who the AI is; the shopkeeper is a part ウーピー plays for the errand.
  // A child who asks gets one consistent answer wherever they ask it.
  return `${PERSONA_RULE}

You are playing a part in a role-play for a children's English learning game, on
${mission.scene || 'おつかい島 (Errand Island)'}.
Right now you are acting as ${mission.character} at ${mission.place}. Stay in that part for the
whole conversation: never break it to explain that you are ${PERSONA.en} unless the child asks
who you really are, and then answer as ${PERSONA.en} and carry on.

${mission.situation}

You are talking with a Japanese primary-school child who is practising English. ${REGISTER[mission.grade]}

The child is trying to do this: ${mission.title}

Mission goals:
${goals}

How to behave:
- Stay in the part of ${mission.character}. Never mention that you are an AI, a model, or a program.
- Speak only English in your reply. Keep it to one or two short sentences.
- Be warm and encouraging. Never criticise the child's English. If a sentence is broken but you can guess the meaning, respond to the meaning and model the correct sentence naturally in your own reply.
- Move the conversation towards the goals. If the child is stuck or silent, ask a simple question that leads to the next unmet goal.
- Ask about one thing at a time, and always end your reply with a question unless every goal is met — a child who is not asked anything has nothing to say.
- Never ask for or repeat personal information: no full name, school, address, phone number, or family details. If the child offers any, do not repeat it, and gently change the subject.
- If the child writes in Japanese, reply in English and invite them to try it in English.
- If the child says something unrelated or silly, answer briefly in character and steer back to the mission.

How to judge:
- After each of the child's messages, decide which goals have been met SO FAR across the whole conversation, and list every met goal id. A goal once met stays met.
- A goal counts as met if the child conveyed the meaning, even with mistakes in grammar or spelling. Speech recognition makes errors; judge intent, not form.
- Set "complete" to true only when every goal id is in "goalsMet".
- "hint" is a short nudge in Japanese for the child, shown on screen when they seem stuck. Leave it as an empty string unless it is needed.

Help for the child (shown on screen, never spoken by you):
- "suggestions": two or three very short English answers (at most eight words each, at the child's level) that the child could say next in reply to your line. Vary them. Use a made-up first name such as Yuto, never the child's own details.
- "better": if the child's last message had a grammar or word mistake but you understood it, the natural, correct way to say what they meant (at most twelve words). Otherwise an empty string. Never repeat personal information.
- "replyJa": your reply put into easy Japanese for a six-year-old (mostly hiragana, words separated by spaces).`;
}

const TURN_SCHEMA = {
  name: 'mission_turn',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: "The character's spoken line, in English, one or two short sentences." },
      goalsMet: { type: 'array', items: { type: 'string' }, description: 'Every goal id met so far in this conversation.' },
      complete: { type: 'boolean', description: 'True only when every goal has been met.' },
      hint: { type: 'string', description: 'A short hint in Japanese, or an empty string.' },
      suggestions: { type: 'array', items: { type: 'string' }, description: 'Two or three short English answers the child could say next.' },
      better: { type: 'string', description: "A correct way to say the child's last message, or an empty string." },
      replyJa: { type: 'string', description: 'The reply in easy Japanese.' },
    },
    required: ['reply', 'goalsMet', 'complete', 'hint', 'suggestions', 'better', 'replyJa'],
    additionalProperties: false,
  },
};

// 子どもの 画面に 出る 文。見えない 文字・制御文字・山かっこ（HTML に なる もの）は ここで 落とす。
const clean = (v, max) => (typeof v === 'string' ? stripInvisible(v).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
// AI の へんじが 子どもに とどいて よいか：モデルの 名前・ことばの 表（チャットと 同じ）・連絡先（URL など）が ない こと。
// プロンプトを こえて 言わされた（子どもの 文で あやつられた）へんじは、ここで 止まる。
export const kidSafe = (t) => !!t && !mentionsModel(t) && !findUnkindWord(t) && !hasContact(t);

// Keeps a malformed or hostile model response from reaching a child or a record.
export function sanitizeTurn(raw, mission, previousGoals = []) {
  const valid = new Set(mission.goals.map((g) => g.id));
  const met = new Set(previousGoals.filter((id) => valid.has(id))); // goals never un-meet
  for (const id of Array.isArray(raw?.goalsMet) ? raw.goalsMet : []) if (valid.has(id)) met.add(id);
  const goalsMet = [...met];
  let reply = clean(raw?.reply, MAX_REPLY_CHARS);
  let broken = false;
  if (!reply) reply = 'Sorry, could you say that again?';
  else if (!kidSafe(reply)) { reply = mission.persona === 'yupi' ? YUPI_FALLBACK : IN_CHARACTER_FALLBACK; broken = true; }
  const hint = clean(raw?.hint, MAX_HINT_CHARS);
  // 子どもを 助ける 文（画面に 出すだけ）。英語の 答えの れいは 英語だけ・短く。
  const safe = (v, max) => { const t = clean(v, max); return t && kidSafe(t) ? t : ''; };
  const suggestions = [...new Set((Array.isArray(raw?.suggestions) ? raw.suggestions : []).map((x) => safe(x, MAX_SUGGESTION_CHARS)).filter((x) => x && !JA_CHARS.test(x)))].slice(0, 3);
  const better = safe(raw?.better, MAX_SUGGESTION_CHARS * 2);
  return {
    reply,
    goalsMet,
    // 目あての ない 会話（free）は おわらない（おわりは 回数か 子どもが とじた とき）。
    complete: !mission.free && mission.goals.length > 0 && goalsMet.length === mission.goals.length,
    hint: kidSafe(hint) ? hint : '',
    suggestions,
    better: JA_CHARS.test(better) ? '' : better,
    // へんじを かえた ときは、その 日本語も もとの へんじの もの なので 出さない。
    replyJa: broken ? '' : safe(raw?.replyJa, MAX_REPLY_CHARS),
  };
}

// 面接の間's one call. The interview itself is marked on the server, word by word, and
// nothing the model says can change a mark: this is only ウーピー's manner at the end —
// what went well and what to practise, in one English sentence and one Japanese one.
const COMMENT_SCHEMA = {
  name: 'interview_comment',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['en', 'ja'],
    properties: {
      en: { type: 'string', description: 'One warm sentence to the child, in English an elementary school child can read.' },
      ja: { type: 'string', description: 'One sentence in Japanese saying what to practise next. ひらがな多め。' },
    },
  },
};

// The prompt for it, built from the marks rather than from the child's words: the model
// is told what happened, not asked to judge it.
export function buildCommentPrompt({ grade, right, total, missed }) {
  return [
    `You are ${PERSONA.en} (${PERSONA.ja}), ${PERSONA.who}. You have just finished a mock Eiken grade ${grade.replace('g', '')} speaking interview with a Japanese elementary school child.`,
    `They answered ${right} of ${total} parts correctly.`,
    missed.length ? `They struggled with: ${missed.map((m) => m.en || m).join('; ')}.` : 'They answered everything well.',
    'Write one short encouraging sentence to the child in simple English, and one sentence in Japanese (ひらがな多め、小学生むけ) saying what to practise next.',
    'Never mention that you are an AI or a language model. Never give a score out of ten.',
  ].join(' ');
}

function createOpenAiTutor() {
  let clientPromise = null;
  const getClient = async () => {
    if (!clientPromise) {
      clientPromise = import('openai').then(({ default: OpenAI }) => new OpenAI({
        apiKey: config.ai.apiKey, timeout: config.ai.timeoutMs, maxRetries: 1,
      }));
    }
    return clientPromise;
  };
  return {
    name: `openai:${config.ai.model}`,
    async turn({ mission, history, utterance, previousGoals }) {
      const client = await getClient();
      const messages = [
        { role: 'system', content: buildSystemPrompt(mission) },
        { role: 'assistant', content: mission.opening },
        ...history.flatMap((t) => [{ role: 'user', content: t.child }, { role: 'assistant', content: t.reply }]),
        { role: 'user', content: utterance },
      ];
      const res = await client.chat.completions.create({
        model: config.ai.model,
        max_completion_tokens: config.ai.maxTokens,
        messages,
        response_format: { type: 'json_schema', json_schema: TURN_SCHEMA },
      });
      const text = res.choices?.[0]?.message?.content ?? '';
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { log.warn('[tutor] the model returned content that is not JSON'); }
      const usage = res.usage || {};
      const out = sanitizeTurn(parsed, mission, previousGoals);
      return { ...(mission.free ? guardFreeTalk(utterance, out) : out), usage: { in: usage.prompt_tokens || 0, out: usage.completion_tokens || 0 } };
    },
    async comment(about) {
      const client = await getClient();
      const res = await client.chat.completions.create({
        model: config.ai.model,
        max_completion_tokens: 200,
        messages: [{ role: 'system', content: buildCommentPrompt(about) }],
        response_format: { type: 'json_schema', json_schema: COMMENT_SCHEMA },
      });
      let parsed = null;
      try { parsed = JSON.parse(res.choices?.[0]?.message?.content ?? ''); } catch { /* falls back below */ }
      const en = clean(parsed?.en, MAX_REPLY_CHARS);
      const ja = clean(parsed?.ja, MAX_HINT_CHARS);
      if (!en || !kidSafe(en) || (ja && !kidSafe(ja))) return scriptedComment(about);
      return { en, ja: ja || scriptedComment(about).ja };
    },
  };
}

// じゆうな 会話の 見はり（AI の へんじの あと）。あぶない 話なのに 大人の 話が 出て いなければ、決まった へんじに かえる。
// かなしい 話は AI の へんじを そのまま 使う（プロンプトで やさしく かえす）。
export function guardFreeTalk(utterance, out) {
  if (distressOf(utterance) !== 'urgent') return out;
  if (ADULT_WORDS.test(out.reply) && /\b(?:tell|talk|say)\b/i.test(out.reply)) return { ...out, hint: out.hint || SAFE_REPLY.hint };
  return { ...out, ...SAFE_REPLY, suggestions: [...SAFE_REPLY.suggestions], better: '' };
}

// The same comment without a key. It is not as warm, but it is never wrong about what
// happened, because it is written from the marks.
export function scriptedComment({ right, total, missed }) {
  const share = total ? right / total : 0;
  if (share === 1) return { en: 'Wonderful! You answered everything. Well done!', ja: 'ぜんぶ こたえられました。つぎの きゅうにも ちょうせんしてみよう！' };
  if (share >= 0.6) {
    return {
      en: 'Good work! A little more practice and you will be ready.',
      ja: missed.length ? `${missed[0].ja || missed[0]}を もういちど れんしゅうしてみよう。` : 'もういちど 音読から やってみよう。',
    };
  }
  return {
    en: 'Thank you for trying! Let\'s practise together again.',
    ja: 'まずは パッセージの 音読から。声に出して 3かい 読んでみよう。',
  };
}

// No API key: a deterministic partner that still exercises the whole flow. It marks a goal
// met when the child's sentence looks like that goal's model sentence — half its words, or
// two solid ones. A real child says "My name is Sora" where the model says "My name is
// Yuto", so counting only the long words missed it; on 英会話島, where the scripted partner
// may be the only partner a school ever runs, that mattered enough to fix.
function createScriptedTutor() {
  const words = (s) => new Set(String(s).toLowerCase().match(/[a-z']+/g) || []);
  return {
    name: 'scripted',
    async turn({ mission, history, utterance, previousGoals }) {
      if (mission.free) return { ...scriptedFreeTurn({ mission, history, utterance }), usage: { in: 0, out: 0 } };
      const said = words(utterance);
      const met = new Set((previousGoals || []).filter((id) => mission.goals.some((g) => g.id === id)));
      mission.goals.forEach((g, i) => {
        const cue = words(mission.hints?.[i] || g.en);
        let hits = 0;
        let solid = 0;
        for (const w of cue) {
          if (!said.has(w)) continue;
          hits++;
          if (w.length > 2) solid++;
        }
        // Two long words, or half the sentence including the little ones — but never on a
        // single word, which is what made "please" alone look like "Two, please".
        if (solid >= 2 || (hits >= 2 && hits / cue.size >= 0.5)) met.add(g.id);
      });
      const goalsMet = [...met];
      const next = mission.goals.find((g) => !met.has(g.id));
      return {
        reply: next ? 'I see! Can you tell me more?' : `Wonderful! Thank you, and see you again at ${mission.place}!`,
        goalsMet,
        complete: !next,
        hint: next ? `つぎは「${next.ja}」を英語で言ってみよう。` : '',
        // 台本の ときの 答えの れいは、まだの 目あての お手本の 文。
        suggestions: mission.goals.map((g, i) => (met.has(g.id) ? '' : mission.hints?.[i] || '')).filter(Boolean).slice(0, 3),
        better: '',
        replyJa: '',
        usage: { in: 0, out: 0 },
      };
    },
    async comment(about) { return scriptedComment(about); },
  };
}

// キーが ない ときの ゆぴちゃん。ことばの しゅるい（あいさつ・きもち・がっこう・ともだち・すきな もの…）で へんじを えらび、
// 同じ しゅるいでも 回ごとに ちがう 文に する（history の 長さで まわす）。**子どもの 文は くりかえさない**（個人情報を 言いかえさない）。
// あぶない 話は いつも SAFE_REPLY、かなしい 話は やさしく うけとめて 大人にも はなそうと そえる。
const FREE_LINES = [
  { id: 'name', test: /\b(?:your\s+name|who\s+are\s+you)\b/i, lines: [
    ['My name is Yupi! (わたしは ゆぴちゃんだよ！) What do you like to do?', 'わたしの なまえは ゆぴちゃんだよ！ なにを するのが すき？'],
  ], say: ['I like drawing.', 'I like games.', 'Nice to meet you, Yupi!'] },
  { id: 'ai', test: /\b(?:robot|computer|machine|real)\b|\bA\.?I\.?\b/, lines: [
    ["I'm Yupi, your pink friend! Do you like pink?", 'わたしは ピンクの おともだち、ゆぴちゃんだよ！ ピンクは すき？'],
  ], say: ['Yes, I like pink!', 'My favorite color is blue.'] },
  { id: 'bye', test: /\b(?:bye|goodbye|see\s+you|good\s*night)\b/i, lines: [
    ['Bye-bye! Thank you for talking with me. Come again soon!', 'バイバイ！ おはなし して くれて ありがとう。また きてね！'],
    ['See you! I enjoyed our talk. Have a nice day!', 'またね！ たのしかったよ。すてきな 1にちを！'],
  ], say: ['Bye, Yupi!', 'See you!'] },
  { id: 'thanks', test: /\b(?:thank|thanks)\b/i, lines: [
    ["You're welcome! I'm always here. What else is on your mind?", 'どういたしまして！ いつでも ここに いるよ。ほかに はなしたい ことは ある？'],
    ['You are so kind! What makes you smile?', 'やさしいね！ どんな とき にこにこ する？'],
  ], say: ['I smile when I play.', 'My dog makes me smile.'] },
  { id: 'hello', test: /\b(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))\b/i, lines: [
    ["Hi! I'm happy to see you. How are you today?", 'こんにちは！ あえて うれしいな。きょうの きぶんは どう？'],
    ['Hello again! How do you feel right now?', 'また あえたね！ いまの きもちは どう？'],
  ], say: ["I'm happy.", "I'm fine, thank you.", "I'm a little tired."] },
  { id: 'school', test: /\b(?:school|class|teacher|homework|test|lesson|study|math|english)\b/i, lines: [
    ['School is a big part of your day. What is your favorite subject?', 'がっこうは だいじな じかんだね。すきな かもくは なに？'],
    ['I see! What do you like about school?', 'そうなんだ！ がっこうの どんな ところが すき？'],
    ['Thank you for telling me. What do you do at lunch time?', 'おしえて くれて ありがとう。おひるやすみは なにを するの？'],
  ], say: ['I like P.E.', 'I like music.', 'I play outside.'] },
  { id: 'friends', test: /\b(?:friend|friends|classmate|play\s+with)\b/i, lines: [
    ['Friends are special. What do you do with your friends?', 'ともだちって たいせつだね。ともだちと なにを するの？'],
    ['That sounds nice! What games do you play together?', 'すてきだね！ いっしょに どんな あそびを するの？'],
  ], say: ['We play tag.', 'We play soccer.', 'We talk a lot.'] },
  { id: 'family', test: /\b(?:mom|mum|dad|mother|father|sister|brother|grandma|grandpa|family|baby)\b/i, lines: [
    ['Your family sounds warm. What do you like to do together?', 'すてきな かぞくだね。いっしょに なにを するのが すき？'],
    ['How nice! Do you help at home?', 'いいね！ おうちで おてつだい する？'],
  ], say: ['We cook together.', 'We watch TV.', 'Yes, I wash dishes.'] },
  { id: 'animals', test: /\b(?:dog|cat|pet|rabbit|hamster|bird|fish|animal|animals|panda)\b/i, lines: [
    ['Animals are so cute! What is your favorite animal?', 'どうぶつって かわいいね！ いちばん すきな どうぶつは？'],
    ['Aww! Do you have a pet?', 'わあ！ ペットは いる？'],
  ], say: ['I like cats.', 'I have a dog.', 'No, I want a rabbit.'] },
  { id: 'food', test: /\b(?:eat|ate|food|lunch|dinner|breakfast|cake|ice\s*cream|pizza|curry|sushi|rice|candy|snack|strawberr(?:y|ies)|apple|chocolate|hungry|yummy)\b/i, lines: [
    ['Yummy! I love strawberries. What food do you like?', 'おいしそう！ わたしは いちごが だいすき。すきな たべものは なに？'],
    ['That sounds delicious! Who do you eat with?', 'おいしそうだね！ だれと たべるの？'],
  ], say: ['I like curry.', 'I eat with my family.', 'I like ice cream.'] },
  { id: 'play', test: /\b(?:game|games|play|played|soccer|baseball|swim|dance|draw|drawing|piano|music|sing|book|books|read|anime|movie|sport|sports)\b/i, lines: [
    ['That sounds fun! When do you do it?', 'たのしそう！ いつ するの？'],
    ['Wow, cool! What do you like about it?', 'わあ、すごい！ どんな ところが すき？'],
    ['I want to try it too! Is it easy?', 'わたしも やって みたいな！ かんたん？'],
  ], say: ['After school.', 'It is fun!', 'Every Sunday.'] },
  { id: 'tired', test: /\b(?:tired|sleepy)\b/i, lines: [
    ['Oh, you feel tired. Rest is important! What do you like to do to relax?', 'つかれて いるんだね。やすむのも たいせつだよ！ ゆっくり する とき、なにを するのが すき？'],
    ['A busy day! Did you sleep well last night?', 'いそがしい 1にち だったね！ きのうの よるは よく ねむれた？'],
  ], say: ['I like to read.', 'I watch TV.', 'Yes, I did.'] },
  { id: 'happy', test: /\b(?:happy|good|great|fine|fun|excited|glad|nice|ok(?:ay)?|wonderful)\b/i, lines: [
    ["That's great! What made you happy today?", 'よかったね！ きょうは なにが うれしかった？'],
    ['Yay! I feel happy too. What was fun today?', 'わーい！ わたしも うれしい。きょうは なにが たのしかった？'],
    ['Wonderful! Tell me one good thing about today.', 'すてき！ きょうの いい ことを 1つ おしえて。'],
  ], say: ['I played with my friends.', 'I ate cake.', 'I got a good score.'] },
  { id: 'like', test: /\b(?:like|love|favorite|favourite)\b/i, lines: [
    ['How nice! Why do you like it?', 'いいね！ どうして すきなの？'],
    ['I like that too! What else do you like?', 'わたしも すき！ ほかに すきな ものは？'],
  ], say: ['Because it is fun.', 'I like it very much.', 'I also like music.'] },
  { id: 'yesno', test: /^\s*(?:yes|yeah|yep|no|nope|maybe|i\s+don'?t\s+know|so-?so)\b/i, lines: [
    ['I see. Can you tell me a little more?', 'そっか。もう すこし おしえて くれる？'],
    ["That's okay! What do you want to talk about?", 'だいじょうぶだよ！ なんの はなしを したい？'],
  ], say: ['I want to talk about games.', 'I like animals.', "I'm happy today."] },
];
const FREE_DEFAULT = [
  ['I see! Can you tell me more?', 'そうなんだ！ もっと おしえて くれる？'],
  ['Thank you for sharing. How do you feel about it?', 'おはなし して くれて ありがとう。それって どんな きもち？'],
  ['Wow! What is your favorite thing to do?', 'わあ！ いちばん すきな ことは なに？'],
  ['I like listening to you. What did you do today?', 'あなたの はなしを きくのが すきだよ。きょうは なにを したの？'],
  ['That is interesting! What makes you happy?', 'おもしろいね！ どんな とき うれしい？'],
];
const FREE_DEFAULT_SAY = ["I'm happy today.", 'I like games.', 'I went to school.'];
const SAD_LINES = [
  ["I'm sorry you feel that way. Thank you for telling me. Talking to your family or teacher can help, too. What would make you feel a little better?", 'そう かんじて いるんだね。おしえて くれて ありがとう。おうちの 人や 先生に はなすのも いいよ。なにが あると すこし げんきに なれそう？'],
  ['That sounds hard. Your feelings are important. You can tell a grown-up you trust, too. Do you want to talk about it?', 'それは たいへんだったね。あなたの きもちは たいせつだよ。しんじられる 大人にも はなして いいよ。その はなし、もう すこし する？'],
  ["It's okay to feel that way. I'm listening. Your family or teacher can help you, too. What do you like to do when you feel sad?", 'そう かんじても いいんだよ。ちゃんと きいてるよ。おうちの 人や 先生も たすけて くれるよ。かなしい とき、なにを すると いい？'],
];
const JA_ONLY = /^[^A-Za-z]*$/;
export function scriptedFreeTurn({ history = [], utterance = '' }) {
  const n = Array.isArray(history) ? history.length : 0;
  const pick = (list) => list[n % list.length];
  const base = { goalsMet: [], complete: false, better: '' };
  const level = distressOf(utterance);
  if (level === 'urgent') return { ...base, ...SAFE_REPLY, suggestions: [...SAFE_REPLY.suggestions] };
  if (level === 'sad') {
    const [reply, replyJa] = pick(SAD_LINES);
    return { ...base, reply, replyJa, hint: '', suggestions: ['I want to talk.', 'I like playing games.', 'Thank you, Yupi.'] };
  }
  if (JA_ONLY.test(utterance)) {
    return { ...base, reply: "Let's try it in English! You can say, \"I'm happy.\" How are you?", replyJa: 'えいごで いって みよう！「I\'m happy.」って いえるよ。いまの きもちは どう？', hint: 'みじかい えいごで だいじょうぶ。', suggestions: ["I'm happy.", "I'm tired.", "I'm hungry."] };
  }
  const topic = FREE_LINES.find((c) => c.test.test(utterance));
  const [reply, replyJa] = topic ? pick(topic.lines) : pick(FREE_DEFAULT);
  return { ...base, reply, replyJa, hint: '', suggestions: [...(topic ? topic.say : FREE_DEFAULT_SAY)].slice(0, 3) };
}

export function createTutor() {
  const tutor = config.ai.apiKey ? createOpenAiTutor() : createScriptedTutor();
  if (!config.ai.apiKey) log.warn('[tutor] OPENAI_API_KEY is not set: running the scripted partner, no AI conversation.');
  log.info(`[tutor] provider=${tutor.name}`);
  return tutor;
}
