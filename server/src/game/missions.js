// Mission definitions for the errand quest. The client renders from this same file,
// so the wording a child sees and the wording the server judges against never drift.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MISSIONS_PATH = path.resolve(here, '../../../client/dist/missions.json');

const GRADES = ['5', '4', '3', '準2', '2'];

export function loadMissions(file = MISSIONS_PATH) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map();
  for (const m of data.missions || []) {
    if (typeof m.id !== 'string' || !m.id) throw new Error('missions.json: a mission has no id');
    if (byId.has(m.id)) throw new Error(`missions.json: duplicate id "${m.id}"`);
    if (!GRADES.includes(m.grade)) throw new Error(`missions.json: ${m.id} has unknown grade "${m.grade}"`);
    for (const key of ['title', 'character', 'place', 'situation', 'opening']) {
      if (typeof m[key] !== 'string' || !m[key]) throw new Error(`missions.json: ${m.id} is missing ${key}`);
    }
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
  return { byId, turnLimit, grades: GRADES };
}

export const MISSIONS = loadMissions();
