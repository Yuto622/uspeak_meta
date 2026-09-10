// えいごアリーナ — battles, ported from Roblox's BattleService v1.7.1.
//
// The design worth keeping is that damage is bought with English. The plain attack
// always lands for a little; the three strong moves each pose a question first, and a
// wrong answer means the move fizzles. A child who answers wins; a child who mashes the
// safe button loses slowly.
//
// Everything is decided here. The client is sent a question and three choices, never the
// answer, and never a damage number it computed itself.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BANK_PATH = path.resolve(here, 'battle-bank.json');

export class BattleError extends Error {}

// Roblox's four moves, unchanged. `quiz` is what makes this an English game.
export const WAZA = {
  poyon: { id: 'poyon', name: 'ぽよんアタック', en: 'Poyon attack!', damage: 10, quiz: false, seconds: 0 },
  beam: { id: 'beam', name: 'えいごビーム', en: 'English beam!', damage: 18, quiz: true, seconds: 10 },
  super: { id: 'super', name: 'スーパーワード', en: 'Super word!', damage: 28, quiz: true, seconds: 8 },
  heal: { id: 'heal', name: 'にこにこヒール', en: 'Nikoniko heal!', heal: 15, quiz: true, seconds: 10 },
};
export const WAZA_IDS = Object.keys(WAZA);

// Roblox's three CPU settings: how often マスターウーピー lands a hit, and how much it takes.
export const CPU = {
  easy: { id: 'easy', name: 'らくらく', accuracy: 0.40, hp: 60 },
  normal: { id: 'normal', name: 'ふつう', accuracy: 0.60, hp: 90 },
  hard: { id: 'hard', name: 'つよい', accuracy: 0.80, hp: 120 },
};
export const CPU_IDS = Object.keys(CPU);

export const REWARD = { win: 15, lose: 10 };   // Roblox: REWARD_CPU / REWARD_LOSE
export const DAILY_CAP = 150;                  // Roblox: DAILY_CAP
export const CPU_DAMAGE = { min: 6, max: 14 };
export const MAX_TURNS = 40;                   // a battle that never ends is a bug, not a game

// Roblox: maxHP(pet) = 60 + level * 8. Our fighter is the child, whose level the server
// already owns, rather than a pet - pets are a later island.
export const maxHp = (level) => 60 + Math.max(1, Math.floor(level || 1)) * 8;

export function loadBank(file = BANK_PATH) {
  const questions = JSON.parse(readFileSync(file, 'utf8')).questions || [];
  if (questions.length < 20) throw new Error('battle-bank.json: too few questions');
  for (const [i, q] of questions.entries()) {
    if (typeof q.q !== 'string' || !q.q) throw new Error(`battle-bank.json: [${i}] has no question`);
    if (!Array.isArray(q.choices) || q.choices.length !== 3) throw new Error(`battle-bank.json: [${i}] needs three choices`);
    if (new Set(q.choices).size !== 3) throw new Error(`battle-bank.json: [${i}] repeats a choice`);
    if (!Number.isInteger(q.answer) || !q.choices[q.answer]) throw new Error(`battle-bank.json: [${i}] has no valid answer`);
  }
  return questions;
}

export const BANK = loadBank();

// The island is shared data: the client builds from these coordinates and the server
// checks positions against them.
export const ARENA_PATH = path.resolve(here, '../../../client/dist/arena.json');

export function loadArena(file = ARENA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8')).island;
  if (!raw) throw new Error('arena.json: no island block');
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(raw[key])) throw new Error(`arena.json: island is missing a numeric ${key}`);
  }
  const spotById = new Map();
  for (const spot of raw.spots || []) {
    if (typeof spot.id !== 'string' || !spot.id) throw new Error('arena.json: a stand has no id');
    if (spotById.has(spot.id)) throw new Error(`arena.json: duplicate stand "${spot.id}"`);
    if (!['stand', 'pvp', 'dojo'].includes(spot.kind)) throw new Error(`arena.json: ${spot.id} has unknown kind "${spot.kind}"`);
    if (spot.kind === 'stand' && !CPU_IDS.includes(spot.difficulty)) throw new Error(`arena.json: stand ${spot.id} has unknown difficulty "${spot.difficulty}"`);
    spotById.set(spot.id, { ...spot, wx: raw.x + spot.x, wz: raw.z + spot.z });
  }
  for (const difficulty of CPU_IDS) {
    const stands = [...spotById.values()].filter((s) => s.kind === 'stand' && s.difficulty === difficulty);
    if (stands.length !== 1) throw new Error(`arena.json: expected one ${difficulty} stand, found ${stands.length}`);
  }
  const all = [...spotById.values()];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      if (Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) <= raw.radius * 2) {
        throw new Error(`arena.json: stands ${all[i].id} and ${all[j].id} overlap`);
      }
    }
  }
  return { ...raw, spotById };
}

