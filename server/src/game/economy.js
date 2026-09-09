// Authoritative wallet rules. Prices come from the shared client data files.
import { FISH_BY_ID, ITEM_BY_ID } from '../../../client/dist/fishing-data.js';
import { WANDS, WAND_BY_ID } from '../../../client/dist/magic-data.js';

export class EconomyError extends Error {}

export const MAX_COINS = 1e9;

export function blankWallet() {
  return { coins: 0, inventory: {}, owned: [], wands: [WANDS[0].id], wand: WANDS[0].id, catches: 0 };
}

export function sanitizeWallet(raw) {
  const w = blankWallet();
  if (!raw || typeof raw !== 'object') return w;
  if (Number.isSafeInteger(raw.coins) && raw.coins >= 0 && raw.coins <= MAX_COINS) w.coins = raw.coins;
  for (const [id, n] of Object.entries(raw.inventory || {})) {
    if (FISH_BY_ID[id] && Number.isSafeInteger(n) && n > 0 && n <= 100000) w.inventory[id] = n;
  }
  w.owned = [...new Set(Array.isArray(raw.owned) ? raw.owned : [])].filter((id) => ITEM_BY_ID[id]);
  w.wands = [...new Set([WANDS[0].id, ...(Array.isArray(raw.wands) ? raw.wands : [])])].filter((id) => WAND_BY_ID[id]);
  w.wand = w.wands.includes(raw.wand) ? raw.wand : WANDS[0].id;
  w.catches = Number.isSafeInteger(raw.catches) && raw.catches >= 0 ? raw.catches : 0;
  return w;
}

// Applies one operation in place and returns a coin-log entry.
export function applyOp(wallet, op) {
  const { type } = op || {};
  const before = wallet.coins;
  switch (type) {
    case 'catch': {
      const fish = FISH_BY_ID[op.id];
      if (!fish) throw new EconomyError('unknown fish');
      wallet.inventory[fish.id] = Math.min(100000, (wallet.inventory[fish.id] || 0) + 1);
      wallet.catches += 1;
      return { op: 'catch', item: fish.id, quantity: 1, delta: 0, balance: wallet.coins };
    }
    case 'sell': {
      const fish = FISH_BY_ID[op.id];
      const quantity = op.quantity ?? 1;
      const have = wallet.inventory[op.id] || 0;
      if (!fish || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > have) throw new EconomyError('nothing to sell');
      wallet.inventory[op.id] = have - quantity;
      if (!wallet.inventory[op.id]) delete wallet.inventory[op.id];
      wallet.coins = Math.min(MAX_COINS, wallet.coins + fish.price * quantity);
      return { op: 'sell', item: fish.id, quantity, delta: wallet.coins - before, balance: wallet.coins };
    }
    case 'sellAll': {
      let total = 0;
      let count = 0;
      for (const [id, n] of Object.entries(wallet.inventory)) {
        total += FISH_BY_ID[id].price * n;
        count += n;
      }
      if (!total) throw new EconomyError('nothing to sell');
      wallet.inventory = {};
      wallet.coins = Math.min(MAX_COINS, wallet.coins + total);
      return { op: 'sellAll', item: '*', quantity: count, delta: wallet.coins - before, balance: wallet.coins };
    }
    case 'buy': {
      const item = ITEM_BY_ID[op.id];
      if (!item) throw new EconomyError('unknown item');
      if (wallet.owned.includes(item.id)) throw new EconomyError('already owned');
      if (wallet.coins < item.price) throw new EconomyError('not enough coins');
      wallet.coins -= item.price;
      wallet.owned.push(item.id);
      return { op: 'buy', item: item.id, quantity: 1, delta: -item.price, balance: wallet.coins };
    }
    case 'buyWand': {
      const wand = WAND_BY_ID[op.id];
      if (!wand) throw new EconomyError('unknown wand');
      if (wallet.wands.includes(wand.id)) throw new EconomyError('already owned');
      if (wallet.coins < wand.price) throw new EconomyError('not enough coins');
      wallet.coins -= wand.price;
      wallet.wands.push(wand.id);
      wallet.wand = wand.id;
      return { op: 'buyWand', item: wand.id, quantity: 1, delta: -wand.price, balance: wallet.coins };
    }
    default:
      throw new EconomyError('unknown operation');
  }
}
