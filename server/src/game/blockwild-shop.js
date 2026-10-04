// BLOCKWILD の中の店 — U-Speak コインで 武器・道具・よろい・食べ物・たいまつ を買う。
//
// 値段と品は client/dist/blockwild-gear.json（ページも同じものを読んで棚を描く）。
// ブロックは まちづくり島のブロック屋の棚（town.js の BLOCKS）で、BLOCKWILD の中からも
// 同じ棚から買える。買った物は BLOCKWILD の持ち物に渡される（ページが `BLOCKWILD.give`
// を呼ぶ）。持ち物は BLOCKWILD 自身のセーブに入り、サーバーは数えない — 守るのはコインだけ。
import { readFileSync } from 'node:fs';

const DATA_PATH = new URL('../../../client/dist/blockwild-gear.json', import.meta.url);
const need = (ok, msg) => { if (!ok) throw new Error(`blockwild-gear.json: ${msg}`); };

export function loadGear(file = DATA_PATH) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const gear = new Map();
  for (const g of raw.gear || []) {
    need(g.id && g.ja && g.en && g.emoji && Number.isInteger(g.price) && g.price >= 0 && g.kind, `item ${g.id}`);
    const items = Array.isArray(g.items) ? g.items : [g.item];
    need(items.length && items.every((i) => Number.isInteger(i) && i > 0), `${g.id} items`);
    need(!gear.has(g.id), `duplicate ${g.id}`);
    gear.set(g.id, { id: g.id, items, n: Math.max(1, Math.floor(Number(g.n) || 1)), emoji: g.emoji, ja: g.ja, en: g.en, price: g.price, kind: g.kind });
  }
  need(gear.size >= 8, 'at least eight things to buy');
  return gear;
}

export const GEAR = loadGear();
export const gearPayload = (g) => ({ id: g.id, items: g.items, n: g.n, emoji: g.emoji, ja: g.ja, en: g.en, price: g.price, kind: g.kind });
