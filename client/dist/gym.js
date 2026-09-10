// ことばのジム — listen and speak.
//
// Like the word huts, this module renders and never judges. In speak mode it sends what
// the microphone heard, not whether that was right; the server decides, so a page cannot
// award itself the drill's XP the way Roblox's could.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createGymUI({ send, speak, toast, isOnline }) {
  let question = null;
  let busy = false;
  let recognition = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'gym-dialog';
  dialog.setAttribute('aria-labelledby', 'gym-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">WORD GYM</span><h2 id="gym-title">ことばのジム</h2></div>
      <span id="gym-score"></span>
      <button type="button" id="gym-close" aria-label="閉じる">×</button>
    </div><div id="gym-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#gym-body', dialog);

  function open() { if (!dialog.open) dialog.showModal(); }
  function close() { stopListening(); question = null; busy = false; dialog.close(); }

  function menu() {
    open();
    question = null;
    $('#gym-score', dialog).textContent = '';
    body().innerHTML = `<p class="quiz-hut">5問ワンセット。せいかい ◈ +5 ・ ✧ +15</p>
      <div class="gym-modes">
        <button type="button" data-mode="listen"><b>👂</b><strong>きく</strong><small>英語を聞いて、絵をえらぶ</small></button>
        <button type="button" data-mode="speak"><b>🎤</b><strong>はなす</strong><small>絵を見て、英語で言う</small></button>
      </div>`;
    body().querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => send('gym:start', { mode: b.dataset.mode }); });
  }

  function renderListen(feedback) {
    const q = question;
    body().innerHTML = `<p class="quiz-hut">👂 きくモード</p>
      <div class="quiz-question gym-listen"><button type="button" id="gym-say">🔊 もういちど きく</button>
        <p>聞こえた ことばの 絵を えらぼう</p></div>
      <div class="gym-cards">${q.choices.map((c, i) => {
        let cls = '';
        if (feedback) {
          if (i === feedback.answer) cls = 'right';
          else if (i === feedback.picked) cls = 'wrong';
        }
        return `<button type="button" data-choice="${i}" class="${cls}" ${feedback ? 'disabled' : ''}>
          <span class="gym-emoji">${esc(c.emoji)}</span><small>${esc(c.ja)}</small></button>`;
      }).join('')}</div>
      ${feedbackLine(feedback)}
      <div class="quiz-actions"><button type="button" id="gym-quit">やめる</button></div>`;
    $('#gym-say', dialog).onclick = () => speak(q.say);
    body().querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = () => {
        if (busy || feedback) return;
        busy = true;
        body().querySelectorAll('[data-choice]').forEach((x) => { x.disabled = true; });
        send('gym:answer', { choice: Number(b.dataset.choice) });
      };
    });
    $('#gym-quit', dialog).onclick = () => { send('gym:quit', {}); close(); };
  }

  function renderSpeak(feedback, status = '') {
    const q = question;
    body().innerHTML = `<p class="quiz-hut">🎤 はなすモード</p>
      <div class="quiz-question gym-speak">
        <span class="gym-emoji big">${esc(q.emoji)}</span>
        <strong>${esc(q.say)}</strong>
        <small>${esc(q.ja)}</small>
        <button type="button" id="gym-say">🔊 お手本を きく</button>
      </div>
      <div class="gym-mic">
        <button type="button" id="gym-listen" class="primary" ${feedback ? 'disabled' : ''}>🎤 言ってみる</button>
        <div class="mission-row"><input id="gym-text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(q.say)}" ${feedback ? 'disabled' : ''}>
          <button type="button" id="gym-send" ${feedback ? 'disabled' : ''}>おくる</button></div>
        <p id="gym-status" role="status">${esc(status)}</p>
      </div>
      ${feedbackLine(feedback)}
      <div class="quiz-actions"><button type="button" id="gym-quit">やめる</button></div>`;
    $('#gym-say', dialog).onclick = () => speak(q.say);
    if (!feedback) {
      $('#gym-listen', dialog).onclick = listen;
      const input = $('#gym-text', dialog);
      const submit = () => {
        const text = input.value.trim();
        if (!text || busy) return;
        busy = true;
        send('gym:answer', { text });
      };
      $('#gym-send', dialog).onclick = submit;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    }
    $('#gym-quit', dialog).onclick = () => { send('gym:quit', {}); close(); };
  }

  function feedbackLine(f) {
    if (!f) return '';
    if (f.correct) return `<p class="quiz-feedback ok">せいかい！ ◈ +5 ・ ✧ +15</p>`;
    if (f.close) return `<p class="quiz-feedback ng">おしい！ こたえは「${esc(f.word)}」${esc(f.ja)}</p>`;
    return `<p class="quiz-feedback ng">こたえは「${esc(f.word)}」${esc(f.ja)}</p>`;
  }

  function stopListening() { try { recognition?.stop(); } catch { /* ignore */ } recognition = null; }

  function listen() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    const status = $('#gym-status', dialog);
    if (!Speech) { status.textContent = 'この端末では音声入力が使えません。文字で入力してね。'; return; }
    stopListening();
    try {
      recognition = new Speech();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      status.textContent = '聞いています…';
      recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        if (busy) return;
        busy = true;
        status.textContent = '…';
        send('gym:answer', { text });
      };
      recognition.onerror = (e) => {
        status.textContent = e.error === 'not-allowed'
          ? 'マイクが許可されていません。文字で入力してね。'
          : 'うまく聞き取れませんでした。もう一度か、文字で入力してね。';
      };
      recognition.start();
    } catch { status.textContent = '音声入力を開始できませんでした。文字で入力してね。'; }
  }

  function render(feedback = null) {
    if (!question) return;
    $('#gym-score', dialog).textContent = `${question.index + 1} / ${question.total}　◯ ${question.correct}`;
    if (question.mode === 'listen') renderListen(feedback); else renderSpeak(feedback);
  }

  $('#gym-close', dialog).onclick = () => { send('gym:quit', {}); close(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); send('gym:quit', {}); close(); });

  return {
    label(spot) { return spot ? `${spot.tone} ${spot.name}` : ''; },
    enter(spot) {
      if (!spot) return;
      if (!isOnline()) { toast('ジムは クラスに入っているときだけ 使えます。'); return; }
      menu();
    },
    onQuestion(m) {
      question = m;
      busy = false;
      stopListening();
      open();
      render();
      if (m.mode === 'listen') speak(m.say);
    },
    onResult(m) {
      busy = false;
      stopListening();
      if (!question) return;
      render({ correct: m.correct, close: m.close, answer: m.answer, picked: m.picked ?? -1, word: m.word, ja: m.ja });
      if (m.levels > 0) toast(`レベル ${m.progress.level} になった！`);
      if (!m.done) {
        setTimeout(() => { if (m.next) { question = m.next; render(); if (m.next.mode === 'listen') speak(m.next.say); } }, 1600);
        return;
      }
      setTimeout(() => {
        const stars = '★'.repeat(m.stars) + '☆'.repeat(3 - m.stars);
        body().innerHTML = `<div class="quiz-done"><p class="gym-stars">${stars}</p>
          <strong>${m.score} / ${m.total} せいかい</strong>
          <p>◈ ${m.score * 5} コインと ✧ ${m.score * 15} XP をもらいました。</p>
          <div class="quiz-actions"><button type="button" class="primary" id="gym-again">もういちど</button>
          <button type="button" id="gym-leave">おわる</button></div></div>`;
        $('#gym-score', dialog).textContent = `${m.score} / ${m.total}`;
        $('#gym-again', dialog).onclick = menu;
        $('#gym-leave', dialog).onclick = close;
        question = null;
      }, 1600);
    },
    onClosed() { close(); },
    onError(m) {
      busy = false;
      if (m?.reason === 'too far') {
        toast(m.hut ? `${m.hut.ja} まで あるいて行こう。` : 'ジムまで あるいて行こう。');
        close();
        return;
      }
      toast({ 'too fast': 'すこし ゆっくりね。' }[m?.reason] || 'うまくいきませんでした。');
      render();
    },
    restore(q) { if (q) { question = q; open(); render(); } },
  };
}
