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

export function buildSystemPrompt(mission) {
  const goals = mission.goals.map((g, i) => `${i + 1}. id="${g.id}" - ${g.en}`).join('\n');
  return `You are ${mission.character}, a character in a children's English learning game set on Willow Island. You are at ${mission.place}.

${mission.situation}

You are talking with a Japanese primary-school child who is practising English. ${REGISTER[mission.grade]}

The child is trying to complete this mission: ${mission.title}

Mission goals:
${goals}

How to behave:
- Stay in character as ${mission.character}. Never mention that you are an AI, a model, or a program.
- Speak only English in your reply. Keep it to one or two short sentences.
- Be warm and encouraging. Never criticise the child's English. If a sentence is broken but you can guess the meaning, respond to the meaning and model the correct sentence naturally in your own reply.
- Move the conversation towards the goals. If the child is stuck or silent, ask a simple question that leads to the next unmet goal.
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
  return {
    reply: clean(raw?.reply, MAX_REPLY_CHARS) || 'Sorry, could you say that again?',
    goalsMet,
    complete: goalsMet.length === mission.goals.length,
    hint: clean(raw?.hint, MAX_HINT_CHARS),
  };
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
  };
}

// No API key: a deterministic partner that still exercises the whole flow. It marks a
// goal met when the child's words overlap that goal's example sentence.
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
        for (const w of cue) if (w.length > 2 && said.has(w)) hits++;
        if (hits >= 2) met.add(g.id);
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
  };
}

export function createTutor() {
  const tutor = config.ai.apiKey ? createOpenAiTutor() : createScriptedTutor();
  if (!config.ai.apiKey) log.warn('[tutor] OPENAI_API_KEY is not set: running the scripted partner, no AI conversation.');
  log.info(`[tutor] provider=${tutor.name}`);
  return tutor;
}
