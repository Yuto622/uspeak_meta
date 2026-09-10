// おつかいクエスト — the walking UI.
//
// This module never decides anything and, just as importantly, it never finishes an
// errand. Taking one, speaking at the shop and handing it over each need the child's
// avatar to be standing at the right place on おつかい島; the server refuses otherwise.
// So the dialog here is a board and a conversation window, not a way to skip the walk.
import { loadErrandData } from './errand-data.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createMissionUI({ send, speak, toast, isOnline, travel, here, setBeacon }) {
  let data = { missions: [], spots: new Map(), island: null };
  let view = 'board';        // board | request | talk | result
  let tracked = '';          // chosen on the board, not yet taken from the plaza
  let active = null;         // { id, stage, character, place, item, spot, from, goals, turnLimit }
  let goalsMet = new Set();
  let turn = 0;
  let busy = false;
  let classMissionId = '';
  let done = new Set();
  let recognition = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'mission-dialog';
  dialog.setAttribute('aria-labelledby', 'mission-title');
  dialog.innerHTML = `<div class="mission-head">
      <div><span class="eyebrow">ERRAND QUEST</span><h2 id="mission-title">おつかいクエスト</h2></div>
      <button type="button" id="mission-close" aria-label="閉じる">×</button>
    </div><div id="mission-body"></div>`;
  document.body.append(dialog);

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'mission-button';
  button.className = 'net-fab';
  button.hidden = true;
  button.textContent = '🗣';
  button.setAttribute('aria-label', 'おつかいクエストを開く');
  document.body.append(button);

  // The step tracker. It is the only thing on screen while a child is walking, and it
  // always names one place: where to go next.
  const hud = document.createElement('aside');
  hud.id = 'errand-hud';
  hud.hidden = true;
  document.body.append(hud);

  const body = () => $('#mission-body', dialog);
  const missionById = (id) => data.missions.find((m) => m.id === id) || null;
  const spot = (id) => data.spots.get(id) || null;

  loadErrandData().then((d) => { data = d; if (dialog.open && view === 'board') renderBoard(); });

  // ---- the tracker ---------------------------------------------------------------

  // Where the child has to walk right now, or null when nothing is in hand.
  function step() {
    if (active) {
      if (active.stage === 'talk') return { spot: active.spot, label: `${active.spot.ja} と 英語で話そう`, index: 1 };
      if (active.stage === 'deliver') return { spot: active.from, label: `${active.from.ja} に とどけよう`, index: 2, carrying: active.item };
      return null;
    }
    const m = missionById(tracked);
    if (!m) return null;
    const from = spot(m.from);
    return from ? { spot: from, label: `${from.ja} に おつかいを もらいに行こう`, index: 0, title: m.title } : null;
  }

  function renderHud() {
    const s = step();
    setBeacon(s ? s.spot.id : '');
    if (!s) { hud.hidden = true; hud.innerHTML = ''; return; }
    const m = missionById(active?.id || tracked);
    const steps = ['広場でうける', 'お店で話す', '広場にとどける'];
    hud.hidden = false;
    hud.innerHTML = `<small>おつかい中</small>
      <strong>${esc(m?.title || '')}</strong>
      <ol class="errand-steps">${steps.map((t, i) => `<li class="${i < s.index ? 'done' : i === s.index ? 'now' : ''}"><span>${i < s.index ? '✓' : i + 1}</span>${esc(t)}</li>`).join('')}</ol>
      <p class="errand-go">→ ${esc(s.label)}</p>
      ${s.carrying ? `<p class="errand-carry">🧺 ${esc(s.carrying)}</p>` : ''}
      ${here() ? '' : '<p class="errand-far">おつかい島にいません</p>'}
      <button type="button" id="errand-hud-open">${here() ? 'くわしく' : 'おつかい島へ行く'}</button>`;
    $('#errand-hud-open', hud).onclick = () => { if (here()) open(); else goToIsland(); };
  }

  function goToIsland() {
    if (here()) return true;
    if (travel('errand')) { dialog.close(); toast('おつかい島へ向かいます。'); return true; }
    toast('いまは移動できません。少ししてからもう一度。');
    return false;
  }

  // ---- board ---------------------------------------------------------------------

  function renderBoard() {
    view = 'board';
    const grades = [...new Set(data.missions.map((m) => m.grade))];
    const featured = missionById(classMissionId);
    const card = (m) => {
      const s = spot(m.spot);
      return `<button type="button" data-mission="${esc(m.id)}" class="${m.id === classMissionId ? 'featured' : ''}${done.has(m.id) ? ' done' : ''}${m.id === tracked ? ' tracked' : ''}">
        <strong>${done.has(m.id) ? '✓ ' : ''}${esc(m.title)}</strong>
        <small>${esc(s?.ja || m.character)} · ${esc(m.place)}</small>
        <span>◈ ${m.reward}</span></button>`;
    };
    body().innerHTML = `<p class="mission-lead">おつかいは <b>おつかい島</b> で歩いてやります。広場のミアからうけとり、お店の人と英語で話し、広場にもどってとどけるとコインがもらえます。</p>
      ${here() ? '' : '<p class="mission-warn">いまはおつかい島の外にいます。「おつかい島へ行く」で移動してください。</p>'}
      ${featured ? `<section class="mission-featured">
        <small>今日のおつかい</small>
        <strong>${esc(featured.title)}</strong>
        <span>${esc(spot(featured.spot)?.ja || featured.character)}</span>
        <button type="button" class="primary" data-mission="${esc(featured.id)}">これにする →</button>
      </section>` : ''}
      <p class="mission-lead">スタンプ ${done.size} / ${data.missions.length}</p>
      <div class="mission-actions"><button type="button" class="primary" id="mission-travel">${here() ? 'おつかい島にいます' : '✈ おつかい島へ行く'}</button></div>
      ${grades.map((g) => `<h3 class="mission-grade">英検${esc(g)}級</h3><div class="mission-cards">${data.missions.filter((m) => m.grade === g).map(card).join('')}</div>`).join('')}`;
    const go = $('#mission-travel', dialog);
    go.disabled = here();
    go.onclick = goToIsland;
    body().querySelectorAll('[data-mission]').forEach((b) => { b.onclick = () => choose(b.dataset.mission); });
  }

  // Choosing does not start anything. It points the child at the plaza.
  function choose(id) {
    if (!isOnline()) { toast('おつかいクエストはクラスに入っているときだけ遊べます。'); return; }
    const m = missionById(id);
    if (!m || active) return;
    tracked = id;
    renderHud();
    dialog.close();
    const from = spot(m.from);
    toast(here() ? `${from?.ja || '広場'} に行って話しかけよう。` : 'おつかい島へ行って、広場のミアに話しかけよう。');
  }

  // ---- the request, handed over at the plaza --------------------------------------

  function renderRequest(m) {
    view = 'request';
    body().innerHTML = `<section class="mission-talk">
        <div class="mission-speaker">
          <small>${esc(active.from.ja)}</small>
          <p id="mission-line">${esc(m.request)}</p>
          <button type="button" id="mission-listen">▷ もう一度きく</button>
        </div>
        <p class="mission-hint">💡 ${esc(m.requestJa)}</p>
        <ol class="mission-goals">${active.goals.map((g) => `<li><span>○</span>${esc(g.ja)}</li>`).join('')}</ol>
        <div class="mission-actions"><button type="button" class="primary" id="mission-accept">わかった！ ${esc(active.spot.ja)} へ</button></div>
      </section>`;
    $('#mission-listen', dialog).onclick = () => speak(m.request);
    $('#mission-accept', dialog).onclick = () => { dialog.close(); renderHud(); toast(`${active.spot.ja} のところへ歩いて行こう。`); };
  }

  // ---- conversation, at the shop ---------------------------------------------------

  function renderTalk({ line, hint = '' } = {}) {
    view = 'talk';
    const goals = active.goals.map((g) => `<li class="${goalsMet.has(g.id) ? 'met' : ''}"><span>${goalsMet.has(g.id) ? '✓' : '○'}</span>${esc(g.ja)}</li>`).join('');
    body().innerHTML = `<section class="mission-talk">
        <div class="mission-speaker">
          <small>${esc(active.character)} · ${esc(active.place)}</small>
          <p id="mission-line">${esc(line)}</p>
          <button type="button" id="mission-listen">▷ もう一度きく</button>
        </div>
        <ol class="mission-goals">${goals}</ol>
        ${hint ? `<p class="mission-hint">💡 ${esc(hint)}</p>` : ''}
        <div class="mission-input">
          <label for="mission-say">英語で答えよう</label>
          <div class="mission-row">
            <input id="mission-say" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="I'd like ..." ${busy ? 'disabled' : ''}>
            <button type="button" id="mission-mic" aria-label="マイクで話す" ${busy ? 'disabled' : ''}>🎤</button>
            <button type="button" class="primary" id="mission-send" ${busy ? 'disabled' : ''}>言う</button>
          </div>
          <p id="mission-status" role="status">${busy ? '…' : `${turn} / ${active.turnLimit} 回`}</p>
          <div class="mission-actions"><button type="button" id="mission-leave">はなれる</button><button type="button" id="mission-quit">やめる</button></div>
        </div>
      </section>`;
    $('#mission-listen', dialog).onclick = () => speak(line);
    const input = $('#mission-say', dialog);
    const submit = () => {
      const text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      input.value = '';
      $('#mission-status', dialog).textContent = `${esc(active.character)} が考えています…`;
      $('#mission-send', dialog).disabled = true;
      $('#mission-mic', dialog).disabled = true;
      send('mission:say', { text });
    };
    $('#mission-send', dialog).onclick = submit;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    $('#mission-mic', dialog).onclick = listen;
    // Leaving keeps the errand: walk back and press the button again to carry on.
    $('#mission-leave', dialog).onclick = () => { dialog.close(); renderHud(); };
    $('#mission-quit', dialog).onclick = () => { send('mission:quit', {}); active = null; tracked = ''; renderHud(); renderBoard(); };
    if (!busy) setTimeout(() => input.focus(), 60);
  }

  // Speech input, with the text box as the fallback wherever it is unavailable.
  function listen() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    const status = $('#mission-status', dialog);
    if (!Speech) { status.textContent = 'この端末では音声入力が使えません。文字で入力してね。'; return; }
    try { recognition?.stop(); } catch { /* ignore */ }
    try {
      recognition = new Speech();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      status.textContent = '聞いています…';
      recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        const input = $('#mission-say', dialog);
        if (input) { input.value = text; status.textContent = `「${text}」でよければ「言う」を押してね。`; }
      };
      recognition.onerror = (e) => {
        status.textContent = e.error === 'not-allowed'
          ? 'マイクが許可されていません。文字で入力してね。'
          : 'うまく聞き取れませんでした。もう一度か、文字で入力してね。';
      };
      recognition.start();
    } catch {
      status.textContent = '音声入力を開始できませんでした。文字で入力してね。';
    }
  }

  // ---- what the interact button does on the island ----------------------------------

  // The label under the crosshair, so a child always knows what pressing it will do.
  function label(s) {
    if (!s) return '';
    if (active) {
      if (active.stage === 'talk') return s.id === active.spot.id ? `${active.character} と 英語で話す` : `${active.spot.ja} へ行こう`;
      if (active.stage === 'deliver') return s.id === active.from.id ? `${active.item} を とどける` : `${active.from.ja} へ もどろう`;
    }
    if (s.kind === 'plaza') return tracked ? 'おつかいを うけとる' : 'おつかい掲示板を見る';
    return `${s.character} と 話す（おつかいは広場で）`;
  }

  function interact(s) {
    if (!s) return;
    if (!isOnline()) { toast('おつかいはクラスに入っているときだけ遊べます。'); return; }
    if (active) {
      if (active.stage === 'talk') {
        if (s.id === active.spot.id) { send('mission:arrive', {}); return; }
        toast(`${active.spot.ja} のところへ行こう。`);
        return;
      }
      if (active.stage === 'deliver') {
        if (s.id === active.from.id) { send('mission:deliver', {}); return; }
        toast(`${active.from.ja} に とどけに もどろう。`);
        return;
      }
    }
    if (s.kind === 'plaza') {
      if (tracked) { send('mission:start', { id: tracked }); return; }
      open();
      renderBoard();
      return;
    }
    toast('まずは広場のミアから、おつかいを うけとろう。');
  }

  // ---- server messages -------------------------------------------------------------

  function adopt(m) {
    active = {
      id: m.id, stage: m.stage, character: m.character, place: m.place, item: m.item,
      spot: m.spot, from: m.from, goals: m.goals, turnLimit: m.turnLimit,
    };
    goalsMet = new Set(m.goalsMet || []);
    turn = m.turn || 0;
    busy = false;
    tracked = '';
  }

  function onOpened(m) {
    adopt(m);
    renderHud();
    open();
    renderRequest(m);
    speak(m.request);
  }

  function onArrived(m) {
    adopt(m);
    renderHud();
    open();
    renderTalk({ line: m.opening });
    speak(m.opening);
  }

  function onTurn(m) {
    if (!active) return;
    busy = false;
    goalsMet = new Set(m.goalsMet || []);
    turn = m.turn || turn;
    active.stage = m.stage || active.stage;
    if (m.item) active.item = m.item;
    if (m.from) active.from = m.from;
    speak(m.reply);
    if (m.gained?.length) toast('お題がひとつ進んだ！');
    if (active.stage === 'deliver') {
      view = 'result';
      body().innerHTML = `<section class="mission-talk">
          <div class="mission-speaker"><small>${esc(active.character)} · ${esc(active.place)}</small><p>${esc(m.reply)}</p></div>
          <ol class="mission-goals">${active.goals.map((g) => `<li class="met"><span>✓</span>${esc(g.ja)}</li>`).join('')}</ol>
          <div class="mission-done"><strong>ぜんぶ言えた！</strong><span>🧺 ${esc(active.item)} を うけとりました</span>
            <p>${esc(active.from.ja)} に とどけると コインが もらえます。</p>
            <div class="mission-actions"><button type="button" class="primary" id="mission-back">広場へ もどる</button></div></div>
        </section>`;
      $('#mission-back', dialog).onclick = () => { dialog.close(); renderHud(); toast(`${active.from.ja} に とどけに もどろう。`); };
      renderHud();
      return;
    }
    renderTalk({ line: m.reply, hint: m.hint });
  }

  function onDelivered(m) {
    const character = active?.from?.ja || '広場のミア';
    const goals = active?.goals || [];
    done = new Set(m.missionsDone || [...done]);
    active = null;
    tracked = '';
    busy = false;
    renderHud();
    view = 'result';
    open();
    body().innerHTML = `<section class="mission-talk">
        <div class="mission-speaker"><small>${esc(character)}</small><p id="mission-line">${esc(m.thanks)}</p>
          <button type="button" id="mission-listen">▷ もう一度きく</button></div>
        <ol class="mission-goals">${goals.map((g) => `<li class="met"><span>✓</span>${esc(g.ja)}</li>`).join('')}</ol>
        <div class="mission-done"><strong>おつかい完了！</strong><span>◈ ${m.reward} コインと スタンプを もらいました</span>
          <div class="mission-actions"><button type="button" class="primary" id="mission-again">つぎのおつかいへ</button></div></div>
      </section>`;
    $('#mission-listen', dialog).onclick = () => speak(m.thanks);
    $('#mission-again', dialog).onclick = renderBoard;
    speak(m.thanks);
    toast(`おつかい完了！ ◈ ${m.reward}`);
  }

  function onClosed(m) {
    active = null;
    busy = false;
    renderHud();
    if (m?.reason === 'turn limit') toast('回数がいっぱいになりました。広場でもう一度うけとれます。');
    if (dialog.open) renderBoard();
  }

  function onError(m) {
    busy = false;
    if (m?.reason === 'too far') {
      const s = m.spot;
      toast(s ? `${s.ja} のところまで歩いて行こう。` : 'その場所まで歩いて行こう。');
      if (dialog.open && view !== 'board') dialog.close();
      renderHud();
      return;
    }
    const text = {
      'too fast': 'すこしゆっくり話してね。',
      'daily limit': '今日のおつかいはここまで。また明日ね。',
      'ai unavailable': '今はつながりません。少ししてからもう一度。',
      'unknown mission': 'そのおつかいは見つかりません。',
      'wrong step': 'いまはその順番ではありません。',
    }[m?.reason] || 'うまくいきませんでした。';
    toast(text);
    if (view === 'talk' && active) renderTalk({ line: $('#mission-line', dialog)?.textContent || '' });
  }

  function open() {
    if (!dialog.open) dialog.showModal();
  }
  function close() {
    try { recognition?.stop(); } catch { /* ignore */ }
    dialog.close();
  }

  button.onclick = () => { open(); if (view === 'board' || !active) renderBoard(); };
  $('#mission-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  return {
    onOpened, onArrived, onTurn, onDelivered, onClosed, onError, interact, label,
    open() { open(); if (!active) renderBoard(); },
    refreshHud: renderHud,
    // An errand that was in progress before a screen lock comes back with the session.
    restore(errand) {
      if (!errand) { active = null; renderHud(); return; }
      adopt(errand);
      renderHud();
    },
    setAvailable(v) { button.hidden = !v; if (!v) { close(); active = null; tracked = ''; renderHud(); } },
    setClassMission(id) { classMissionId = id || ''; if (dialog.open && view === 'board') renderBoard(); },
    setDone(ids) { done = new Set(Array.isArray(ids) ? ids : []); if (dialog.open && view === 'board') renderBoard(); },
    get missions() { return data.missions; },
  };
}
