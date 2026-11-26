// 住民と はなす・いえに よんで もらう の つなぎ（2026-11）。画面は npc-talk.js、へやは npc-home.js、ことばは npc-lines.js。
//
// 入口は 3 つ：
//   1. ひろばを 歩く 人（plaza-walkers.js）：window の `uspeak:npc-talk`（cancelable・detail に id）を 受けて、会話の 画面を ひらく。なかよしの かぎは `main:<id>`。
//   2. 島の 住民：food-give.js の「💬 はなす」（`talkTo(at)`）。かぎは `島:場所`（あげる ときと 同じ）。
//   3. たべものを あげた あと（`food:gave`）：ひとことの お礼。
// いえ：❤ が たりると（部屋の 表の `invited`）さそいの ことば → 「おじゃまする」→ `home:visit {key}` → **`home:visit:ok` が 来てから** 入る。
import { villagerSeed } from './villager.js';
import { isJa } from './i18n.js';
import { createNpcTalk } from './npc-talk.js';
import { createNpcHome } from './npc-home.js';

const L = (en, ja) => (isJa() ? ja : en);
const WHY = {
  'not friends yet': ['You are not close friends yet. Give more food!', 'まだ よんで もらえないよ。もっと なかよく なろう！'],
  'too fast': ['Wait a moment.', 'すこし まってね。'],
  'no such villager': ['That house is not here.', 'その いえは ないよ。'],
};

// 島の 住民（island-kit の spot）→ 会話の 画面に わたす 形。かぎは food-give.js と 同じ。
export function residentInfo(island, spot) {
  const name = String(spot?.character || spot?.en || spot?.name || spot?.id || '');
  return { key: `${island}:${spot.id}`, name: { en: name, ja: name }, seed: villagerSeed(spot), color: Number(spot.color) || 0xcbbb95 };
}

