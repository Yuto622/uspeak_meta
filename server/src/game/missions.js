// Mission definitions for the errand quest. The client renders from this same file,
// so the wording a child sees and the wording the server judges against never drift.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MISSIONS_PATH = path.resolve(here, '../../../client/dist/missions.json');

const GRADES = ['5', '4', '3', '準2', '2'];
const SPOT_KINDS = ['plaza', 'shop'];

// The island is the only place an errand can happen. Spot coordinates are local to the
// island; world coordinates (what a client actually reports in a `move` message) are
// derived once here so the room never has to remember to add the offset.
function loadIsland(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('missions.json: no island block');
  for (const key of ['id', 'name', 'en']) {
    if (typeof raw[key] !== 'string' || !raw[key]) throw new Error(`missions.json: island is missing ${key}`);
  }
  for (const key of ['x', 'z', 'radius']) {
    if (!Number.isFinite(raw[key])) throw new Error(`missions.json: island is missing a numeric ${key}`);
  }
  if (raw.radius <= 0 || raw.radius > 20) throw new Error('missions.json: island radius must be between 0 and 20');
  const spotById = new Map();
  for (const s of raw.spots || []) {
    if (typeof s.id !== 'string' || !s.id) throw new Error('missions.json: a spot has no id');
    if (spotById.has(s.id)) throw new Error(`missions.json: duplicate spot "${s.id}"`);
    if (!SPOT_KINDS.includes(s.kind)) throw new Error(`missions.json: spot ${s.id} has unknown kind "${s.kind}"`);
    for (const key of ['name', 'character', 'ja']) {
      if (typeof s[key] !== 'string' || !s[key]) throw new Error(`missions.json: spot ${s.id} is missing ${key}`);
    }
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) throw new Error(`missions.json: spot ${s.id} has no coordinates`);
    spotById.set(s.id, { ...s, wx: raw.x + s.x, wz: raw.z + s.z });
  }
  if (!spotById.size) throw new Error('missions.json: the island has no spots');
  // Spots must be far enough apart that standing at one is never standing at another,
  // otherwise the position gate would let a child skip a leg of the walk.
  const spots = [...spotById.values()];
  for (let i = 0; i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      const gap = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
      if (gap <= raw.radius * 2) throw new Error(`missions.json: spots ${spots[i].id} and ${spots[j].id} overlap`);
    }
  }
  return { ...raw, spotById };
}


export function loadMissions(file = MISSIONS_PATH) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const island = loadIsland(data.island);
  const byId = new Map();
  for (const m of data.missions || []) {
    if (typeof m.id !== 'string' || !m.id) throw new Error('missions.json: a mission has no id');
    if (byId.has(m.id)) throw new Error(`missions.json: duplicate id "${m.id}"`);
    if (!GRADES.includes(m.grade)) throw new Error(`missions.json: ${m.id} has unknown grade "${m.grade}"`);
    for (const key of ['title', 'character', 'place', 'situation', 'opening', 'item', 'request', 'requestJa', 'thanks']) {
      if (typeof m[key] !== 'string' || !m[key]) throw new Error(`missions.json: ${m.id} is missing ${key}`);
    }
    const spot = island.spotById.get(m.spot);
    const from = island.spotById.get(m.from);
    if (!spot) throw new Error(`missions.json: ${m.id} names unknown spot "${m.spot}"`);
    if (!from) throw new Error(`missions.json: ${m.id} names unknown pickup spot "${m.from}"`);
    if (spot.id === from.id) throw new Error(`missions.json: ${m.id} would be finished without walking anywhere`);
    // The child must talk to whoever actually stands at that spot.
    if (spot.character !== m.character) throw new Error(`missions.json: ${m.id} talks to ${m.character} but ${spot.id} is ${spot.character}`);
    if (spot.name !== m.place) throw new Error(`missions.json: ${m.id} says "${m.place}" but ${spot.id} is "${spot.name}"`);
    if (!Array.isArray(m.goals) || !m.goals.length) throw new Error(`missions.json: ${m.id} has no goals`);
    const goalIds = new Set();
    for (const g of m.goals) {
      if (typeof g.id !== 'string' || !g.id) throw new Error(`missions.json: ${m.id} has a goal with no id`);
      if (goalIds.has(g.id)) throw new Error(`missions.json: ${m.id} repeats goal id "${g.id}"`);
      goalIds.add(g.id);
      for (const key of ['ja', 'en']) if (typeof g[key] !== 'string' || !g[key]) throw new Error(`missions.json: ${m.id}/${g.id} is missing ${key}`);
    }
    if (!Number.isInteger(m.reward) || m.reward < 0 || m.reward > 1000) throw new Error(`missions.json: ${m.id} has an invalid reward`);
    byId.set(m.id, m);
  }
  if (!byId.size) throw new Error('missions.json: no missions defined');
  const turnLimit = Number.isInteger(data.turnLimit) && data.turnLimit >= 2 && data.turnLimit <= 40 ? data.turnLimit : 12;
  return { byId, turnLimit, grades: GRADES, island };
}

export const MISSIONS = loadMissions();
