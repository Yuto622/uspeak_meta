// 住民との 会話の 画面（2026-11・牧場物語の ような「ことばの はこ＋かおの 絵」）。
//
// ・左下に こい 色の はこ（なまえの 札・ことば・▼）、右に 少し かたむいた 白い わくの **かおの 絵**と 気もちの しるし（♪ ! ♥ … 💦）。
// ・かおの 絵は **その 住民の 本物の 3D の かお**：島と 同じ 体（villager.js）を 作り、ひょうじょうごとの 目と 口を かいて、
//   food-real.js の `renderShots`（小さな レンダラーを 作って すぐ 捨てる）で 1 人 1 回だけ 絵に する。WebGL は 持ちつづけない。
//   描けない とき（WebGL なし・検査の Node）は 服の 色の まると 絵文字。**ぜったいに 投げない。**
// ・ことばは npc-lines.js（せいかく 8 つ）。英語と 日本語を 両方 出す（いまの 言語を 大きく）。🔊 は 英語を 読む。
// ・`<dialog>` では ない（3D を かくさない）。ひらいて いる 間は `body[data-npc-talk]`＝ game.js が 歩きを 止める。
// ・なかよしの ❤（food.state.friends）を いっしょに 出す。❤ が たりると「いえに いく」（きめるのは 部屋＝home:visit）。
import * as THREE from './three.module.js';
import { buildVillager } from './villager.js';
import { chibiMaker, CHIBI_INK } from './island-cast.js';
import { isJa, onLangChange } from './i18n.js';
import { phaseAt } from './world-clock.js';
import { seasonNow } from './main-seasons.js';
import { PERSONALITIES, personalityOf, linesFor, conversation, homeTalk } from './npc-lines.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (en, ja) => (isJa() ? ja : en);
export const EXPRESSIONS = ['smile', 'happy', 'surprised', 'shy', 'sleepy'];
const FACE_OF = { smile: 'smile', happy: 'happy', surprised: 'surprised', shy: 'shy', sleepy: 'sleepy', love: 'happy' };
const BADGE = { smile: '♪', happy: '♪', surprised: '!', shy: '💦', sleepy: '…', love: '♥' };
const EMOJI = { smile: '🙂', happy: '😄', surprised: '😮', shy: '😊', sleepy: '😌', love: '😍' };
const INVITED_KEY = 'uspeak-npc-invited-v1';
const hex = (c) => `#${(Number(c) >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`;

