// きせかえの見た目 — one small model per wardrobe item.
//
// Built from boxes, like the avatar they hang on. That is not laziness: the whole world is
// boxes, a glTF hat would look like it came from a different game, and a class of thirty
// opening the page should not each download forty models to try a cap on.
//
// Every model is built at the origin facing +z, and the anchor it is added to (see
// avatars.js) puts it where it belongs. So nothing here knows how tall a head is:
//
//   head   the crown of the head, y=0 at the top    hats sit just above it
//   face   in front of the eyes                     glasses, masks, moustaches
//   back   between the shoulder blades              capes, packs, tails, wings
//   chest  the front of the shirt                   badges, ties, aprons
//
import * as THREE from './three.module.js';

const geometry = new THREE.BoxGeometry();
const mats = new Map();
const mat = (c, opts = {}) => {
  const key = `${c}:${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, ...opts }));
  return mats.get(key);
};

// Two tones of the same colour read as a made thing rather than a painted block, and one
// number is cheaper to keep in step than a second colour in the JSON.
const tone = new THREE.Color();
const hsl = {};
export function tint(hex, amount) {
  tone.set(hex);
  tone.getHSL(hsl);
  tone.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return tone.getHex();
}

function box(parent, x, y, z, w, h, d, colour, opts) {
  const m = new THREE.Mesh(geometry, mat(colour, opts));
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const TAU = Math.PI * 2;
const GLASS = { transparent: true, opacity: 0.55 };
const SHINY = { metalness: 0.55, roughness: 0.28 };

const KINDS = {
  // ---- hats. The head is about 0.75 wide and its top is the anchor. ----
  cap(g, c) {
    box(g, 0, 0.09, 0, 0.8, 0.18, 0.72, c);
    box(g, 0, 0.04, 0.42, 0.62, 0.08, 0.34, c);          // the peak
  },
  beanie(g, c) {
    box(g, 0, 0.05, 0, 0.82, 0.28, 0.76, c);             // pulled down over the ears
    box(g, 0, -0.1, 0, 0.86, 0.14, 0.8, tint(c, -0.1));  // the turned-up band
    box(g, 0, 0.26, 0, 0.2, 0.18, 0.2, tint(c, 0.22));   // the bobble
  },
  bow(g, c) {
    box(g, 0, -0.01, 0, 0.8, 0.09, 0.74, tint(c, -0.08));// the band it is tied to
    box(g, 0, 0.11, 0.05, 0.15, 0.15, 0.15, tint(c, -0.14));
    for (const side of [-1, 1]) {
      box(g, side * 0.25, 0.12, 0.05, 0.34, 0.28, 0.12, c);
      box(g, side * 0.36, -0.05, 0.05, 0.14, 0.3, 0.1, tint(c, -0.05));
    }
  },
  brim(g, c) {
    box(g, 0, 0.12, 0, 0.68, 0.24, 0.62, c);
    box(g, 0, 0.03, 0, 1.18, 0.06, 1.12, c);             // a wide brim, for the sun
    box(g, 0, 0.1, 0.33, 0.7, 0.09, 0.06, 0xb8834a);     // the band
  },
  wreath(g, c) {
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      box(g, Math.sin(a) * 0.36, 0.02, Math.cos(a) * 0.34, 0.15, 0.11, 0.15, i % 2 ? c : tint(c, -0.09));
    }
    const petals = [0xf2a2c0, 0xfff0b0, 0xffffff, 0xe0a8e8, 0xffc48a];
    for (let i = 0; i < 5; i += 1) {
      const a = ((i + 0.4) / 5) * TAU;
      box(g, Math.sin(a) * 0.36, 0.1, Math.cos(a) * 0.34, 0.14, 0.12, 0.14, petals[i]);
    }
  },
  ears(g, c) {
    box(g, 0, 0.06, 0, 0.78, 0.12, 0.7, c);
    for (const side of [-1, 1]) {
      box(g, side * 0.24, 0.22, 0, 0.2, 0.24, 0.14, c);
      box(g, side * 0.24, 0.2, 0.03, 0.11, 0.14, 0.1, 0xe9a2ae);
    }
  },
  helmet(g, c) {
    box(g, 0, 0.12, 0, 0.82, 0.26, 0.76, c);
    box(g, 0, 0.27, 0, 0.6, 0.14, 0.56, c);
    box(g, 0, 0.02, 0, 1.06, 0.08, 1.0, tint(c, -0.05));  // the brim, all the way round
    box(g, 0, 0.11, 0, 0.86, 0.08, 0.8, 0x8a6a45);        // the band
    box(g, 0, 0.37, 0, 0.11, 0.1, 0.11, 0xb9c2cc, SHINY); // the little knob on top
  },
  pirate(g, c) {
    box(g, 0, 0.1, 0, 0.78, 0.2, 0.72, c);
    box(g, 0, 0.21, 0, 0.98, 0.13, 0.54, c);              // turned up fore and aft…
    box(g, 0, 0.21, 0, 0.54, 0.13, 0.94, c);              // …and at the sides
    box(g, 0, 0.14, 0.4, 0.17, 0.15, 0.05, 0xfff4e0);     // the skull
    for (const side of [-1, 1]) box(g, side * 0.05, 0.11, 0.43, 0.04, 0.04, 0.04, 0x262a33);
  },
  wizard(g, c) {
    box(g, 0, 0.03, 0, 1.0, 0.08, 0.94, tint(c, -0.1));   // the brim
    // A cone made of shrinking boxes, leaning back a little so it does not read as a
    // traffic cone standing on a child.
    for (let i = 0; i < 6; i += 1) {
      box(g, 0, 0.15 + i * 0.17, -i * 0.035, 0.58 - i * 0.085, 0.19, 0.54 - i * 0.08, c);
    }
    box(g, 0, 1.16, -0.2, 0.12, 0.12, 0.12, 0xf7e08a, { emissive: 0xf7e08a, emissiveIntensity: 0.7 });
    box(g, 0.02, 0.42, 0.26, 0.11, 0.11, 0.03, 0xf7e08a);
    box(g, -0.14, 0.72, 0.16, 0.08, 0.08, 0.03, 0xf7e08a);
  },
  crown(g, c) {
    box(g, 0, 0.1, 0, 0.72, 0.2, 0.66, c, SHINY);
    // Five points, so it reads as a crown from behind as well as in front.
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU;
      box(g, Math.sin(a) * 0.28, 0.27, Math.cos(a) * 0.26, 0.13, 0.2, 0.13, c, SHINY);
    }
    box(g, 0, 0.4, 0, 0.1, 0.1, 0.1, 0xe0526a, { metalness: 0.3, roughness: 0.2 });
  },

  // ---- face. The anchor sits just in front of the eyes. ----
  round(g, c) {
    box(g, 0, 0, 0, 0.52, 0.045, 0.03, c);               // the bridge
    for (const side of [-1, 1]) {
      box(g, side * 0.17, 0, 0.01, 0.2, 0.2, 0.02, c);
      box(g, side * 0.17, 0, 0.02, 0.15, 0.15, 0.01, 0xbfe4ef, GLASS);
    }
  },
  shades(g, c) {
    box(g, 0, 0, 0, 0.56, 0.05, 0.03, c);
    for (const side of [-1, 1]) box(g, side * 0.17, -0.02, 0.01, 0.24, 0.16, 0.03, c, { roughness: 0.25 });
  },
  goggles(g, c) {
    box(g, 0, 0.01, -0.08, 0.88, 0.15, 0.06, tint(c, -0.3));   // the strap, round the head
    for (const side of [-1, 1]) {
      box(g, side * 0.18, 0, 0.01, 0.3, 0.26, 0.07, c);
      box(g, side * 0.18, 0, 0.05, 0.21, 0.18, 0.02, 0xbfe4ef, { transparent: true, opacity: 0.6 });
    }
    box(g, 0, 0, 0.01, 0.14, 0.08, 0.05, c);
  },
  patch(g, c) {
    box(g, -0.18, 0.01, 0.01, 0.23, 0.21, 0.03, c);
    box(g, 0, 0.1, -0.06, 0.78, 0.05, 0.05, c);          // the string, round the head
  },
  nose(g, c) {
    box(g, 0, -0.1, 0.02, 0.17, 0.17, 0.14, c, { roughness: 0.4 });
  },
  paint(g, c) {
    // A star on each cheek, drawn flat against the face as three crossing bars.
    for (const side of [-1, 1]) {
      box(g, side * 0.25, -0.09, -0.01, 0.19, 0.06, 0.02, c);
      box(g, side * 0.25, -0.09, -0.01, 0.06, 0.19, 0.02, c);
      box(g, side * 0.25, -0.09, -0.01, 0.13, 0.13, 0.02, c);
    }
  },
  mask(g, c) {
    box(g, 0, -0.17, 0.0, 0.63, 0.31, 0.07, c);
    box(g, 0, -0.06, 0.01, 0.61, 0.07, 0.06, tint(c, -0.07));  // the pleat
    box(g, 0, -0.2, 0.01, 0.61, 0.07, 0.06, tint(c, -0.07));
    for (const side of [-1, 1]) box(g, side * 0.33, -0.12, -0.12, 0.05, 0.05, 0.26, c);
  },
  stache(g, c) {
    box(g, 0, -0.17, 0.0, 0.32, 0.09, 0.06, c);
    for (const side of [-1, 1]) {
      box(g, side * 0.21, -0.14, 0.0, 0.13, 0.13, 0.06, c);
      box(g, side * 0.29, -0.09, 0.0, 0.08, 0.1, 0.05, c);
    }
  },
  snorkel(g, c) {
    box(g, 0, 0.02, 0, 0.5, 0.26, 0.05, c);
    box(g, 0, 0.02, 0.02, 0.42, 0.18, 0.03, 0xbfe4ef, { transparent: true, opacity: 0.5 });
    box(g, 0.3, 0.2, -0.02, 0.07, 0.5, 0.07, c);         // the tube, up past the ear
  },
  visor(g, c) {
    box(g, 0, 0.03, -0.06, 0.84, 0.12, 0.08, 0x2a2f38);  // the band
    box(g, 0, 0.03, 0.01, 0.72, 0.15, 0.05, 0x353b45);
    box(g, 0, 0.03, 0.04, 0.62, 0.09, 0.02, c, { emissive: c, emissiveIntensity: 1.1, roughness: 0.3 });
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
  tail(g, c) {
    box(g, 0, -0.22, -0.06, 0.27, 0.3, 0.27, c);
    box(g, 0, -0.48, -0.14, 0.25, 0.3, 0.25, tint(c, 0.04));
    box(g, 0, -0.68, -0.3, 0.23, 0.26, 0.27, tint(c, 0.08));
    box(g, 0, -0.78, -0.5, 0.21, 0.22, 0.26, tint(c, 0.12));
    box(g, 0, -0.76, -0.68, 0.19, 0.2, 0.2, 0xfff4e2);   // the white tip
  },
  balloon(g, c) {
    box(g, 0.26, 0.3, -0.12, 0.025, 0.92, 0.025, 0xe4dcc0);   // the string
    box(g, 0.26, 0.66, -0.12, 0.1, 0.1, 0.1, tint(c, -0.16)); // the knot
    box(g, 0.26, 0.95, -0.12, 0.44, 0.5, 0.44, c, { roughness: 0.32 });
    box(g, 0.26, 1.16, -0.12, 0.3, 0.16, 0.3, c, { roughness: 0.32 });
  },
  shell(g, c) {
    box(g, 0, -0.18, -0.14, 0.88, 0.94, 0.28, c);
    box(g, 0, -0.18, -0.3, 0.64, 0.68, 0.18, tint(c, 0.1));
    box(g, 0, -0.18, -0.2, 0.96, 0.22, 0.34, 0xe0cf9a);   // the rim
    for (let i = 0; i < 4; i += 1) {
      box(g, (i % 2 ? 0.2 : -0.2), 0.05 - Math.floor(i / 2) * 0.44, -0.34, 0.24, 0.26, 0.1, tint(c, 0.2));
    }
  },
  guitar(g, c) {
    box(g, 0.05, -0.44, -0.16, 0.58, 0.6, 0.17, c);       // the lower bout…
    box(g, 0.05, -0.16, -0.16, 0.44, 0.36, 0.16, c);      // …and the waist
    box(g, 0.05, -0.4, -0.07, 0.19, 0.19, 0.04, 0x3a2a1c);// the sound hole
    box(g, 0.05, 0.28, -0.15, 0.14, 0.92, 0.1, 0x6b4a2f); // the neck, over the shoulder
    box(g, 0.05, 0.78, -0.15, 0.18, 0.2, 0.12, 0x3a2a1c);
    box(g, 0, -0.04, -0.04, 0.74, 0.09, 0.07, 0x4a3a2a);  // the strap
  },
  sword(g, c) {
    box(g, -0.2, -0.32, -0.14, 0.15, 1.02, 0.06, c, { metalness: 0.6, roughness: 0.25 });
    box(g, -0.2, 0.26, -0.14, 0.38, 0.09, 0.11, 0xb08040, SHINY);   // the guard
    box(g, -0.2, 0.43, -0.14, 0.11, 0.28, 0.11, 0x6b4a2f);          // the grip
    box(g, -0.2, 0.6, -0.14, 0.15, 0.11, 0.15, 0xb08040, SHINY);    // the pommel
    box(g, 0.05, -0.05, -0.05, 0.72, 0.09, 0.07, 0x5a4632);         // the baldric
  },
  jet(g, c) {
    box(g, 0, -0.14, -0.2, 0.46, 0.62, 0.24, 0xd8d2c4);
    box(g, 0, 0.16, -0.18, 0.52, 0.14, 0.2, 0xd8d2c4);
    for (const side of [-1, 1]) {
      box(g, side * 0.3, -0.12, -0.22, 0.25, 0.72, 0.25, c);
      box(g, side * 0.3, -0.52, -0.22, 0.19, 0.14, 0.19, 0x4a4a52);
      box(g, side * 0.3, -0.68, -0.22, 0.15, 0.18, 0.15, 0xffb347, { emissive: 0xff7a2a, emissiveIntensity: 1.2 });
      box(g, side * 0.26, 0.06, 0.03, 0.09, 0.46, 0.07, 0x6b563f);  // the shoulder straps
    }
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
  bowtie(g, c) {
    box(g, 0, 0.24, 0.01, 0.11, 0.11, 0.06, tint(c, -0.14));
    for (const side of [-1, 1]) {
      box(g, side * 0.15, 0.24, 0.0, 0.21, 0.17, 0.05, c);
      box(g, side * 0.24, 0.24, 0.0, 0.06, 0.11, 0.05, tint(c, -0.06));
    }
  },
  tie(g, c) {
    box(g, 0, 0.25, 0.01, 0.12, 0.12, 0.06, tint(c, -0.14));   // the knot
    box(g, 0, 0.04, 0.005, 0.15, 0.36, 0.04, c);
    box(g, 0, -0.18, 0.005, 0.1, 0.14, 0.04, c);
  },
  corsage(g, c) {
    box(g, 0.14, 0.06, 0.0, 0.05, 0.22, 0.04, 0x4f8f5a);       // the stem
    box(g, 0.2, 0.02, 0.0, 0.14, 0.06, 0.04, 0x4f8f5a);        // a leaf
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * TAU;
      box(g, 0.14 + Math.sin(a) * 0.08, 0.2 + Math.cos(a) * 0.08, 0.02, 0.1, 0.1, 0.04, c);
    }
    box(g, 0.14, 0.2, 0.04, 0.08, 0.08, 0.03, 0xfff0b0);
  },
  apron(g, c) {
    box(g, 0, -0.3, -0.01, 0.64, 0.68, 0.05, c);
    box(g, 0, 0.06, -0.01, 0.36, 0.38, 0.05, c);               // the bib
    for (const side of [-1, 1]) box(g, side * 0.21, 0.26, -0.03, 0.06, 0.32, 0.04, c);
    box(g, 0, -0.06, 0.01, 0.68, 0.08, 0.06, tint(c, -0.16));  // the waist tie
    box(g, 0, -0.38, 0.02, 0.22, 0.18, 0.03, tint(c, -0.09));  // the pocket
  },
  sash(g, c) {
    // Diagonal, made of a stair of boxes: nothing here can be rotated, and a straight
    // band across the chest is a belt worn too high.
    for (let i = 0; i < 8; i += 1) box(g, -0.28 + i * 0.085, 0.3 - i * 0.1, 0, 0.17, 0.17, 0.05, c);
    box(g, 0.3, -0.4, 0.02, 0.21, 0.21, 0.04, 0xf2ce72, SHINY);
    box(g, 0.3, -0.4, 0.05, 0.1, 0.1, 0.03, 0xfff1c2);
  },
  pendant(g, c) {
    for (let i = 0; i < 6; i += 1) {
      const t = i / 5;
      for (const side of [-1, 1]) box(g, side * (0.27 - 0.23 * t), 0.35 - 0.21 * t, -0.02, 0.05, 0.06, 0.03, 0xd8c070, SHINY);
    }
    box(g, 0, 0.06, 0.01, 0.17, 0.19, 0.05, c, { metalness: 0.4, roughness: 0.24 });
    box(g, 0, 0.06, 0.04, 0.08, 0.1, 0.02, 0xfff6d8);
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
