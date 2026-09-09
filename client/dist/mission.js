// Errand quest UI: pick a mission, then talk to the character in English.
//
// Nothing here decides anything. The server judges every utterance and this module
// renders what it is told: which goals are met, whether the mission is complete, and
// how many coins were awarded.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createMissionUI({ send, speak, toast, isOnline }) {
  let data = { missions: [] };
  let view = 'list';        // list | talk
  let active = null;         // { id, character, place, goals, turnLimit }
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

  const body = () => $('#mission-body', dialog);

  async function load() {
    try {
      const res = await fetch('missions.json', { cache: 'no-cache' });
      data = await res.json();
    } catch (err) {
      console.warn('[mission] missions.json failed to load', err);
      data = { missions: [] };
    }
  }

  // ---- list ---------------------------------------------------------------------

  function renderList() {
    view = 'list';
    const grades = [...new Set(data.missions.map((m) => m.grade))];
    const featured = data.missions.find((m) => m.id === classMissionId);
    body().innerHTML = `${featured ? `<section class="mission-featured">
        <small>今日のおつかい</small>
        <strong>${esc(featured.title)}</strong>
        <span>${esc(featured.character)} · ${esc(featured.place)}</span>
        <button type="button" class="primary" data-mission="${esc(featured.id)}">はじめる →</button>
      </section>` : ''}
      <p class="mission-lead">キャラクターに英語で話しかけて、お題をクリアしよう。マイクでも、文字入力でもOK。</p>
      <p class="mission-lead">スタンプ ${done.size} / ${data.missions.length}</p>
      ${grades.map((g) => `<h3 class="mission-grade">英検${esc(g)}級</h3><div class="mission-cards">${
        data.missions.filter((m) => m.grade === g).map((m) => `<button type="button" data-mission="${esc(m.id)}" class="${m.id === classMissionId ? 'featured' : ''}${done.has(m.id) ? ' done' : ''}">
          <strong>${done.has(m.id) ? '✓ ' : ''}${esc(m.title)}</strong>
          <small>${esc(m.character)} · ${esc(m.place)}</small>
          <span>◈ ${m.reward}</span>
        </button>`).join('')}</div>`).join('')}`;
    body().querySelectorAll('[data-mission]').forEach((b) => { b.onclick = () => start(b.dataset.mission); });
  }

  function start(id) {
    if (!isOnline()) { toast('おつかいクエストはオンラインのときだけ遊べます。'); return; }
    send('mission:start', { id });
  }

  // ---- conversation ---------------------------------------------------------------

  function renderTalk({ line, hint = '', reward = 0, done = false } = {}) {
    view = 'talk';
    const mission = data.missions.find((m) => m.id === active.id) || {};
    const goals = active.goals.map((g) => `<li class="${goalsMet.has(g.id) ? 'met' : ''}"><span>${goalsMet.has(g.id) ? '✓' : '○'}</span>${esc(g.ja)}</li>`).join('');
    body().innerHTML = `<section class="mission-talk">
        <div class="mission-speaker">
          <small>${esc(active.character)} · ${esc(active.place)}</small>
          <p id="mission-line">${esc(line)}</p>
          <button type="button" id="mission-listen">▷ もう一度きく</button>
        </div>
        <ol class="mission-goals">${goals}</ol>
        ${hint ? `<p class="mission-hint">💡 ${esc(hint)}</p>` : ''}
        ${done ? `<div class="mission-done"><strong>クリア！</strong><span>◈ ${reward} コインを受け取りました</span>
            <div class="mission-actions"><button type="button" class="primary" id="mission-again">ほかのおつかいへ</button></div></div>`
          : `<div class="mission-input">
              <label for="mission-say">英語で答えよう</label>
              <div class="mission-row">
                <input id="mission-say" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="I'd like ..." ${busy ? 'disabled' : ''}>
                <button type="button" id="mission-mic" aria-label="マイクで話す" ${busy ? 'disabled' : ''}>🎤</button>
                <button type="button" class="primary" id="mission-send" ${busy ? 'disabled' : ''}>言う</button>
              </div>
              <p id="mission-status" role="status">${busy ? '…' : `${turn} / ${active.turnLimit} 回`}</p>
              <div class="mission-actions"><button type="button" id="mission-quit">やめる</button></div>
            </div>`}
      </section>`;
    $('#mission-listen', dialog).onclick = () => speak(line);
    if (done) {
      $('#mission-again', dialog).onclick = renderList;
      return;
    }
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
    $('#mission-quit', dialog).onclick = () => { send('mission:quit', {}); renderList(); };
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

  // ---- server messages -------------------------------------------------------------

  function onOpened(m) {
    active = { id: m.id, character: m.character, place: m.place, goals: m.goals, turnLimit: m.turnLimit };
    goalsMet = new Set();
    turn = 0;
    busy = false;
    open();
    renderTalk({ line: m.opening });
    speak(m.opening);
  }

  function onTurn(m) {
    if (!active) return;
    busy = false;
    goalsMet = new Set(m.goalsMet || []);
    turn = m.turn || turn;
    renderTalk({ line: m.reply, hint: m.hint, reward: m.reward || 0, done: !!m.complete });
    speak(m.reply);
    if (m.gained?.length) toast('お題がひとつ進んだ！');
    if (m.complete) { toast(`おつかいクリア！ ◈ ${m.reward}`); if (m.missionsDone) done = new Set(m.missionsDone); active = null; }
  }

  function onClosed(m) {
    active = null;
    busy = false;
    if (m?.reason === 'turn limit') toast('回数がいっぱいになりました。もう一度ちょうせんできます。');
    if (dialog.open) renderList();
  }

  function onError(m) {
    busy = false;
    const text = { 'too fast': 'すこしゆっくり話してね。', 'daily limit': '今日のおつかいはここまで。また明日ね。', 'ai unavailable': '今はつながりません。少ししてからもう一度。', 'unknown mission': 'そのおつかいは見つかりません。' }[m?.reason] || 'うまくいきませんでした。';
    toast(text);
    if (view === 'talk' && active) renderTalk({ line: $('#mission-line', dialog)?.textContent || '' });
  }

  function open() {
    if (!dialog.open) dialog.showModal();
    if (!active) renderList();
  }
  function close() {
    try { recognition?.stop(); } catch { /* ignore */ }
    dialog.close();
  }

  button.onclick = () => { open(); if (!active) renderList(); };
  $('#mission-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  load();

  return {
    onOpened, onTurn, onClosed, onError, open,
    setAvailable(v) { button.hidden = !v; if (!v) close(); },
    setClassMission(id) { classMissionId = id || ''; if (dialog.open && view === 'list') renderList(); },
    setDone(ids) { done = new Set(Array.isArray(ids) ? ids : []); if (dialog.open && view === 'list') renderList(); },
    get missions() { return data.missions; },
  };
}
