// 幼児モード — 先生が /teacher/kids（運営は /admin/kids）で オンに した 子の かんたんな 画面。
//
// きめるのは 部屋（welcome の `kids` と、かわった ときの 'kids' メッセージ）。ここは 画面の 出し分けだけ：
// `body[data-mode=kids]` を 立て、kids.css が ふだんの 道具（冒険ノート・ランキング・こまかい 設定…）を しまう。
// - こどもの ホーム（`#kids-home`）：大きな 絵の ボタン 5 つ。どれにも 🔊（読み上げ）。入った ときに まず これが 出る。
// - 島の 上では 下に 行き先ボタン（`#kids-dock`）：おすと その 戸口へ 自動で 行く（歩かなくて いい）。
// 判定・コイン・記録は ふつうの モードと 同じ（ここでは 何も きめない）。
import { isJa, onLangChange } from './i18n.js';

// 幼児モードで 行ける 島（しまの ちずに 出す もの）。world-picker.js も これを 見る。
export const KIDS_ISLANDS = ['main', 'reading', 'fishworld', 'wear', 'land'];
export const kidsOn = () => globalThis.document?.body?.dataset.mode === 'kids';

const HOME = [
  { id: 'today', icon: '🌟', ja: 'きょうの がくしゅう', en: "Today's Lesson", color: '#e27a2d' },
  { id: 'books', icon: '📚', ja: 'ほんだな', en: 'Books', color: '#6b4c9c' },
  { id: 'map', icon: '🗺️', ja: 'しまの ちず', en: 'Map', color: '#2fa3b8' },
  { id: 'wear', icon: '👕', ja: 'きせかえ', en: 'Dress Up', color: '#b06fc4' },
  { id: 'play', icon: '🎮', ja: 'あそぶ', en: 'Play', color: '#4fae6b' },
];
// メインの島は 建物が 多いので、行き先は この 3 つだけ。ほかの 島は その 島の 建物 ぜんぶ（4 つまで）。
const MAIN_SPOTS = [
  { id: 'hut_easy', icon: '📖', ja: 'えいたんご', en: 'Words' },
  { id: 'fishing_pier', icon: '🎣', ja: 'つり', en: 'Fishing' },
  { id: 'clothes', icon: '👕', ja: 'ふくや', en: 'Clothes' },
];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const two = (o) => `<b class="en">${esc(o.en)}</b><i class="ja">${esc(o.ja)}</i>`;

