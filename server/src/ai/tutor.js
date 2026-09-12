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

export function buildSystemPrompt(mission) {
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
- "hint" is a short nudge in Japanese for the child, shown on screen when they seem stuck. Leave it as an empty string unless it is needed.`;
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
    },
    required: ['reply', 'goalsMet', 'complete', 'hint'],
    additionalProperties: false,
  },
};

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Keeps a malformed or hostile model response from reaching a child or a record.
export function sanitizeTurn(raw, mission, previousGoals = []) {
  const valid = new Set(mission.goals.map((g) => g.id));
  const met = new Set(previousGoals.filter((id) => valid.has(id))); // goals never un-meet
  for (const id of Array.isArray(raw?.goalsMet) ? raw.goalsMet : []) if (valid.has(id)) met.add(id);
  const goalsMet = [...met];
  let reply = clean(raw?.reply, MAX_REPLY_CHARS);
  if (!reply) reply = 'Sorry, could you say that again?';
  else if (mentionsModel(reply)) reply = IN_CHARACTER_FALLBACK;
  const hint = clean(raw?.hint, MAX_HINT_CHARS);
  return {
    reply,
    goalsMet,
    complete: goalsMet.length === mission.goals.length,
    hint: mentionsModel(hint) ? '' : hint,
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
      return { ...sanitizeTurn(parsed, mission, previousGoals), usage: { in: usage.prompt_tokens || 0, out: usage.completion_tokens || 0 } };
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
      if (!en || mentionsModel(en) || mentionsModel(ja)) return scriptedComment(about);
      return { en, ja: ja || scriptedComment(about).ja };
    },
  };
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
    async turn({ mission, utterance, previousGoals }) {
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
        usage: { in: 0, out: 0 },
      };
    },
    async comment(about) { return scriptedComment(about); },
  };
}

export function createTutor() {
  const tutor = config.ai.apiKey ? createOpenAiTutor() : createScriptedTutor();
  if (!config.ai.apiKey) log.warn('[tutor] OPENAI_API_KEY is not set: running the scripted partner, no AI conversation.');
  log.info(`[tutor] provider=${tutor.name}`);
  return tutor;
}
