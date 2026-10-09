// 英単語ハウス（メインの島）の画面 — Roblox の WordHouse と同じ：1 回 10 問、形式はレベルごとの抽選。
//
// ページは答えを知らない。`wh:start {house, level}` → `wh:ask`、`wh:answer` → `wh:result`
// （まちがい → retry と同じ問題、正解 → next に つぎの問題、さいご → done）。コインは部屋が払う。
// 問題の見た目と操作は formats-ui（つり島と同じ部品）。
import { t as tr, isJa } from './i18n.js';
import { renderFormat, confetti } from './formats-ui.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;

export const HOUSE_INFO = {
  hut_easy: { icon: '📗', color: '#4fae6b', en: 'Word House — Easy', ja: '英単語ハウス（イージー）', levels: ['SuperEasy', 'Easy'], grade: ['Eiken 5', 'えいけん5きゅう'] },
  hut_medium: { icon: '📙', color: '#e08a2c', en: 'Word House — Medium', ja: '英単語ハウス（ミディアム）', levels: ['Medium'], grade: ['Eiken 4', 'えいけん4きゅう'] },
  hut_hard: { icon: '📘', color: '#3f6fb8', en: 'Word House — Hard', ja: '英単語ハウス（ハード）', levels: ['Hard'], grade: ['Eiken 3', 'えいけん3きゅう'] },
};
export const LEVEL_LABEL = { SuperEasy: ['SUPER EASY', 'スーパーイージー'], Easy: ['EASY', 'イージー'], Medium: ['MEDIUM', 'ミディアム'], Hard: ['HARD', 'ハード'] };
const LEVEL_KEY = 'uspeak-wordhouse-easy-v1';

// SUPER EASY ⇔ EASY は看板で切り替える（Roblox の「レベルを かえる」）。この端末に覚えておく。
export function easyLevel() { try { return localStorage.getItem(LEVEL_KEY) === 'Easy' ? 'Easy' : 'SuperEasy'; } catch { return 'SuperEasy'; } }
export function toggleEasyLevel() { const next = easyLevel() === 'Easy' ? 'SuperEasy' : 'Easy'; try { localStorage.setItem(LEVEL_KEY, next); } catch { /* private mode */ } return next; }

