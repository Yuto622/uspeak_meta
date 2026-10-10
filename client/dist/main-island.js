// メインの島 — Roblox の メインワールドを、上から見た 2D の地図にした「ホーム」。
//
// 配置は main_island.json（Roblox から書き出した x, z をそのまま使う：Roblox で遊んだ子が
// 「同じ町だ」と分かるのが目的）。島そのものは 3D（main-world.js）で、これは その上に開く「しまの ちず」。建物をタップ → 下からカード → Roblox と同じ言葉の
// ボタン（「はいる」「英語で釣りをする」「レベルを かえる」）。小さい子とスマホには「リストで見る」。
//
// 動くもの（P1）：英単語ハウス 3 軒（wordhouse.js）・レベル切り替え看板・つり場（fishworld.js の
// spot "main"、3D 無し）・さかなの かいとりや・ゲート 5 つ（ワールドのカード → とぶ）・画面のボタン。
// P2 / P3 は地図に出すだけで、押すと「じゅんびちゅう」（Web に似た島があれば そこへ行ける）。
// 正解・コイン・記録は全部 部屋（wh:* / fw:* / main:*）。ここは並べて、押されたら頼むだけ。
import { t as tr, isJa, onLangChange } from './i18n.js';
import { REGION_BY_ID } from './rpg-data.js';
import { lookOf } from './world-picker.js';
import { HOUSE_INFO, LEVEL_LABEL, easyLevel, toggleEasyLevel } from './wordhouse.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const GUIDE_KEY = 'uspeak-main-guide-v1';
const VIEW_KEY = 'uspeak-main-view-v1';

