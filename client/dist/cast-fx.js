// つりの 3D の 演出（さお・糸・うき・「！」・波紋・魚が はねる）。島の 上で うきを 見て まつ ための 部品。
// つり島（fishworld-island.js）と 同じ 見た目・同じ 動き。メインの島の つり場と 英検の つり場が 使う。
//   const fx = createCastFx({ THREE, root, B });   // root ＝ 島の Group（座標は 島の 中の 座標）
//   fx.start({ cast: {x, z}, waterY })  → bite() → splash(fish) → end()
//   fx.update(t, player) を 毎フレーム、fx.chase(camera, player, dt) で 肩ごしの カメラ。
import * as THREE from './three.module.js';

function textSprite(text, { size = 140, color = '#fff', background = '', width = 1.5 } = {}) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  if (background) { g.fillStyle = background; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = color; g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 136);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(width, width, 1); s.renderOrder = 4;
  return s;
}

export function createCastFx({ root, B }) {
  const fx = { cast: null, player: null, t: 0, lastRings: 0, ripples: [], splashes: [], waterY: 0 };
  const loader = new THREE.TextureLoader();
  const photoCache = new Map();

  const rod = new THREE.Group();
  const tilt = new THREE.Group(); tilt.rotation.x = 0.95; rod.add(tilt);
  B(0, 0.8, 0, 0.05, 1.75, 0.05, 0x857455, tilt); B(0, -0.12, 0, 0.1, 0.3, 0.1, 0x484e46, tilt); B(0, 0.3, 0.05, 0.14, 0.14, 0.08, 0x6b7c86, tilt);
  rod.visible = false; root.add(rod);
  const rodTip = new THREE.Object3D(); rodTip.position.set(0, 1.68, 0); tilt.add(rodTip);
  const bobber = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe0566a })); top.position.y = 0.08; bobber.add(top);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf7f1e1 })); bot.position.y = -0.06; bobber.add(bot);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0xffd246 })); stem.position.y = 0.3; bobber.add(stem);
  bobber.visible = false; root.add(bobber);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf7f1e1, transparent: true, opacity: 0.75 }));
  line.visible = false; root.add(line);
  const bang = textSprite('！', { size: 150, color: '#fff', background: '#e0566a', width: 1.5 }); bang.visible = false; root.add(bang);
  const ringGeo = new THREE.TorusGeometry(0.5, 0.05, 6, 32);

  function ring(x, z, color) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, fx.waterY - 0.02, z); root.add(m);
    fx.ripples.push({ m, born: fx.t });
  }
  function start({ cast, waterY = 0.4 }) {
    fx.cast = { since: fx.t, bite: false };
    fx.waterY = waterY;
    bobber.position.set(cast.x, waterY, cast.z); bobber.visible = true; rod.visible = true; line.visible = true; bang.visible = false;
    if (fx.player) {
      const px = fx.player.position.x - root.position.x; const pz = fx.player.position.z - root.position.z;
      fx.player.rotation.y = Math.atan2(cast.x - px, cast.z - pz);
    }
    ring(cast.x, cast.z, 0x9fe0ff);
    return true;
  }
  function bite() {
    if (!fx.cast) return;
    fx.cast.bite = true; fx.cast.biteAt = fx.t;
    bang.position.set(bobber.position.x, fx.waterY + 1.6, bobber.position.z); bang.visible = true;
    ring(bobber.position.x, bobber.position.z, 0xffffff); setTimeout(() => ring(bobber.position.x, bobber.position.z, 0xffffff), 180);
  }
  function end() {
    fx.cast = null;
    rod.visible = false; bobber.visible = false; line.visible = false; bang.visible = false;
  }
  // 釣れた魚が 水から はねる：写真を 板に はって 弧を えがき、しぶきが ちる。
  function splash(fish) {
    if (!fx.cast) return;
    const at = { x: bobber.position.x, z: bobber.position.z };
    const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, color: 0xffffff });
    const s = new THREE.Sprite(mat); s.scale.set(1.9, 1.9, 1); s.renderOrder = 5; s.position.set(at.x, fx.waterY, at.z); root.add(s);
    const key = fish?.photo ? `assets/fish/${fish.photo}.jpg` : '';
    if (key) {
      if (!photoCache.has(key)) photoCache.set(key, loader.load(key, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; }));
      mat.map = photoCache.get(key); mat.needsUpdate = true;
    } else { const t = textSprite(fish?.emoji || '🐟', { size: 160, width: 1.9 }); mat.map = t.material.map; mat.needsUpdate = true; }
    fx.splashes.push({ s, born: fx.t, x: at.x, z: at.z, y: fx.waterY });
    for (let i = 0; i < 14; i += 1) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x9fe0ff : 0xffffff, transparent: true }));
      d.position.set(at.x, fx.waterY, at.z); root.add(d);
      fx.splashes.push({ s: d, born: fx.t, x: at.x, z: at.z, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3, y: fx.waterY, drop: true });
    }
    for (let i = 0; i < 3; i += 1) setTimeout(() => ring(at.x, at.z, 0xffffff), 120 * i);
  }

  const camAt = new THREE.Vector3(); const camLook = new THREE.Vector3();
  function chase(camera, player, dt) {
    if (!fx.cast) return false;
    const bx = bobber.position.x + root.position.x; const bz = bobber.position.z + root.position.z;
    const dx = bx - player.position.x; const dz = bz - player.position.z; const len = Math.hypot(dx, dz) || 1;
    camAt.set(player.position.x - (dx / len) * 6.5 + (dz / len) * 3, 5.2, player.position.z - (dz / len) * 6.5 - (dx / len) * 3);
    camera.position.lerp(camAt, 1 - Math.exp(-dt * 2.5));
    camLook.set((player.position.x + bx) / 2, 0.6, (player.position.z + bz) / 2);
    camera.lookAt(camLook);
    return true;
  }

  const tipWorld = new THREE.Vector3();
  function update(t, player) {
    fx.t = t; fx.player = player;
    if (fx.cast) {
      // さおは 右手に。子どもの 向きに ついてくる。
      const yaw = player.rotation.y; const r = root.position;
      rod.position.set(player.position.x - r.x + Math.cos(yaw) * 0.42 + Math.sin(yaw) * 0.25, player.position.y + 1.05, player.position.z - r.z - Math.sin(yaw) * 0.42 + Math.cos(yaw) * 0.25);
      rod.rotation.y = yaw;
      const age = t - fx.cast.since;
      const bob = fx.cast.bite ? Math.sin((t - fx.cast.biteAt) * 22) * 0.12 - 0.18 : Math.sin(t * 5) * 0.05;
      bobber.position.y = fx.waterY + bob;
      // 糸：さおの 先から、少し たるんで うきへ。
      rodTip.getWorldPosition(tipWorld); root.worldToLocal(tipWorld);
      const a = line.geometry.attributes.position; const bx = bobber.position.x; const bz = bobber.position.z; const by = bobber.position.y + 0.3;
      a.setXYZ(0, tipWorld.x, tipWorld.y, tipWorld.z); a.setXYZ(1, (tipWorld.x + bx) / 2, Math.min(tipWorld.y, by) + 0.25, (tipWorld.z + bz) / 2); a.setXYZ(2, bx, by, bz); a.needsUpdate = true; line.geometry.computeBoundingSphere();
      if (fx.cast.bite) { bang.position.y = fx.waterY + 1.5 + Math.abs(Math.sin((t - fx.cast.biteAt) * 9)) * 0.3; if (t - fx.lastRings > 0.5) { fx.lastRings = t; ring(bx, bz, 0xffffff); } }
      else if (age > 0.4 && t - fx.lastRings > 1.6) { fx.lastRings = t; ring(bx, bz, 0x9fe0ff); }
    }
    for (let i = fx.ripples.length - 1; i >= 0; i -= 1) {
      const rp = fx.ripples[i]; const age = t - rp.born; const k = 1 + age * 2.4;
      rp.m.scale.set(k, k, 1); rp.m.material.opacity = Math.max(0, 0.8 - age * 0.7);
      if (age > 1.2) { root.remove(rp.m); rp.m.material.dispose(); fx.ripples.splice(i, 1); }
    }
    for (let i = fx.splashes.length - 1; i >= 0; i -= 1) {
      const sp = fx.splashes[i]; const age = t - sp.born;
      if (sp.drop) { sp.s.position.set(sp.x + sp.vx * age, sp.y + sp.vy * age - 6 * age * age, sp.z + sp.vz * age); sp.s.material.opacity = Math.max(0, 1 - age); if (age > 1) { root.remove(sp.s); sp.s.geometry.dispose(); sp.s.material.dispose(); fx.splashes.splice(i, 1); } }
      else { sp.s.position.set(sp.x, sp.y + Math.sin(Math.min(1, age / 1.3) * Math.PI) * 2.6, sp.z); sp.s.material.rotation = Math.sin(age * 3) * 0.3; sp.s.material.opacity = age < 1.3 ? 1 : Math.max(0, 1 - (age - 1.3) * 3); if (age > 1.7) { root.remove(sp.s); sp.s.material.dispose(); fx.splashes.splice(i, 1); } }
    }
  }

  return { start, bite, end, splash, update, chase, get casting() { return !!fx.cast; } };
}
