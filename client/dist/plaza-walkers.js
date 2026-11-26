// メインの島の ひろばを 歩く 人たち と フリーマーケットの お店の 人（2026-11）。だれが いるかは plaza-npcs.js、場所は main-plaza.js。
//
// ・体は 住人と 同じ まるい 体（villager.js の buildVillager）。`userData.limbs`（左あし・右あし・左うで・右うで）を
//   アバターと 同じ 式（avatars.js の update：sin(…+(i%2)π)・足 0.4〜・うで 0.3〜）で ふる。歩いた 分だけ 足が 動く（すべらない）。
// ・歩く 人：点を じゅんに めぐる → 2〜6 秒 止まる（お店や 時計台を 見る・近くの 子を 見る）→ つぎの 点。
//   子どもが 2.2 より 近づくと 止まって こちらを 向く。名札は 近くで 出る。
// ・**この 端末だけの かざり**（部屋には 送らない・コインも うごかない）。となりの 子と 同じ 場所に いるとは かぎらない。
// ・動かすのは 島が 見えて いて、子どもから 60 より 近い 人だけ。影は 大きい 部品だけ。更新は update 1 つ。
//
// 話しかける つなぎ口（会話の 画面は 後から ここに つなぐ）：
//   nearest(player) → { id, name:{en,ja}, personality, lines:[{en,ja}], object3D, distance, role } | null
//   「💬 ○○ と はなす」ボタン（または E キー）→ window に `uspeak:npc-talk`（cancelable・detail は 上と 同じ ＋ id）。
//   だれも preventDefault() しなければ、つぎの あいさつを ふきだしで 出す（say）。
import * as THREE from './three.module.js';
import { buildVillager } from './villager.js';
import { PLAZA_NPCS, PERSONALITIES, linesOf } from './plaza-npcs.js';
import { isJa, t as tr } from './i18n.js';

const STOP_AT = 2.2, GO_AT = 2.9;          // この 近さで 止まる／はなれたら また 歩く
const REACH = 2.6, KEEPER_REACH = 3.5;     // 話しかけられる 近さ（お店の 人は 台を はさむので 少し 遠くから）
const ANIMATE_WITHIN = 60, LABEL_WITHIN = 9;

