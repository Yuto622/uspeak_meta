// 今日の5分 — 島まで歩かなくても答えられる5問（英検の読む3・聞く2）。
//
// **塾の日でも5分なら取れる。** 子ども英語教室の退会理由の1位は「塾が始まるから」で、
// 30分島をめぐる時間はなくても、5分ならある。その5分が記録に残る（保護者レポートの
// 「おうちの日」）。
//
// 英検の島の画面と同じく、**このページは答えを知らない**。4つの選択肢を見せて、
// 押したものを送り、○×はサーバーが返す。級もサーバーが決める（その子が次にめざす級）。
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LETTERS = ['A', 'B', 'C', 'D'];
const GRADE = { g5: '5級', g4: '4級', g3: '3級' };

export function createQuick5({ send, speak, toast, isOnline }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'quick-dialog';
  dialog.setAttribute('aria-labelledby', 'quick-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow" id="quick-eyebrow">5 MINUTES A DAY</span><h2 id="quick-title">きょうの 5ふん</h2></div>
      <div class="quiz-score" id="quick-score"></div>
      <button type="button" id="quick-close" aria-label="とじる">×</button>
    </div><div id="quick-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#quick-body', dialog);
  let question = null;
  let locked = false;
  const close = () => {
    if (question) send('quick:quit', {});
    question = null;
    try { dialog.close(); } catch { /* もう閉じている */ }
  };
  $('#quick-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  function head() {
    $('#quick-eyebrow', dialog).textContent = `英検${GRADE[question.grade] || ''} · ${question.skill === 'reading' ? 'READING' : 'LISTENING'}`;
    $('#quick-score', dialog).textContent = `${question.index + 1} / ${question.total}　◯ ${question.correct}`;
  }

  function choices(feedback) {
    return `<div class="quiz-choices eiken-choices">${question.choices.map((c, i) => {
      let cls = '';
      if (feedback) { if (i === feedback.answer) cls = 'right'; else if (i === feedback.picked) cls = 'wrong'; }
      return `<button type="button" data-choice="${i}" class="${cls}" ${feedback ? 'disabled' : ''}><b>${LETTERS[i]}</b><span>${esc(c)}</span></button>`;
    }).join('')}</div>`;
  }

  function render(feedback = null) {
    head();
    const top = question.skill === 'reading'
      ? `<p class="eiken-lead">英語の 文を 読んで、質問に 答えよう。</p>
         <div class="eiken-passage"><p>${esc(question.text)}</p><button type="button" id="quick-read">▷ 読み上げ</button></div>
         ${question.hint ? `<details class="eiken-hint"><summary>ことばの ヒント</summary><p>${esc(question.hint)}</p></details>` : ''}`
      : `<p class="eiken-lead">英語を 聞いて、意味を えらぼう。</p>
         <div class="eiken-ear"><button type="button" id="quick-play">🔊 もう一度 きく</button>
         ${feedback ? `<p class="eiken-said">${esc(question.say)}</p>` : '<p class="eiken-said hidden">？</p>'}</div>`;
    const line = feedback
      ? `<p class="quiz-feedback ${feedback.correct ? 'ok' : 'ng'}">${feedback.correct ? '◯ せいかい！' : `× こたえは ${LETTERS[feedback.answer]}`}${feedback.coins ? ` · ◈ +${feedback.coins}` : ''}</p>`
      : '';
    const next = feedback
      ? `<div class="quiz-actions">${feedback.done
        ? `<p class="quick-done">${feedback.score} / ${feedback.total} もん せいかい。${feedback.perfect ? 'ぜんもん せいかい！' : 'また あした！'}</p><button type="button" class="primary" id="quick-end">おわる</button>`
        : '<button type="button" class="primary" id="quick-next">つぎへ →</button>'}</div>`
      : '';
    body().innerHTML = `${top}<p class="eiken-q">${esc(question.q)}</p>${choices(feedback)}${line}${next}`;
    $('#quick-read', dialog)?.addEventListener('click', () => speak(question.text));
    $('#quick-play', dialog)?.addEventListener('click', () => speak(question.say));
    body().querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = () => {
        if (locked || feedback) return;
        locked = true;
        body().querySelectorAll('[data-choice]').forEach((x) => { x.disabled = true; });
        send('quick:answer', { choice: Number(b.dataset.choice) });
      };
    });
    $('#quick-next', dialog)?.addEventListener('click', () => { if (pending) { question = pending; pending = null; locked = false; render(); if (question.skill === 'listening') speak(question.say); } });
    $('#quick-end', dialog)?.addEventListener('click', () => { question = null; try { dialog.close(); } catch { /* */ } });
  }

  let pending = null;
  return {
    open(grade = '') {
      if (!isOnline()) { toast('きょうの 5ふんは オンラインで できます。'); return; }
      if (!dialog.open) dialog.showModal();
      body().innerHTML = '<p class="dash-note">じゅんび しています…</p>';
      send('quick:start', grade ? { grade } : {});
    },
    onQuestion(m) {
      question = m; pending = null; locked = false;
      if (!dialog.open) dialog.showModal();
      render();
      if (m.skill === 'listening') speak(m.say);
    },
    onResult(m) {
      pending = m.next || null;
      render(m);
    },
    onError(m) {
      locked = false;
      if (m.reason === 'too fast') { toast('ちょっと まってね。'); if (question) render(); return; }
      toast('いまは はじめられません。');
    },
    onClosed() { question = null; },
    get dialog() { return dialog; },
  };
}