export const ARENA = loadArena();

export function createBattle({ difficulty, level, move = null, random = Math.random }) {
  const cpu = CPU[difficulty];
  if (!cpu) throw new BattleError('unknown difficulty');
  const hp = maxHp(level);
  return {
    difficulty,
    random,
    move,                 // とくいわざ, learned from a fish at the dojo
    you: { hp, max: hp },
    foe: { hp: cpu.hp, max: cpu.hp },
    turn: 1,
    pending: null,        // a question the child has to answer for the move to land
    log: [],
    over: false,
    won: false,
  };
}

export function statePayload(battle) {
  return {
    difficulty: battle.difficulty,
    cpu: CPU[battle.difficulty].name,
    you: { ...battle.you },
    foe: { ...battle.foe },
    turn: battle.turn,
    over: battle.over,
    won: battle.won,
    // The four everyone has, plus the one this child taught themselves with a fish.
    waza: [...WAZA_IDS.map((id) => ({ ...WAZA[id] })), ...(battle.move ? [{ ...battle.move }] : [])],
  };
}

function drawQuestion(battle) {
  const source = BANK[Math.floor(battle.random() * BANK.length)];
  const order = [0, 1, 2];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const k = Math.floor(battle.random() * (i + 1));
    [order[i], order[k]] = [order[k], order[i]];
  }
  return {
    q: source.q,
    choices: order.map((o) => source.choices[o]),
    answer: order.indexOf(source.answer),
  };
}

// What the child sees of a pending question: never the answer.
export function wazaById(battle, id) {
  return WAZA[id] || (battle.move && battle.move.id === id ? battle.move : null);
}

export function quizPayload(battle) {
  const p = battle.pending;
  if (!p) return null;
  const waza = wazaById(battle, p.waza);
  return { waza: p.waza, q: p.question.q, choices: [...p.question.choices], seconds: waza.seconds };
}

// The child chooses a move. A plain attack resolves now; a strong one asks first.
export function chooseWaza(battle, wazaId) {
  if (battle.over) throw new BattleError('battle is over');
  if (battle.pending) throw new BattleError('answer first');
  const waza = WAZA[wazaId] || (battle.move && battle.move.id === wazaId ? battle.move : null);
  if (!waza) throw new BattleError('unknown waza');
  if (!waza.quiz) return resolve(battle, waza, true);
  battle.pending = { waza: waza.id, question: drawQuestion(battle), askedAt: Date.now() };
  return { asked: true };
}

// The answer to a pending question, or the timer running out.
export function answerQuiz(battle, choice, { timedOut = false } = {}) {
  const p = battle.pending;
  if (!p) throw new BattleError('nothing was asked');
  const waza = wazaById(battle, p.waza);
  const late = Date.now() - p.askedAt > (waza.seconds + 3) * 1000;   // 3s of slack for the wire
  const correct = !timedOut && !late && Number.isInteger(choice) && choice === p.question.answer;
  const outcome = { answer: p.question.answer, picked: Number.isInteger(choice) ? choice : -1, correct, timedOut: timedOut || late };
  battle.pending = null;
  return { ...resolve(battle, waza, correct), quiz: outcome };
}

function resolve(battle, waza, landed) {
  const events = [];
  if (!landed) {
    events.push({ who: 'you', waza: waza.id, fizzled: true });
  } else if (waza.heal) {
    const before = battle.you.hp;
    battle.you.hp = Math.min(battle.you.max, battle.you.hp + waza.heal);
    events.push({ who: 'you', waza: waza.id, heal: battle.you.hp - before });
  } else {
    battle.foe.hp = Math.max(0, battle.foe.hp - waza.damage);
    events.push({ who: 'you', waza: waza.id, damage: waza.damage });
  }
  if (battle.foe.hp <= 0) return finish(battle, true, events);

  // The opponent's turn: it lands as often as its difficulty says.
  const cpu = CPU[battle.difficulty];
  if (battle.random() < cpu.accuracy) {
    const damage = CPU_DAMAGE.min + Math.floor(battle.random() * (CPU_DAMAGE.max - CPU_DAMAGE.min + 1));
    battle.you.hp = Math.max(0, battle.you.hp - damage);
    events.push({ who: 'foe', damage });
  } else {
    events.push({ who: 'foe', missed: true });
  }
  if (battle.you.hp <= 0) return finish(battle, false, events);

  battle.turn += 1;
  if (battle.turn > MAX_TURNS) return finish(battle, battle.foe.hp <= battle.you.hp, events);
  return { events, over: false };
}

function finish(battle, won, events) {
  battle.over = true;
  battle.won = won;
  return { events, over: true, won, reward: won ? REWARD.win : REWARD.lose };
}
