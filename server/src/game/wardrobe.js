// きせかえ、部屋の側 — what an outfit costs and whether a child may wear it.
//
// The shop is a shop, so the same rule as every other shop in this game applies: the page
// asks, the room decides. A page can put a crown on its own screen all it likes; what it
// cannot do is own one. Buying checks the price against the wallet and the level against
// the record, and both numbers come from the same wardrobe.json the page draws from, so
// there is no second price list to disagree with.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableFrom, sanitizeWorn } from '../../../client/dist/wardrobe-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(here, '../../../client/dist');

export const WARDROBE = tableFrom(JSON.parse(readFileSync(path.join(CLIENT, 'wardrobe.json'), 'utf8')));
export { sanitizeWorn };

export const sanitizeOwned = (raw) => [...new Set((Array.isArray(raw) ? raw : [])
  .map((id) => String(id))
  .filter((id) => WARDROBE.byId.has(id)))];

// What the page is told: everything about every item, plus what this child owns, wears and
// can afford. None of it is secret — the point of a shop is to want something you cannot
// buy yet — so the whole table goes, with the reason each locked item is locked.
export function shopPayload({ owned, worn, coins, level }) {
  const has = new Set(owned);
  const on = new Set(worn);
  return {
    slots: WARDROBE.slots,
    coins,
    level,
    items: WARDROBE.items.map((it) => ({
      ...it,
      owned: has.has(it.id),
      worn: on.has(it.id),
      // Two different "no"s, and a child should be able to tell them apart: one is a
      // matter of saving up, the other of playing more.
      locked: level < it.level,
      afford: coins >= it.price,
    })),
  };
}

export class WardrobeError extends Error {}

// Buying. Returns what to charge; the caller moves the coins, so there is exactly one
// place in the server that touches a wallet.
export function priceOf({ id, owned, coins, level }) {
  const item = WARDROBE.byId.get(String(id));
  if (!item) throw new WardrobeError('no such item');
  if (owned.includes(item.id)) throw new WardrobeError('already owned');
  if (level < item.level) throw new WardrobeError('level too low');
  if (coins < item.price) throw new WardrobeError('not enough coins');
  return item;
}

// Wearing. Only what is owned, only one thing per slot, and taking something off is just
// wearing nothing in that slot.
export function wear({ owned, worn, id, off = false }) {
  const item = WARDROBE.byId.get(String(id));
  if (!item) throw new WardrobeError('no such item');
  if (!off && !owned.includes(item.id)) throw new WardrobeError('not yours');
  const kept = worn.filter((w) => WARDROBE.byId.get(w)?.slot !== item.slot);
  return off ? kept : [...kept, item.id];
}