// 種類ごとの色（地図のタイルとリストのカード）。
const KIND = {
  spawn: '#f2b630', word_house: '#e27a2d', level_sign: '#1b3a2f', fishing: '#1f8aa6', gate: '#7a5cc8', fish_buy: '#2f9e8f',
  area: '#8db86b', season_quiz: '#d4a021', food_shop: '#e0a526', outfit_shop: '#d9668d', block_shop: '#8a9a4a',
  housing: '#5a7fb0', battle_arena: '#b0664a', photo_booth: '#7c8a96', npc: '#4fae6b',
};
// ゲートの行き先（Web の島）。
// 屋台（main_island.json の island.spots の kind "food_shop"）。2D の地図の poi の id と同じ。
const FOOD_POI = { shop_food0: 'fruit', shop_food2: 'sweets', shop_food3: 'drinks' };
// 専用の島と 同じ お店（3D の島で 入る）。
const SHOP_POI = { clothes: ['Clothes and hats for your avatar.', 'アバターの ふくや ぼうしを かえるよ。'], blocks: ['Blocks for the plaza and BLOCKWILD.', 'ひろば と BLOCKWILD の ブロックを かえるよ。'], mansion: ['Buy your own island house.', 'じぶんの しまの いえを かえるよ。'] };
const GATE_TO = { gate_race: 'ride', gate_rpg: 'meadow', gate_build: 'town', gate_park: 'park', gate_fishing: 'fishworld' };
// じゅんびちゅうの場所に いちばん近い Web の島（あれば カードから行ける）。
const ALT = { clothes: 'wear', blocks: 'town', build_area: 'town', mansion: 'land', arena1: 'arena', arena2: 'arena', npc_talk: 'conv' };
// 子ども向けの説明（英語・ひらがな）。main_island.json の action は作る人へのメモなので画面には出さない。
const COPY = {
  spawn: ['Your adventure starts here. Try the Word Houses and the Fishing Pier!', 'ここから はじまるよ。英単語ハウスと つり場に いってみよう！'],
  hut_easy: ['10 English questions. SUPER EASY or EASY (Eiken 5).', 'えいごの もんだい 10もん。SUPER EASY か EASY（えいけん5きゅう）。'],
  hut_medium: ['10 English questions. MEDIUM (Eiken 4).', 'えいごの もんだい 10もん。MEDIUM（えいけん4きゅう）。'],
  hut_hard: ['10 English questions. HARD (Eiken 3).', 'えいごの もんだい 10もん。HARD（えいけん3きゅう）。'],
  level_sign: ['Switch the Easy house between SUPER EASY and EASY.', 'イージーの いえを SUPER EASY ⇔ EASY に かえる かんばん。'],
  fishing_pier: ['Answer in English, then reel in a fish. Same words as the Pond.', 'えいごで こたえて、さかなを つりあげよう。いけと おなじ ことば。'],
  fish_buy: ['Sell the fish you caught for coins.', 'つった さかなを うって コインに しよう。'],
  gate_fishing: ['The Fishing World: pond, river and sea.', 'フィッシングワールド：いけ・かわ・うみ。'],
  gate_race: ['Race your kart with the class.', 'クラスの みんなと カートで レース。'],
  gate_rpg: ['The RPG quest: meet buddies with English.', 'RPG の ぼうけん。えいごで なかまに であう。'],
  gate_build: ['Build with blocks.', 'ブロックで たてものを つくる。'],
  gate_park: ['The Theme Park: rides and fireworks.', 'テーマパーク：のりものと はなび。'],
};
const SCENERY = {
  GinjiDenki: ['📺', 'Electronics'], JijiBooks: ['📚', 'Books'], MogumoBurger: ['🍔', 'Burgers'], HibanaPizza: ['🍕', 'Pizza'],
  NyauruToybox: ['🧸', 'Toys'], SoraMobile: ['📱', 'Phones'], 'villager house': ['🏠', 'House'],
};
// ラベルの向き（Roblox の配置で近いもの同士がぶつからないように）。
const SIDE = { hut_easy: 'above', hut_medium: 'above', hut_hard: 'above', gate_park: 'left', gate_race: 'left', gate_build: 'left', gate_rpg: 'left', shop_food2: 'left', shop_food0: 'left', fish_buy: 'right', shop_food3: 'right', spawn: 'right', npc_talk: 'below', level_sign: 'below', photo: 'below' };
// 名前。英単語ハウスは3軒とも「英単語ハウス」なので、レベルを足して見分ける。
const NAME = {
  hut_easy: ['Word House · Easy', '英単語ハウス・イージー', 'EASY'], hut_medium: ['Word House · Medium', '英単語ハウス・ミディアム', 'MEDIUM'],
  hut_hard: ['Word House · Hard', '英単語ハウス・ハード', 'HARD'], level_sign: ['Level Sign', 'レベルの かんばん'],
};
const shortJa = (p) => NAME[p.id]?.[1] || String(p.ja).replace(/（.*?）/g, '').replace(/\(.*?\)/g, '');
const shortEn = (p) => NAME[p.id]?.[0] || String(p.en).replace(/^Word House — /, 'Word House ').replace(/ \(.+\)$/, '');
// 地図の上の札は短く（英単語ハウスはレベルだけ。3軒が並んでいるので）。
const tagEn = (p) => (p.id === 'hut_easy' ? LEVEL_LABEL[easyLevel()][0] : NAME[p.id]?.[2] || shortEn(p));
const tagJa = (p) => (p.id === 'hut_easy' ? LEVEL_LABEL[easyLevel()][1] : p.kind === 'word_house' ? LEVEL_LABEL[p.id === 'hut_medium' ? 'Medium' : 'Hard'][1] : shortJa(p));

let dataPromise = null;
const loadData = () => (dataPromise ||= fetch('main_island.json', { cache: 'no-cache' }).then((r) => r.json()));

