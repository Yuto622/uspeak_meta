// 夜のおばけ — the ghosts of Willow Island, and the sky they come out under.
//
// Nothing here decides anything. The sky is read from the shared clock (`world-clock.js`),
// the list of ghosts that are out comes from the server, and swinging the wand is a
// request the server may refuse. What this module does is make the night a place: twelve
// small ghosts drifting over the grass, each holding one English word.
//
// Made for children: no blood, no chasing, no losing. Touching a ghost does nothing at
// all — you have to walk up and swing.
import * as THREE from './three.module.js';
import { phaseAt } from './world-clock.js';

const GLOW = 0xdff0ff;

export function createNight({ scene, player, send, isOnline, toast, speak, learn, serverNow }) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const state = { phase: 'day', night: 0, data: null, out: new Set(), swingAt: 0, caught: null };
  const ghosts = new Map();   // id -> { data, group, body, plate, popped }

  // ---- building ------------------------------------------------------------------

  function plate(text, width = 3.1) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(18,32,52,.82)';
    ctx.beginPath(); ctx.roundRect(6, 8, 500, 112, 26); ctx.fill();
    ctx.fillStyle = '#e8f4ff';
    ctx.font = '700 54px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66, 470);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Nameplates opt out of depth so a child can always read the word they are chasing.
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.scale.set(width, width / 4, 1);
    s.renderOrder = 4;
    return s;
  }

  function build(data) {
    state.data = data;
    const bodyGeo = new THREE.SphereGeometry(0.52, 14, 12);
    const tailGeo = new THREE.ConeGeometry(0.5, 0.8, 12);
    const eyeGeo = new THREE.SphereGeometry(0.075, 8, 8);
    for (const g of data.ghosts) {
      const group = new THREE.Group();
      group.position.set(g.x, 0, g.z);
      const tint = g.pumpkin ? 0xff9c45 : GLOW;
      const skin = new THREE.MeshStandardMaterial({
        color: tint, emissive: tint, emissiveIntensity: g.pumpkin ? 0.7 : 0.42,
        transparent: true, opacity: 0.82, roughness: 0.6,
      });
      const body = new THREE.Group();
      body.position.y = 1.9;
      const head = new THREE.Mesh(bodyGeo, skin);
      const tail = new THREE.Mesh(tailGeo, skin);
      tail.position.y = -0.62; tail.rotation.x = Math.PI;
      const eyes = new THREE.Group();
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b2a3a });
      for (const x of [-0.19, 0.19]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(x, 0.08, 0.46);
        eyes.add(eye);
      }
      // A smile, so nobody is ever frightened of one of these.
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.033, 6, 12, Math.PI), eyeMat);
      smile.position.set(0, -0.09, 0.46);
      smile.rotation.z = Math.PI;
      body.add(head, tail, eyes, smile);
      if (g.pumpkin) {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0x5f7a3c }));
        stalk.position.y = 0.6;
        body.add(stalk);
      }
      // Only the pumpkins carry a light. Twelve point lights on the same island is a
      // real cost on a classroom iPad, and the rest read well enough from their own glow.
      let lamp = null;
      if (g.pumpkin) {
        lamp = new THREE.PointLight(tint, 0, 5, 2);
        lamp.position.y = 0.1;
        body.add(lamp);
      }
      const label = plate(g.word);
      label.position.y = 1.05;
      body.add(label);
      group.add(body);
      root.add(group);
      ghosts.set(g.id, { data: g, group, body, lamp, skin, label, popped: 0, phase: Math.random() * Math.PI * 2 });
    }
  }

  // The data is fetched once, and the world is only built if it arrives: a night with no
  // ghosts is a quiet night, not a broken page.
  const ready = fetch('night.json').then((r) => r.json()).then(build).catch((err) => {
    console.warn('[night] no ghosts tonight:', err.message);
  });

  // ---- what the server says ------------------------------------------------------

  function setGhosts(ids) {
    state.out = new Set(Array.isArray(ids) ? ids : []);
    for (const [id, g] of ghosts) g.group.visible = state.out.has(id);
  }

  function setPhase(world) {
    if (!world) return;
    state.phase = world.id;
    if (Array.isArray(world.ghosts)) setGhosts(world.ghosts);
    if (world.id !== 'night') setGhosts([]);
  }

  // A ghost caught by anyone: it pops where it stood, so the class sees each other work.
  function pop(id) {
    const g = ghosts.get(id);
    if (!g) return;
    g.popped = 0.55;
    state.out.delete(id);
  }

  function onCaught(m) {
    pop(m.id);
    speak(m.word);
    learn(m.word, m.ja);
    toast(m.coins ? `${m.word}（${m.ja}）· ◈ ${m.coins}` : `${m.word}（${m.ja}）· 今夜のコインは いっぱいです`);
  }

  function onError(m) {
    if (m.reason === 'too far') toast('もう少し 近づいて 杖を ふろう。');
    else if (m.reason === 'already gone') toast('だれかが 先に つかまえたよ。');
    else if (m.reason === 'not night') toast('おばけは 夜にしか 出てきません。');
  }

  // ---- what a child does -----------------------------------------------------------

  // The nearest ghost within reach, or null. Only at night, only where they live, and
  // only online: the coins are the server's to give.
  function nearby(space) {
    if (!state.data || state.phase !== 'night' || !isOnline()) return null;
    if (space !== state.data.space) return null;
    let best = null; let bestGap = state.data.reach;
    for (const id of state.out) {
      const g = ghosts.get(id);
      if (!g || g.popped) continue;
      const gap = Math.hypot(player.position.x - g.data.x, player.position.z - g.data.z);
      if (gap <= bestGap) { best = g; bestGap = gap; }
    }
    return best ? { id: best.data.id, word: best.data.word, ja: best.data.ja, gap: bestGap } : null;
  }

  const label = (near) => `👻 ${near.word} を 杖で つかまえる`;

  function swing(space) {
    const near = nearby(space);
    if (!near) return false;
    state.swingAt = performance.now();
    send('ghost:hit', { id: near.id });
    return true;
  }

  // ---- the frame -------------------------------------------------------------------

  function update(t, dt, space) {
    const world = phaseAt(serverNow());
    state.night = world.night;
    // The group follows the island, not the ghost list: a ghost that is popping is no
    // longer "out" but still has to be seen finishing.
    root.visible = !!(state.data && space === state.data.space);
    if (!state.data) return world;
    for (const [id, g] of ghosts) {
      if (g.popped > 0) {
        // Popping: it swells, fades and is gone. No falling over, nothing unpleasant.
        g.popped = Math.max(0, g.popped - dt);
        const k = g.popped / 0.55;
        g.body.scale.setScalar(1 + (1 - k) * 1.7);
        g.skin.opacity = 0.82 * k;
        g.label.material.opacity = k;
        if (g.lamp) g.lamp.intensity = 4 * k;
        if (g.popped === 0) { g.group.visible = false; g.body.scale.setScalar(1); g.skin.opacity = 0.82; g.label.material.opacity = 1; }
        continue;
      }
      if (!g.group.visible) continue;
      // A slow drift and bob, so they read as floating rather than standing.
      g.body.position.y = 1.9 + Math.sin(t * 1.1 + g.phase) * 0.22;
      g.group.position.x = g.data.x + Math.sin(t * 0.32 + g.phase) * 0.55;
      g.group.position.z = g.data.z + Math.cos(t * 0.27 + g.phase) * 0.55;
      g.body.rotation.y = Math.sin(t * 0.4 + g.phase) * 0.5;
      if (g.lamp) g.lamp.intensity = 1.6 + Math.sin(t * 2 + g.phase) * 0.5;
    }
    return world;
  }

  return { ready, update, setPhase, setGhosts, onCaught, onError, nearby, label, swing, pop, state, ghosts };
}
