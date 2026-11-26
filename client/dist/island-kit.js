// Voxel island construction, shared by every walkable island in the world.
//
// おつかい島 and ことばの学校島 are the same island with different buildings on it: the
// same layered terrain, the same dock, the same signposting, the same collision and the
// same "am I standing at a place" question. Only the buildings and what happens at them
// differ, so that is all each island module writes.
import * as THREE from './three.module.js';
import { buildVillager, villagerSeed } from './villager.js';
import { placeHost } from './island-cast.js';
import { createHouseBatch } from './real-house.js';
import { groundMaterial, groundKind, grassTufts } from './ground-fx.js';
import { createRealTrees } from './real-trees.js';
import { seasonNow } from './main-seasons.js';
// 島の看板は canvas に焼いた絵で、HTML の仕組み（`data-t` / `.en`・`.ja`）が効かない。
// 言語を見て焼き直すために、ここだけ i18n を直接見ている。
import { isJa, onLangChange } from './i18n.js';

// 3D の 札の 字の 大きさ。iPad（タッチ）では 1.5 倍まで（パソコンは そのまま）。
const SIGN_BOOST = globalThis.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 1;

export const HALF_X = 30;
export const HALF_Z = 25;
export const NEAR_DISTANCE = 5;          // must match `radius` in the island's data file
const LABEL_DISTANCE = 16;