export function createNpcSocial({ player, camera, rpg, food, send, toast = () => {}, speak = null, isOnline = () => false }) {
  let pending = null; let pendingTimer = 0; let colors = null;
  const talk = createNpcTalk({
    speak,
    friends: () => food?.state?.friends || {},
    rules: () => food?.state?.friendRules || { max: 10, per: 3, perDay: 3, invite: 3 },
    onVisit: (who) => visit(who),
  });
  const home = createNpcHome({
    player, camera, toast,
    onEnter: (info) => { setTimeout(() => { if (home.active && home.info === info && !talk.isOpen) talk.open({ ...info, mode: 'welcome' }); }, 1400); },
    onLeave: () => { if (talk.isOpen) talk.close(); },
  });
  try { rpg?.attachHome?.(home); } catch { /* 古い rpg.js でも 会話は できる */ }

  // ひろばの 人の 服の 色（データは plaza-npcs.js。まだ なければ たねから 決める）。
  try { import('./plaza-npcs.js').then((m) => { colors = new Map((m.PLAZA_NPCS || []).map((n) => [n.id, n.color])); }).catch(() => {}); } catch { /* */ }
  const tint = (id) => { let h = 2166136261; for (const c of String(id)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return [0xf2994a, 0x4fae6b, 0xe86fa0, 0x3d6fb0, 0xb48cff, 0x7a9a5a, 0xd9483b, 0x2f9e8f][(h >>> 0) % 8]; };

  // ひろばの 人（plaza-walkers.js の info）→ 会話の 画面に わたす 形。
  function walkerInfo(npc) {
    if (!npc?.id) return null;
    const id = String(npc.id);
    if (!/^[a-z0-9_-]{1,40}$/.test(id)) return null;
    const name = npc.name && typeof npc.name === 'object' ? { en: String(npc.name.en || npc.name.ja || ''), ja: String(npc.name.ja || npc.name.en || '') } : { en: String(npc.name || id), ja: String(npc.name || id) };
    return { key: `main:${id}`, name, personality: npc.personality, seed: id, color: Number(npc.color) || colors?.get(id) || tint(id), lines: Array.isArray(npc.lines) ? npc.lines : [] };
  }
  function findWalker(id) {
    try { const list = rpg?.main?.npcs; if (Array.isArray(list)) return list.find((n) => n?.id === id) || null; } catch { /* まだ ない */ }
    return null;
  }

  function openTalk(info, extra = {}) {
    if (!info) return false;
    if (document.querySelector('dialog[open]')) return false;
    return talk.open({ ...info, ...extra });
  }

  // 1. ひろばの 人。
  try {
    addEventListener('uspeak:npc-talk', (e) => {
      try {
        const d = e?.detail || {};
        const info = walkerInfo({ ...(findWalker(d.id) || {}), ...d });
        if (info && openTalk(info)) e.preventDefault();
      } catch { /* あちらの ふきだしに まかせる */ }
    });
  } catch { /* Node */ }

  // 2. そばの 住民（food-give.js の near() の 形）。いえの 中では いえの 人。
  function talkTo(at) {
    if (!at) return false;
    const info = at.info || (at.spot?.id ? residentInfo(at.island, at.spot) : null);
    return openTalk(info, home.active ? { mode: 'home' } : {});
  }

  // 3. あげた あとの ひとこと。
  function onGave(m, target) {
    try {
      const at = target?.at;
      const info = at?.info || (at?.spot?.id ? residentInfo(at.island, at.spot) : null);
      if (!info || info.key !== m?.key) return;
      setTimeout(() => { if (!talk.isOpen) openTalk(info, { mode: 'thanks', favourite: !!m.favourite }); }, 900);
    } catch { /* お礼が 出なくても あげた ことは かわらない */ }
  }

  // ---- いえ ----
  function visit(info) {
    if (!info?.key) return;
    if (!isOnline()) { toast(L('You can visit when you are in a class.', 'クラスに はいって いる ときだけ 行けるよ。')); return; }
    if (home.active || pending) return;
    pending = info;
    clearTimeout(pendingTimer); pendingTimer = setTimeout(() => { pending = null; }, 5000);
    send('home:visit', { key: info.key });
  }
  function onVisitOk(m) {
    const info = pending; pending = null; clearTimeout(pendingTimer);
    if (!info || info.key !== m?.key || home.active) return;      // たのんで いない へんじでは 入らない
    if (rpg?.state?.busy || rpg?.state?.mode === 'flight' || rpg?.insideBuilding || rpg?.inRoom) return;
    if (talk.isOpen) talk.close();
    home.enter(info);
  }
  function onVisitError(m) {
    pending = null; clearTimeout(pendingTimer);
    toast(L(...(WHY[m?.reason] || ['You cannot go in now.', 'いまは 入れないよ。'])));
  }

  // food-give.js の near()：いえの 中では いえの 人、メインの島では ひろばの 人（住民が そばに いない とき）。
  function nearInHome() {
    const at = home.nearest();
    if (!at) return null;
    const info = at.info; const i = info.key.indexOf(':');
    return { island: info.key.slice(0, i), spot: { id: info.key.slice(i + 1), character: (isJa() ? info.name?.ja : info.name?.en) || info.name?.ja || '' }, x: at.x, z: at.z, info, home: true };
  }
  function nearWalker() {
    try {
      if (rpg?.state?.current !== 'main') return null;
      const npc = rpg.main?.nearestNpc?.(player);
      const info = walkerInfo(npc);
      if (!info) return null;
      const o = npc.object3D;
      let x = player.position.x, z = player.position.z;
      if (o?.getWorldPosition) { const v = o.getWorldPosition(o.position.clone()); x = v.x; z = v.z; }
      return { island: 'main', spot: { id: String(npc.id), character: (isJa() ? info.name.ja : info.name.en) || info.name.ja }, x, z, info, walker: true };
    } catch { return null; }
  }

  return {
    talk, home, talkTo, onGave, visit, onVisitOk, onVisitError, nearInHome, nearWalker, walkerInfo, residentInfo,
    leaveHome(silent = true) { if (home.active) home.leave(silent); if (talk.isOpen) talk.close(); },
  };
}
