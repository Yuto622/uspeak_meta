// 左の「つぎに やること」（/admin/tasks の はじめの100）。
// 中身は ぜんぶ 部屋が 決める（tasks:state）。ここは ならべるだけで、すんだかどうかも コインも 決めない。
// ページにしか 分からない こと（画面を ひらいた・はなしかけた）は task:ui で 名前だけ 言う（部屋が 一覧と てらす）。
//
// 置き場所は 左の クエストの 入れ物（.quest-panel）の いちばん 上。U-Speak島では 島の クエストの 上に、
// ほかの 島（.on-errand-island で 入れ物が 消える 島）では 入れ物ごと 出して カードだけ 見せる（tasks.css）。
import { isJa, onLangChange, t as tr } from './i18n.js';

const FOLD_KEY = 'uspeak-tasks-fold-v1';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createTaskCard({ send = () => {}, isOnline = () => false } = {}) {
  const panel = document.querySelector('.quest-panel');
  const card = document.createElement('section');
  card.id = 'task-card';
  card.hidden = true;
  card.setAttribute('aria-live', 'polite');
  if (panel) panel.prepend(card); else document.body.append(card);

  let data = null;
  let cheer = null;
  let cheerTimer = 0;
  let folded = false;
  try { folded = localStorage.getItem(FOLD_KEY) === '1'; } catch { /* private mode */ }

  const text = (task) => (isJa() ? task.ja : (task.en || task.ja));

  function render() {
    const on = !!data && isOnline() && !data.all;
    card.hidden = !on;
    panel?.classList.toggle('has-tasks', on);
    if (!on) return;
    const ch = data.chapter;
    const pct = Math.round((ch.done / Math.max(1, ch.size)) * 100);
    const left = ch.size - ch.done;
    const count = data.framing === 'left'
      ? tr('あと {0}こ', [left])
      : tr('{0}こ できた', [ch.done]);
    const [first, ...rest] = data.tasks;
    const meter = (task) => (task.need > 1
      ? `<span class="task-meter"><i style="width:${Math.round((task.have / task.need) * 100)}%"></i></span><b class="task-count">${task.have} / ${task.need}</b>`
      : '');
    const reward = (task) => (task.coins > 0 ? `<span class="task-coins">🪙 ${task.coins}</span>` : (task.xp > 0 ? `<span class="task-coins">✧ ${task.xp} XP</span>` : ''));
    card.classList.toggle('folded', folded);
    card.innerHTML = `
      <button type="button" class="task-head" aria-expanded="${!folded}">
        <span class="task-eyebrow">${tr('つぎに やること')}</span>
        <span class="task-chapter">${esc(isJa() && ch.name ? ch.name : tr('しょう {0}', [ch.n]))} · ${count}</span>
        <span class="task-fold" aria-hidden="true">${folded ? '▾' : '▴'}</span>
      </button>
      <div class="task-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      ${cheer ? `<div class="task-cheer">✓ ${esc(cheer)}</div>` : ''}
      ${first ? `<div class="task-now">
        <strong>${esc(text(first))}</strong>
        ${first.where && isJa() ? `<small>📍 ${esc(first.where)}</small>` : ''}
        <div class="task-row">${meter(first)}${reward(first)}</div>
      </div>` : ''}
      ${rest.length ? `<ol class="task-next">${rest.map((task) => `<li><span>${esc(text(task))}</span>${task.need > 1 ? `<b>${task.have}/${task.need}</b>` : ''}</li>`).join('')}</ol>` : ''}
      ${ch.reward > 0 ? `<p class="task-goal">${tr('この しょうを おえると 🪙 {0}', [ch.reward])}</p>` : ''}`;
  }

  card.addEventListener('click', (e) => {
    if (!e.target.closest('.task-head')) return;
    folded = !folded;
    try { localStorage.setItem(FOLD_KEY, folded ? '1' : '0'); } catch { /* private mode */ }
    render();
  });

  onLangChange(render);

  // ---- ページにしか 分からない こと ---------------------------------------------
  const sent = new Set();
  const ui = (name, once = true) => {
    if (!isOnline()) return;
    if (once && sent.has(name)) return;
    sent.add(name);
    send('task:ui', { name });
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('button, a, [data-quest], .mi-poi');
    if (!el) return;
    if (el.matches('#journal')) ui('wordbook');
    else if (el.matches('#mapbtn, #flight-button')) ui('worldmap');
    else if (el.matches('[data-fish-tab="book"], [data-fw-tab="dex"], .fw-dexdock, .fw-dexdock *')) ui('fishdex');
    else if (el.matches('#rank-button')) ui('ranking');
    else if (el.matches('[data-ride]')) ui('ride');
    else if (el.closest('#fishing-content') && el.matches('[data-item]')) ui('equip');
    else if (el.closest('#main-island') && el.closest('.mi-poi, .mi-sheet-card, .wm-card, .mi-list button')) ui('homemap_poi');
    else if (el.matches('#interact')) {
      if (/Emma/i.test(el.textContent || '')) ui('emma');
      ui('talk', false);
    }
  }, true);

  // 画面の ようすを 見る（ひらいた・かわった）。
  const body = document.body;
  let lastArcade = '';
  let lastBuddies = -1;
  let lastQuests = -1;
  const watch = () => {
    // おつかいの 道しるべ（#errand-hud）が 出ている 間は そちらが 左の 主役。
    body.classList.toggle('errand-busy', !!document.querySelector('#errand-hud:not([hidden])'));
    if (body.dataset.main) ui('homemap');
    if (document.querySelector('#bag-dialog[open]')) ui('bag');
    const arcade = body.dataset.arcade || '';
    if (arcade && arcade !== lastArcade) ui(arcade === 'blockwild' ? 'blockwild' : 'minigame', false);
    lastArcade = arcade;
    const buddies = parseInt(document.querySelector('#rpg-count')?.textContent || '', 10);
    if (Number.isFinite(buddies)) {
      if (lastBuddies >= 0 && buddies > lastBuddies) ui('buddy', false);
      lastBuddies = buddies;
    }
    const quests = parseInt(document.querySelector('#count')?.textContent || '', 10);
    if (Number.isFinite(quests)) {
      if (lastQuests >= 0 && quests > lastQuests) ui('quest', false);
      lastQuests = quests;
    }
  };
  setInterval(watch, 700);

  return {
    set(payload) { data = payload || null; render(); },
    // 部屋が すませた。カードの 上に ちいさく 出してから つぎへ（コインは coin-hud が 降らせる）。
    done(msg) {
      const first = msg?.tasks?.[0];
      const chapter = msg?.chapters?.[0];
      if (!first && !chapter) return;
      cheer = chapter ? tr('「{0}」 クリア！', [chapter.name || chapter.n]) : text(first);
      card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
      clearTimeout(cheerTimer);
      cheerTimer = setTimeout(() => { cheer = null; render(); }, 2600);
      render();
    },
    refresh: render,
    element: card,
  };
}
