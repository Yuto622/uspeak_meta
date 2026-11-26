// 島と 島を つなぐ 橋（2026-11）：絵・歩ける はんい・まんなかでの きりかえ・となりの 島を 見せる・しまって いる 門。
//
// 表は bridges-data.js（LINKS）。U-Speak島 ⇔ メインの島 の 1 本だけは 前から ある bridge.js の まま（ここは 道しるべだけ 立てる）。
//
// ・**歩ける はんい**：いまの 島から 出て いる 橋の 板の 上は、どの 島の 当たり判定よりも 先に「歩ける」
//   （game.js の `blocked` が さいしょに `bridges.blocked` を 聞く）。板の 外は いまの 島の 当たり判定の まま＝海には おちない。
// ・**きりかえ**：まんなかを 1 歩 こえたら `rpg.activate(となり, false, true)`。ひこうきも 読みこみも ない。
//   テーマパークは `park.arrive()` で 中の しるし（inPark）を そろえる（立つ 場所は うごかさない）。
// ・**見せる 島は 2 つまで**：いまの 島 ＋ 橋の むこうの 島（橋の 上に いる 間と、橋の たもとの 近く）。
//   むこうの 島は `show(true)` の あと `asPeer(true)`（island-kit.js）＝ 絵だけ 出て、ミニマップ・戸口は いまの 島の まま。
//   ぼうけんの ちいきは rpg-world.js が 毎フレーム かくすので、その あとで 出しなおす（game.js は rpg.update の あとに ここを 呼ぶ）。
// ・**しまって いる 島**（プレミアム・まだ ひらいて いない ちいき・幼児モードで 行けない 島）は、まんなかに 門。
//   門の 手前までは 歩けて、むこう半分は 当たり判定。ぶつかったら いつもの お知らせ。
// ・**描く 回数**：橋 1 本＝ 木と 石を まとめた 1 回 ＋ あかり 1 回（＋ 道しるべの 札 2 まい）。長さは 関係ない。
//   あかりは 夜に emissive だけ 強く する（光源は 足さない）。
import * as THREE from './three.module.js';
import { LINKS, linksOf, otherEnd, project, onDeck, deckY, pointAt, drawBridgeStubs, REST_HALF, REST_WIDE } from './bridges-data.js';
import { REGION_BY_ID } from './rpg-data.js';
import { KIDS_ISLANDS, kidsOn } from './kids.js';
import { t as tr, isJa, onLangChange } from './i18n.js';

const SIGN_BOOST = globalThis.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 1;
const NEAR_HEAD = 20;    // 橋の たもとに これだけ 近づいたら むこうの 島を 出す
const FAR_HEAD = 30;     // これだけ はなれたら しまう（出たり 消えたりを ふせぐ あそび）
const GATE_GAP = 1.1;    // 門の 手前で 止まる きょり

const WOOD = [0xa0703f, 0x96683a, 0xab7a48, 0x8f6236];
const DARK = 0x6b4826, RAIL = 0x8a5f33, STONE_A = 0x8d9aa0, STONE_B = 0x9a9585, ROPE = 0xd9c08a;