export function createMainIsland({ send, toast, isOnline, rpg, fishworld, wordhouse, daily, dash, guide, getCoins, getLevel, getStreak, player = null, food = null, shops = {} }) {
  const root = document.createElement('div');
  root.id = 'main-island';
  root.hidden = true;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Main Island');
  document.body.append(root);
  const state = { data: null, view: 'map', open: false, picked: '', zoom: 1 };
  try { state.view = localStorage.getItem(VIEW_KEY) || (matchMedia('(max-width: 640px)').matches ? 'list' : 'map'); } catch { /* private mode */ }
  const firstTime = () => { try { return !localStorage.getItem(GUIDE_KEY); } catch { return false; } };
  const doneGuide = () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* private mode */ } root.classList.remove('guiding'); rpg.main?.setTarget(''); };

  // ---- 座標：Roblox の x, z を frame で 0〜1 に ----
  const fx = (x) => (x - state.data.frame.minX) / (state.data.frame.maxX - state.data.frame.minX) * 100;
  const fz = (z) => (z - state.data.frame.minZ) / (state.data.frame.maxZ - state.data.frame.minZ) * 100;
  const fw = (w) => w / (state.data.frame.maxX - state.data.frame.minX) * 100;
  const fd = (d) => d / (state.data.frame.maxZ - state.data.frame.minZ) * 100;
  const rect = (o) => `left:${fx(o.x - o.w / 2)}%;top:${fz(o.z - o.d / 2)}%;width:${fw(o.w)}%;height:${fd(o.d)}%`;

  function poiTile(p) {
    const color = KIND[p.kind] || '#4fae6b';
    const big = p.w >= 18 && p.d >= 12;
    const soon = p.phase > 1;
    return `${big ? `<div class="mi-foot k-${esc(p.kind)}${soon ? ' soon' : ''}" style="${rect(p)};--kc:${color}"></div>` : ''}
      <button type="button" class="mi-poi k-${esc(p.kind)}${soon ? ' soon' : ''} side-${SIDE[p.id] || 'below'}" data-poi="${esc(p.id)}" style="left:${fx(p.x)}%;top:${fz(p.z)}%;--kc:${color}"
        aria-label="${esc(isJa() ? p.ja : p.en)}">
        <span class="mi-ic">${p.icon}</span>
        <span class="mi-tag"><b class="en">${esc(tagEn(p))}</b><i class="ja">${esc(tagJa(p))}</i>${soon ? '<em>🔜</em>' : ''}</span>
      </button>`;
  }

  // 草の上の木：道・水・建物・場所に かからない所に、決まった並びで（毎回同じ島に見えるように）。
  function trees() {
    const d = state.data;
    const boxes = [...d.roads, ...d.scenery, ...d.pois.map((p) => ({ ...p, w: Math.max(p.w, 26), d: Math.max(p.d, 26) }))];
    const inWater = (x, z) => x > d.water.minX - 8 && x < d.water.maxX + 8 && z > d.water.minZ - 8;
    let s = 4242; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const out = [];
    for (let i = 0; i < 160 && out.length < 46; i += 1) {
      const x = d.frame.minX + 10 + rnd() * (d.frame.maxX - d.frame.minX - 20);
      const z = d.frame.minZ + 8 + rnd() * (d.frame.maxZ - d.frame.minZ - 16);
      if (inWater(x, z) || boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 9 && Math.abs(z - b.z) < b.d / 2 + 9)) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - z) < 16)) continue;
      out.push({ x, z, k: rnd() > 0.55 ? '🌳' : rnd() > 0.5 ? '🌲' : '🌷' });
    }
    return out.map((t) => `<span class="mi-tree" style="left:${fx(t.x)}%;top:${fz(t.z)}%">${t.k}</span>`).join('');
  }

  function mapHtml() {
    const d = state.data;
    const w = d.water;
    const spawn = d.pois.find((p) => p.id === 'spawn');
    return `<div class="mi-map-scroll"><div class="mi-map" style="--zoom:${state.zoom}">
      <div class="mi-water" style="left:${fx(w.minX)}%;top:${fz(w.minZ)}%;width:${fw(w.maxX - w.minX)}%;height:${fd(w.maxZ - w.minZ)}%"><span class="mi-water-label">${bi('Waterside', 'みずべ')}</span></div>
      ${d.roads.map((r) => `<div class="mi-road" style="${rect(r)}"></div>`).join('')}
      ${trees()}
      ${d.scenery.map((s) => { const [ic, en] = SCENERY[s.name] || ['🏠', 'House']; const quiet = s.name === 'villager house'; return `<div class="mi-scene${quiet ? ' quiet' : ''}" style="${rect(s)}">${quiet ? '' : `<span>${ic}</span><small>${bi(en, esc(s.ja))}</small>`}</div>`; }).join('')}
      ${d.pois.map(poiTile).join('')}
      ${spawn ? `<span class="mi-me" style="left:${fx(spawn.x - 12)}%;top:${fz(spawn.z - 4)}%" aria-hidden="true">🧒<em>${bi('You', 'きみ')}</em></span>` : ''}
    </div></div>
    <div class="mi-zoom"><button type="button" data-zoom="1" aria-label="ズーム">＋</button><button type="button" data-zoom="-1" aria-label="ズームアウト">－</button></div>`;
  }

  function listCard(p) {
    const color = KIND[p.kind] || '#4fae6b';
    const soon = p.phase > 1;
    return `<button type="button" class="wm-card mi-card${soon ? ' soon' : ''}" data-poi="${esc(p.id)}" style="--wc:${color}">
      <span class="wm-icon" aria-hidden="true">${p.icon}</span>
      <b class="wm-name">${esc(shortEn(p))}</b>
      <small class="wm-ja" translate="no">${esc(shortJa(p))}</small>
      ${soon ? `<em class="wm-badge here mi-soon">${bi('Coming soon', 'じゅんびちゅう')}</em>` : ''}
    </button>`;
  }

  function listHtml() {
    const d = state.data;
    const order = ['hut_easy', 'hut_medium', 'hut_hard', 'fishing_pier', 'fish_buy', 'level_sign', 'gate_fishing', 'gate_race', 'gate_rpg', 'gate_build', 'gate_park', 'spawn'];
    const p1 = order.map((id) => d.pois.find((p) => p.id === id)).filter(Boolean);
    const later = d.pois.filter((p) => p.phase > 1);
    return `<div class="mi-list">
      <h3 class="mi-sec">${bi('⭐ Play now', '⭐ いま あそべる')}</h3><div class="wm-grid">${p1.map(listCard).join('')}</div>
      <h3 class="mi-sec">${bi('🔜 Coming soon', '🔜 じゅんびちゅう')}</h3><div class="wm-grid">${later.map(listCard).join('')}</div>
    </div>`;
  }

  function render() {
    if (!state.data) return;
    root.dataset.view = state.view;
    root.innerHTML = `<div class="mi-top">
        <div class="mi-brand"><span class="mi-logo">u</span><div><b class="en">Main Island</b><i class="ja">メインの しま</i><small>U-Speak</small></div></div>
        <div class="mi-chips"><span class="mi-coins"><i aria-hidden="true">◈</i> <b id="mi-coins">${(getCoins() ?? 0).toLocaleString()}</b></span><span class="mi-lvl">Lv <b id="mi-level">${getLevel() ?? 1}</b></span></div>
        <nav class="mi-tools" aria-label="メニュー" data-t-label="メニュー">
          <button type="button" data-tool="view" class="mi-viewbtn">${state.view === 'map' ? `📋 ${bi('List', 'リストで見る')}` : `🗺 ${bi('Map', 'ちずで見る')}`}</button>
          <button type="button" data-tool="worlds">🌍 ${bi('Worlds', 'ワールド')}</button>
          <button type="button" data-tool="dex">📖 ${bi('Fish Dex', 'ずかん')}</button>
          <button type="button" data-tool="daily">🎁 ${bi('Daily', 'デイリー')}</button>
          <button type="button" data-tool="stats">📊 ${bi('Records', 'きろく')}</button>
          <button type="button" data-tool="help">❓ ${bi('Help', 'ヘルプ')}</button>
          <button type="button" data-tool="close" class="mi-go3d">🏝 ${bi('3D Island', '3Dの しま')}</button>
        </nav>
      </div>
      <div class="mi-stage">${state.view === 'map' ? mapHtml() : listHtml()}
        ${firstTime() ? `<div class="mi-hint"><span>👆</span><p>${bi('Start with a Word House or the Fishing Pier!', 'まずは 英単語ハウス か つり場 へ いってみよう！')}</p><button type="button" class="mi-hint-x" aria-label="とじる" data-t-label="とじる">✕</button></div>` : ''}
      </div>
      <div class="mi-sheet" hidden></div>`;
    if (firstTime()) root.classList.add('guiding');
    root.querySelectorAll('[data-poi]').forEach((b) => { b.onclick = () => pick(b.dataset.poi); });
    root.querySelectorAll('[data-tool]').forEach((b) => { b.onclick = () => tool(b.dataset.tool); });
    root.querySelectorAll('[data-zoom]').forEach((b) => { b.onclick = () => zoom(Number(b.dataset.zoom)); });
    const x = $('.mi-hint-x', root); if (x) x.onclick = () => { doneGuide(); $('.mi-hint', root)?.remove(); };
    if (state.view === 'map') requestAnimationFrame(() => centerOn('spawn', false));
  }

  function centerOn(id, smooth = true) {
    const sc = $('.mi-map-scroll', root); const p = state.data?.pois.find((q) => q.id === id);
    if (!sc || !p) return;
    const map = $('.mi-map', root);
    const left = (fx(p.x) / 100) * map.clientWidth - sc.clientWidth / 2;
    const top = (fz(p.z) / 100) * map.clientHeight - sc.clientHeight / 2;
    sc.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  }

  function zoom(dir) {
    state.zoom = Math.max(1, Math.min(2.2, state.zoom + dir * 0.3));
    const map = $('.mi-map', root); if (map) map.style.setProperty('--zoom', state.zoom);
  }

  // ---- 下から出るカード ----
  function sheet(html) {
    const el = $('.mi-sheet', root);
    el.innerHTML = `<div class="mi-sheet-card">${html}</div>`;
    el.hidden = false;
    $('.mi-sheet-x', el)?.addEventListener('click', closeSheet);
    el.onclick = (e) => { if (e.target === el) closeSheet(); };
    return el;
  }
  function closeSheet() { const el = $('.mi-sheet', root); if (el) { el.hidden = true; el.innerHTML = ''; } root.querySelectorAll('.picked').forEach((n) => n.classList.remove('picked')); state.picked = ''; }

  function head(p) {
    const color = KIND[p.kind] || '#4fae6b';
    return `<button type="button" class="mi-sheet-x" aria-label="とじる" data-t-label="とじる">✕</button>
      <div class="mi-sheet-head" style="--kc:${color}"><span class="mi-sheet-ic">${p.icon}</span>
        <div><h3>${bi(esc(shortEn(p)), esc(shortJa(p)))}</h3><p class="mi-sheet-sub">${p.phase > 1 ? bi('Coming soon', 'じゅんびちゅう') : bi('Open now', 'いま あそべる')}</p></div></div>`;
  }

  function pick(id) {
    const p = state.data.pois.find((q) => q.id === id);
    if (!p) return;
    closeSheet();
    state.picked = id;
    root.querySelectorAll(`[data-poi="${CSS.escape(id)}"]`).forEach((n) => n.classList.add('picked'));
    if (['hut_easy', 'fishing_pier'].includes(id)) doneGuide();
    const copy = COPY[id];
    const desc = copy ? `<p class="mi-sheet-desc">${bi(copy[0], copy[1])}</p>` : '';
    // ゲート：ワールド選択と同じカードで行き先を見せる。
    if (GATE_TO[id]) {
      const dest = REGION_BY_ID[GATE_TO[id]];
      const [icon, color] = lookOf(dest);
      const open = rpg.store.unlocked(dest.id);
      const el = sheet(`${head(p)}${desc}
        <div class="mi-dest"><div class="wm-card${open ? '' : ' locked'}" style="--wc:${color}"><span class="wm-icon">${icon}</span><b class="wm-name">${esc(String(dest.en || dest.name).replace(/\s+Island$/i, ''))}</b><small class="wm-ja" translate="no">${esc(dest.yomi || dest.name)}</small>${open ? '' : '<span class="wm-lock">🔒</span>'}</div></div>
        <div class="mi-acts"><button type="button" class="mi-act primary" data-act="go">${bi('Enter', 'はいる')}</button></div>`);
      $('[data-act="go"]', el).onclick = () => goWorld(dest.id);
      return;
    }
    // 屋台（3D の島で 買える）：地図からは その屋台の前へ つれていく。
    if (SHOP_POI[id]) {
      const el = sheet(`${head(p)}<p class="mi-sheet-desc">${bi(SHOP_POI[id][0], SHOP_POI[id][1])}</p>
        <div class="mi-acts"><button type="button" class="mi-act primary" data-act="stall">${bi('🚶 Go to the shop', '🚶 おみせへ いく')}</button></div>`);
      $('[data-act="stall"]', el).onclick = () => toStall(id);
      return;
    }
    if (FOOD_POI[id]) {
      const el = sheet(`${head(p)}<p class="mi-sheet-desc">${bi('Buy food with U-Speak coins. Eat it to fill your hunger 🍗.', 'U-Speak コインで たべものを かえるよ。たべると おなか 🍗 が ふえる。')}</p>
        <div class="mi-acts"><button type="button" class="mi-act primary" data-act="stall">${bi('🛒 Go to the stall', '🛒 やたいへ いく')}</button></div>`);
      $('[data-act="stall"]', el).onclick = () => toStall(id);
      return;
    }
    if (p.phase > 1) {
      const alt = ALT[id] ? REGION_BY_ID[ALT[id]] : null;
      const el = sheet(`${head(p)}<p class="mi-sheet-desc">${bi('This place is being built. Coming soon!', 'ここは いま じゅんびちゅう。もうすこし まってね！')}</p>
        ${alt ? `<div class="mi-acts"><button type="button" class="mi-act" data-act="alt">${bi(`Try ${esc(String(alt.en).replace(/\s+Island$/i, ''))} instead`, `にている ところ：${esc(alt.name)}`)} →</button></div>` : ''}`);
      if (alt) $('[data-act="alt"]', el).onclick = () => goWorld(alt.id);
      return;
    }
    const acts = [];
    if (p.kind === 'word_house') acts.push(['house', bi('Enter', 'はいる')]);
    if (id === 'level_sign') acts.push(['level', bi('Change level', 'レベルを かえる')]);
    if (id === 'fishing_pier') { acts.push(['fish', bi('🎣 Fish in English', '🎣 英語で釣りをする')]); acts.push(['dex', bi('📖 Fish Dex', '📖 ずかん')]); }
    if (id === 'fish_buy') acts.push(['sell', bi('🐟 Sell fish', '🐟 さかなを うる')]);
    if (id === 'spawn') { acts.push(['to:hut_easy', bi('📖 Word House', '📖 英単語ハウス')]); acts.push(['to:fishing_pier', bi('🎣 Fishing Pier', '🎣 つり場')]); }
    const level = id === 'level_sign' || id === 'hut_easy' ? `<p class="mi-level-now">${bi('Now', 'いまは')}: <b>${esc(LEVEL_LABEL[easyLevel()][0])}</b></p>` : '';
    const el = sheet(`${head(p)}${desc}${level}<div class="mi-acts">${acts.map(([k, label], i) => `<button type="button" class="mi-act${i === 0 ? ' primary' : ''}" data-act="${k}">${label}</button>`).join('')}</div>`);
    el.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => act(p, b.dataset.act); });
  }

  function act(p, what) {
    if (what.startsWith('to:')) { const to = what.slice(3); if (state.view === 'map') centerOn(to); pick(to); return; }
    if (what === 'house') { closeSheet(); wordhouse.open(p.id); return; }
    if (what === 'level') {
      const next = toggleEasyLevel();
      toast(tr('レベルを {lv} に かえたよ', { lv: LEVEL_LABEL[next][0] }));
      render();
      pick(p.id);
      return;
    }
    if (!isOnline()) { toast(tr('オンラインで あそべます。')); return; }
    closeSheet();
    if (what === 'fish') fishworld.enter({ id: 'main', zone: 1 }, { flat: true, auto: true });
    if (what === 'dex') fishworld.enter({ id: 'main', zone: 1 }, { flat: true, tab: 'dex' });
    if (what === 'sell') fishworld.enter({ id: 'main', zone: 1 }, { flat: true, tab: 'bag' });
  }

  function toStall(id) {
    close();
    if (rpg.state.current !== 'main') rpg.activate('main', true, true);
    const isl = rpg.main?.data;
    const sp = isl?.spots.find((q) => q.id === id);
    // 戸口の すこし手前に 立たせる（屋台は 南に 建つので 北がわ、お店の 建物は 北に 建つので 南がわ）。
    if (sp && player) player.position.set(isl.x + sp.x, 0, isl.z + sp.z + (sp.kind === 'food_shop' ? -2.5 : 2.5));
  }

  function goWorld(id) {
    if (!rpg.store.unlocked(id)) { toast(tr('まだ ひらいていません')); return; }
    close();
    if (rpg.state.current !== id && rpg.fly(id) === false) rpg.activate(id, true);
  }

  function tool(what) {
    if (what === 'view') { state.view = state.view === 'map' ? 'list' : 'map'; try { localStorage.setItem(VIEW_KEY, state.view); } catch { /* private */ } render(); return; }
    if (what === 'close') { close(); return; }
    if (what === 'worlds') { rpg.openMap(); return; }
    if (what === 'help') { guide.open(); return; }
    if (what === 'stats') { if (!isOnline()) { toast(tr('オンラインで あそべます。')); return; } dash.open(); return; }
    if (what === 'daily') { if (!isOnline()) { toast(tr('オンラインで あそべます。')); return; } daily.openLogin(getStreak?.() || 0); return; }
    if (what === 'dex') { if (!isOnline()) { toast(tr('オンラインで あそべます。')); return; } fishworld.enter({ id: 'main', zone: 1 }, { flat: true, tab: 'dex' }); }
  }

  // ほかの道（🌍 ワールド・先生の集合・同梱のゲーム）で島を出たら、ホームは自分で閉じる。
  // 開いたままだと 3D が止まっている（game.js）ので、ひこうきが飛ばない。
  let watch = 0;
  function watchTravel() {
    // 「出かけた しゅんかん」だけ とじる。とんでいる さいちゅうに 🏠 で ひらいたときは そのまま。
    const travelling = () => { const b = document.body.dataset; return rpg.state.mode === 'flight' || !!(b.race || b.gp || b.arcade); };
    let was = travelling();
    clearInterval(watch);
    watch = setInterval(() => {
      if (!state.open) { clearInterval(watch); return; }
      const now = travelling();
      if (now && !was) close();
      was = now;
    }, 250);
  }

  async function open() {
    state.data ||= await loadData();
    state.open = true;
    watchTravel();
    root.hidden = false;
    document.body.dataset.main = '1';
    render();
  }
  function close() {
    if (!state.open) return;
    state.open = false;
    closeSheet();
    root.hidden = true;
    delete document.body.dataset.main;
  }
  function refresh() {
    const c = $('#mi-coins', root); if (c) c.textContent = (getCoins() ?? 0).toLocaleString();
    const l = $('#mi-level', root); if (l) l.textContent = String(getLevel() ?? 1);
  }
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (state.picked) closeSheet(); } });
  onLangChange(() => { if (state.open) { const picked = state.picked; render(); if (picked) pick(picked); } });

  // ---- 3D のメインの島（main-world.js）----------------------------------------------------
  // 戸口に入ったとき（net-client の setDoorHandler）と、E / 「ここで …」ボタンのとき。2D の地図と同じことをする。
  function walkIn(spot) {
    if (!spot) return false;
    if (['hut_easy', 'fishing_pier'].includes(spot.id)) doneGuide();
    if (spot.kind === 'gate') { goWorld(spot.to); return true; }
    // 英会話の お店：戸口では 中に 入る（false ＝ island-interior の 部屋へ）。中の カウンターで ウーピーと 話す。
    if (spot.kind === 'talk_shop') { if (rpg.insideBuilding) { shops.conv?.enter(spot); return true; } return false; }
    // たてる ばしょ → BLOCKWILD（ブロックの 世界。オフラインでも 開く）。
    if (spot.kind === 'blockwild') { shops.blockwild?.open(); return true; }
    if (spot.kind === 'word_house') { wordhouse.open(spot.house || spot.id); return true; }
    if (spot.kind === 'level_sign') {
      const next = toggleEasyLevel();
      toast(tr('レベルを {lv} に かえたよ', { lv: LEVEL_LABEL[next][0] }));
      return true;
    }
    if (!isOnline()) { toast(tr('オンラインで あそべます。')); return true; }
    if (spot.kind === 'fishing') fishworld.enter({ id: 'main', zone: 1 }, { flat: true, auto: true });
    if (spot.kind === 'fish_buy') fishworld.enter({ id: 'main', zone: 1 }, { flat: true, tab: 'bag' });
    if (spot.kind === 'food_shop') food?.openShop(spot.shop);
    // 専用の島と 同じ お店：ふくや → きせかえの 3D の店、ブロックや → まちづくり島の ブロック屋、いえの おみせ → 土地島の ふどうさん。
    if (spot.kind === 'wear_shop') shops.wardrobe?.open({});
    if (spot.kind === 'block_shop') shops.town?.enter({ kind: 'shop' });
    if (spot.kind === 'land_shop') shops.land?.enter({ kind: 'office' });
    return true;
  }
  const LABEL = {
    word_house: (sp) => `📖 ${tr('はいる')}（${LEVEL_LABEL[sp.id === 'hut_easy' ? easyLevel() : HOUSE_INFO[sp.id]?.levels?.[0] || 'Easy']?.[0] || ''}）`,
    level_sign: () => tr('🔁 レベルを かえる'),
    fishing: () => tr('🎣 英語で釣りをする'),
    fish_buy: () => tr('🐟 さかなを うる'),
    food_shop: () => tr('🛒 たべものを かう'),
    wear_shop: () => tr('👕 ふくを 見る'),
    block_shop: () => tr('🧱 ブロックを 見る'),
    land_shop: () => tr('🏠 いえを 見る'),
    blockwild: () => '⛏ BLOCKWILD',
    talk_shop: (sp) => (rpg.insideBuilding ? `🗣 ${tr('英語で はなす')}` : `🚪 ${tr('はいる')}`),
    gate: (sp) => `🌀 ${isJa() ? String(sp.ja || '').replace(/への ゲート$/, '') : sp.character} →`,
  };
  const label = (spot) => (LABEL[spot?.kind] || (() => tr('はいる')))(spot);

  // ホーム＝メインの島。はじめて クラスに入ったときは その場で島に立たせる（飛ばない）。
  // あとで 🏠 を押したときは ひこうきで行く。島にいるときの 🏠 は 2D の地図（リストでも見られる）。
  const homeState = { homed: false, from: null };
  function goHome({ first = false } = {}) {
    if (rpg.state.current === 'main') { if (!first) open(); return; }
    if (first) {
      if (player) homeState.from = { id: rpg.state.current, x: player.position.x, y: player.position.y, z: player.position.z };
      rpg.activate('main', true, true);
      homeState.homed = true;
      // はじめての子には 光の柱で 英単語ハウス（イージー）を さす（入ったら きえる）。
      let seen = false; try { seen = localStorage.getItem(GUIDE_KEY) === '1'; } catch { /* private */ }
      if (!seen) rpg.main?.setTarget('hut_easy');
      return;
    }
    if (rpg.fly('main') === false) rpg.activate('main', true, true);
  }
  // 島にいた時間（session / main）は 3D の島に立っている間。入った・出たを部屋に言うだけで、数えるのは部屋。
  let onIsland = false;
  setInterval(() => {
    const now = rpg.state.current === 'main' && rpg.state.mode !== 'flight' && isOnline();
    if (now !== onIsland) { onIsland = now; send(now ? 'main:enter' : 'main:leave', {}); }
  }, 1000);

  // 検査用：はじめのホームを取り消して、入ったときの場所に戻す（e2e は U-Speak島の上で歩く）。
  function skipHome() {
    close();
    const f = homeState.from;
    if (!f) return;
    homeState.from = null;
    rpg.activate(f.id, false, true);
    if (player) player.position.set(f.x, f.y, f.z);
  }

  return { open, close, refresh, pick, walkIn, label, goHome, skipHome, get homed() { return homeState.homed; }, get isOpen() { return state.open; }, state };
}