const geo = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
export function mat(color, emissive = 0) {
  const key = `${color}:${emissive}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, emissive: color, emissiveIntensity: emissive }));
  return mats.get(key);
}

// Lighten or darken a hex colour. Voxel work reads as built rather than blocky when the
// same wood or plaster appears in two or three tones, and one number is cheaper to keep
// consistent than a second palette.
export function shade(hex, amount) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return c.getHex();
}

// One island's worth of building tools. `build` is called once, with these, when the
// island's data has arrived.
// 大きい島（メインの島）は `size`（半分の幅と奥行き）・`power`（2＝だ円、4＝角の丸い四角）・
// `land(x, z)`（false のところは陸を作らない＝入り江）・`dock`（船着き場の いちばん陸よりの点）・`hills` を渡す。
// 渡さなければ いままでの 60×50 の だ円の島。
// `annex`（{x0,x1,z0,z1,r}＝かどの まるい 四角）は 島の 形の 外へ つき出す 土地（メインの島の 東の ひろば・2026-11）。そこも 陸に なり、歩ける。
export function createIsland({ scene, build, seed = 20250910, size = null, power = 2, land = null, dock = null, hills = null, annex = null }) {
  const HX = size?.x ?? HALF_X;
  const HZ = size?.z ?? HALF_Z;
  const DOCK = { x: dock?.x ?? 0, z: dock?.z ?? 21 };
  // つき出した 土地の 中か（m だけ 内がわに ちぢめて 見る。マイナスなら 外へ ひろげる）。
  const inAnnex = annex ? (x, z, m = 0) => {
    const r = Math.max(0, (annex.r ?? 4) - m), hx = (annex.x1 - annex.x0) / 2 - m, hz = (annex.z1 - annex.z0) / 2 - m;
    const dx = Math.abs(x - (annex.x0 + annex.x1) / 2) - (hx - r), dz = Math.abs(z - (annex.z0 + annex.z1) / 2) - (hz - r);
    return dx <= 0 ? dz <= r : dz <= 0 ? dx <= r : dx * dx + dz * dz <= r * r;
  } : () => false;
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  let data = null;
  let built = false;
  let wanted = false;           // asked to be shown, possibly before the data arrived
  const spots = [];             // { def, npc, label, ja }
  const doors = [];             // { def, x, z } - the doorway of a building you can enter
  const obstacles = [];
  const mapTiles = [];          // 右上の 地図の 陸（[x, z, はまか]）。ground() が 3D と 同じ マスを 記録する
  const mapPaths = [];          // 地図の 道（path() の 線）
  let mapBase = null;           // 陸・道・建物までを 1 回だけ 描いた 下絵
  let beacon = null;
  let targetId = '';
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  // Shore rocks, path tiles and greenery are hundreds of identical boxes. They are
  // collected by colour and drawn as one instanced mesh each, so the island costs a
  // couple of dozen draw calls instead of several hundred on a classroom iPad.
  const deco = new Map();
  const lit = [];               // materials that come on at night: windows, lamps, fires
  const D = (x, y, z, w, h, d, color, glow = 0, flat = false) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    const key = `${color}:${glow}:${flat ? 1 : 0}`;
    if (!deco.has(key)) deco.set(key, { color, glow, flat, list: [] });
    deco.get(key).list.push(m);
  };
  // The ground itself: thousands of tiles that receive shadows but never cast them.
  // Left casting, every blade of the island shadows the one beside it and the whole
  // place goes dark.
  const G = (x, y, z, w, h, d, color) => D(x, y, z, w, h, d, color, 0, true);
  const houses = createHouseBatch();
  const woods = [];
  let realTrees = null;
  const lampSpots = [];          // 街灯の 足もとの 光の わ（夜だけ・1 回の 描画）
  let pools = null;
  let tuftsMesh = null;
  // 草むら（ground-fx.js の grassTufts）：草の タイルの 上に、道・小物・建物を さけて 立てる。島 1 つで 900 まで・描く 回数は 1。
  function plantTufts() {
    if (tuftsMesh) return null;
    try {
      const taken = new Set(), cell = (x, z) => `${Math.round(x)}:${Math.round(z)}`, tops = [];
      for (const { color, flat, list } of deco.values()) {
        for (const m of list) {
          const e = m.elements, x = e[12], y = e[13], z = e[14], w = e[0], h = e[5], d = e[10];
          if (flat === true && h > 0.6 && h < 0.8 && groundKind(color) === 'grass') { tops.push({ x, y: y + h / 2, z, color }); continue; }
          if (y - h / 2 > 1.2 || h > 2.5) continue;                       // 高い ところの 物・土の 柱は 関係ない
          for (let ax = Math.floor(x - w / 2 - 0.4); ax <= Math.ceil(x + w / 2 + 0.4); ax += 1) for (let az = Math.floor(z - d / 2 - 0.4); az <= Math.ceil(z + d / 2 + 0.4); az += 1) taken.add(cell(ax, az));
        }
      }
      let q = 4711; const r = () => ((q = (q * 16807) % 2147483647) - 1) / 2147483646;
      // 草の タイル 1 まいに 3 かぶまで・島 1 つで 2400 まで（板 3 まい × 2400 ＝ 1.4 万 三角・描く 回数は 1）。
      const every = Math.max(1, tops.length * 3 / 2400), out = [];
      for (const t of tops) for (let k = 0; k < 3; k += 1) {
        if (r() * every > 1) continue;
        const x = t.x + (r() - 0.5) * 1.9, z = t.z + (r() - 0.5) * 1.9;
        if (taken.has(cell(x, z)) || obstacles.some((o) => Math.abs(x - o.x) < o.w + 0.5 && Math.abs(z - o.z) < o.d + 0.5)) continue;
        out.push({ x, y: t.y - 0.03, z, s: 0.9 + r() * 0.8, tall: 0.4 + r() * 0.35, turn: r() * 3.14, color: t.color, tint: 1.0 + r() * 0.22 });
      }
      return grassTufts(out);
    } catch { return null; }
  }
  function flushDeco() {
    if (houses.count) lit.push(...houses.flush(root));
    if (woods.length && !realTrees) { try { realTrees = createRealTrees({ root, trees: woods, seed: 900 + woods.length }); realTrees.setSeason(seasonNow().season); } catch { realTrees = null; } }
    if (lampSpots.length && !pools) {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64); gr.addColorStop(0, 'rgba(255,214,150,0.9)'); gr.addColorStop(0.35, 'rgba(255,196,120,0.38)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        const pm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
        pools = new THREE.InstancedMesh(pg, pm, lampSpots.length);
        const m4 = new THREE.Matrix4();
        lampSpots.forEach(([lx, lz], i) => { m4.compose(new THREE.Vector3(lx, 0.31, lz), new THREE.Quaternion(), new THREE.Vector3(7.5, 1, 7.5)); pools.setMatrixAt(i, m4); });
        pools.frustumCulled = false; pools.renderOrder = 2; pools.visible = false; root.add(pools);
      } catch { pools = null; }
    }
    tuftsMesh = plantTufts();
    if (tuftsMesh) root.add(tuftsMesh);
    for (const { color, glow, flat, list } of deco.values()) {
      // Each lit colour gets its own material instance, so turning the lights up at
      // night does not also make the roofs glow.
      // 地面（flat）は 草・土・道の 手ざわりを かける（ground-fx.js）。色ごとに 1 つ・描く 回数は かわらない。
      const material = glow ? mat(color, 0).clone() : flat ? groundMaterial(mat(color), flat === true ? undefined : flat) : mat(color);
      if (glow) { material.emissive = new THREE.Color(color); material.emissiveIntensity = 0; lit.push({ material, glow }); }
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = !flat;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    deco.clear();
  }

  // The islands are lit by the world's clock: the windows and the lamp posts come on as
  // the sky goes over, which is the same number every child in the class is seeing.
  function setNight(night) {
    const n = Math.max(0, Math.min(1, night || 0));
    for (const { material, glow } of lit) material.emissiveIntensity = glow * n;
    if (pools) { pools.material.opacity = n * 0.5; pools.visible = n > 0.03; }
  }

  const B = (x, y, z, w, h, d, color, parent = root, emissive = 0) => {
    const m = new THREE.Mesh(geo, mat(color, emissive));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // depthTest defaults on: a place sign belongs to the world and should go behind the
  // hill it is behind. Only the nameplates over people opt out, so a child can always
  // read who is where.
  const labels = [];   // every sign this island puts up, so a race can take them down
  let labelsOn = true; // and whether they are up at all: an island builds itself lazily,
                       // so a sign made after the race started has to be born hidden
  // 言語が変わったら、この島の看板を焼き直す。島は一度しか建たないので、聞き役もひとつ。
  onLangChange(() => { for (const s2 of labels) s2.userData.repaint?.(); });
  // 看板。**HTML ではなく canvas に焼いた絵**なので、`data-t` も `.en`/`.ja` も効かない。
  // かわりに **`{en, ja}` の組を受け取って、言語が変わったら焼き直す**（テクスチャの
  // 描き直しだけなので、島を建て直す必要はない）。文字列ひとつでも今までどおり動く。
  //
  // **幅は長いほうの言語で決める。** 言語を変えるたびに看板の大きさが変わると、
  // 隣の建物と重なったり離れたりして、島がそのたびに違う島に見える。
  function sprite(text, x, y, z, { width = 8, background = '#183946', color = '#f3dfaa', weight = 600, size = 36, depthTest = true } = {}) {
    const pair = text && typeof text === 'object' ? { en: String(text.en || ''), ja: String(text.ja || '') } : null;
    const pick = () => (pair ? (isJa() ? pair.ja : pair.en) || pair.ja || pair.en : String(text ?? ''));
    const c = document.createElement('canvas');
    c.width = 768; c.height = 100;
    const ctx = c.getContext('2d');
    const paint = () => {
      ctx.clearRect(0, 0, 768, 100);
      if (background) { ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(4, 4, 760, 92, 18); ctx.fill(); }
      ctx.fillStyle = color;
      const now = pick();
      // タッチの 端末（iPad）は 字を 札いっぱいに。長い 名前だけ 入る 大きさまで 小さく する（横に つぶさない）。
      let fs = Math.round(size * SIGN_BOOST);
      ctx.font = `${weight} ${fs}px sans-serif`;
      while (fs > size && ctx.measureText(now).width > 700) { fs -= 2; ctx.font = `${weight} ${fs}px sans-serif`; }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(now, 384, 53, 720);
      s.userData.signText = now;   // 焼いた文字。検査と、島の名前を疑ったときのため
    };
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest, transparent: true }));
    paint();
    tex.needsUpdate = true;
    s.position.set(x, y, z);
    s.scale.set(width, width / 7.68, 1);
    s.renderOrder = depthTest ? 1 : 3;
    // 言語が変わったときに 焼き直すための道具を、看板自身に持たせておく。
    if (pair) s.userData.repaint = () => { paint(); tex.needsUpdate = true; };
    root.add(s);
    labels.push(s);
    s.visible = labelsOn;
    return s;
  }

  // A voxel villager in the same style as the islanders on Willow.
  function person(color, skin, x, z, seed) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    root.add(g);
    // 見た目は 人ごとに ちがう（villager.js）。同じ たね＝同じ 人。家の 中の カウンターの 人も 同じ たねで 建つ。
    return buildVillager(B, g, { color, seed: seed ?? `${x}:${z}` });
  }

  // A building with a front: plinth, timber framing, shuttered windows that light up at
  // night, a porch over the door, eaves, a ridge, a chimney, and its name hanging from a
  // bracket rather than floating in the air. Everything is instanced, so a house of
  // fifty pieces still costs the island nothing to draw.
  function house(x, z, w, d, wall, roof, name) {
    const hx = w / 2;
    const hz = d / 2;
    const front = z + hz;
    const dark = shade(wall, -0.22);
    const beam = 0x6f5b3e;
    const ridge = shade(roof, -0.18);

    // 2026-11：家は real-house.js（かわらの 屋根・しっくいと 木の ほねぐみ・ガラスの まど）。島の 家を まとめて 4 回で 描く。
    // 前の 箱の 家（だんだんの 屋根）は やめた。色（wall・roof）と 大きさは データの まま。
    houses.add(x, z, w, d, wall, roof);

    obstacles.push({ x, z, w: hx + 0.4, d: hz + 0.4 });
    // The name hangs from a bracket by the door, at reading height.
    D(x - hx - 0.1, 3.5, front - 0.4, 0.22, 0.22, 1.4, beam);
    const longest = typeof name === 'object' ? Math.max(String(name.en || '').length, String(name.ja || '').length) : String(name).length;
    sprite(name, x, 5.9, front + 0.7, { width: Math.max(6, longest * 0.52) });
    return null;
  }

  // A paved way: irregular flagstones, gravel edging, and a lamp post every few paces
  // that comes on with the evening.
  function path(ax, az, bx, bz) {
    mapPaths.push([ax, az, bx, bz]);
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.round(length / 1.35));
    const nx = (bz - az) / (length || 1);
    const nz = -(bx - ax) / (length || 1);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const pz = az + (bz - az) * t;
      const wobble = (rand() - 0.5) * 0.5;
      D(px + nx * wobble, 0.17, pz + nz * wobble, 1.5 + rand() * 0.5, 0.14, 1.5 + rand() * 0.5, i % 3 ? 0xd9c9a2 : 0xcdbc8f, 0, 'cobble');
      // Loose gravel either side, so the path has an edge rather than a border.
      for (const side of [-1, 1]) {
        if (rand() > 0.55) continue;
        D(px + nx * side * (1.1 + rand() * 0.4), 0.14, pz + nz * side * (1.1 + rand() * 0.4), 0.4 + rand() * 0.4, 0.1, 0.4 + rand() * 0.4, rand() > 0.5 ? 0xc6b58c : 0xb8a87f);
      }
      if (i % 5 === 2) lamp(px + nx * 1.9, pz + nz * 1.9);
    }
  }

  // A lamp post. Dark by day, warm at night — the same light the windows use.
  function lamp(x, z) {
    D(x, 0.2, z, 0.8, 0.4, 0.8, 0x8d8570);
    D(x, 1.8, z, 0.26, 3.2, 0.26, 0x6f5b3e);
    D(x, 3.5, z, 0.7, 0.16, 0.7, 0x6f5b3e);
    D(x, 3.22, z, 0.5, 0.5, 0.5, 0xffdda0, 1.25);
    lampSpots.push([x, z]);
    D(x, 3.7, z, 0.34, 0.2, 0.34, 0x6f5b3e);
  }

  // Three kinds of tree, because a wood of one kind reads as wallpaper. The kind is
  // chosen from the position, so an island looks the same every time it is built.
  function tree(x, z, scale = 1, kind = -1) {
    const k = kind >= 0 ? kind : Math.floor(rand() * 3);
    // 2026-11：箱の 木を やめて、メインの島と 同じ リアルな 木（real-trees.js）。島 1 つで まとめて 描く。
    woods.push({ x, z, scale: scale * 0.78, kind: k });
    // A little shadow of undergrowth at the foot, which hides the join with the ground.
    D(x + (rand() - 0.5), 0.25, z + (rand() - 0.5), 1.1 * scale, 0.3, 1.1 * scale, 0x5f7a4a);
  }

  // Small things that make a place look lived in. None of them collide: a child walking
  // through a flowerbed is not a bug worth the frustration of an invisible wall.
  function bush(x, z, s = 1) {
    D(x, 0.5 * s, z, 1.5 * s, 1.0 * s, 1.5 * s, 0x5d8b4f);
    D(x + 0.35 * s, 0.85 * s, z - 0.2 * s, 1.0 * s, 0.7 * s, 1.0 * s, 0x6f9c58);
  }
  function flowers(x, z, colour = 0xf0d98a) {
    for (let i = 0; i < 3; i += 1) {
      const fx = x + (rand() - 0.5) * 1.6;
      const fz = z + (rand() - 0.5) * 1.6;
      D(fx, 0.4, fz, 0.07, 0.5, 0.07, 0x5f7a52);
      D(fx, 0.72, fz, 0.3, 0.24, 0.3, colour);
    }
  }
  function rock(x, z, s = 1) {
    D(x, 0.35 * s, z, 1.6 * s, 0.9 * s, 1.4 * s, 0x9a9585);
    D(x + 0.4 * s, 0.8 * s, z + 0.2 * s, 0.9 * s, 0.7 * s, 0.8 * s, 0xa8a391);
  }
  function barrel(x, z) {
    D(x, 0.55, z, 0.9, 1.1, 0.9, 0x8a6a45);
    D(x, 0.35, z, 0.98, 0.14, 0.98, 0x6d543a);
    D(x, 0.78, z, 0.98, 0.14, 0.98, 0x6d543a);
  }
  function crate(x, z, s = 1) {
    D(x, 0.45 * s, z, 1.1 * s, 0.9 * s, 1.1 * s, 0xb08655);
    D(x, 0.9 * s, z, 1.16 * s, 0.1 * s, 1.16 * s, 0x8d6b44);
  }
  function bench(x, z, facing = 0) {
    const dx = Math.sin(facing);
    const dz = Math.cos(facing);
    D(x, 0.55, z, 2.4 - dz * 0 , 0.16, 0.8, 0xa58c62);
    D(x - dx * 0.35, 1.05, z - dz * 0.35, 2.4, 0.7, 0.16, 0xa58c62);
    for (const side of [-0.9, 0.9]) D(x + side * dz, 0.28, z + side * dx, 0.18, 0.55, 0.6, 0x7b6647);
  }
  function fence(x, z, count, axis = 'x') {
    for (let i = 0; i < count; i += 1) {
      const fx = x + (axis === 'x' ? i * 1.5 : 0);
      const fz = z + (axis === 'z' ? i * 1.5 : 0);
      D(fx, 0.85, fz, 0.18, 1.5, 0.18, 0xd4c49b);
      if (i < count - 1) {
        D(fx + (axis === 'x' ? 0.75 : 0), 1.0, fz + (axis === 'z' ? 0.75 : 0), axis === 'x' ? 1.5 : 0.14, 0.14, axis === 'z' ? 1.5 : 0.14, 0xddcda5);
        D(fx + (axis === 'x' ? 0.75 : 0), 0.55, fz + (axis === 'z' ? 0.75 : 0), axis === 'x' ? 1.5 : 0.14, 0.14, axis === 'z' ? 1.5 : 0.14, 0xddcda5);
      }
    }
  }
  // Bunting between two posts: the cheapest way to make a square feel like an occasion.
  function bunting(ax, az, bx, bz, height = 4.2) {
    const steps = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.2));
    const colours = [0xe4708a, 0xf0c05a, 0x7ec98a, 0x6aa9d4];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const sag = Math.sin(t * Math.PI) * 0.55;
      D(ax + (bx - ax) * t, height - sag, az + (bz - az) * t, 0.4, 0.5, 0.1, colours[i % colours.length]);
    }
  }


  // The terrain, the dock and the shore every island starts from.
  //
  // The land is laid as tiles inside an ellipse rather than as one slab, so the island
  // has a coastline instead of four corners: grass in the middle, a sand shelf at the
  // edge, rocks and foam where it meets the water. Low rises break the flatness. All of
  // it is instanced, so a few thousand tiles cost a handful of draw calls.
  function ground(island) {
    root.position.set(island.x, 0, island.z);
    const grass = island.grass ?? 0x8fa65c;
    const grassTop = island.grassTop ?? 0x9cb266;
    const sand = 0xe0cfa4;
    const soil = 0x8a7a5c;
    const RX = HX + 1;
    const RZ = HZ + 1;
    const edge = (x, z) => Math.abs(x / RX) ** power + Math.abs(z / RZ) ** power;

    // Where the ground rises. Kept away from the middle and from the landing, so no
    // building or path ever has to climb.
    const rises = hills || [
      { x: -21, z: -14, r: 9 }, { x: 22, z: -12, r: 8 },
      { x: -24, z: 11, r: 7 }, { x: 19, z: 15, r: 6.5 },
    ];
    const lift = (x, z) => {
      let h = 0;
      for (const hill of rises) {
        const d = Math.hypot(x - hill.x, z - hill.z) / hill.r;
        if (d < 1) h = Math.max(h, Math.cos(d * Math.PI / 2) * 2.2);
      }
      return Math.round(h * 2) / 2;
    };
    ground.lift = lift;

    // Each tile is a face of grass or sand on a column of soil, the way a voxel world
    // shows its ground: the cliff at the shore is then soil, not a slab of lawn.
    // つき出した 土地（annex）が あれば そこまで 同じ マス目で ひろげる。annex の 中は「となりが 陸で ない」マスだけ すなはま。
    const NB = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    const isLand = (x, z) => inAnnex(x, z) || (edge(x, z) <= 1.04 && (!land || land(x, z)));
    const more = (n) => 2 * Math.max(0, Math.ceil(n / 2));
    const X0 = -RX - (annex ? more(-RX - annex.x0) : 0), X1 = RX + (annex ? more(annex.x1 - RX) : 0);
    const Z0 = -RZ - (annex ? more(-RZ - annex.z0) : 0), Z1 = RZ + (annex ? more(annex.z1 - RZ) : 0);
    for (let x = X0; x <= X1; x += 2) {
      for (let z = Z0; z <= Z1; z += 2) {
        const e = edge(x, z);
        const ann = inAnnex(x, z);
        if (!ann && e > 1.04) continue;
        if (!ann && land && !land(x, z)) continue;
        const beach = ann ? NB.some(([dx, dz]) => !isLand(x + dx, z + dz)) : e > 0.94 || (land && NB.some(([dx, dz]) => !land(x + dx, z + dz)));
        const y = beach ? 0 : lift(x, z);
        const top = beach ? sand : (x * 7 + z * 3) % 5 === 0 ? grassTop : grass;
        mapTiles.push([x, z, beach]);
        // The top face lands on y = 0.2, which is the ground everything else on the
        // island is built to stand on.
        G(x, -0.15 + y, z, 2.02, 0.7, 2.02, top);
        G(x, -2.1 + y / 2, z, 2.02, 3.2 + y, 2.02, beach ? shade(sand, -0.16) : soil);
        if (!beach && y > 0.4 && rand() > 0.88) rock(x + rand() - 0.5, z + rand() - 0.5, 0.5 + rand() * 0.5);
      }
    }
    // Where the sand meets the water: wet sand, then foam, then rocks standing in it.
    for (let a = 0; a < Math.PI * 2; a += 0.05 * (power > 2 ? 0.5 : 1)) {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const cx = Math.sign(c) * Math.abs(c) ** (2 / power);
      const cz = Math.sign(sn) * Math.abs(sn) ** (2 / power);
      if (land && !land(cx * RX * 0.97, cz * RZ * 0.97)) continue;
      G(cx * (RX + 1.1), -0.55, cz * (RZ + 1.1), 2.4, 0.8, 2.4, shade(sand, -0.06));
      G(cx * (RX + 2.4), -1.1, cz * (RZ + 2.4), 1.8 + rand(), 0.5, 1.8 + rand(), 0xd8e7dd);
      if (rand() > 0.85) {
        const s = 0.6 + rand() * 0.7;
        const tone = rand() > 0.5 ? 0x8d9aa0 : 0x9a9585;   // 乱数は いつも 同じ 数だけ 使う（annex の 中の 岩だけ 置かない）
        if (!inAnnex(cx * (RX + 1.6), cz * (RZ + 1.6), -2)) D(cx * (RX + 1.6), -0.35, cz * (RZ + 1.6), 1.5 * s, 1.3 * s, 1.4 * s, tone);
      }
    }
    // つき出した 土地の なみうちぎわ（ぬれた 砂 → あわ → 岩）。島の 乱数（rand）は 使わない＝ほかの 物の 場所は かわらない。
    if (annex) {
      let q = 9173; const r2 = () => ((q = (q * 16807) % 2147483647) - 1) / 2147483646;
      const near = (x, z, n) => { for (let dx = -n; dx <= n; dx += 2) for (let dz = -n; dz <= n; dz += 2) if (inAnnex(x + dx, z + dz)) return true; return false; };
      for (let x = X0 - 6; x <= X1 + 6; x += 2) for (let z = Z0 - 6; z <= Z1 + 6; z += 2) {
        if (isLand(x, z) || edge(x, z) <= 1.12) continue;
        if (near(x, z, 2)) {
          G(x, -0.55, z, 2.4, 0.8, 2.4, shade(sand, -0.06));
          if (r2() > 0.9) { const s = 0.6 + r2() * 0.7; D(x + r2() - 0.5, -0.35, z + r2() - 0.5, 1.5 * s, 1.3 * s, 1.4 * s, r2() > 0.5 ? 0x8d9aa0 : 0x9a9585); }
        } else if (near(x, z, 4)) G(x, -1.1, z, 1.8 + r2(), 0.5, 1.8 + r2(), 0xd8e7dd);
      }
    }

    // 船着き場は DOCK を起点に描く（いつもの島は x=0, z=21）。
    const ox = DOCK.x;
    const oz = DOCK.z - 21;
    const Dk = (x, y, z, ...rest) => D(ox + x, y, oz + z, ...rest);
    // The landing: planks with gaps, mooring posts with a rope, a lantern and a rowing
    // boat tied alongside — the first thing anyone sees of the island.
    for (let i = 0; i < 7; i += 1) Dk(0, 0.2, 21 + i * 1.1, 7, 0.22, 0.95, i % 2 ? 0xc0a077 : 0xb79768);
    for (let i = 0; i < 6; i += 1) Dk(-2.6 + i * 1.05, -0.6, 27, 0.34, 2, 0.34, 0x8a7350);
    for (const sx of [-3.3, 3.3]) {
      Dk(sx, 1.2, 21.5, 0.34, 2.6, 0.34, 0x8a7350);
      Dk(sx, 2.5, 21.5, 0.5, 0.3, 0.5, 0x6d543a);
    }
    Dk(0, 2.35, 21.5, 6.6, 0.12, 0.12, 0xb9a075);          // the rope between the posts
    lamp(ox + 3.3, oz + 24.5);
    // A boat: hull, seat, and two oars leaning on the gunwale.
    Dk(5.2, -0.35, 25.5, 2.0, 0.7, 4.4, 0x8a6a45);
    Dk(5.2, 0.05, 25.5, 1.5, 0.3, 3.8, 0x6d543a);
    Dk(5.2, 0.35, 25.5, 1.7, 0.16, 0.7, 0xa58c62);
    Dk(6.0, 0.7, 25.2, 0.14, 0.14, 2.6, 0xa58c62);

    // The island's name on a post beside the landing, not on the spot a child lands on.
    Dk(6.8, 1.7, 21.5, 0.34, 3.4, 0.34, 0x8a7350);
    Dk(6.8, 3.5, 21.5, 0.9, 0.3, 0.9, 0xb8703f);
    sprite({ en: island.en, ja: island.name }, ox + 6.8, 4.3, oz + 21.5, { width: 8, size: 31 });
  }

  // Greenery, kept off the paths and away from every place a child has to stand. Trees
  // gather in loose groups rather than spreading evenly, because an evenly planted
  // island reads as a lawn with obstacles on it.
  function scatter(island, count = 120) {
    const clear = (x, z, r = 9) => !island.spots.some((sp) => Math.hypot(x - sp.x, z - sp.z) < r)
      && !(Math.abs(x) < 5 && z > 8);
    // A handful of copses, then everything else scattered between them.
    for (let g = 0; g < 5; g += 1) {
      const gx = (rand() - 0.5) * HX * 1.6;   // いつもの 島（30×25）では 48・40・54・44・27・22 の まま
      const gz = (rand() - 0.5) * HZ * 1.6;
      if (!clear(gx, gz, 12)) continue;
      const kind = Math.floor(rand() * 3);
      for (let i = 0; i < 4 + Math.floor(rand() * 4); i += 1) {
        const x = gx + (rand() - 0.5) * 9;
        const z = gz + (rand() - 0.5) * 9;
        if (!clear(x, z)) continue;
        tree(x, z, 0.75 + rand() * 0.55, kind);
      }
    }
    for (let i = 0; i < count; i += 1) {
      const x = (rand() - 0.5) * (HX - 3) * 2;
      const z = (rand() - 0.5) * (HZ - 3) * 2;
      if ((x / (HX - 3)) ** 2 + (z / (HZ - 3)) ** 2 > 1) continue;      // stay on the land
      if (!clear(x, z, 7)) continue;
      const roll = rand();
      if (roll > 0.88) tree(x, z, 0.7 + rand() * 0.6);
      else if (roll > 0.7) bush(x, z, 0.7 + rand() * 0.6);
      else if (roll > 0.62) rock(x, z, 0.5 + rand() * 0.5);
      else flowers(x, z, [0xf0d98a, 0xe89bb0, 0xdfe4ef, 0xe7b06a][Math.floor(rand() * 4)]);
    }
  }

  // The beam over wherever the island says to go next.
  function makeBeacon() {
    beacon = new THREE.Group();
    beacon.visible = false;
    root.add(beacon);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.85, depthTest: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    ring.renderOrder = 2;
    beacon.add(ring);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 12, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
    column.position.y = 6;
    beacon.add(column);
    beacon.userData.ring = ring;
  }

  // The doorway of a building, recorded where the island draws one. A child who walks
  // into it goes inside; islands that only put a person on the grass never call this, so
  // there is nothing to walk into and nothing to promise.
  //
  // Takes the same two numbers the island gave `house()` - how far back it was drawn and
  // how deep it is - and works out where its front wall is. The doorway is the strip
  // just in front of that wall, which is exactly as close as the wall's own collision
  // lets a child get, and therefore where they end up when they walk to the place.
  function door(def, backset = 4.6, depth = 6.4) {
    doors.push({ def, x: def.x, z: def.z - backset + depth / 2 + 0.75 });
  }

  // The doorway the player is standing in, if any.
  function doorNear(playerObject) {
    const lx = playerObject.position.x - root.position.x;
    const lz = playerObject.position.z - root.position.z;
    for (const d of doors) {
      if (Math.abs(lx - d.x) < 1.4 && Math.abs(lz - d.z) < 1.4) return d.def;
    }
    return null;
  }

  // A resident with a nameplate, at one of the island's spots.
  function resident(def) {
    const npc = person(Number(def.color), 0xe8c39a, def.x, def.z, villagerSeed(def));
    // labelBg / labelWidth：札の 色と 幅（英検の つり場は 級の 色で「🎣 英検3級 · Sora」を 1 枚に）。
    const label = sprite(def.label || def.character, def.x, 3.5, def.z, { width: def.labelWidth || 4.4, size: def.labelSize || 40, depthTest: false, ...(def.labelBg ? { background: def.labelBg } : {}) });
    // 住人の下の一言。英語が無いデータもある（その時は日本語のまま出る）。
    const ja = sprite({ en: def.en || def.ja, ja: def.ja }, def.x, 2.95, def.z, { width: 6.6, size: 30, background: '#1c3b2fdd', color: '#dff0d4', depthTest: false });
    ja.visible = false;
    spots.push({ def, npc, label, ja });
  }

  let host = null, hostLabel = null;
  function construct() {
    if (built || !data) return;
    built = true;
    ground(data);
    build({ island: data, B, D, sprite, person, house, path, tree, resident, door, ground, scatter, rand, obstacles,
      shade, lamp, bush, flowers, rock, barrel, crate, bench, fence, bunting, root });
    makeBeacon();
    flushDeco();
    // 島の「かお」の キャラクター（island-cast.js）：ついた 場所の よこで むかえる。
    const st = data.start;
    host = placeHost(root, data.id, st ? st.x - 2.8 : DOCK.x + 5, st ? st.z + 1.8 : DOCK.z - 3.2);
    if (host) { const c = host.cast; hostLabel = sprite({ en: c.en, ja: c.name }, host.x, 4.1, host.z, { width: 5, size: 34 }); hostLabel.visible = false; }
    setTarget(targetId, targetAt);
  }

  // `at` lets an island point the beacon at a place that is not a building (ぼくじょう島's
  // field and pen): the id is remembered for the minimap, the coordinates for the light.
  let targetAt = null;
  const targetSpot = () => data?.spots.find((sp) => sp.id === targetId) || (targetId && targetAt ? targetAt : null);
  function setTarget(spotId, at = null) {
    targetId = spotId || '';
    targetAt = at;
    if (!beacon) return;
    const spot = targetSpot();
    beacon.visible = labelsOn && !!spot;
    if (spot) beacon.position.set(spot.x, 0, spot.z);
  }

  function update(t, player) {
    if (realTrees && root.visible) realTrees.update(t);
    if (tuftsMesh && root.visible) tuftsMesh.userData.update(t);
    if (root.visible) houses.update(t);
    if (!root.visible || !built) return;
    if (host) { const d = host.update(t, player.position.x - root.position.x, player.position.z - root.position.z); if (hostLabel) hostLabel.visible = labelsOn && d < 12; }
    for (const sp of spots) {
      const dist = Math.hypot(player.position.x - root.position.x - sp.def.x, player.position.z - root.position.z - sp.def.z);
      sp.npc.position.y = Math.sin(t * 1.4 + sp.def.x) * 0.05;
      if (dist < 14) sp.npc.rotation.y = Math.atan2(player.position.x - root.position.x - sp.def.x, player.position.z - root.position.z - sp.def.z);
      // Nameplates fade in as a child walks up to a building — unless the signs are down
      // altogether, which is what a race does (see setLabels).
      sp.label.visible = labelsOn && (sp.def.labelAlways || dist < LABEL_DISTANCE);
      sp.ja.visible = labelsOn && dist < NEAR_DISTANCE + 2;
      sp.label.position.y = 3.5 + Math.sin(t * 1.6 + sp.def.z) * 0.06;
    }
    if (beacon?.visible) {
      beacon.userData.ring.rotation.z = t * 0.8;
      beacon.userData.ring.position.y = 0.4 + Math.sin(t * 1.8) * 0.12;
    }
  }

  // Nearest spot the child is actually standing at, or null.
  function nearest(player) {
    if (!built || !root.visible) return null;
    let best = null;
    for (const sp of spots) {
      const dist = Math.hypot(player.position.x - root.position.x - sp.def.x, player.position.z - root.position.z - sp.def.z);
      if (dist <= NEAR_DISTANCE && (!best || dist < best.dist)) best = { spot: sp.def, dist };
    }
    return best;
  }

  function blocked(x, z) {
    if (!built) return false;   // nothing to collide with until the island exists
    const lx = x - root.position.x;
    const lz = z - root.position.z;
    if ((Math.abs(lx) > HX || Math.abs(lz) > HZ) && !inAnnex(lx, lz, 0.9)) return true;
    return obstacles.some((o) => Math.abs(lx - o.x) < o.w + 0.35 && Math.abs(lz - o.z) < o.d + 0.35);
  }

  // 右上の ちいさな 地図（全島 共通）：点ではなく、2D の 地図のような 絵 ─ 海・すなはま・草・道・水辺・
  // 建物の 床・場所ごとの 色の まるに 絵・オレンジの「きみ」。陸と 道と 建物は 動かないので 1 回だけ
  // 下絵（mapBase）に 描き、毎フレームは 場所の まると 自分だけ 描く。
  const hex = (n, fallback) => (n === undefined || n === null ? fallback : '#' + Number(n).toString(16).padStart(6, '0'));
  const MAP_K = Math.min(172 / (2 * (HX + 3)), 128 / (2 * (HZ + 3)));
  const mx = (x) => 90 + x * MAP_K;
  const my = (z) => 72 + z * MAP_K;
  function paintBase() {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 280;   // 2 倍の こまかさ（描く 座標は 180×140 の まま）
    const g = c.getContext?.('2d');
    if (!g || !g.fillRect || !g.roundRect || !g.ellipse) return null;
    g.scale?.(2, 2);
    const k = MAP_K;
    // 海は こい 緑の 夜空（異次元・ブランド色）。島の 形が はっきり 見える。
    g.fillStyle = '#0f3a34'; g.fillRect(0, 0, 180, 140);
    g.fillStyle = '#fff4d6'; for (let i = 0; i < 26; i += 1) g.fillRect((i * 53) % 180, (i * 37) % 140, 0.8, 0.8);
    // 波打ちぎわの うすい 輪。
    g.fillStyle = '#2f8f7a';
    for (const [x, z, beach] of mapTiles) if (beach) g.fillRect(mx(x - 1.8), my(z - 1.8), 3.6 * k, 3.6 * k);
    const grass = hex(data.grassTop ?? data.grass, '#a9cf7c');
    for (const [x, z, beach] of mapTiles) {
      g.fillStyle = beach ? '#e8d6a8' : grass;
      g.fillRect(mx(x - 1.02), my(z - 1.02), 2.04 * k + 0.5, 2.04 * k + 0.5);
    }
    // 水辺（つり島の 池・川・さんばし）。
    const w = data.water;
    if (w) {
      g.fillStyle = '#6fb7c9'; g.strokeStyle = '#6fb7c9';
      if (w.pond) { g.beginPath(); g.ellipse(mx(w.pond.x), my(w.pond.z), w.pond.rx * k, w.pond.rz * k, 0, 0, Math.PI * 2); g.fill(); }
      if (w.river?.length) {
        g.lineWidth = 4.2 * k; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
        w.river.forEach(([x, z], i) => (i ? g.lineTo(mx(x), my(z)) : g.moveTo(mx(x), my(z))));
        g.stroke();
      }
      if (w.pier) { g.fillStyle = '#b7905f'; g.fillRect(mx(w.pier.x0), my(w.pier.z - 1), (w.pier.x1 - w.pier.x0) * k, 2 * k); }
    }
    // 道。
    g.strokeStyle = '#d8c9a0'; g.lineWidth = Math.max(2, 2 * k); g.lineCap = 'round';
    for (const [ax, az, bx, bz] of mapPaths) { g.beginPath(); g.moveTo(mx(ax), my(az)); g.lineTo(mx(bx), my(bz)); g.stroke(); }
    // 船着き場。
    g.fillStyle = '#b7905f';
    g.fillRect(mx(DOCK.x - 3.5), my(DOCK.z), 7 * k, 7.7 * k);
    // 建物の 床（木や 岩など 小さい 当たり判定は 描かない）。
    for (const o of obstacles) {
      if (o.w < 1.6 || o.d < 1.6) continue;
      g.fillStyle = '#efe2c6';
      g.beginPath(); g.roundRect(mx(o.x - o.w), my(o.z - o.d), 2 * o.w * k, 2 * o.d * k, 2); g.fill();
      g.strokeStyle = '#c9b48c'; g.lineWidth = 0.8; g.stroke();
    }
    return c;
  }
  const KIND_ICON = {
    plaza: '⛲', library: '📚', abc: '🔤', shop: '🛒', hut: '📖', gym: '💪', booth: '💬', avatar: '🦸', hat: '🎩', face: '👓', back: '🎒', chest: '🏅',
    puyo: '🟢', suika: '🍉', barn: '🐄', field: '🌱', kitchen: '🍳', ship: '🚢', ferry: '⛵', board: '📋', office: '🏠',
    pond: '🎣', river: '🎣', sea: '🎣', interview: '🎤', speaking: '🗣', writing: '✏️', reading: '📖', listening: '🎧',
    start: '🏁', gate: '🚩', door: '🚪', furniture: '🛋', agent: '🏡', blockwild: '⛏', dojo: '🥋', stand: '🏟', pvp: '⚔',
    meadow: '🐾', nest: '🥚',
  };
  const KIND_COLOR = {
    plaza: '#e0a526', shop: '#e27a2d', hut: '#e27a2d', gym: '#c8553d', booth: '#4fae6b', puyo: '#3aa35b', suika: '#d94b5b',
    pond: '#1f8aa6', river: '#1f8aa6', sea: '#1f8aa6', interview: '#7a5cc8', start: '#1b3a2f', gate: '#7a5cc8',
    blockwild: '#b5603a', ferry: '#5a7fb0', office: '#5a7fb0', board: '#8a9a4a',
  };
  function drawMap(ctx, player) {
    if (!built || !root.visible) return false;
    if (!mapBase) mapBase = paintBase();
    ctx.clearRect(0, 0, 180, 140);
    if (mapBase && ctx.drawImage) ctx.drawImage(mapBase, 0, 0, 180, 140);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const sp of spots) {
      const def = sp.def;
      const target = def.id === targetId;
      const x = mx(def.x); const y = my(def.z);
      const r = target ? 8.2 : 6.8;
      if (target) { const pulse = 2.5 + Math.sin(Date.now() / 260) * 1.5; ctx.fillStyle = '#ffb06677'; ctx.beginPath(); ctx.arc(x, y, r + 2 + pulse, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = target ? '#ffb066' : '#fff4d6';
      ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = KIND_COLOR[def.kind] || (def.color !== undefined ? hex(def.color) : '#4fae6b');
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.font = '9px sans-serif';
      ctx.fillText(def.icon || KIND_ICON[def.kind] || (/\p{Extended_Pictographic}/u.test(def.tone || '') ? def.tone : '💬'), x, y + 0.5);
    }
    // 光の 柱が 建物でない 場所（ぼくじょうの 畑など）を さしているとき。
    if (targetAt && !data.spots.some((sp) => sp.id === targetId)) {
      ctx.fillStyle = '#ffd246'; ctx.beginPath(); ctx.arc(mx(targetAt.x), my(targetAt.z), 4, 0, Math.PI * 2); ctx.fill();
    }
    // きみ（オレンジ）。
    const me = { x: player.position.x - root.position.x, z: player.position.z - root.position.z };
    const beat = 6.5 + Math.sin(Date.now() / 300) * 1.6;
    ctx.fillStyle = '#e27a2d55'; ctx.beginPath(); ctx.arc(mx(me.x), my(me.z), beat, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx(me.x), my(me.z), 4.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e27a2d'; ctx.beginPath(); ctx.arc(mx(me.x), my(me.z), 3.4, 0, Math.PI * 2); ctx.fill();
    // 島の 名前（ミニマップは 毎フレーム 描き直すので、焼き直しの 仕掛けは 要らない）。
    const name = isJa() ? data.name : (data.en || data.name);
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
    const tw = ctx.measureText?.(name)?.width ?? name.length * 5;
    ctx.fillStyle = '#0c241ce6'; ctx.fillRect(3, 2, tw + 11, 14);
    ctx.fillStyle = '#ffb066'; ctx.fillRect(3, 2, 2.4, 14);
    ctx.fillStyle = '#fff4d6'; ctx.fillText(name, 9, 9.5);
    return true;
  }

  return {
    get data() { return data; },
    get spots() { return data?.spots || []; },
    get target() { return targetId; },
    get visible() { return root.visible; },
    // Called once the island's data file has arrived.
    receive(d) { data = d; if (wanted) { construct(); root.visible = true; } },
    show(on) {
      wanted = !!on;
      if (on) construct();
      root.visible = !!on && built;
      if (!on && beacon) beacon.visible = false; else setTarget(targetId);
    },
    // The island's own signs — its name over the jetty, the label on every building. They
    // are how a child finds their way around on foot, and they are in the way of a race:
    // the chase camera is eight metres from the ground, where a sign written to be read
    // from thirty fills half the screen.
    repaintLabels() { for (const s2 of labels) s2.userData.repaint?.(); },
    // いま看板に焼かれている文字。言語を疑ったときに 外から読める1か所。
    get signs() { return labels.map((s2) => s2.userData.signText || ''); },
    setLabels(on) {
      labelsOn = !!on;
      for (const s2 of labels) s2.visible = labelsOn;
      // The pillar of light that points at the building a child is being sent to belongs
      // to walking around; a race has its own thing to drive at.
      if (beacon) beacon.visible = labelsOn && !!targetSpot();
    },
    setTarget, update, nearest, blocked, drawMap, doorNear, setNight,
    setHouseLit: (x, z, on) => houses.setLit(x, z, on),
    get doors() { return doors.map((d) => ({ id: d.def.id, x: d.x, z: d.z })); },
    origin: () => ({ x: root.position.x, z: root.position.z }),
    // 着いたときに立つ場所（船着き場の陸がわ）。rpg.activate が使う。
    arrival: { x: DOCK.x, z: DOCK.z },
  };
}
