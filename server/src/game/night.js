// 夜のおばけ — the night, and what comes out in it.
//
// Ported from Roblox's NightGhostManager, which was itself a review-safe replacement for
// a zombie: no blood, no death, no fear. An おばけ drifts in the dark carrying an English
// word, one in four wears a pumpkin, and touching one does nothing at all. Swing the
// wand at it and it pops with a small handful of coins and its word.
//
// The clock is shared with the browser (`world-clock.js`), so a child and their
// classmates are in the same part of the day. Everything that pays is decided here: the
// server holds which ghosts are out, checks that the child is standing next to the one
// they swung at, and caps what a night can pay.
import { readFileSync } from 'node:fs';
import { dayIndex } from './daily.js';

export class GhostError extends Error {}

export const DATA_PATH = new URL('../../../client/dist/night.json', import.meta.url);

export function loadNight(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  for (const key of ['reach', 'respawnSec', 'coins', 'dailyCap']) {
    if (!Number.isFinite(raw[key]) || raw[key] <= 0) throw new Error(`night.json: ${key} must be a positive number`);
  }
  if (!raw.space) throw new Error('night.json: no space');
  const ghosts = new Map();
  for (const g of raw.ghosts || []) {
    if (!g.id || ghosts.has(g.id)) throw new Error(`night.json: duplicate or missing id "${g.id}"`);
    if (!g.word || !g.ja) throw new Error(`night.json: ${g.id} has no word`);
    if (!Number.isFinite(g.x) || !Number.isFinite(g.z)) throw new Error(`night.json: ${g.id} has no place`);
    // A child must be able to tell two ghosts apart while swinging at one of them.
    for (const other of ghosts.values()) {
      if (Math.hypot(g.x - other.x, g.z - other.z) <= raw.reach * 2) {
        throw new Error(`night.json: ${g.id} and ${other.id} are within one swing of each other`);
      }
    }
    ghosts.set(g.id, { ...g, pumpkin: !!g.pumpkin });
  }
  if (ghosts.size < 4) throw new Error('night.json: a night needs more than a few ghosts');
  return { ...raw, ghosts, ids: [...ghosts.keys()] };
}

export const NIGHT = loadNight();
export const REACH = NIGHT.reach;
export const COINS = NIGHT.coins;
export const DAILY_CAP = NIGHT.dailyCap;
export const RESPAWN_MS = NIGHT.respawnSec * 1000;

// What the client is told about a ghost. The word is not a secret — the point is to read
// it — but the coins are never the client's to decide.
export const ghostPayload = (ghost) => ({ id: ghost.id, word: ghost.word, ja: ghost.ja, pumpkin: ghost.pumpkin, x: ghost.x, z: ghost.z });

// A child's own night: which day it is counting from, and what has been paid.
export function blankCaps(now = Date.now()) {
  return { day: dayIndex(now), battle: 0, ghost: 0 };
}

export function sanitizeCaps(raw, now = Date.now()) {
  const caps = blankCaps(now);
  if (!raw || typeof raw !== 'object') return caps;
  const day = Number(raw.day);
  // Yesterday's spending is not today's, so a stale row simply starts the day fresh.
  if (!Number.isFinite(day) || Math.floor(day) !== caps.day) return caps;
  for (const key of ['battle', 'ghost']) {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n > 0) caps[key] = Math.min(1e7, Math.floor(n));
  }
  return caps;
}

// What is left of a cap today, rolling the day over on its own.
export function roomLeft(caps, key, cap, now = Date.now()) {
  const today = dayIndex(now);
  if (caps.day !== today) { caps.day = today; caps.battle = 0; caps.ghost = 0; }
  return Math.max(0, cap - (caps[key] || 0));
}
