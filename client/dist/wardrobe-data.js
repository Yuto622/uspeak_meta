// きせかえのデータ — the one item table, loaded the same way on both sides.
//
// The page imports this for the shop; the server imports the same JSON to decide what a
// purchase costs and whether it is allowed. Nothing has a second copy of a price.
export function tableFrom(raw) {
  const slots = (raw?.slots || []).map((s) => ({ id: String(s.id), ja: String(s.ja || s.id), en: String(s.en || s.id), icon: String(s.icon || '') }));
  const slotIds = new Set(slots.map((s) => s.id));
  const items = [];
  const byId = new Map();
  for (const it of raw?.items || []) {
    const id = String(it?.id || '');
    if (!id || byId.has(id)) throw new Error(`wardrobe.json: duplicate or missing id "${id}"`);
    if (!slotIds.has(it.slot)) throw new Error(`wardrobe.json: ${id} has no such slot "${it.slot}"`);
    if (!Number.isFinite(it.price) || it.price <= 0) throw new Error(`wardrobe.json: ${id} has no price`);
    if (!Number.isFinite(it.level) || it.level < 1) throw new Error(`wardrobe.json: ${id} has no level`);
    if (!/^[0-9a-f]{6}$/i.test(String(it.colour || ''))) throw new Error(`wardrobe.json: ${id} has a bad colour`);
    const item = {
      id,
      slot: String(it.slot),
      ja: String(it.ja || id),
      en: String(it.en || id),
      price: Math.floor(it.price),
      level: Math.floor(it.level),
      colour: String(it.colour).toLowerCase(),
      kind: String(it.kind || ''),
    };
    items.push(item);
    byId.set(id, item);
  }
  if (!items.length) throw new Error('wardrobe.json: no items');
  return { slots, items, byId, ids: [...byId.keys()] };
}

// One id per slot at most, and only ids that exist. Used by the page before it draws and
// by the room before it saves, so a saved outfit is always a wearable one.
export function sanitizeWorn(table, raw) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(raw) ? raw : []) {
    const item = table.byId.get(String(id));
    if (!item || seen.has(item.slot)) continue;
    seen.add(item.slot);
    out.push(item.id);
  }
  return out;
}

export async function loadWardrobe(url = './wardrobe.json') {
  return tableFrom(await (await fetch(url)).json());
}
