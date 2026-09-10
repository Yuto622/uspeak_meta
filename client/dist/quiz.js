// ことばの小屋 — the quiz screen.
//
// This module knows the question and the four choices, and nothing else. It does not
// know the answer: it finds out which one was right only after the child has committed,
// because the server tells it then. There is nothing here to read ahead.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LETTERS = ['A', 'B', 'C', 'D'];

export function createQuizUI({ send, speak, toast, isOnline }) {
  let question = null;   // { q, choices, index, total, correct, hut, name }
  let locked = false;
  let hutName = '';

  const dialog = document.createElement('dialog');
  dialog.id = 'quiz-dialog';
  dialog.setAttribute('aria-labelledby', 'quiz-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">WORD HUT</span><h2 id="quiz-title">ことばの小屋</h2></div>
      <span id="quiz-score"></span>
      <button type="button" id="quiz-close" aria-label="閉じる">×</button>
    </div><div id="quiz-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#quiz-body', dialog);

  function render(feedback = null) {
    if (!question) return;
    const q = question;
    $('#quiz-score', dialog).textContent = `${q.index + 1} / ${q.total}　◯ ${q.correct}`;
    body().innerHTML = `<p class="quiz-hut">${esc(hutName)}</p>
      <div class="quiz-question"><p id="quiz-q">${esc(q.q)}</p>
        <button type="button" id="quiz-listen">▷ もう一度きく</button></div>
      <div class="quiz-choices">${q.choices.map((c, i) => {
        let cls = '';
        if (feedback) {
          if (i === feedback.answer) cls = 'right';
          else if (i === feedback.picked) cls = 'wrong';
        }
        return `<button type="button" data-choice="${i}" class="${cls}" ${feedback ? 'disabled' : ''}>
          <b>${LETTERS[i]}</b><span>${esc(c)}</span></button>`;
      }).join('')}</div>
      ${feedback ? `<p class="quiz-feedback ${feedback.correct ? 'ok' : 'ng'}">${feedback.correct
        ? `せいかい！ ◈ +${feedback.coins} ・ ✧ +${feedback.xp}`
        : `おしい！ こたえは ${LETTERS[feedback.answer]} 「${esc(q.choices[feedback.answer])}」`}</p>` : ''}
      <div class="quiz-actions"><button type="button" id="quiz-quit">やめる</button></div>`;
    $('#quiz-listen', dialog).onclick = () => speak(q.q);
    body().querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = () => {
        if (locked || feedback) return;
        locked = true;
        body().querySelectorAll('[data-choice]').forEach((x) => { x.disabled = true; });
        send('quiz:answer', { choice: Number(b.dataset.choice) });
      };
    });
    $('#quiz-quit', dialog).onclick = () => { send('quiz:quit', {}); close(); };
  }

  function open() { if (!dialog.open) dialog.showModal(); }
  function close() { question = null; locked = false; dialog.close(); }

  // Keyboard A-D, so a child with a keyboard is not forced onto the mouse.
  dialog.addEventListener('keydown', (e) => {
    const i = LETTERS.indexOf(e.key.toUpperCase());
    if (i >= 0) { e.preventDefault(); body().querySelector(`[data-choice="${i}"]`)?.click(); }
  });
  $('#quiz-close', dialog).onclick = () => { send('quiz:quit', {}); close(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); send('quiz:quit', {}); close(); });

  return {
    // What the interact button says outside a hut.
    label(spot) { return spot ? `${spot.tone} ${spot.name} で クイズ` : ''; },
    enter(spot) {
      if (!spot) return;
      if (!isOnline()) { toast('小屋のクイズは クラスに入っているときだけ 遊べます。'); return; }
      send('quiz:start', { hut: spot.id });
    },
    onQuestion(m) {
      question = m;
      hutName = m.name || hutName;
      locked = false;
      open();
      render();
      speak(m.q);
    },
    onResult(m) {
      locked = false;
      if (!question) return;
      render({ correct: m.correct, answer: m.answer, picked: m.picked, xp: m.correct ? 10 : 0, coins: m.correct ? 10 : 0 });
      if (m.levels > 0) toast(`レベル ${m.progress.level} になった！`);
      if (!m.done) {
        setTimeout(() => { if (m.next) { question = m.next; render(); speak(m.next.q); } }, 1400);
        return;
      }
      setTimeout(() => {
        const perfect = m.perfectBonus ? `<p class="quiz-perfect">ぜんもん せいかい！ ◈ +${m.perfectBonus} ボーナス</p>` : '';
        body().innerHTML = `<div class="quiz-done"><strong>${m.score} / ${m.total} せいかい</strong>${perfect}
          <p>◈ ${m.score * 10 + (m.perfectBonus || 0)} コインと ✧ ${m.score * 10} XP をもらいました。</p>
          <div class="quiz-actions"><button type="button" class="primary" id="quiz-again">もういちど</button>
          <button type="button" id="quiz-leave">おわる</button></div></div>`;
        $('#quiz-score', dialog).textContent = `${m.score} / ${m.total}`;
        $('#quiz-again', dialog).onclick = () => send('quiz:start', { hut: m.hut });
        $('#quiz-leave', dialog).onclick = close;
        question = null;
      }, 1400);
    },
    onClosed() { close(); },
    onError(m) {
      locked = false;
      if (m?.reason === 'too far') {
        toast(m.hut ? `${m.hut.ja} まで あるいて行こう。` : 'その小屋まで あるいて行こう。');
        close();
        return;
      }
      toast({ 'too fast': 'すこし ゆっくりね。', 'unknown hut': 'その小屋は 見つかりません。' }[m?.reason] || 'うまくいきませんでした。');
      if (question) render();
    },
    restore(q) { if (q) { question = q; hutName = ''; open(); render(); } },
  };
}
