// おさかな道場 — the move a fish teaches.
//
// Roblox's FeedMoveService picked the move by matching the Japanese species name:
// anything containing ゴールデン taught きんのかがやき, anything with サメ taught かみつき.
// Our hundred fish are invented ones carrying English vocabulary (コモレビメダカ / apple),
// so those names never match. The rule that mattered is the one kept: the rarer the
// fish, the stronger the move it teaches. Rarity sets the power, and the pond, the river
// and the sea each name it differently, so two children with different bags fight
// differently.
//
// All eleven moves are Roblox's, with its names, damage and timers.
import { FISH_BY_ID } from '../../../client/dist/fishing-data.js';

const M = (id, name, en, damage, seconds) => ({ id, name, en, damage, seconds, quiz: true, fish: true });

export const FISH_MOVES = {
  energy: M('energy', 'おさかなパワー', 'Fish power!', 22, 10),
  punch: M('punch', 'パンチパンチ', 'Punch punch!', 24, 10),
  pinch: M('pinch', 'はさみアタック', 'Pinch attack!', 24, 10),
  spike: M('spike', 'トゲトゲガード', 'Spike guard!', 24, 10),
  ink: M('ink', 'すみはき', 'Ink splash!', 26, 10),
  jet: M('jet', 'ジェットふんしゃ', 'Jet spray!', 26, 10),
  shock: M('shock', 'でんきショック', 'Electric shock!', 28, 9),
  dash: M('dash', 'こうそくアタック', 'Speed dash!', 30, 9),
  bite: M('bite', 'かみつき', 'Bite!', 34, 8),
  ryugu: M('ryugu', 'りゅうのなみ', 'Dragon wave!', 38, 8),
  golden: M('golden', 'きんのかがやき', 'Golden shine!', 40, 8),
};

// [rarity][zone] — damage never falls as rarity rises, which is the whole promise.
const TABLE = [
  { pond: 'energy', river: 'punch', sea: 'pinch' },
  { pond: 'spike', river: 'ink', sea: 'jet' },
  { pond: 'shock', river: 'dash', sea: 'dash' },
  { pond: 'bite', river: 'bite', sea: 'ryugu' },
  { pond: 'ryugu', river: 'golden', sea: 'golden' },
];

export function moveForFish(fishId) {
  const fish = FISH_BY_ID[fishId];
  if (!fish) return null;
  const row = TABLE[Math.max(0, Math.min(TABLE.length - 1, fish.rarity | 0))];
  const move = FISH_MOVES[row[fish.zone] || row.pond];
  return move ? { ...move, from: fish.id, fishName: fish.name, word: fish.word } : null;
}

// A stored move is only ever a fish id. The move is rebuilt from it, so a tampered save
// cannot invent a 999-damage move - the worst it can claim is having eaten another fish.
export function sanitizeMove(raw) {
  const from = typeof raw === 'string' ? raw : raw?.from;
  return typeof from === 'string' ? moveForFish(from) : null;
}
