// たべものを 頭の 上に もつ・住民に あげる・なかよしの ❤（2026-11）。
//
// ・かばんの「もつ」で、その たべものの 3D（food-real.js）が じぶんの 頭の 上に のる（牧場物語の たまごの ように）。
//   **じぶんの 画面だけ**（ほかの 子には 送らない）。player の 子に つけるので、すがたを かえても ついて くる。
// ・もったまま 住民の そばに 立つと「🎁 ○○に あげる」。押すと `food:give { island, spot, id }` を 頼むだけ。
//   へらす・点を ふやす・1 日 3 回までを きめるのは 部屋（server/src/game/food.js の give）。
// ・あげたら ❤ が 住民の 上に とび、「○○ と なかよし ❤❤♡…」の カード。そばに 立つだけでも（あげた ことが あれば）バーが 出る。
import * as THREE from './three.module.js';
import { realFood } from './food-real.js';
import { isJa, onLangChange } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (en, ja) => (isJa() ? ja : en);
const HELD_SIZE = 0.72;       // たべものの 大きさ（realFood は 1 くらい）
const ARM_UP = Math.PI - 0.22;
const WHY = {
  'none left': ['You have none left.', 'もう ないよ。'],
  'too fast': ['Wait a moment.', 'すこし まってね。'],
  'enough today': ['That is enough for today. Come back tomorrow!', 'きょうは もう おなか いっぱい だって。また あした！'],
  'best friends': ['You are already best friends!', 'もう いちばんの なかよし だよ！'],
};

export function villagerName(spot) { return String(spot?.character || spot?.en || spot?.name || spot?.id || ''); }
// なかよしの かぎ（`島:場所`）。会話の 画面（npc-talk.js）・いえ（npc-home.js）も 同じ かぎを 使う。
export const friendKeyOf = (at) => (at?.spot?.id ? `${at.island}:${at.spot.id}` : '');

