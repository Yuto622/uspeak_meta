// おはなし島 — the island that is a call.
//
// Every other room in this project is a building: you walk in, and the people inside it
// are the people you can hear. This island is the exception on purpose. The whole of it
// is one room, so a child who lands here is already in the call with everyone else on the
// grass — nothing to press, nothing for a teacher to open. The four booths on it are
// ordinary rooms again, for when two children want to talk without the island listening.
//
// The coordinates are shared data, like every other island: the client builds from them
// and the server checks positions against the same numbers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_PATH = path.resolve(here, '../../../client/dist/talk.json');

export function loadTalk(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8')).island;
  if (!raw) throw new Error('talk.json: no island block');
  for (const key of ['id', 'name', 'en']) {
    if (typeof raw[key] !== 'string' || !raw[key]) throw new Error(`talk.json: island is missing ${key}`);
  }
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(raw[key])) throw new Error(`talk.json: island is missing a numeric ${key}`);
  }
  const plaza = raw.plaza || {};
  if (!(plaza.max >= 2)) throw new Error('talk.json: the plaza holds nobody');
  const spotById = new Map();
  for (const spot of raw.spots || []) {
    if (typeof spot.id !== 'string' || !spot.id) throw new Error('talk.json: a booth has no id');
    if (spotById.has(spot.id)) throw new Error(`talk.json: duplicate booth "${spot.id}"`);
    if (!Number.isFinite(spot.x) || !Number.isFinite(spot.z)) throw new Error(`talk.json: booth ${spot.id} has no coordinates`);
    spotById.set(spot.id, { ...spot, wx: raw.x + spot.x, wz: raw.z + spot.z });
  }
  if (spotById.size < 2) throw new Error('talk.json: an island of one booth is not worth sailing to');
  const booths = [...spotById.values()];
  for (let i = 0; i < booths.length; i += 1) {
    for (let j = i + 1; j < booths.length; j += 1) {
      if (Math.hypot(booths[i].x - booths[j].x, booths[i].z - booths[j].z) <= raw.radius * 2) {
        throw new Error(`talk.json: booths ${booths[i].id} and ${booths[j].id} overlap`);
      }
    }
  }
  return { ...raw, plaza: { ...plaza }, spotById };
}

export const TALK = loadTalk();

// Is this a place on おはなし島 — the grass itself, or one of its booths?
export const isTalkSpace = (space) => space === TALK.id || String(space || '').startsWith(`in:${TALK.id}:`);