// ---- かおの 絵 ---------------------------------------------------------------------------
// ひょうじょうごとの 目・口・ほお。体は `face: { noEyes, noMouth, noBlush }` で かおの 部品なしに 作って ある。
function drawFace(g, kind) {
  const add = chibiMaker(g);
  const INK = CHIBI_INK, WHITE = 0xffffff, BLUSH = 0xf59aa0, MOUTH = 0xa5483f;
  const roundEyes = (dx = 0, sy = 1) => {
    for (const s of [-1, 1]) {
      add('S', INK, [s * 0.21 + dx, 1.72, 0.5], [0.17, 0.23 * sy, 0.1], [0, s * 0.32, 0]);
      add('S', WHITE, [s * 0.21 + 0.035 + dx, 1.72 + 0.06 * sy, 0.545], [0.07, 0.08 * sy, 0.03]);
      add('S', WHITE, [s * 0.21 - 0.03 + dx, 1.72 - 0.05 * sy, 0.55], [0.035, 0.04, 0.02]);
    }
  };
  const blush = (w = 0.17, h = 0.09, color = BLUSH) => { for (const s of [-1, 1]) add('S', color, [s * 0.38, 1.58, 0.44], [w, h, 0.05], [0, s * 0.6, 0]); };
  if (kind === 'happy') {
    for (const s of [-1, 1]) add('A', INK, [s * 0.21, 1.69, 0.53], [0.21, 0.2, 0.2], [0, s * 0.3, 0]);     // とじた 目（∩）
    add('S', 0x8f2f2a, [0, 1.53, 0.545], [0.22, 0.17, 0.08]);                                              // あけた 口
    add('S', 0xf08a8a, [0, 1.495, 0.575], [0.13, 0.08, 0.04]);
    blush();
  } else if (kind === 'surprised') {
    for (const s of [-1, 1]) {
      add('S', WHITE, [s * 0.21, 1.73, 0.495], [0.24, 0.28, 0.1], [0, s * 0.32, 0]);
      add('S', INK, [s * 0.21, 1.73, 0.54], [0.1, 0.12, 0.05], [0, s * 0.32, 0]);
      add('B', INK, [s * 0.22, 1.93, 0.5], [0.16, 0.03, 0.03], [0, 0, s * -0.22]);                         // 上がった まゆ
    }
    add('S', 0x8f2f2a, [0, 1.52, 0.56], [0.12, 0.15, 0.06]);
    blush();
  } else if (kind === 'shy') {
    roundEyes(0.025, 0.86);                                                                                // 少し よこを 見る
    blush(0.27, 0.16, 0xf07f8f);
    add('A', MOUTH, [0, 1.555, 0.555], [0.07, 0.06, 0.1], [Math.PI, 0, 0]);
    for (const s of [-1, 1]) add('B', INK, [s * 0.22, 1.9, 0.5], [0.14, 0.028, 0.03], [0, 0, s * -0.32]);   // こまった まゆ（内がわが 上）
  } else if (kind === 'sleepy') {
    for (const s of [-1, 1]) add('B', INK, [s * 0.21, 1.7, 0.535], [0.19, 0.035, 0.04], [0, s * 0.3, s * -0.08]);  // 半分 とじた 目
    add('S', MOUTH, [0.03, 1.545, 0.565], [0.07, 0.06, 0.04]);
    blush(0.15, 0.08);
  } else {
    roundEyes();
    blush();
    add('A', MOUTH, [0, 1.56, 0.555], [0.13, 0.11, 0.13], [Math.PI, 0, 0]);
  }
}

// その 人の かおを 絵の まんなかに 置いた 形（renderShots の カメラは 高さ `look` を 見る）。
export function portraitModel({ color, seed }, kind = 'smile') {
  const body = new THREE.Group();
  buildVillager(null, body, { color, seed, face: { noEyes: true, noMouth: true, noBlush: true } });
  drawFace(body, FACE_OF[kind] || 'smile');
  const tall = body.scale.y || 1;
  const k = 0.76;
  const outer = new THREE.Group();
  const tilt = new THREE.Group();
  body.scale.multiplyScalar(k);
  body.position.y = -1.7 * tall * k;          // かおの まんなかを 原点に
  tilt.add(body); tilt.rotation.x = -0.2;      // カメラは 少し 上から 見るので、あごを 上げる
  tilt.position.y = 0.6;
  outer.add(tilt);
  // renderShots は 描いた あと 形を dispose する。体の 形（island-cast の G）は みんなで 使うので、材質だけ 捨てさせる。
  outer.traverse = (fn) => { const seen = new Set(); THREE.Object3D.prototype.traverse.call(outer, (o) => { for (const m of [].concat(o.material || [])) seen.add(m); }); for (const m of seen) fn({ material: m }); };
  return outer;
}

const shots = new Map();      // seed|color → Promise<{ smile: url, … } | null>
export function portraitShots(who) {
  // 島の キャラクター（spot.cast。いまは ゆぴちゃん だけ）は その 子の 絵（yupi.js）。
  if (who?.cast === 'yupi') return import('./yupi.js').then((m) => m.yupiPortraits()).catch(() => null);
  const id = `${who.seed}|${who.color}`;
  if (!shots.has(id)) {
    shots.set(id, import('./food-real.js')
      .then(({ renderShots }) => renderShots(EXPRESSIONS, (kind) => portraitModel(who, kind), { size: 320, look: 0.52, turn: -0.2 }))
      .catch(() => null));
    if (shots.size > 40) shots.delete(shots.keys().next().value);
  }
  return shots.get(id);
}

