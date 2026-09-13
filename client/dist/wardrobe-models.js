// きせかえの見た目 — one small model per wardrobe item.
//
// Built from boxes, like the avatar they hang on. That is not laziness: the whole world is
// boxes, a glTF hat would look like it came from a different game, and a class of thirty
// opening the page should not each download sixteen models to try a cap on.
//
// Every model is built at the origin facing +z, and the anchor it is added to (see
// avatars.js) puts it where it belongs. So nothing here knows how tall a head is.
import * as THREE from './three.module.js';

const geometry = new THREE.BoxGeometry();
const mats = new Map();
const mat = (c, opts = {}) => {
  const key = `${c}:${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, ...opts }));
  return mats.get(key);
};

function box(parent, x, y, z, w, h, d, colour, opts) {
  const m = new THREE.Mesh(geometry, mat(colour, opts));
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const KINDS = {
  // ---- hats. The head is about 0.75 wide and its top is the anchor. ----
  cap(g, c) {
    box(g, 0, 0.09, 0, 0.8, 0.18, 0.72, c);
    box(g, 0, 0.04, 0.42, 0.62, 0.08, 0.34, c);          // the peak
  },
  brim(g, c) {
    box(g, 0, 0.12, 0, 0.68, 0.24, 0.62, c);
    box(g, 0, 0.03, 0, 1.18, 0.06, 1.12, c);             // a wide brim, for the sun
    box(g, 0, 0.1, 0.33, 0.7, 0.09, 0.06, 0xb8834a);     // the band
  },
  ears(g, c) {
    box(g, 0, 0.06, 0, 0.78, 0.12, 0.7, c);
    for (const side of [-1, 1]) {
      box(g, side * 0.24, 0.22, 0, 0.2, 0.24, 0.14, c);
      box(g, side * 0.24, 0.2, 0.03, 0.11, 0.14, 0.1, 0xe9a2ae);
    }
  },
  crown(g, c) {
    box(g, 0, 0.1, 0, 0.72, 0.2, 0.66, c, { metalness: 0.55, roughness: 0.28 });
    // Five points, so it reads as a crown from behind as well as in front.
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      box(g, Math.sin(a) * 0.28, 0.27, Math.cos(a) * 0.26, 0.13, 0.2, 0.13, c, { metalness: 0.55, roughness: 0.28 });
    }
    box(g, 0, 0.4, 0, 0.1, 0.1, 0.1, 0xe0526a, { metalness: 0.3, roughness: 0.2 });
  },

  // ---- face. The anchor sits just in front of the eyes. ----
  round(g, c) {
    box(g, 0, 0, 0, 0.52, 0.045, 0.03, c);               // the bridge
    for (const side of [-1, 1]) {
      box(g, side * 0.17, 0, 0.01, 0.2, 0.2, 0.02, c);
      box(g, side * 0.17, 0, 0.02, 0.15, 0.15, 0.01, 0xbfe4ef, { transparent: true, opacity: 0.55 });
    }
  },
  shades(g, c) {
    box(g, 0, 0, 0, 0.56, 0.05, 0.03, c);
    for (const side of [-1, 1]) box(g, side * 0.17, -0.02, 0.01, 0.24, 0.16, 0.03, c, { roughness: 0.25 });
  },
  snorkel(g, c) {
    box(g, 0, 0.02, 0, 0.5, 0.26, 0.05, c);
    box(g, 0, 0.02, 0.02, 0.42, 0.18, 0.03, 0xbfe4ef, { transparent: true, opacity: 0.5 });
    box(g, 0.3, 0.2, -0.02, 0.07, 0.5, 0.07, c);         // the tube, up past the ear
  },

  // ---- back. The anchor is between the shoulder blades. ----
  cape(g, c) {
    box(g, 0, -0.02, 0, 0.86, 0.1, 0.08, c);             // the collar
    box(g, 0, -0.5, -0.04, 0.8, 0.95, 0.06, c);          // …and the fall of it
    box(g, 0, -0.98, -0.05, 0.66, 0.12, 0.06, c);
  },
  wings(g, c) {
    for (const side of [-1, 1]) {
      box(g, side * 0.3, 0.05, -0.04, 0.44, 0.5, 0.05, c);
      box(g, side * 0.52, -0.16, -0.04, 0.3, 0.4, 0.05, c);
      box(g, side * 0.66, -0.36, -0.04, 0.2, 0.26, 0.05, c);
    }
  },
  pack(g, c) {
    box(g, 0, -0.28, -0.12, 0.6, 0.66, 0.28, c);
    box(g, 0, -0.12, -0.27, 0.44, 0.22, 0.06, 0x6b563f);
    for (const side of [-1, 1]) box(g, side * 0.26, 0.02, 0.02, 0.09, 0.5, 0.07, 0x6b563f);
  },

  // ---- chest. The anchor is on the front of the shirt. ----
  badge(g, c) {
    box(g, 0, 0, 0, 0.17, 0.17, 0.04, c, { metalness: 0.4, roughness: 0.3 });
    box(g, 0, 0, 0.02, 0.09, 0.09, 0.03, 0xfff6d8);
  },
  medal(g, c) {
    box(g, 0, 0.16, -0.01, 0.05, 0.34, 0.03, 0xc0453f);  // the ribbon
    box(g, 0, -0.06, 0, 0.22, 0.22, 0.05, c, { metalness: 0.65, roughness: 0.22 });
    box(g, 0, -0.06, 0.03, 0.11, 0.11, 0.02, 0xfff1c2);
  },
  scarf(g, c) {
    box(g, 0, 0.18, -0.02, 0.78, 0.16, 0.5, c);          // round the neck
    box(g, 0.2, -0.14, 0.06, 0.18, 0.5, 0.08, c);        // and one end hanging
  },
};

// One item's model. Returns null for an item this build does not know how to draw, so a
// data file that runs ahead of the code degrades to "not wearing it" rather than a crash.
export function itemModel(item) {
  const make = KINDS[item?.kind];
  if (!make) return null;
  const g = new THREE.Group();
  make(g, Number.parseInt(item.colour, 16) || 0xcccccc);
  g.userData.itemId = item.id;
  return g;
}

export const KNOWN_KINDS = Object.keys(KINDS);
