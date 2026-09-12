// 英会話島 — four houses, eight scenes, one owl to talk to.
//
// The island the errand quest built taught a child to complete an errand in English. This
// one has no errand: a child walks into a house and simply talks, and the only thing being
// measured is whether they managed to say the two or three things the scene is about
// (「名前を つたえる」「ねだんを たずねる」…). Those are the aims, and the server decides
// whether they were met — the page never says "I did it", it only sends what was heard.
//
// The conversation itself is the same machinery as the errand: a topic here is shaped into
// the mission object that src/ai/tutor.js already knows how to run, so the persona rules,
// the safety rules, the JSON schema and the scripted no-API-key fallback are all shared
// rather than written twice.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CONV_PATH = path.resolve(here, '../../../client/dist/conv.json');

// The page draws the island from this same file, so a spot that moves here moves there.
// Anything malformed stops the server at startup rather than at a child's first tap.
export function loadConv(file = CONV_PATH) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const island = data.island;
  if (!island?.id || !Array.isArray(island.spots) || !island.spots.length) throw new Error('conv.json: no island');
  const turnLimit = Number(data.turnLimit) || 14;
  const reward = {
    aimXp: Number(data.reward?.aimXp) || 0,
    topicCoins: Number(data.reward?.topicCoins) || 0,
    topicXp: Number(data.reward?.topicXp) || 0,
  };
  const dailyCoinCap = Number(data.dailyCoinCap) || 0;
  const spotById = new Map();
  const topicById = new Map();
  for (const spot of island.spots) {
    if (!spot.id || spotById.has(spot.id)) throw new Error(`conv.json: bad or duplicate house "${spot.id}"`);
    if (!Number.isFinite(spot.x) || !Number.isFinite(spot.z)) throw new Error(`conv.json: house "${spot.id}" has no place`);
    if (!Array.isArray(spot.topics) || !spot.topics.length) throw new Error(`conv.json: house "${spot.id}" has nothing to talk about`);
    for (const topic of spot.topics) {
      if (!topic.id || topicById.has(topic.id)) throw new Error(`conv.json: bad or duplicate topic "${topic.id}"`);
      if (!topic.opening || !topic.situation) throw new Error(`conv.json: topic "${topic.id}" has no scene`);
      if (!Array.isArray(topic.goals) || topic.goals.length < 2 || topic.goals.length > 4) {
        throw new Error(`conv.json: topic "${topic.id}" needs two to four aims`);
      }
      const seen = new Set();
      for (const goal of topic.goals) {
        if (!goal.id || seen.has(goal.id)) throw new Error(`conv.json: topic "${topic.id}" has a bad aim id`);
        if (!goal.en || !goal.ja) throw new Error(`conv.json: aim "${goal.id}" needs both languages`);
        seen.add(goal.id);
      }
      topicById.set(topic.id, { ...topic, spot: spot.id, grade: spot.grade || '5' });
    }
    // World coordinates, the way a `move` message carries them: the page walks in island
    // space, the server judges in world space, and this is the one place they meet.
    spot.wx = island.x + spot.x;
    spot.wz = island.z + spot.z;
    spotById.set(spot.id, spot);
  }
  return { island, spotById, topicById, turnLimit, reward, dailyCoinCap, id: island.id };
}

export const CONV = loadConv();

// A topic, in the shape src/ai/tutor.js runs conversations in. `scene` is the one thing
// the errand did not need: the tutor's prompt names the island and the part being played,
// and here that is a café on 英会話島 rather than a shop on おつかい島.
export function asMission(topic) {
  return {
    id: `conv:${topic.id}`,
    grade: topic.grade,
    title: topic.title,
    character: 'ウーピー',
    place: topic.place || CONV.spotById.get(topic.spot)?.name || '英会話島',
    scene: '英会話島 (Conversation Isle)',
    situation: topic.situation,
    opening: topic.opening,
    goals: topic.goals,
    hints: topic.hints || [],
  };
}

// What the page is allowed to know: the scene, the aims in Japanese, and the opening line.
// Not the hints for aims that have not been met — those come one at a time, from the AI,
// when a child is actually stuck.
export function topicPayload(topic) {
  const spot = CONV.spotById.get(topic.spot);
  return {
    spot: topic.spot,
    topic: topic.id,
    title: topic.title,
    en: topic.en || '',
    place: spot?.name || '',
    grade: topic.grade,
    opening: topic.opening,
    aims: topic.goals.map((g) => ({ id: g.id, ja: g.ja })),
    turnLimit: CONV.turnLimit,
  };
}

// Every house, for the page's own menu — and for a test that walks to each one.
export const convSpots = () => CONV.island.spots.map((spot) => ({
  id: spot.id,
  name: spot.name,
  en: spot.en,
  ja: spot.ja,
  tone: spot.tone,
  grade: spot.grade,
  topics: spot.topics.map((t) => ({ id: t.id, title: t.title, en: t.en || '' })),
}));