// ---- 画面 ---------------------------------------------------------------------------------
export function createNpcTalk({ speak = null, friends = () => ({}), rules = () => ({ max: 10, per: 3, perDay: 3, invite: 3 }), onVisit = null, onClose = null, bag = () => [], onGive = null } = {}) {
  const state = { open: false, who: null, lines: [], at: 0, variant: 'talk', choice: false, pics: null, sig: '' };
  const turns = new Map();     // key → 話した 回数（この ページの 間だけ）
  let el = null; let ui = null;

  try {
    el = document.createElement('div');
    el.id = 'ntk'; el.hidden = true; el.setAttribute('translate', 'no');
    el.innerHTML = `<div class="ntk-portrait" aria-hidden="true"><div class="ntk-frame"><span class="ntk-emoji"></span><img alt="" decoding="async" hidden></div><b class="ntk-badge"></b></div>
      <div class="ntk-box" role="dialog" aria-live="polite">
        <div class="ntk-tab"><span class="ntk-chip" aria-hidden="true"><img alt="" hidden></span><b class="ntk-name"></b><small class="ntk-kind"></small></div>
        <button type="button" class="ntk-close" aria-label="Close">✕</button>
        <div class="ntk-hearts"></div>
        <p class="ntk-line"></p>
        <p class="ntk-sub"></p>
        <div class="ntk-gift" hidden></div>
        <div class="ntk-acts"></div>
      </div>`;
    document.body.appendChild(el);
    ui = {
      frame: el.querySelector('.ntk-frame'), img: el.querySelector('.ntk-frame img'), emoji: el.querySelector('.ntk-emoji'), badge: el.querySelector('.ntk-badge'),
      chip: el.querySelector('.ntk-chip img'), name: el.querySelector('.ntk-name'), kind: el.querySelector('.ntk-kind'), hearts: el.querySelector('.ntk-hearts'),
      line: el.querySelector('.ntk-line'), sub: el.querySelector('.ntk-sub'), acts: el.querySelector('.ntk-acts'), gift: el.querySelector('.ntk-gift'), box: el.querySelector('.ntk-box'),
    };
    el.querySelector('.ntk-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
    ui.box.addEventListener('click', (e) => { if (e.target?.closest?.('button')) return; advance(); });
    el.querySelector('.ntk-portrait').addEventListener('click', () => advance());
    for (const ev of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(ev, (e) => e.stopPropagation());
    // キーは 世界に 流さない（スペースで とぶ・E で 家に 入る を ふせぐ）。
    addEventListener('keydown', (e) => {
      if (!state.open) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (k === 'Enter' || k === ' ' || k === 'e' || k === 'E') {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!e.repeat) { if (e.target?.closest?.('#ntk button') && k !== 'e' && k !== 'E') e.target.click(); else advance(); }
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopImmediatePropagation();
    }, true);
    onLangChange(() => { if (state.open) paint(); });
  } catch { el = null; ui = null; }

  // ---- おぼえて おく こと：もう さそわれた 住民（この ブラウザ）----
  function invitedSet() { try { const a = JSON.parse(localStorage.getItem(INVITED_KEY) || '[]'); return new Set(Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(-300) : []); } catch { return new Set(); } }
  function markInvited(key) { try { const s = invitedSet(); s.add(key); localStorage.setItem(INVITED_KEY, JSON.stringify([...s])); } catch { /* 保存 できなくても 会話は つづく */ } }
  const friendOf = (key) => { try { return friends()?.[key] || null; } catch { return null; } };
  const canVisit = (key) => !!friendOf(key)?.invited;

  function heartsHtml(key) {
    const fr = friendOf(key); let r = null;
    try { r = rules(); } catch { r = null; }
    const max = Number(r?.max) || 10;
    const hearts = Math.max(0, Math.min(max, Number(fr?.hearts) || 0));
    return `<span class="ntk-h" aria-label="${hearts} / ${max}"><b>${'❤'.repeat(hearts)}</b><i>${'♡'.repeat(max - hearts)}</i></span>${fr?.favourite ? `<span class="ntk-fav">${L('Loves', 'だいすき')}：${esc(fr.favourite)}</span>` : ''}`;
  }

  function setFace(mood) {
    if (!ui) return;
    const face = FACE_OF[mood] || 'smile';
    const url = state.pics?.[face] || state.pics?.smile || '';
    ui.emoji.textContent = EMOJI[mood] || EMOJI.smile;
    if (url) { if (ui.img.getAttribute('src') !== url) ui.img.src = url; ui.img.hidden = false; ui.emoji.hidden = true; }
    else { ui.img.hidden = true; ui.emoji.hidden = false; }
    const small = state.pics?.smile || '';
    if (small) { if (ui.chip.getAttribute('src') !== small) ui.chip.src = small; ui.chip.hidden = false; } else ui.chip.hidden = true;
    ui.badge.textContent = BADGE[mood] || '♪';
    ui.badge.dataset.mood = mood || 'smile';
    ui.badge.classList.remove('pop'); void ui.badge.offsetWidth; ui.badge.classList.add('pop');
  }

  function paint() {
    if (!ui || !state.who) return;
    const who = state.who; const line = state.lines[state.at] || state.lines[state.lines.length - 1];
    if (!line) return;
    const p = PERSONALITIES[who.personality];
    el.dataset.variant = state.variant === 'home' ? 'home' : 'talk';
    el.style.setProperty('--ntk-c', hex(who.color));
    ui.name.textContent = who.name?.en || who.name?.ja || '';   // 名前は いつも 英語
    ui.kind.textContent = p ? `${p.icon} ${isJa() ? p.ja : p.en}` : '';
    ui.hearts.innerHTML = heartsHtml(who.key);
    // 英語が 主役（大きく）・日本語は 小さく 下に。どちらの 言語の 画面でも 同じ（英語を 学ぶ ための 会話）。
    const main = line.en; const sub = line.ja;
    ui.line.textContent = main || sub || ''; ui.line.lang = main ? 'en' : 'ja';
    ui.sub.textContent = main ? sub || '' : ''; ui.sub.lang = 'ja';
    setFace(line.mood);
    const last = state.at >= state.lines.length - 1;
    let acts = `<button type="button" class="ntk-say" aria-label="${L('Listen', 'きく')}">🔊</button>`;
    if (state.choice && last) {
      acts += `<button type="button" class="ntk-go" data-do="visit">🏠 ${L('Visit', 'おじゃまする')}</button><button type="button" class="ntk-later" data-do="later">${L('Later', 'また こんど')}</button>`;
    } else {
      if (last && state.variant !== 'home' && canVisit(who.key)) acts += `<button type="button" class="ntk-go" data-do="visit">🏠 ${L('Go to their house', 'いえに いく')}</button>`;
      acts += `<button type="button" class="ntk-next" data-do="next" aria-label="${last ? L('Close', 'とじる') : L('Next', 'つぎへ')}">${last ? L('OK', 'おわり') : L('Next', 'つぎへ')} <i>${last ? '■' : '▼'}</i></button>`;
    }
    ui.acts.innerHTML = acts;
    // もって いる たべものを そのまま あげる（2026-11：「話してるときに 食べ物 もってたら 簡単に あげれるように」）。おすと 1 こ わたす。きめるのは 部屋。
    let items = []; try { items = (bag() || []).filter((b) => b && b.id && b.n > 0).slice(0, 6); } catch { items = []; }
    const giftOn = !!onGive && items.length > 0 && !state.choice;
    ui.gift.hidden = !giftOn;
    if (giftOn) {
      ui.gift.innerHTML = `<span class="ntk-gift-cap">🎁 ${L('Give', 'あげる')}</span>` + items.map((b) => `<button type="button" class="ntk-food" data-give="${String(b.id).replace(/[^a-z0-9_-]/gi, '')}"><i>${b.icon || '🍎'}</i><span>${String(b.en || '').replace(/[<>&"]/g, '')}</span><small>×${b.n}</small></button>`).join('');
      for (const b of ui.gift.querySelectorAll('[data-give]')) b.onclick = (e) => {
        e.stopPropagation();
        if (state.giveLock) return;
        state.giveLock = true; setTimeout(() => { state.giveLock = false; }, 1300);
        try { onGive(who, b.dataset.give); } catch { /* あげられなくても 会話は つづく */ }
      };
    } else ui.gift.innerHTML = '';
    ui.acts.querySelector('.ntk-say').onclick = (e) => { e.stopPropagation(); sayLine(); };
    // 行が かわったら 自動で 読み上げる（🔊 を おさなくても 流れる。同じ 行の 描きなおしでは 読まない）。
    if (state.spoken !== line) { state.spoken = line; sayLine(); }
    for (const b of ui.acts.querySelectorAll('[data-do]')) b.onclick = (e) => { e.stopPropagation(); act(b.dataset.do); };
  }

  function sayLine() { const line = state.lines[state.at]; if (line?.en) { try { speak?.(line.en, { japanese: false }); } catch { /* 声が なくても つづく */ } } }

  function act(what) {
    const who = state.who;
    if (what === 'next') { advance(); return; }
    if (what === 'later') {
      state.choice = false;
      state.lines = [linesFor({ personality: who.personality }).later]; state.at = 0; paint();
      return;
    }
    if (what === 'visit') { close(); try { onVisit?.(who); } catch { /* いえが なくても 会話は とじる */ } }
  }

  function advance() {
    if (!state.open) return;
    if (state.at < state.lines.length - 1) { state.at += 1; paint(); return; }
    if (state.choice) return;                       // えらぶまで とじない（✕ か Esc は いつでも）
    close();
  }

  // open({ key, name:{en,ja}, personality, seed, color, lines?, mode?, favourite? })
  //   mode: 'talk'（いつもの 会話）/ 'thanks'（あげた あとの ひとこと）/ 'home'（いえの 中）/ 'welcome'（いえに 入った とき）
  function open(info = {}) {
    if (!ui || !info || !info.key) return false;
    try {
      const who = {
        key: String(info.key), name: info.name || { en: '', ja: '' }, seed: String(info.seed ?? info.key), color: Number(info.color) || 0xcbbb95,
        personality: personalityOf(info.seed ?? info.key, info.personality), lines: Array.isArray(info.lines) ? info.lines : [],
      };
      const mode = info.mode || 'talk';
      const fr = friendOf(who.key);
      const hearts = Number(fr?.hearts) || 0;
      let phase = 'day'; let season = 'spring';
      try { phase = phaseAt().id; } catch { /* 時計が なくても ひるま */ }
      try { season = seasonNow().season; } catch { /* 季節が なくても はる */ }
      const turn = turns.get(who.key) || 0;
      const set = linesFor({ personality: who.personality, hearts, phase, season, favouriteKnown: !!info.favourite });
      let lines;
      if (mode === 'thanks') lines = [info.favourite ? set.favourite : set.thanks];
      else if (mode === 'welcome') lines = [set.welcome];
      else if (mode === 'home') { lines = homeTalk({ personality: who.personality, turn, hearts }); turns.set(who.key, turn + 1); }
      else { lines = conversation({ personality: who.personality, hearts, phase, season, turn, extra: who.lines }); turns.set(who.key, turn + 1); }
      state.variant = mode === 'home' || mode === 'welcome' || info.inHome ? 'home' : 'talk';
      // はじめて ❤ が たりた とき：さそいの ことばと 2 つの ボタン。
      state.choice = false;
      if (state.variant !== 'home' && fr?.invited && !invitedSet().has(who.key)) {
        lines = lines.concat([set.invite]); state.choice = true; markInvited(who.key);
      }
      state.who = who; state.lines = lines; state.at = 0; state.pics = null; state.open = true;
      el.hidden = false;
      document.body.dataset.npcTalk = state.variant;
      paint();
      const mine = who;
      portraitShots(who).then((pics) => { if (state.open && state.who === mine && pics) { state.pics = pics; setFace((state.lines[state.at] || {}).mood); } }).catch(() => {});
      return true;
    } catch (err) { try { console.warn('[npc-talk] ひらけない', err); } catch { /* */ } close(); return false; }
  }

  function close() {
    state.spoken = null;
    if (!state.open && el?.hidden !== false) return;
    const who = state.who;
    state.open = false; state.who = null; state.choice = false;
    try { if (el) el.hidden = true; delete document.body.dataset.npcTalk; } catch { /* */ }
    try { onClose?.(who); } catch { /* */ }
  }

  return {
    open, close, state, el,
    refresh() { if (state.open) paint(); },
    get isOpen() { return state.open; },
    canVisit, personalityOf: (info) => personalityOf(info?.seed ?? info?.key, info?.personality),
  };
}