export function createWordHouseUI({ send, toast, speak, isOnline, onCoins = () => {} }) {
  const state = { house: '', level: '', ask: null, ctl: null, marks: [], busy: false };
  const dialog = document.createElement('dialog');
  dialog.id = 'wh-dialog';
  dialog.innerHTML = `<div class="wh-head">
      <div class="wh-head-text"><small>WORD HOUSE · <span id="wh-level">EASY</span></small><h2 id="wh-title">英単語ハウス</h2></div>
      <div class="wh-dots" id="wh-dots" aria-hidden="true"></div>
      <button type="button" id="wh-close" aria-label="とじる" data-t-label="とじる">✕</button>
    </div><div id="wh-body"></div>`;
  document.body.append(dialog);
  const body = $('#wh-body', dialog);
  $('#wh-close', dialog).onclick = () => close();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  function close() {
    if (state.busy) send('wh:quit', {});
    state.busy = false; state.ask = null;
    state.ctl?.destroy?.(); state.ctl = null;
    if (dialog.open) dialog.close();
  }

  function head() {
    const h = HOUSE_INFO[state.house] || HOUSE_INFO.hut_easy;
    dialog.style.setProperty('--hc', h.color);
    const lv = LEVEL_LABEL[state.level] || LEVEL_LABEL.Easy;
    $('#wh-level', dialog).textContent = lv[0];
    $('#wh-title', dialog).innerHTML = `${h.icon} ${bi(esc(h.en), esc(h.ja))}`;
    $('#wh-dots', dialog).innerHTML = state.busy ? Array.from({ length: 10 }, (_, i) => `<i class="${state.marks[i] || (i === (state.ask?.i ?? -1) ? 'now' : '')}"></i>`).join('') : '';
  }

  // はいる：はじめる前の画面。どのレベルで何問かを見せて、ボタン1つ。
  function open(house) {
    if (!isOnline()) { toast(tr('英単語ハウスは オンラインで あそべます。')); return; }
    state.house = HOUSE_INFO[house] ? house : 'hut_easy';
    state.level = state.house === 'hut_easy' ? easyLevel() : HOUSE_INFO[state.house].levels[0];
    state.busy = false; state.marks = []; state.ask = null;
    const h = HOUSE_INFO[state.house];
    const lv = LEVEL_LABEL[state.level];
    head();
    body.innerHTML = `<div class="wh-start" style="--hc:${h.color}">
      <div class="wh-badge"><span>${h.icon}</span></div>
      <p class="wh-level-chip">${esc(lv[0])} · ${bi(h.grade[0], h.grade[1])}</p>
      <h3>${bi('10 questions', '10もん')}</h3>
      <ul class="wh-rules">
        <li>✅ ${bi('Right first time: ◈ 4 + XP', '1かいで せいかい：◈ 4 と XP')}</li>
        <li>🔁 ${bi('Wrong? Try the same question again (◈ 2)', 'まちがえたら おなじ もんだいを もういちど（◈ 2）')}</li>
        <li>🌟 ${bi('All 10 right first time: bonus ◈ 20', '10もん ぜんぶ 1かいで せいかい：ボーナス ◈ 20')}</li>
      </ul>
      ${state.house === 'hut_easy' ? `<p class="wh-fine">${bi('SUPER EASY ⇔ EASY: use the level sign by the door.', 'SUPER EASY ⇔ EASY は 入口の かんばんで かえられるよ。')}</p>` : ''}
      <button type="button" class="wh-go">${bi('▶ Start', '▶ はじめる')}</button>
    </div>`;
    $('.wh-go', body).onclick = () => { state.busy = true; send('wh:start', { house: state.house, level: state.level }); };
    if (!dialog.open) dialog.showModal();
  }

  function renderAsk(m) {
    state.ask = m;
    state.busy = true;
    if (m.level) state.level = m.level;
    head();
    state.ctl?.destroy?.();
    body.innerHTML = '';
    state.ctl = renderFormat(body, m.format, {
      speak,
      onQuit: () => close(),
      onCheck: (answer) => send('wh:answer', { qid: m.qid, answer }),
    });
  }

  function onAsk(m) { if (!dialog.open) dialog.showModal(); renderAsk(m); }

  function onResult(m) {
    if (!state.ctl || !state.ask || m.qid !== state.ask.qid) return;
    if (m.wallet) onCoins(m.wallet);
    const i = state.ask.i;
    if (m.correct) state.marks[i] = m.attempt >= 2 ? 'half' : 'ok';
    else if (!m.retry) state.marks[i] = 'ng';
    state.ctl.showResult(m.correct, { diff: m.diff, reveal: m.reveal, escaped: !m.correct && !m.retry });
    if (m.coins > 0) toast(`◈ +${m.coins}`);
    if (m.capped) toast(tr('きょうの 英単語ハウスの コインは ここまで。XP は もらえるよ。'));
    head();
    if (m.retry) setTimeout(() => { if (state.ask?.qid === m.qid) renderAsk({ ...state.ask, attempt: 2, format: m.format }); }, 1700);
    else if (m.next) setTimeout(() => { if (state.ask?.qid === m.qid) renderAsk(m.next); }, m.correct ? 1100 : 2400);
    else if (m.done) setTimeout(() => showDone(m.done), m.correct ? 1100 : 2400);
  }

  function showDone(d) {
    state.busy = false;
    state.ctl?.destroy?.(); state.ctl = null; state.ask = null;
    head();
    const stars = d.correct >= 10 ? 3 : d.correct >= 7 ? 2 : d.correct >= 4 ? 1 : 0;
    body.innerHTML = `<div class="wh-done">
      <p class="wh-stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></p>
      <h3>${d.bonus ? bi('PERFECT!', 'パーフェクト！') : d.correct >= 7 ? bi('Great job!', 'よく できました！') : bi('Nice try!', 'がんばったね！')}</h3>
      <p class="wh-score"><b>${d.correct}</b> / ${d.n}</p>
      <div class="wh-dotsbig">${state.marks.map((k) => `<i class="${k}"></i>`).join('')}</div>
      <p class="wh-coins">◈ ${d.coins}${d.bonus ? ` <small>${bi(`(bonus ${d.bonus})`, `（ボーナス ${d.bonus}）`)}</small>` : ''}</p>
      <div class="wh-actions">
        <button type="button" class="wh-go">${bi('🔁 Again', '🔁 もういちど')}</button>
        <button type="button" class="wh-back">${bi('Back to the island', 'しまに もどる')}</button>
      </div></div>`;
    if (d.bonus || d.correct >= 7) confetti($('.wh-done', body));
    $('.wh-go', body).onclick = () => { state.marks = []; state.busy = true; send('wh:start', { house: state.house, level: state.level }); };
    $('.wh-back', body).onclick = () => close();
  }

  function onError(m) {
    const why = { 'no question': 'もういちど はじめてね。', 'too fast': 'ちょっと まってね。', 'no such house': 'その いえは ありません。' }[m.reason] || m.reason;
    toast(tr(why));
    if (m.reason === 'no question') close();
  }

  return { open, close, onAsk, onResult, onError, get isOpen() { return dialog.open; }, state };
}