// onTalk(at)：「💬 はなす」を おした（npc-social.js）。onGaveTalk(m, target)：あげた あとの ひとこと。
export function createFoodGive({ player, food, send, toast, speak = null, isOnline, near, onChange = () => {}, onTalk = null, onGaveTalk = null }) {
  const state = { id: '', near: null, pending: false, sig: '', target: null };

  // ---- 頭の 上の たべもの ----
  const root = new THREE.Group();
  root.name = 'held-food';
  const models = new Map();     // 1 しゅるい 1 回だけ 作る
  let shown = null; let top = 2.7; let topAt = -1; let armsOf = null; let armZ = [0, 0];
  const tmp = new THREE.Vector3(); const box = new THREE.Box3();

  function restoreArms() {
    if (!armsOf) return;
    const limbs = armsOf.userData?.limbs || [];
    if (limbs[2]) limbs[2].rotation.z = armZ[0];
    if (limbs[3]) limbs[3].rotation.z = armZ[1];
    // rotation.x は 歩く うごき（avatars.js の update）が つぎの こまで 書きなおす
    armsOf = null;
  }
  function setModel(id) {
    if (shown) root.remove(shown);
    shown = null;
    if (!id) { root.removeFromParent(); restoreArms(); return; }
    if (!models.has(id)) { const m = realFood(id); if (m) m.scale.setScalar(HELD_SIZE); models.set(id, m); }
    shown = models.get(id);
    if (shown) root.add(shown);
  }
  function drop() { if (!state.id) return; state.id = ''; setModel(''); onChange(); }
  function hold(id) {
    if (!id || !food.state.bag.some((b) => b.id === id)) return false;
    state.id = id; setModel(id); topAt = -1; onChange();
    return true;
  }
  function toggle(id) { if (state.id === id) { drop(); return false; } return hold(id); }

  // 頭の てっぺん（ぼうしも 入れる）。体は player の 子の うち userData.limbs を 持つ もの。
  function headTop(body) {
    const head = body?.userData?.anchors?.head;
    if (!head) return 2.7;
    player.updateWorldMatrix(true, true);
    head.getWorldPosition(tmp);
    box.setFromObject(head);
    if (!box.isEmpty() && Number.isFinite(box.max.y)) tmp.y = Math.max(tmp.y, box.max.y);
    const y = player.worldToLocal(tmp).y;
    return Number.isFinite(y) ? Math.max(1.2, Math.min(4.2, y)) : 2.7;
  }

  // ---- ❤ が とぶ ----
  let heartTex = null;
  const bursts = [];
  function heartTexture() {
    if (heartTex) return heartTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ff4f7b'; g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 8, 10, 22, 10); g.bezierCurveTo(28, 10, 32, 15, 32, 20);
    g.bezierCurveTo(32, 15, 36, 10, 42, 10); g.bezierCurveTo(56, 10, 60, 34, 32, 54); g.closePath(); g.stroke(); g.fill();
    heartTex = new THREE.CanvasTexture(c); heartTex.colorSpace = THREE.SRGBColorSpace;
    return heartTex;
  }
  function burst(at, count) {
    const scene = player.parent;
    if (!scene || !at) return;
    for (let i = 0; i < count; i += 1) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthTest: false }));
      const a = (i / count) * Math.PI * 2;
      s.position.set(at.x + Math.cos(a) * 0.5, 2.6, at.z + Math.sin(a) * 0.5);
      s.scale.setScalar(0.01); s.renderOrder = 20;
      scene.add(s);
      bursts.push({ s, age: -i * 0.09, vx: Math.cos(a) * 0.5, vz: Math.sin(a) * 0.5 });
    }
  }
  function stepBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const b = bursts[i]; b.age += dt;
      if (b.age < 0) continue;
      const k = b.age / 1.5;
      if (k >= 1) { b.s.removeFromParent(); b.s.material.dispose(); bursts.splice(i, 1); continue; }
      b.s.position.x += b.vx * dt; b.s.position.z += b.vz * dt; b.s.position.y += (1.5 - k) * dt;
      b.s.scale.setScalar(0.62 * Math.min(1, k * 6));
      b.s.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    }
  }

  // ---- 画面：あげる ボタンと なかよしの バー ----
  const panel = document.createElement('div');
  panel.id = 'give'; panel.hidden = true;
  const card = document.createElement('div');
  card.id = 'give-card'; card.hidden = true; card.setAttribute('role', 'status');
  document.body.append(panel, card);
  let cardTimer = 0;

  const rules = () => food.state.friendRules || { max: 10, per: 3, perDay: 3 };
  const friend = (key) => food.state.friends?.[key] || null;
  function meter(points) {
    const { max, per } = rules();
    const hearts = Math.min(max, Math.floor(points / per));
    const part = hearts >= max ? 1 : (points % per) / per;
    return `<span class="gv-hearts" aria-label="${hearts} / ${max}"><b>${'❤'.repeat(hearts)}</b><i>${'♡'.repeat(max - hearts)}</i></span>
      <span class="gv-bar"><i style="--gv:${Math.round(part * 100)}%"></i></span>`;
  }
  const foodName = (id) => { const b = food.state.bag.find((x) => x.id === id); return b ? `${b.icon} <span translate="no">${esc(b.en)}</span>` : ''; };
  const who = (name) => `<span class="gv-who" translate="no">${esc(name)}</span>`;

  function paintPanel() {
    const at = state.near;
    const busy = !at || !isOnline() || document.querySelector('dialog[open]');
    const key = friendKeyOf(at);
    const fr = key ? friend(key) : null;
    // 「💬 はなす」：たべものを 持って いなくても、住民の そばなら 出す（ひろばを 歩く 人は じぶんの ボタンが ある）。
    const canTalk = !!onTalk && !!at && !at.walker;
    if (busy || (!state.id && !fr && !canTalk)) { if (!panel.hidden) { panel.hidden = true; state.sig = ''; } return; }
    const sig = [key, state.id, fr?.points, fr?.left, fr?.favourite, state.pending, isJa(), canTalk].join('|');
    if (sig === state.sig) return;
    state.sig = sig;
    const name = villagerName(at.spot);
    const { max } = rules();
    const full = fr && fr.hearts >= max;
    const done = fr && fr.left <= 0;
    let act = '';
    if (full) act = `<p class="gv-note">${L('Best friends!', 'いちばんの なかよし！')}</p>`;
    else if (!state.id) act = `<p class="gv-note">${L('🎒 Hold some food to give it.', '🎒 たべものを もつと あげられるよ。')}</p>`;
    else if (done) act = `<p class="gv-note">${L('Come back tomorrow!', 'きょうは ここまで。また あした！')}</p>`;
    else act = `<button type="button" class="gv-btn" ${state.pending ? 'disabled' : ''}><span class="gv-gift">🎁 ${foodName(state.id)}</span><span>${isJa() ? `${who(name)}に あげる` : `Give to ${who(name)}`}</span><kbd>G</kbd></button>`;
    const fav = fr?.favourite ? `<p class="gv-fav">${L('Loves', 'だいすき')}：<span translate="no">${esc(fr.favourite)}</span></p>` : '';
    const talkBtn = canTalk ? `<button type="button" class="gv-talk">💬 <span>${isJa() ? `${who(name)} と はなす` : `Talk to ${who(name)}`}</span><kbd>T</kbd></button>` : '';
    if (!state.id && !fr && talkBtn) act = '';        // まだ なにも あげて いない 住民：はなす だけ
    panel.innerHTML = `${fr ? `<div class="gv-friend"><span class="gv-title">${isJa() ? `${who(name)} と なかよし` : `Friends with ${who(name)}`}</span>${meter(fr.points)}</div>${fav}` : ''}<div class="gv-row">${act}${talkBtn}</div>`;
    panel.hidden = false;
    const btn = panel.querySelector('.gv-btn');
    if (btn) btn.onclick = give;
    const tb = panel.querySelector('.gv-talk');
    if (tb) tb.onclick = talkNow;
  }

  function talkNow() {
    const at = state.near;
    if (!at || !onTalk || panel.hidden || at.walker) return;
    try { onTalk(at); } catch { /* 会話が ひらけなくても あげる ことは できる */ }
  }

  function give() {
    const at = state.near;
    if (!at || !state.id || state.pending || panel.hidden) return;
    state.pending = true; state.sig = '';
    state.target = { x: at.x, z: at.z, name: villagerName(at.spot), key: friendKeyOf(at), at };
    send('food:give', { island: at.island, spot: at.spot.id, id: state.id });
    setTimeout(() => { if (state.pending) { state.pending = false; state.sig = ''; } }, 3000);
  }

  function onGave(m) {
    state.pending = false; state.sig = '';
    food.apply({ bag: m.bag, friends: m.friends, friendRules: m.friendRules });
    if (state.id && !food.state.bag.some((b) => b.id === state.id)) drop();
    const t = state.target?.key === m.key ? state.target : null;
    burst(t, m.favourite ? 9 : 5);
    const name = t?.name || '';
    card.innerHTML = `<p class="gv-title">${isJa() ? `${who(name)} と なかよし` : `Friends with ${who(name)}`} <b class="gv-plus">+${m.gained}</b></p>
      ${meter(m.points)}${m.favourite ? `<p class="gv-love">💖 ${L('A favourite food!', 'だいすきな たべもの！')}</p>` : ''}${m.heartUp ? `<p class="gv-up">${L('One more heart!', '❤ が ふえたよ！')}</p>` : ''}`;
    card.hidden = false; card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    clearTimeout(cardTimer); cardTimer = setTimeout(() => { card.hidden = true; }, 4000);
    speak?.('Here you are!', { japanese: false, rate: 0.9 });
    try { onGaveTalk?.(m, t); } catch { /* お礼の ひとことが 出なくても あげた ことは かわらない */ }
  }
  function onError(m) {
    state.pending = false; state.sig = '';
    const why = WHY[m?.reason] || ['You cannot give it now.', 'いまは あげられないよ。'];
    toast(L(...why));
  }

  addEventListener('keydown', (e) => {
    const k = String(e.key || '').toLowerCase();
    if (k !== 'g' && k !== 't') return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || panel.hidden || document.body.dataset.npcTalk || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable) return;
    if (k === 't') talkNow(); else give();
  });
  onLangChange(() => { state.sig = ''; });

  // ---- 1 こまごと ----
  let tick = 0; let time = 0;
  function update(t, dt) {
    stepBursts(dt);
    time += dt; tick += 1;
    if (tick % 8 === 0) {
      // たべた・あげた などで かばんから なくなったら おろす
      if (state.id && (!isOnline() || !food.state.bag.some((b) => b.id === state.id))) drop();
      state.near = isOnline() ? near() : null;
      paintPanel();
    }
    if (!state.id || !shown) return;
    if (root.parent !== player) player.add(root);
    const body = player.children.find((c) => c.userData?.limbs) || null;
    if (body !== armsOf) {
      restoreArms(); armsOf = body; topAt = -1;
      const limbs = body?.userData?.limbs || [];
      armZ = [limbs[2]?.rotation.z || 0, limbs[3]?.rotation.z || 0];
    }
    if (topAt < 0 || tick - topAt > 45) { top = headTop(body); topAt = tick; }
    root.visible = !document.body.classList.contains('first-person') && (!body || body.visible !== false);
    root.position.set(0, top + 0.1 + Math.sin(time * 3.2) * 0.045, 0);
    root.rotation.y = Math.sin(time * 1.1) * 0.25;
    // うでを 上げる：歩く うごきは 毎こま rotation.x を 書くので、その あとで 上書きする（net.update は avatars.update の あと）。
    const limbs = body?.userData?.limbs;
    if (limbs?.[2] && limbs?.[3]) {
      limbs[2].rotation.x = ARM_UP; limbs[3].rotation.x = ARM_UP;
      limbs[2].rotation.z = armZ[0] + 0.2; limbs[3].rotation.z = armZ[1] - 0.2;
    }
  }

  return { hold, drop, toggle, give, talk: talkNow, onGave, onError, update, get id() { return state.id; }, state, root, panel, card };
}