export function createBridges({ scene, player, camera, rpg, park, atmosphere, toast, busy = () => false }) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb84d, emissiveIntensity: 0.3, roughness: 0.6 });
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const signs = [];
  onLangChange(() => { for (const s of signs) s.userData.repaint(); });

  const nameOf = (id) => { const r = REGION_BY_ID[id]; return r ? { en: r.en || r.name, ja: r.yomi || r.name } : { en: id, ja: id }; };

  // 札（canvas に 焼いた 絵）。island-kit.js の sprite と 同じ 見た目。`text` は { en, ja }、あとから かえられる。
  function sprite(parent, text, x, y, z, { width = 8.4, background = '#183946', color = '#f3dfaa', size = 38 } = {}) {
    const c = document.createElement('canvas'); c.width = 768; c.height = 100;
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.userData.text = text;
    s.userData.repaint = () => {
      if (!ctx?.fillText) return;
      const tx = s.userData.text; const now = (isJa() ? tx.ja : tx.en) || tx.ja || tx.en || '';
      ctx.clearRect(0, 0, 768, 100);
      ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect?.(4, 4, 760, 92, 18); ctx.fill();
      ctx.fillStyle = color;
      let fs = Math.round(size * SIGN_BOOST); ctx.font = `600 ${fs}px sans-serif`;
      while (fs > 22 && ctx.measureText(now).width > 700) { fs -= 2; ctx.font = `600 ${fs}px sans-serif`; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(now, 384, 53, 720);
      s.userData.signText = now; tex.needsUpdate = true;
    };
    s.userData.repaint();
    s.position.set(x, y, z); s.scale.set(width, width / 7.68, 1); s.renderOrder = 1;
    parent.add(s); signs.push(s);
    return s;
  }

  // 箱を あつめて 1 回で 描く（色は 箱ごと）。
  function batch(parent, material) {
    const list = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    return {
      add(x, y, z, w, h, d, color = 0xffffff) { list.push([x, y, z, w, h, d, color]); },
      flush({ shadow = true } = {}) {
        if (!list.length) return null;
        const mesh = new THREE.InstancedMesh(box, material, list.length);
        list.forEach(([x, y, z, w, h, d, color], i) => {
          m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d)); mesh.setMatrixAt(i, m4);
          mesh.setColorAt(i, col.setHex(color));
        });
        mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = shadow; mesh.receiveShadow = true;
        mesh.computeBoundingSphere?.(); mesh.computeBoundingBox?.();
        parent.add(mesh);
        return mesh;
      },
    };
  }

  // 橋 1 本。group の 中では +z が 橋の 向き（a → b）、+x が 横（bridges-data.js の w と 同じ 向き）。
  const built = new Map();
  function build(l) {
    if (built.has(l.id)) return built.get(l.id);
    const g = new THREE.Group(); g.name = `bridge:${l.id}`;
    g.position.set(l.from.x, 0, l.from.z); g.rotation.y = Math.atan2(l.ux, l.uz);
    const entry = { l, group: g, gate: null, gateSign: null, lockKind: '' };
    const post = (b, w, s, y0 = 0) => { b.add(w, y0 + 1.5, s, 0.26, 3.0, 0.26, DARK); b.add(w, y0 + 3.05, s, 0.9, 0.12, 0.5, RAIL); };
    const A = nameOf(l.a), B = nameOf(l.b);
    if (l.legacy) {
      // 前から ある 橋：道しるべだけ（板・手すりは bridge.js）。
      const b = batch(g, bodyMat); const w = l.half + 1.7;
      post(b, w, 1.2); post(b, w, l.len - 1.2);
      b.flush();
      sprite(g, { en: `→ ${B.en}`, ja: `→ ${B.ja}` }, w, 4.0, 1.2);
      sprite(g, { en: `→ ${A.en}`, ja: `→ ${A.ja}` }, w, 4.0, l.len - 1.2);
    } else {
      const b = batch(g, bodyMat), glow = batch(g, glowMat);
      const H = l.half, mid = l.len / 2;
      const inRest = (s) => l.rest && Math.abs(s - mid) <= REST_HALF;
      const edge = (s) => (inRest(s) ? REST_WIDE : H);
      // 板：横に わたす。色を 少しずつ かえて、すきまを あける。
      const n = Math.max(2, Math.round(l.len / 0.82)), step = l.len / n;
      for (let i = 0; i < n; i += 1) {
        const s = (i + 0.5) * step;
        b.add(0, deckY(l, s) - 0.07, s, edge(s) * 2 + 0.36, 0.14, step - 0.1, WOOD[(i * 7 + (i >> 2)) % WOOD.length]);
      }
      // 板の 下の けた（2 本）と、石の 橋げた。
      const seg = Math.max(1, Math.round(l.len / 4)), sl = l.len / seg;
      for (let i = 0; i < seg; i += 1) {
        const s = (i + 0.5) * sl;
        for (const sx of [-1, 1]) b.add(sx * (H - 0.35), deckY(l, s) - 0.3, s, 0.3, 0.3, sl + 0.04, DARK);
      }
      const piers = Math.max(1, Math.round(l.len / 11));
      for (let i = 0; i < piers; i += 1) {
        const s = (i + 0.5) * (l.len / piers);
        if (s < 2.5 || s > l.len - 2.5) continue;
        const top = deckY(l, s) - 0.45, tone = i % 2 ? STONE_A : STONE_B, e = edge(s);
        for (const sx of [-1, 1]) {
          b.add(sx * (e - 0.25), (top - 4.4) / 2, s, 0.72, top + 4.4, 0.72, tone);
          b.add(sx * (e - 0.25), -1.45, s, 1.15, 0.7, 1.15, i % 2 ? STONE_B : STONE_A);
        }
        b.add(0, top - 0.13, s, e * 2 + 0.5, 0.3, 0.6, DARK);
      }
      // 手すり：柱 → 上と 中の 横木。まんなかの 台では 外へ ひろがる。
      const runs = l.rest ? [[0.3, mid - REST_HALF, H], [mid - REST_HALF, mid + REST_HALF, REST_WIDE], [mid + REST_HALF, l.len - 0.3, H]] : [[0.3, l.len - 0.3, H]];
      for (const [s0, s1, e] of runs) {
        const k = Math.max(1, Math.round((s1 - s0) / 2.4)), d = (s1 - s0) / k;
        for (const sx of [-1, 1]) {
          const x = sx * (e + 0.12);
          for (let i = 0; i <= k; i += 1) { const s = s0 + i * d; b.add(x, deckY(l, s) + 0.5, s, 0.2, 1.14, 0.2, DARK); }
          for (let i = 0; i < k; i += 1) {
            const s = s0 + (i + 0.5) * d, y = deckY(l, s);
            b.add(x, y + 1.06, s, 0.16, 0.1, d + 0.02, RAIL);
            b.add(x, y + 0.58, s, 0.08, 0.08, d + 0.02, ROPE);
          }
        }
      }
      if (l.rest) {
        // 台の かど：手すりを 横に とじる。ベンチ 2 つ。
        for (const s of [mid - REST_HALF, mid + REST_HALF]) for (const sx of [-1, 1]) {
          const w = REST_WIDE - H, x = sx * (H + w / 2 + 0.12), y = deckY(l, s);
          b.add(x, y + 1.06, s, w, 0.1, 0.16, RAIL); b.add(x, y + 0.58, s, w, 0.08, 0.08, ROPE);
        }
        const y = deckY(l, mid);
        for (const sx of [-1, 1]) {
          const x = sx * (REST_WIDE - 0.55);
          b.add(x, y + 0.5, mid, 0.62, 0.12, 2.6, WOOD[2]);
          b.add(x + sx * 0.3, y + 0.92, mid, 0.1, 0.62, 2.6, WOOD[0]);
          for (const dz of [-1.1, 1.1]) b.add(x, y + 0.24, mid + dz, 0.5, 0.44, 0.14, DARK);
        }
      }
      // あかり：両はし ＋ とちゅう（左右 こうご）。光るのは ちいさい 箱だけ。
      const lampAt = (s, sx) => {
        const x = sx * (edge(s) + 0.12), y = deckY(l, s);
        b.add(x, y + 1.45, s, 0.22, 2.9, 0.22, DARK);
        b.add(x, y + 3.2, s, 0.6, 0.1, 0.6, DARK);
        glow.add(x, y + 2.92, s, 0.42, 0.44, 0.42);
      };
      for (const sx of [-1, 1]) { lampAt(0.5, sx); lampAt(l.len - 0.5, sx); }
      const lamps = Math.floor(l.len / 13);
      for (let i = 1; i < lamps; i += 1) lampAt(i * (l.len / lamps), i % 2 ? 1 : -1);
      if (l.rest) for (const sx of [-1, 1]) for (const s of [mid - REST_HALF, mid + REST_HALF]) lampAt(s, sx);
      // 道しるべ（両はし）。板の よこの 岸に 立つ。
      const w = H + 1.9;
      post(b, w, 1.0); post(b, w, l.len - 1.0);
      b.flush(); glow.flush({ shadow: false });
      sprite(g, { en: `→ ${B.en}`, ja: `→ ${B.ja}` }, w, 4.0, 1.0);
      sprite(g, { en: `→ ${A.en}`, ja: `→ ${A.ja}` }, w, 4.0, l.len - 1.0);
      // しまって いる ときの 門（まんなか）。いる ときだけ 出す。
      const gate = new THREE.Group(); gate.visible = false; g.add(gate);
      const gb = batch(gate, gateMat), gy = deckY(l, mid), ge = edge(mid);
      for (const sx of [-1, 1]) { gb.add(sx * (ge - 0.1), gy + 1.7, mid, 0.42, 3.4, 0.42, DARK); gb.add(sx * (ge - 0.1), gy + 3.5, mid, 0.62, 0.2, 0.62, RAIL); }
      gb.add(0, gy + 3.25, mid, ge * 2, 0.34, 0.34, DARK);
      for (let i = 0; i < 9; i += 1) { const x = -ge + 0.5 + i * ((ge * 2 - 1) / 8); gb.add(x, gy + 1.25, mid, 0.16, 2.3, 0.16, i % 2 ? 0xe27a2d : 0xf3dfaa); }
      gb.add(0, gy + 2.3, mid, ge * 2 - 0.4, 0.2, 0.22, DARK); gb.add(0, gy + 0.35, mid, ge * 2 - 0.4, 0.2, 0.22, DARK);
      gb.flush();
      entry.gate = gate;
      entry.gateSign = sprite(gate, { en: '🔒', ja: '🔒' }, 0, gy + 4.25, mid, { width: 8.4, background: '#5b2333', color: '#ffe9c2' });
    }
    g.visible = false;
    scene.add(g);
    built.set(l.id, entry);
    return entry;
  }

  // ---- 行けるか ---------------------------------------------------------------------
  function lockOf(id) {
    try {
      if ((rpg.premiumLock || []).includes(id)) return { kind: 'premium', id };
      if (kidsOn() && !KIDS_ISLANDS.includes(id) && id !== 'willow') return { kind: 'kids', id };
      const r = REGION_BY_ID[id];
      if (r && !r.hub && !rpg.store.unlocked(id)) return { kind: 'progress', id };
    } catch { /* まだ 用意の とちゅう */ }
    return null;
  }
  const GATE_TEXT = {
    premium: { en: '🔒 Premium island', ja: '🔒 プレミアムの しまです' },
    kids: { en: '🔒 Not open now', ja: '🔒 ここは また こんどね' },
    progress: { en: '🔒 Not open yet', ja: '🔒 まだ ひらいて いないよ' },
  };
  function notice(lock) {
    if (lock.kind === 'premium') {
      // いつもの 🔒 の 画面（premium.js）だけ。しまの ちずと 同じ。toast は 出さない：
      // 画面が ひらいて いると toast は その 中へ うつされ、つぎに 画面を 書きなおした ときに #toast ごと 消えて しまう。
      dispatchEvent(new CustomEvent('uspeak:premium', { detail: lock.id }));
    } else if (lock.kind === 'kids') toast(tr('🔒 この はしの むこうは また こんどね。'));
    else {
      const r = REGION_BY_ID[lock.id];
      toast(tr('ひらく じょうけん：{what}', { what: (r.needs || []).map((n) => tr('{where}の 物語 ＋ さがす もくひょう', { where: isJa() ? REGION_BY_ID[n].name : REGION_BY_ID[n].en || REGION_BY_ID[n].name })).join(' ＋ ') }));
    }
  }

  const active = () => !busy() && !rpg.state.busy && !rpg.interiorScene && !rpg.insidePark && !park.state.busy;
  const myLinks = () => linksOf(rpg.state.current);
  const deckUnder = (x, z, pad) => { for (const l of myLinks()) if (!l.legacy && onDeck(l, x, z, pad)) return l; return null; };
  // いまの 島から 見て、門より むこうか。
  const beyondGate = (l, s) => (l.a === rpg.state.current ? s : l.len - s) > l.len / 2 - GATE_GAP;

  // ---- 当たり判定（game.js の blocked が さいしょに 聞く）---------------------------
  const asked = [];   // この フレームに 聞かれた 場所（手すりに そって すべらせる ために 使う）
  let bump = null, bumpLatch = null;
  function blocked(x, z) {
    if (!active()) return null;
    if (asked.length < 24) asked.push(x, z);
    const l = deckUnder(x, z, 0.6);
    if (!l) {
      // 手すり：海の 上の 板に 立って いる 間は、板の 外へ 出られない（島の 四角い 当たり判定の かどは 海の 上まで 歩けて しまうので）。
      const here = deckUnder(player.position.x, player.position.z, 0);
      if (here) { const s = project(here, player.position.x, player.position.z).s; if (s > 3.5 && s < here.len - 3.5) return true; }
      return null;
    }
    const lock = lockOf(otherEnd(l, rpg.state.current));
    if (lock && beyondGate(l, project(l, x, z).s)) { bump = { l, lock }; return true; }
    return false;
  }

  // ---- むこうの 島を 見せる ---------------------------------------------------------
  let peer = '';
  const isKit = (id) => !!rpg[id]?.show && id !== 'park';
  function showPeer(id) {
    if (!id || id === rpg.state.current) return;
    if (isKit(id)) { const isl = rpg[id]; if (!isl.visible) { isl.show(true); isl.asPeer?.(true); } return; }
    const r = REGION_BY_ID[id];
    if (r && !r.hub) { const d = rpg.world.build(id); if (d?.root) d.root.visible = true; }
  }
  function hidePeer(id) {
    const cur = rpg.state.current;
    if (!id || id === cur) return;
    if (id === 'main' && cur === 'willow') return;   // U-Speak島からは メインの島が いつも 見えて いる（rpg.activate）
    if (isKit(id) && rpg[id].visible) rpg[id].show(false);
  }
  function headNear(x, z) {
    let best = null;
    for (const l of myLinks()) {
      const end = l.a === rpg.state.current ? l.from : l.to;
      const d = Math.hypot(x - end.x, z - end.z);
      const other = otherEnd(l, rpg.state.current);
      if (d < (other === peer ? FAR_HEAD : NEAR_HEAD) && (!best || d < best.d)) best = { d, other };
    }
    return best?.other || '';
  }

  // ---- まんなかで 島を きりかえる ---------------------------------------------------
  function switchTo(next) {
    const px = player.position.x, py = player.position.y, pz = player.position.z, cam = camera.position.clone();
    if (park.state.inPark !== (next === 'park')) {
      // テーマパークの 中か 外か（当たり判定・右の パネル）。arrive は ひこうきで ついた 場所に 立たせるので、もとの 場所に もどす。
      park.arrive(next === 'park');
      player.position.set(px, py, pz); camera.position.copy(cam);
    }
    rpg.activate(next, false, true);
    rpg[next]?.asPeer?.(false);
    try { rpg.store.visit(next); } catch { /* 行った ことの しるしだけ */ }
    const r = REGION_BY_ID[next];
    if (r && !r.hub) { try { rpg.adventure?.onFlight?.(next); } catch { /* ものがたりの 進み */ } }
    dispatchEvent(new CustomEvent('uspeak:bridge', { detail: { to: next } }));
  }

  const last = { x: NaN, z: NaN };
  let on = null;
  function update(t, dt) {
    const px0 = player.position.x, pz0 = player.position.z;
    const ok = active();
    // 手すりに そって すべる：ななめの 橋で まっすぐ 押しても 止まらない ように。
    // game.js は「いまの 場所 → x だけ 動いた 場所 → z だけ 動いた 場所」の 順に 聞く。動けなかった ぶんを 橋の 向きに なおす。
    // （ほかの ものが 先に 聞いて いても よい ように、「さっきの 場所」から はじまる 3 つを さがす。）
    let ai = -1;
    if (ok) for (let i = 0; i + 5 < asked.length; i += 2) if (Math.abs(asked[i] - last.x) < 1e-6 && Math.abs(asked[i + 1] - last.z) < 1e-6 && Math.abs(asked[i + 3] - last.z) < 1e-6) { ai = i; break; }
    if (ai >= 0) {
      const wx = asked[ai + 2] - asked[ai], wz = asked[ai + 5] - asked[ai + 1], want = Math.hypot(wx, wz);
      const moved = Math.hypot(px0 - last.x, pz0 - last.z);
      const l = want > 1e-5 && want < 2 && moved < want * 0.8 ? deckUnder(last.x, last.z, 0) : null;
      if (l) {
        const p = project(l, last.x, last.z), along = wx * l.ux + wz * l.uz, side = wx * l.uz - wz * l.ux;
        const lim = (l.rest && Math.abs(p.s + along - l.len / 2) <= REST_HALF - 0.3 ? REST_WIDE : l.half) - 0.08;
        const s1 = p.s + along, w1 = Math.max(-lim, Math.min(lim, p.w + side));
        if (Math.abs(along) > want * 0.2 && s1 > 0.4 && s1 < l.len - 0.4) {
          const q = pointAt(l, s1, w1);
          const lock = lockOf(otherEnd(l, rpg.state.current));
          if (!(lock && beyondGate(l, s1))) { player.position.x = q.x; player.position.z = q.z; }
        }
      }
    }
    asked.length = 0;
    const px = player.position.x, pz = player.position.z;
    const cur0 = rpg.state.current;
    on = ok ? deckUnder(px, pz, 0.2) : null;
    if (on) {
      const { s } = project(on, px, pz);
      const d = on.a === cur0 ? s : on.len - s;
      if (d > on.len / 2 + 1) { const next = otherEnd(on, cur0); if (!lockOf(next)) switchTo(next); }
      // 足もとを 板の 高さに（島の 地面は 0.2）。
      const ramp = Math.max(0, Math.min(1, Math.min(s, on.len - s) / 1.5));
      player.position.y += (deckY(on, s) - 0.2) * ramp;
    }
    const cur = rpg.state.current;
    // むこうの 島。
    const want = ok ? (on ? otherEnd(on, cur) : headNear(px, pz)) : '';
    if (peer && peer !== want) hidePeer(peer);
    peer = want;
    if (peer) showPeer(peer);
    // 橋の 絵：いまの 島の 橋 ＋ むこうの 島の 橋。門は いまの 島の 橋だけ。
    for (const l of LINKS) {
      const mine = l.a === cur || l.b === cur;
      const show = mine || (!!peer && (l.a === peer || l.b === peer));
      const e = built.get(l.id) || (show ? build(l) : null);
      if (!e) continue;
      e.group.visible = show;
      if (!e.gate) continue;
      const lock = show && mine ? lockOf(otherEnd(l, cur)) : null;
      e.gate.visible = !!lock;
      if (lock && e.lockKind !== lock.kind) { e.lockKind = lock.kind; e.gateSign.userData.text = GATE_TEXT[lock.kind]; e.gateSign.userData.repaint(); }
    }
    glowMat.emissiveIntensity = 0.25 + 1.7 * (atmosphere?.state?.night || 0);
    // 門に ぶつかった お知らせ（はなれるまで 1 回だけ）。
    if (bumpLatch && Math.hypot(px - bumpLatch.x, pz - bumpLatch.z) > 5) bumpLatch = null;
    if (bump) { if (!bumpLatch && ok) { bumpLatch = { x: px, z: pz }; notice(bump.lock); } bump = null; }
    last.x = player.position.x; last.z = player.position.z;
  }

  // カメラ（game.js）：U-Speak島は カメラが 島の まんなかへ 寄る 作り。橋の 上では 体に ついて いく ように、0〜1 を 返す。
  function follow() {
    if (!on) return 0;
    const cur = rpg.state.current, { s } = project(on, player.position.x, player.position.z);
    return Math.max(0, Math.min(1, (on.a === cur ? s : on.len - s) / 10));
  }

  // ミニマップ（game.js）：島の 絵を 自分で 描く 島（U-Speak島・テーマパーク・ぼうけんの ちいき）に 橋の ねもとを 足す。
  // island-kit の 島と メインの島は 下絵に 入って いる（drawBridgeStubs を じぶんで 呼ぶ）。
  function mapOverlay(ctx) {
    try {
      const cur = rpg.state.current;
      if (rpg.interiorScene || rpg.insidePark) return;
      if (cur === 'willow') drawBridgeStubs(ctx, cur, (x) => 90 + x * 2.6, (z) => 70 + z * 2.1, { x: 0, z: 0 }, 7);
      else if (cur === 'park') drawBridgeStubs(ctx, cur, (x) => 90 + x * 2.36, (z) => 68.5 + z * 1.81, { x: 135, z: 0 }, 5);
      else { const r = REGION_BY_ID[cur]; if (r && !r.hub) drawBridgeStubs(ctx, cur, (x) => 90 + x * 2.1, (z) => 70 + z * 1.8, { x: r.x, z: r.z }, 5); }
    } catch { /* 地図の かざり */ }
  }

  return {
    blocked, update, follow, lockOf, build, mapOverlay,
    get on() { return on; }, get peer() { return peer; },
    get links() { return LINKS; },
    // QA：いま 出て いる 橋の id。
    get visible() { return [...built.values()].filter((e) => e.group.visible).map((e) => e.l.id); },
    entry: (id) => built.get(id) || null,
  };
}
