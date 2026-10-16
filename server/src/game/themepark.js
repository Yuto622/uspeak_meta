// テーマパークの のりもの代 — のる たびに U-Speak コインを はらう。
//
// 値段は client/dist/park-rides.json（ページも 同じ ものを 読んで 値札を 出す）。
// ページが 送るのは「これに のりたい」だけ。はらえるか・いくらかは ここが 決める。
import { readFileSync } from 'node:fs';

const DATA_PATH = new URL('../../../client/dist/park-rides.json', import.meta.url);

export class ParkError extends Error {}

export function loadRides(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const rides = new Map();
  for (const r of raw.rides || []) {
    if (!r.id || !Number.isInteger(r.price) || r.price < 0) throw new Error(`park-rides.json: ride ${r.id}`);
    if (rides.has(r.id)) throw new Error(`park-rides.json: duplicate ${r.id}`);
    rides.set(r.id, { id: r.id, price: r.price });
  }
  for (const id of ['wheel', 'coaster', 'carousel']) if (!rides.has(id)) throw new Error(`park-rides.json: missing ${id}`);
  return rides;
}

export const RIDES = loadRides();

export function rideOf(id) {
  const r = typeof id === 'string' ? RIDES.get(id) : null;
  if (!r) throw new ParkError('unknown ride');
  return r;
}
