// ペット島 — one pet, cared for over real days.
//
// Ported from Roblox's PetService. The part worth keeping exactly is that hunger and
// mood fall with wall-clock time, not with play time: a pet left alone for a day is
// hungry when a child comes back, whether or not anyone was online. That is arithmetic
// on a timestamp, so it costs nothing and cannot drift.
//
// Everything a pet does is decided here. The client asks to feed; the server checks the
// coins, checks the pet is not already full, and says what happened.
import { readFileSync } from 'node:fs';

export const EGG_COST = 300;      // Roblox: EGG_COST
export const FEED_COST = 20;      // Roblox: FEED_COST
export const PAT_COOLDOWN_MS = 60 * 1000;
export const FEED_HUNGER = 40;
export const PAT_HAPPY = 10;
export const FEED_XP = 5;
export const PAT_XP = 2;
export const FULL_AT = 98;        // too full to eat
export const DAY_MS = 86400 * 1000;

export class PetError extends Error {}

// The island is shared data, like every other: the client builds from these coordinates
// and the server checks positions against them.
export const ISLAND_PATH = new URL('../../../client/dist/pets.json', import.meta.url);

export function loadIsland(file = ISLAND_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8')).island;
  if (!raw) throw new Error('pets.json: no island block');
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(raw[key])) throw new Error(`pets.json: island is missing a numeric ${key}`);
  }
  const spotById = new Map();
  for (const spot of raw.spots || []) {
    if (!['nest', 'kitchen', 'meadow'].includes(spot.kind)) throw new Error(`pets.json: ${spot.id} has unknown kind "${spot.kind}"`);
    if (spotById.has(spot.kind)) throw new Error(`pets.json: two ${spot.kind} buildings`);
    spotById.set(spot.kind, { ...spot, wx: raw.x + spot.x, wz: raw.z + spot.z });
  }
  for (const kind of ['nest', 'kitchen', 'meadow']) {
    if (!spotById.has(kind)) throw new Error(`pets.json: no ${kind}`);
  }
  const all = [...spotById.values()];
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      if (Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) <= raw.radius * 2) {
        throw new Error(`pets.json: ${all[i].id} and ${all[j].id} overlap`);
      }
    }
  }
  return { ...raw, spotById };
}

export const SPECIES = [
  { id: 'dog', emoji: '🐶', en: 'puppy', ja: 'こいぬ' },
  { id: 'cat', emoji: '🐱', en: 'kitten', ja: 'こねこ' },
  { id: 'rabbit', emoji: '🐰', en: 'bunny', ja: 'うさぎ' },
  { id: 'frog', emoji: '🐸', en: 'frog', ja: 'かえる' },
  { id: 'panda', emoji: '🐼', en: 'panda', ja: 'パンダ' },
  { id: 'fox', emoji: '🦊', en: 'fox', ja: 'きつね' },
];
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
export const NAMES = ['Max', 'Luna', 'Coco', 'Momo', 'Leo', 'Bell', 'Kiki', 'Choco'];

export const levelOf = (xp) => Math.floor(Math.max(0, xp || 0) / 25) + 1;

export function hatch(random = Math.random, now = Date.now()) {
  const species = SPECIES[Math.floor(random() * SPECIES.length)];
  return {
    species: species.id,
    name: NAMES[Math.floor(random() * NAMES.length)],
    xp: 0,
    hunger: 100,
    happy: 100,
    seen: now,
    born: now,
    patAt: 0,
  };
}

export function sanitizePet(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const species = SPECIES_BY_ID[raw.species];
  if (!species) return null;
  const num = (v, max) => Math.max(0, Math.min(max, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0));
  return {
    species: species.id,
    name: NAMES.includes(raw.name) ? raw.name : NAMES[0],
    xp: num(raw.xp, 1e6),
    hunger: num(raw.hunger, 100),
    happy: num(raw.happy, 100),
    seen: num(raw.seen, Date.now() + DAY_MS) || Date.now(),
    born: num(raw.born, Date.now() + DAY_MS) || Date.now(),
    patAt: num(raw.patAt, Date.now() + DAY_MS),
  };
}

// Hunger and mood fall by a full 100 over a day. Applied in place, from `seen`, so time
// spent offline counts exactly as much as time spent playing.
export function decay(pet, now = Date.now()) {
  if (!pet) return pet;
  const elapsed = Math.max(0, now - (pet.seen || now));
  const lost = (elapsed / DAY_MS) * 100;
  pet.hunger = Math.max(0, pet.hunger - lost);
  pet.happy = Math.max(0, pet.happy - lost);
  pet.seen = now;
  return pet;
}

export function petPayload(pet, now = Date.now()) {
  if (!pet) return null;
  decay(pet, now);
  const species = SPECIES_BY_ID[pet.species];
  return {
    species: pet.species,
    emoji: species.emoji,
    en: species.en,
    ja: species.ja,
    name: pet.name,
    xp: pet.xp,
    level: levelOf(pet.xp),
    hunger: Math.round(pet.hunger),
    happy: Math.round(pet.happy),
    canPat: now - (pet.patAt || 0) >= PAT_COOLDOWN_MS,
    patIn: Math.max(0, PAT_COOLDOWN_MS - (now - (pet.patAt || 0))),
    days: Math.floor((now - (pet.born || now)) / DAY_MS),
  };
}

// Returns { pet, cost, xp, message }. Throws PetError when the action is not allowed,
// so the caller never has to guess whether to charge for it.
export function act(pet, action, { coins, now = Date.now() } = {}) {
  if (!pet) throw new PetError('no pet');
  decay(pet, now);
  if (action === 'feed') {
    if (coins < FEED_COST) throw new PetError('not enough coins');
    if (pet.hunger >= FULL_AT) throw new PetError('already full');
    pet.hunger = Math.min(100, pet.hunger + FEED_HUNGER);
    pet.xp += FEED_XP;
    return { cost: FEED_COST, xp: FEED_XP, message: `${pet.name} は おなかが いっぱいに なった！` };
  }
  if (action === 'pat') {
    if (now - (pet.patAt || 0) < PAT_COOLDOWN_MS) throw new PetError('too soon');
    pet.patAt = now;
    pet.happy = Math.min(100, pet.happy + PAT_HAPPY);
    pet.xp += PAT_XP;
    return { cost: 0, xp: PAT_XP, message: `${pet.name} は うれしそう！` };
  }
  throw new PetError('unknown action');
}

export const PET_ISLAND = loadIsland();
