// ミニゲーム島 — ふたつの家、ふたつのゲーム。
//
// The whole island is two houses with a game's name over each door. Walk into the one you
// want; neither is a shop and neither asks the room for anything, because what is behind
// both doors is a separate game running in a frame (see arcade.js). That is also why
// there is no server module reading minigames.json: nothing here is the room's business.
//
// Terrain, dock, collision, labels, minimap and beacon come from the shared island kit, as
// they do for every other walkable island. Only the buildings are written here.
import { createIsland, NEAR_DISTANCE } from './island-kit.js';

export { NEAR_DISTANCE };

let promise = null;
export function loadMiniData() {
  if (!promise) {
    promise = fetch('minigames.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`minigames.json: ${r.status}`); return r.json(); })
      .catch((err) => { console.warn('[mini] minigames.json failed to load', err); return { island: null }; });
  }
  return promise;
}

export function createMiniIsland({ scene }) {
  const island = createIsland({
    scene,
    seed: 71828,
    build({ island: data, B, D, sprite, house, path, resident, door, scatter, bench, flowers, bunting, obstacles }) {
      const yard = data.courtyard;
      // A little arcade forecourt: a paved square with a low stage, and bunting over it,
      // so two houses read as a place rather than as two houses.
      B(yard.x, 0.12, yard.z, 17, 0.15, 12, 0xe0d6bd);
      B(yard.x, 0.2, yard.z, 12, 0.14, 8, 0xeee5cc);
      B(yard.x, 0.3, yard.z, 5.2, 0.16, 5.2, 0xd9cfe6);
      bunting(yard.x - 8, yard.z - 4.5, yard.x + 8, yard.z - 4.5, 3.6);
      bunting(yard.x - 8, yard.z + 5.5, yard.x + 8, yard.z + 5.5, 3.6);
      sprite({ en: data.en, ja: data.name }, yard.x, 4.6, yard.z, { width: 11, size: 30 });

      // The landmark: a cabinet the size of a shed, with a lit screen facing the landing.
      // An island of games should look like one from the water.
      const cx = yard.x;
      const cz = yard.z + 7.5;
      D(cx, 0.5, cz, 7.0, 0.8, 4.0, 0xbcb49a);
      D(cx, 3.0, cz, 5.6, 4.6, 3.0, 0x2b2740);
      D(cx, 3.0, cz, 5.9, 4.2, 2.6, 0x37324f);
      D(cx, 3.5, cz + 1.5, 4.2, 2.6, 0.25, 0x9fd6e8, 0.75);      // the screen
      // Four puyo-ish blobs and a melon on it, so it is obvious what is inside.
      const pips = [0xe0566a, 0x5ab86f, 0xf0c84a, 0x6f8fe0];
      pips.forEach((c, i) => D(cx - 1.4 + i * 0.95, 3.9, cz + 1.65, 0.6, 0.6, 0.12, c, 0.5));
      D(cx, 2.8, cz + 1.65, 1.1, 1.1, 0.12, 0x4f9a55, 0.5);
      D(cx, 2.8, cz + 1.7, 0.5, 1.1, 0.1, 0x2f6a3a, 0.5);
      D(cx, 1.5, cz + 1.5, 4.6, 0.7, 0.4, 0x4a4560);              // the control panel
      for (let i = 0; i < 5; i += 1) D(cx - 1.6 + i * 0.8, 1.75, cz + 1.6, 0.34, 0.34, 0.3, pips[i % 4], 0.4);
      D(cx, 5.6, cz, 6.2, 0.5, 3.4, 0x4a4560);
      D(cx, 6.0, cz, 3.4, 0.4, 1.4, 0xf0c84a, 0.8);
      obstacles.push({ x: cx, z: cz, w: 3.2, d: 2.2 });

      bench(yard.x - 5.5, yard.z + 3.5, 0);
      bench(yard.x + 5.5, yard.z + 3.5, 0);
      flowers(yard.x - 9, yard.z + 12, 0xe89bb0);
      flowers(yard.x + 9, yard.z + 12, 0xdfe4ef);

      // The two houses. Each is painted its game's colour and wears its game's name, and
      // the name over the door is the only menu on this island.
      for (const def of data.spots) {
        house(def.x, def.z - 4.6, 9, 6.4, Number(def.color), 0x6f5b3e, { en: `${def.tone} ${def.en || def.name}`, ja: `${def.tone} ${def.name}` });
        door(def);
        path(def.path.x, def.path.z, def.x, def.z);
        B(def.x, 0.18, def.z, 6, 0.16, 6, 0xe6dcc0);
        // A lit window either side of the door, and a short awning over each. `house()`
        // puts the front wall at def.z - 1.4, so anything meant to be SEEN goes at a
        // larger z than that; smaller is inside the house.
        for (const side of [-1, 1]) {
          const wx = def.x + side * 2.9;
          D(wx, 1.95, def.z - 1.44, 1.9, 1.8, 0.18, 0x6f5b3e);
          D(wx, 1.95, def.z - 1.32, 1.6, 1.5, 0.14, 0xf3ecd8, 0.5);
          D(wx, 1.95, def.z - 1.26, 0.14, 1.5, 0.08, 0x6f5b3e);
          for (let i = 0; i < 4; i += 1) {
            D(wx - 0.9 + i * 0.6, 3.05, def.z - 1.05, 0.6, 0.26, 0.9, i % 2 ? Number(def.color) : 0xf7f1e1);
          }
        }
        resident(def);
      }
      scatter(data, 100);
    },
  });

  return Object.assign(island, {
    ready: loadMiniData().then((d) => { island.receive(d.island); return d; }),
  });
}