function hash(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const turnTo = (now, want, k) => { const d = Math.atan2(Math.sin(want - now), Math.cos(want - now)); return now + d * Math.min(1, k); };

export function createPlazaWalkers({ root, sprite, plaza }) {
  let q = 60607; const rnd = () => ((q = (q * 16807) % 2147483647) - 1) / 2147483646;
  const npcs = [];
  for (const def of PLAZA_NPCS) {
    const stall = def.stall ? plaza?.stalls?.find((s) => s.id === def.stall) : null;
    if (def.stall && !stall) continue;
    if (!def.stall && !(def.route?.length >= 2)) continue;
    const g = new THREE.Group();
    try { buildVillager(null, g, { color: def.color, seed: def.id }); } catch { continue; }
    g.traverse((o) => { if (o.isMesh && o.scale.x * o.scale.y * o.scale.z < 0.08) o.castShadow = false; });
    const limbs = g.userData.limbs?.length === 4 ? g.userData.limbs : g.children.filter((c) => c.isGroup).slice(0, 4);
    const h = hash(def.id), idx = stall ? 0 : h % def.route.length, start = stall ? stall.keeper : def.route[idx];
    g.position.set(start.x, 0, start.z); g.rotation.y = stall ? Math.PI : 0;
    root.add(g);
    const p = PERSONALITIES[def.personality] || {};
    const label = sprite({ en: `${p.icon || ''} ${def.name.en}`.trim(), ja: `${p.icon || ''} ${def.name.ja}`.trim() }, start.x, 3.0, start.z, { width: 3.4, size: 46, depthTest: false });
    label.visible = false;
    npcs.push({ def, g, limbs, label, keeper: !!stall, x: start.x, z: start.z, idx, dir: 1, mode: 'pause', wait: 0.5 + rnd() * 4, phase: (h % 628) / 100, amp: 0, held: false, said: h % 3, look: rnd() * 6.28, dist: 999 });
  }
  const byId = new Map(npcs.map((n) => [n.def.id, n]));
  const info = (n, distance = n.dist) => ({ id: n.def.id, name: n.def.name, personality: n.def.personality, lines: linesOf(n.def), object3D: n.g, distance, role: n.keeper ? 'keeper' : 'walker' });

  // ---- ふきだし（1 まいを つかいまわす）----
  let bubble = null, bubbleFor = null, bubbleUntil = 0, now = 0;
  try {
    const c = document.createElement('canvas'); c.width = 768; c.height = 128;
    const ctx = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(6.6, 1.1, 1); sp.renderOrder = 4; sp.visible = false; root.add(sp);
    bubble = { sp, paint(text) {
      ctx.clearRect(0, 0, 768, 128);
      ctx.fillStyle = '#fffdf6'; ctx.strokeStyle = '#1b3a2f'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect(6, 6, 756, 96, 26); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(360, 100); ctx.lineTo(384, 124); ctx.lineTo(408, 100); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1b3a2f'; let fs = 44; ctx.font = `700 ${fs}px sans-serif`;
      while (fs > 24 && ctx.measureText(text).width > 716) { fs -= 2; ctx.font = `700 ${fs}px sans-serif`; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 384, 56, 724);
      tex.needsUpdate = true;
    } };
  } catch { bubble = null; }

  // ---- 「💬 ○○ と はなす」ボタンと、ことばの 行（ふきだしが 読みにくい 小さな 画面の ため）----
  let box = null, btn = null, line = null, shownFor = '', lineUntil = 0, uiCheck = 0, uiOk = true;
  try {
    if (!document.head || !document.body?.appendChild) throw new Error('no dom');
    const style = document.createElement('style');
    style.textContent = '#npc-talk{position:fixed;left:50%;top:calc(50% + 92px);transform:translateX(-50%);z-index:6;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;max-width:92vw}'
      + '#npc-talk[hidden]{display:none}'
      + '#npc-talk button{pointer-events:auto;font:700 16px/1.2 system-ui,sans-serif;color:#fff4d6;background:#1b3a2f;border:2px solid #e27a2d;border-radius:999px;padding:10px 18px;min-height:44px;cursor:pointer;box-shadow:0 4px 14px #0005;touch-action:manipulation;-webkit-user-select:none;user-select:none}'
      + '#npc-talk button:active{transform:scale(.97)}#npc-talk button[hidden]{display:none}'
      + '#npc-talk kbd{font:700 12px/1 system-ui,sans-serif;background:#fff4d6;color:#1b3a2f;border-radius:5px;padding:2px 6px;margin-right:6px}'
      + '@media (pointer:coarse){#npc-talk kbd{display:none}}'
      + '#npc-talk p{margin:0;font:700 15px/1.35 system-ui,sans-serif;color:#1b3a2f;background:#fffdf6;border:2px solid #1b3a2f;border-radius:14px;padding:8px 14px;text-align:center}'
      + '#npc-talk p[hidden]{display:none}';
    document.head.appendChild(style);
    box = document.createElement('div'); box.id = 'npc-talk'; box.hidden = true;
    line = document.createElement('p'); line.hidden = true; line.setAttribute('role', 'status');
    btn = document.createElement('button'); btn.type = 'button';
    box.append(line, btn); document.body.appendChild(box);
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (shownFor) talk(shownFor); });
    for (const ev of ['pointerdown', 'touchstart', 'mousedown']) btn.addEventListener(ev, (e) => e.stopPropagation());
    addEventListener('keydown', (e) => {
      if (e.key !== 'e' && e.key !== 'E') return;
      if (e.repeat || !shownFor || box.hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      if (document.querySelector('dialog[open]') || document.querySelector('#near')?.style.display === 'block') return;   // ほかの「はなす・はいる」が 出て いれば そちら
      talk(shownFor);
    });
  } catch { box = null; btn = null; line = null; }
  const nameOf = (n) => (isJa() ? n.def.name.ja : n.def.name.en) || n.def.name.ja;
  const pick = (text) => (text && typeof text === 'object' ? (isJa() ? text.ja : text.en) || text.ja || text.en || '' : String(text ?? ''));

  // その 人の 頭の 上に ことばを 出す（seconds 秒）。会話の 画面からも 使える。
  function say(id, text, seconds = 4.5) {
    const n = byId.get(id); if (!n) return false;
    const s = pick(text); if (!s) return false;
    if (bubble) { try { bubble.paint(s); bubbleFor = n; bubbleUntil = now + seconds; bubble.sp.visible = true; } catch { /* 絵が 描けなくても 下の 行は 出る */ } }
    if (line) { line.textContent = `${nameOf(n)}：${s}`; line.hidden = false; lineUntil = now + seconds; if (box) box.hidden = false; }
    return true;
  }
  // 話しかける。`uspeak:npc-talk` を だれかが preventDefault() すれば そちらに まかせる（true を 返す）。
  function talk(id) {
    const n = byId.get(id); if (!n) return false;
    let taken = false;
    try { taken = !window.dispatchEvent(new CustomEvent('uspeak:npc-talk', { detail: info(n), cancelable: true })); } catch { taken = false; }
    if (taken) return true;
    const lines = linesOf(n.def); if (!lines.length) return false;
    say(id, lines[n.said % lines.length]); n.said += 1;
    return false;
  }

  let last = null;
  function update(t, player) {
    const dt = last === null ? 0 : Math.max(0, Math.min(0.1, t - last)); last = t; now = t;
    if (!root.visible) { if (box && !box.hidden) box.hidden = true; return; }
    const lx = player.position.x - root.position.x, lz = player.position.z - root.position.z;
    let best = null;
    for (const n of npcs) {
      const d = Math.hypot(lx - n.x, lz - n.z); n.dist = d;
      n.label.visible = d < LABEL_WITHIN;
      if (d > ANIMATE_WITHIN) continue;
      const toPlayer = Math.atan2(lx - n.x, lz - n.z);
      if (d < (n.keeper ? KEEPER_REACH : REACH) && (!best || d < best.dist)) best = n;
      let moving = false;
      if (n.keeper) {
        n.g.rotation.y = turnTo(n.g.rotation.y, d < 7 ? toPlayer : Math.PI + Math.sin(t * 0.35 + n.look) * 0.5, dt * 5);
        n.g.position.y = Math.abs(Math.sin(t * 1.6 + n.look)) * 0.03;
      } else {
        n.held = n.held ? d < GO_AT : d < STOP_AT;
        const wp = n.def.route[n.idx];
        if (n.held) n.g.rotation.y = turnTo(n.g.rotation.y, toPlayer, dt * 8);
        else if (n.mode === 'pause') {
          n.wait -= dt;
          const want = wp.face !== undefined ? wp.face + Math.sin(t * 0.7 + n.look) * 0.25 : d < 5 ? toPlayer : n.g.rotation.y + Math.sin(t * 0.6 + n.look) * dt * 0.8;
          n.g.rotation.y = turnTo(n.g.rotation.y, want, dt * 4);
          if (n.wait <= 0) {
            const len = n.def.route.length;
            if (n.def.loop === false) { if (n.idx + n.dir < 0 || n.idx + n.dir >= len) n.dir = -n.dir; n.idx += n.dir; } else n.idx = (n.idx + 1) % len;
            n.mode = 'walk';
          }
        } else {
          const dx = wp.x - n.x, dz = wp.z - n.z, left = Math.hypot(dx, dz), step = (n.def.speed || 1.8) * dt;
          if (left <= step || left < 0.05) { n.x = wp.x; n.z = wp.z; n.mode = 'pause'; n.wait = 2 + rnd() * 4; }
          else {
            n.x += (dx / left) * step; n.z += (dz / left) * step; moving = true;
            n.g.rotation.y = turnTo(n.g.rotation.y, Math.atan2(dx, dz), dt * 9);
            n.phase += step * 4.4;                                  // 歩いた 長さで 足を ふる＝すべらない
          }
        }
        n.g.position.set(n.x, moving ? Math.abs(Math.sin(n.phase)) * 0.06 : 0, n.z);
        n.label.position.set(n.x, 3.0, n.z);
      }
      n.amp += ((moving ? 1 : 0) - n.amp) * Math.min(1, dt * 10);
      if (n.amp > 0.002 || moving) n.limbs.forEach((limb, i) => { limb.rotation.x = Math.sin(n.phase + (i % 2) * Math.PI) * (i < 2 ? 0.5 : 0.36) * n.amp; });
    }
    if (bubble?.sp.visible) {
      if (t > bubbleUntil || !bubbleFor) bubble.sp.visible = false;
      else bubble.sp.position.set(bubbleFor.x, 3.95, bubbleFor.z);
    }
    if (box) {
      uiCheck -= dt;
      if (uiCheck <= 0) { uiCheck = 0.25; try { uiOk = !document.querySelector('dialog[open]') && !document.body.dataset.main; } catch { uiOk = true; } }
      const who = best && uiOk ? best.def.id : '';
      if (who !== shownFor) {
        shownFor = who;
        if (who) btn.innerHTML = `<kbd>E</kbd>💬 ${tr('{who} と はなす', { who: nameOf(best) }).replace(/[<>&]/g, '')}`;
        btn.hidden = !who;
      }
      if (line && !line.hidden && t > lineUntil) line.hidden = true;
      box.hidden = !shownFor && (!line || line.hidden);
    }
  }

  // いちばん 近い「話しかけられる」人（歩く 人は 2.6、お店の 人は 3.5 まで）。いなければ null。
  function nearest(player) {
    if (!root.visible) return null;
    const lx = player.position.x - root.position.x, lz = player.position.z - root.position.z;
    let best = null, bd = Infinity;
    for (const n of npcs) { const d = Math.hypot(lx - n.x, lz - n.z); if (d < (n.keeper ? KEEPER_REACH : REACH) && d < bd) { best = n; bd = d; } }
    return best ? info(best, bd) : null;
  }

  return {
    update, nearest, talk, say,
    get npcs() { return npcs.map((n) => ({ ...info(n), x: n.x, z: n.z, moving: n.amp > 0.5 })); },
  };
}
