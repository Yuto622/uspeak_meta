// Remote avatars: interpolation buffer (100 ms behind), extrapolation on stalls,
// snap on teleports, name labels and chat bubbles. Positions are never trusted for
// gameplay; they are only rendered.
import * as THREE from './three.module.js';
import { buildAvatar } from './avatars.js';
import { NET } from './net-config.js';

function textSprite(text, { bg = '#345344', color = '#fff4d7', size = 30, width = 512, scale = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = 100;
  const ctx = c.getContext('2d');
  ctx.font = `600 ${size}px 'DM Sans','Noto Sans JP',sans-serif`;
  const w = Math.min(width - 12, ctx.measureText(text).width + 44);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect((width - w) / 2, 8, w, 84, 20); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  ctx.fillText(text, width / 2, 52, width - 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set((width / 100) * 0.98 * scale, 0.98 * scale, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function createRemotePlayers({ worldScene, getInteriorScene }) {
  const remotes = new Map(); // sessionId -> remote
  const isInterior = (space) => typeof space === 'string' && space.startsWith('in:');

  function makeRemote(id, info) {
    let config = { id: 'kai' };
    try { config = { ...config, ...JSON.parse(info.avatar || '{}') }; } catch { /* keep default */ }
    const group = new THREE.Group();
    const model = buildAvatar(config);
    group.add(model);
    const label = textSprite(info.role === 'teacher' ? `★ ${info.name}` : info.name, { bg: info.role === 'teacher' ? '#8a4b2c' : '#345344', scale: 0.55 });
    label.position.set(0, 3.15, 0);
    group.add(label);
    return {
      id, group, model, label, bubble: null, bubbleUntil: 0, avatarJson: info.avatar,
      name: info.name, role: info.role, space: info.space, anim: info.anim || 'idle', connected: info.connected !== false,
      buffer: [], // {t, x, z, yaw}
      pos: new THREE.Vector3(info.x, 0, info.z), yaw: info.yaw || 0, vel: new THREE.Vector3(),
      parent: null, lastSampleAt: 0, teleported: true,
    };
  }

  function upsert(id, info) {
    let r = remotes.get(id);
    if (!r) { r = makeRemote(id, info); remotes.set(id, r); }
    if (info.avatar && info.avatar !== r.avatarJson) {
      r.group.remove(r.model);
      let config = { id: 'kai' };
      try { config = { ...config, ...JSON.parse(info.avatar) }; } catch { /* ignore */ }
      r.model = buildAvatar(config);
      r.group.add(r.model);
      r.avatarJson = info.avatar;
    }
    r.space = info.space; r.anim = info.anim; r.connected = info.connected !== false; r.role = info.role;
    return r;
  }

  // Called for every state patch that touched x/z/yaw of a player.
  function pushSample(id, sample, now = performance.now()) {
    const r = remotes.get(id);
    if (!r) return;
    const last = r.buffer[r.buffer.length - 1];
    if (last && Math.hypot(sample.x - last.x, sample.z - last.z) > NET.SNAP_DISTANCE) {
      // Teleport (gather / region change): drop history, place immediately.
      r.buffer.length = 0;
      r.pos.set(sample.x, 0, sample.z);
      r.yaw = sample.yaw;
      r.vel.set(0, 0, 0);
      r.teleported = true;
    }
    r.buffer.push({ t: now, x: sample.x, z: sample.z, yaw: sample.yaw });
    r.lastSampleAt = now;
    while (r.buffer.length > 2 && now - r.buffer[0].t > NET.BUFFER_KEEP_MS) r.buffer.shift();
  }

  function remove(id) {
    const r = remotes.get(id);
    if (!r) return;
    r.parent?.remove(r.group);
    remotes.delete(id);
  }

  function showBubble(id, text) {
    const r = remotes.get(id);
    if (!r) return;
    if (r.bubble) r.group.remove(r.bubble);
    r.bubble = textSprite(text, { bg: '#fffaf0', color: '#263d33', size: 28, width: 640, scale: 0.62 });
    r.bubble.position.set(0, 3.95, 0);
    r.group.add(r.bubble);
    r.bubbleUntil = performance.now() + NET.CHAT_BUBBLE_MS;
  }

  const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

  function interpolate(r, now) {
    const renderAt = now - NET.INTERP_DELAY_MS;
    const buf = r.buffer;
    if (!buf.length) return;
    // Find the pair of samples around renderAt.
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > renderAt) i--;
    const a = buf[i - 1];
    const b = buf[i];
    if (a && b && a.t <= renderAt && renderAt <= b.t) {
      const u = b.t === a.t ? 1 : (renderAt - a.t) / (b.t - a.t);
      r.pos.set(a.x + (b.x - a.x) * u, 0, a.z + (b.z - a.z) * u);
      r.yaw = lerpAngle(a.yaw, b.yaw, u);
      r.vel.set((b.x - a.x) / Math.max(1, b.t - a.t), 0, (b.z - a.z) / Math.max(1, b.t - a.t));
      if (i > 1) buf.splice(0, i - 1);
    } else if (renderAt > b.t) {
      // Buffer underflow (lost / delayed packets): extrapolate briefly, then hold.
      const dt = Math.min(renderAt - b.t, NET.EXTRAPOLATE_MAX_MS);
      const stalled = renderAt - b.t > NET.EXTRAPOLATE_MAX_MS;
      r.pos.set(b.x + r.vel.x * dt, 0, b.z + r.vel.z * dt);
      r.yaw = b.yaw;
      if (stalled) r.vel.set(0, 0, 0);
    } else {
      // Only future samples (just teleported / first sample): show the newest.
      r.pos.set(b.x, 0, b.z);
      r.yaw = b.yaw;
    }
  }

  function update(t, mySpace) {
    const now = performance.now();
    const interiorScene = getInteriorScene();
    for (const r of remotes.values()) {
      const visible = r.connected && r.space === mySpace && r.anim !== 'fly';
      const wantParent = visible ? (isInterior(mySpace) ? interiorScene : worldScene) : null;
      if (r.parent !== wantParent) {
        r.parent?.remove(r.group);
        wantParent?.add(r.group);
        r.parent = wantParent;
      }
      r.group.visible = !!wantParent;
      if (!wantParent) continue;
      interpolate(r, now);
      r.group.position.copy(r.pos);
      r.group.rotation.y = r.yaw;
      const moving = r.anim === 'walk' || r.anim === 'run';
      const speed = r.anim === 'run' ? 13 : 10;
      const limbs = r.model.userData.limbs || [];
      limbs.forEach((g, i) => { g.rotation.x = moving ? Math.sin(t * speed + (i % 2) * Math.PI) * (i < 2 ? 0.4 : 0.3) : 0; });
      r.group.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.075 : 0;
      r.model.children.forEach((m) => { if (m.material) m.material.transparent = false; });
      if (r.bubble && now > r.bubbleUntil) { r.group.remove(r.bubble); r.bubble = null; }
    }
  }

  return { upsert, pushSample, remove, showBubble, update, get count() { return remotes.size; }, get(id) { return remotes.get(id); }, textSprite };
}