export function createKidsUI({ speak, toast, rpg, player, goPlace, isOnline, pendingHomework, openHomework, openReading, openWardrobe, openMap, enterMain, logout }) {
  const state = { on: false, home: false, island: '' };
  const say = (o) => { try { speak(isJa() ? o.ja : o.en, { japanese: isJa() }); } catch { /* 声が 出なくても 画面は つかえる */ } };

  const home = document.createElement('div');
  home.id = 'kids-home'; home.hidden = true; home.setAttribute('translate', 'no');
  const dock = document.createElement('nav');
  dock.id = 'kids-dock'; dock.hidden = true; dock.setAttribute('translate', 'no');
  document.body.append(home, dock);

  function renderHome() {
    const todo = pendingHomework?.() || 0;
    home.innerHTML = `<div class="kh-inner">
      <header class="kh-head"><h2>${two({ en: 'Hello!', ja: 'こんにちは！' })}</h2>
        <button type="button" class="kh-say" data-say="hello" aria-label="よみあげ">🔊</button></header>
      <div class="kh-grid">${HOME.map((b) => `<div class="kh-card" style="--kc:${b.color}">
        <button type="button" class="kh-go" data-go="${b.id}"><span class="kh-icon" aria-hidden="true">${b.icon}</span><span class="kh-name">${two(b)}</span>
          ${b.id === 'today' && todo ? `<em class="kh-badge">${todo}</em>` : ''}</button>
        <button type="button" class="kh-say" data-say="${b.id}" aria-label="よみあげ">🔊</button></div>`).join('')}</div>
      <footer class="kh-foot"><button type="button" class="kh-out" data-go="out">⏏ ${two({ en: 'Log out', ja: 'おわる' })}</button></footer>
    </div>`;
  }
  home.addEventListener('click', (e) => {
    const s = e.target.closest('[data-say]');
    if (s) { say(s.dataset.say === 'hello' ? { ja: 'こんにちは！ なにを する？', en: 'Hello! What do you want to do?' } : HOME.find((b) => b.id === s.dataset.say)); return; }
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });
  function go(id) {
    if (id === 'out') { logout?.(); return; }
    if (id === 'play') { closeHome(); return; }
    if (id !== 'play' && !isOnline()) { toast('オンラインで あそべます。'); return; }
    // 宿題・本だなは ホームの 上に ひらく（とじると ホームに もどる）。
    if (id === 'today') { if (pendingHomework?.() > 0) openHomework(); else openReading(); return; }
    if (id === 'books') { openReading(); return; }
    if (id === 'wear') { openWardrobe(); return; }
    if (id === 'map') { closeHome(); openMap(); }
  }
  function openHome() {
    if (!state.on) return;
    for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'net-lobby' && d.id !== 'avatar-dialog') d.close();
    renderHome(); home.hidden = false; state.home = true; document.body.dataset.kidsHome = '1';
  }
  function closeHome() { home.hidden = true; state.home = false; delete document.body.dataset.kidsHome; renderDock(true); }

  // ---- 島の 上：行き先ボタン（おすと 戸口へ） ----
  function spotsHere() {
    const id = rpg.state.current; const data = rpg[id]?.data;
    if (!data?.spots || !KIDS_ISLANDS.includes(id)) return [];
    if (id === 'main') return MAIN_SPOTS.map((m) => ({ ...m, spot: data.spots.find((s) => s.id === m.id) })).filter((m) => m.spot);
    return data.spots.slice(0, 4).map((s) => ({ id: s.id, icon: s.tone || s.icon || '🚪', ja: s.name || s.ja || s.id, en: s.en || s.name || s.id, spot: s }));
  }
  let shown = [];
  function renderDock(force = false) {
    if (!state.on) { dock.hidden = true; return; }
    const id = rpg.state.current;
    if (!force && id === state.island) return;
    state.island = id; shown = spotsHere();
    dock.innerHTML = `<button type="button" class="kd-btn kd-home" data-kd="home"><span aria-hidden="true">🏠</span><small>${two({ en: 'Home', ja: 'ホーム' })}</small></button>`
      + shown.map((s, i) => `<button type="button" class="kd-btn" data-kd="${i}"><span aria-hidden="true">${esc(s.icon)}</span><small>${two(s)}</small></button>`).join('');
    dock.hidden = false;
  }
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kd]'); if (!b) return;
    if (b.dataset.kd === 'home') { openHome(); return; }
    const s = shown[Number(b.dataset.kd)]; if (!s) return;
    say(s);
    walkTo(rpg.state.current, s.spot);
  });
  // 戸口の 前へ（歩かなくて いい）。メインの島は そのまま 中の 画面を ひらく。ほかの 島は 戸口に 立たせると 島が ひらく。
  function walkTo(islandId, spot) {
    const isl = rpg[islandId]?.data; if (!isl || !spot) return;
    if (islandId === 'main') {
      if (!goPlace({ island: 'main', to: spot.id })) return;
      enterMain?.(spot);
      return;
    }
    for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'net-lobby') d.close();
    // island-kit の 戸口は 建物の まんなかから 0.65 手前（doorNear が ひろう）。
    player.position.set(isl.x + spot.x, 0, isl.z + spot.z - 0.65);
  }

  function set(on, { first = false } = {}) {
    on = !!on;
    if (on === state.on) { if (on && first) openHome(); return; }
    state.on = on;
    if (on) {
      document.body.dataset.mode = 'kids';
      state.island = '';
      openHome();
      toast(isJa() ? '🧸 かんたんな がめんに なったよ' : '🧸 Easy screen is on');
    } else {
      delete document.body.dataset.mode; delete document.body.dataset.kidsHome;
      home.hidden = true; dock.hidden = true; state.home = false;
    }
    dispatchEvent(new CustomEvent('uspeak:kids', { detail: on }));
  }
  // いる 島が かわったら 行き先を かきかえる（飛んでいる 間・全画面の あそびの 間は CSS が しまう）。
  setInterval(() => { if (state.on && !state.home) renderDock(); }, 600);
  onLangChange(() => { if (state.on) { if (state.home) renderHome(); renderDock(true); } });

  return { set, openHome, closeHome, refresh: () => { if (state.home) renderHome(); }, get on() { return state.on; }, get homeOpen() { return state.home; }, state };
}
