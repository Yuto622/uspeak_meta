// 英検の島 — the four screens, one per skill.
//
// This module knows the question and nothing else. It never knows the answer: for 読む
// and 聞く it has four options and finds out which was right only after the child has
// committed; for 書く it has the words but not their order; for 話す it sends what the
// microphone heard and lets the server say whether that was the sentence. There is
// nothing here to read ahead.
import { t, onLangChange } from './i18n.js';

// **画面の文字は英語が主**（レッスンは外国人の先生が進める）。「あ」を押すと日本語になる。
// **もんだいの中身は訳さない**：`question.q` / `question.ja` / `question.text` /
// `question.say` / `question.hint` はサーバーの問題バンクから来るもので、
// 日本語であることが問題そのもの。ここを通すのは 見出し・ボタン・お知らせだけ。
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LETTERS = ['A', 'B', 'C', 'D'];
const SKILL = {
  // `ja` と `lead` は**辞書の鍵**。出すときに t() を通すので、ここは日本語のままでよい。
  reading: { tone: '📖', ja: '読む', en: 'READING', lead: '英語の 文を 読んで、質問に 答えよう。' },
  listening: { tone: '🎧', ja: '聞く', en: 'LISTENING', lead: 'ウーピーの 英語を 聞いて、意味を えらぼう。' },
  writing: { tone: '✏️', ja: '書く', en: 'WRITING', lead: 'ことばを ならべて、英語の 文を つくろう。' },
  speaking: { tone: '🎤', ja: '話す', en: 'SPEAKING', lead: '声に 出して 言おう。マイクが 聞いています。' },
};

export function createEikenUI({ send, speak, toast, isOnline, learn }) {
  let question = null;      // the payload the server sent, and never more than that
  let locked = false;
  let built = [];           // 書く: the tiles laid out so far, as indexes into q.tiles
  let recognition = null;
  let badge = '';
  let hallName = '';

  const dialog = document.createElement('dialog');
  dialog.id = 'eiken-dialog';
  dialog.setAttribute('aria-labelledby', 'eiken-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow" id="eiken-eyebrow">EIKEN</span><h2 id="eiken-title" data-t="英検の島">英検の島</h2></div>
      <span id="eiken-score"></span>
      <button type="button" id="eiken-close" aria-label="閉じる" data-t-label="閉じる">×</button>
    </div><div id="eiken-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#eiken-body', dialog);

  const open = () => { if (!dialog.open) dialog.showModal(); };
  function close() {
    question = null;
    locked = false;
    stopListening();
    try { dialog.close(); } catch { /* already closed */ }
  }

  // ---- the four screens ----------------------------------------------------------------

  function head() {
    const s = SKILL[question.skill] || SKILL.reading;
    $('#eiken-eyebrow', dialog).textContent = `${badge} · ${s.en}`;
    // 館の名前はサーバーから来る（`よむ図書館` など）。**それも辞書の鍵**なので、
    // そのまま t() に渡せば英語の館名になる。載っていなければ日本語のまま出る。
    $('#eiken-title', dialog).textContent = hallName ? t(hallName) : `${s.tone} ${t(s.ja)}`;
    $('#eiken-score', dialog).textContent = `${question.index + 1} / ${question.total}　◯ ${question.correct}`;
    return s;
  }

  function choiceRow(feedback) {
    return `<div class="quiz-choices eiken-choices">${question.choices.map((c, i) => {
      let cls = '';
      if (feedback) {
        if (i === feedback.answer) cls = 'right';
        else if (i === feedback.picked) cls = 'wrong';
      }
      return `<button type="button" data-choice="${i}" class="${cls}" ${feedback ? 'disabled' : ''}>
        <b>${LETTERS[i]}</b><span>${esc(c)}</span></button>`;
    }).join('')}</div>`;
  }

  function wireChoices(feedback) {
    body().querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = () => {
        if (locked || feedback) return;
        locked = true;
        body().querySelectorAll('[data-choice]').forEach((x) => { x.disabled = true; });
        send('eiken:answer', { choice: Number(b.dataset.choice) });
      };
    });
  }

  function renderReading(feedback) {
    const s = head();
    body().innerHTML = `<p class="eiken-lead">${esc(t(s.lead))}</p>
      <div class="eiken-passage"><p>${esc(question.text)}</p>
        <button type="button" id="eiken-read">${esc(t('▷ 読み上げ'))}</button></div>
      ${question.hint ? `<details class="eiken-hint"><summary>${esc(t('ことばの ヒント'))}</summary><p>${esc(question.hint)}</p></details>` : ''}
      <p class="eiken-q">${esc(question.q)}</p>
      ${choiceRow(feedback)}${feedbackLine(feedback)}${actions()}`;
    $('#eiken-read', dialog).onclick = () => speak(question.text);
    wireChoices(feedback);
    wireActions();
  }

  function renderListening(feedback) {
    const s = head();
    body().innerHTML = `<p class="eiken-lead">${esc(t(s.lead))}</p>
      <div class="eiken-ear"><button type="button" id="eiken-play">${esc(t('🔊 もう一度 きく'))}</button>
        ${feedback ? `<p class="eiken-said">${esc(question.say)}</p>` : '<p class="eiken-said hidden">？</p>'}</div>
      <p class="eiken-q">${esc(question.q)}</p>
      ${choiceRow(feedback)}${feedbackLine(feedback)}${actions()}`;
    $('#eiken-play', dialog).onclick = () => speak(question.say);
    wireChoices(feedback);
    wireActions();
  }

  function renderWriting(feedback) {
    const s = head();
    const used = new Set(built);
    const line = built.map((i) => question.tiles[i]).join(' ');
    body().innerHTML = `<p class="eiken-lead">${esc(t(s.lead))}</p>
      <p class="eiken-q">${esc(question.ja)}</p>
      <div class="eiken-line ${feedback ? (feedback.correct ? 'ok' : 'ng') : ''}">
        <span>${esc(line) || `<span class="eiken-blank">${esc(t('ここに ならべる'))}</span>`}</span><b>${esc(question.mark)}</b></div>
      <div class="eiken-tiles">${question.tiles.map((w, i) => `
        <button type="button" data-tile="${i}" ${used.has(i) || feedback ? 'disabled' : ''}>${esc(w)}</button>`).join('')}</div>
      <div class="eiken-line-acts">
        <button type="button" id="eiken-undo" ${built.length && !feedback ? '' : 'disabled'}>${esc(t('← ひとつ もどす'))}</button>
        <button type="button" class="primary" id="eiken-done" ${built.length === question.tiles.length && !feedback ? '' : 'disabled'}>${esc(t('これで いい'))}</button>
      </div>
      ${feedbackLine(feedback)}${actions()}`;
    body().querySelectorAll('[data-tile]').forEach((b) => {
      b.onclick = () => { if (locked || feedback) return; built.push(Number(b.dataset.tile)); render(); };
    });
    $('#eiken-undo', dialog).onclick = () => { built.pop(); render(); };
    $('#eiken-done', dialog).onclick = () => {
      if (locked) return;
      locked = true;
      send('eiken:answer', { words: built.map((i) => question.tiles[i]) });
    };
    wireActions();
  }

  function renderSpeaking(feedback) {
    const s = head();
    body().innerHTML = `<p class="eiken-lead">${esc(t(s.lead))}</p>
      <p class="eiken-q">${esc(question.ja)}</p>
      <div class="eiken-say"><strong>${esc(question.en)}</strong>
        <button type="button" id="eiken-play">${esc(t('🔊 お手本'))}</button></div>
      <div class="eiken-mic">
        <button type="button" class="primary" id="eiken-listen" ${feedback ? 'disabled' : ''}>${esc(t('🎤 言ってみる'))}</button>
        <p id="eiken-status">${feedback ? '' : esc(t('ボタンを おしてから 話してね。'))}</p>
      </div>
      <details class="eiken-hint"><summary>${esc(t('声が うまく 入らない ときは'))}</summary>
        <div class="eiken-typed"><input id="eiken-typed" type="text" autocomplete="off" placeholder="${esc(t('英語で 書く'))}" ${feedback ? 'disabled' : ''}>
        <button type="button" id="eiken-send" ${feedback ? 'disabled' : ''}>${esc(t('おくる'))}</button></div></details>
      ${feedbackLine(feedback)}${actions()}`;
    $('#eiken-play', dialog).onclick = () => speak(question.en);
    if (!feedback) {
      $('#eiken-listen', dialog).onclick = listen;
      $('#eiken-send', dialog).onclick = () => {
        const said = $('#eiken-typed', dialog).value.trim();
        if (!said || locked) return;
        locked = true;
        send('eiken:answer', { heard: said });
      };
    }
    wireActions();
  }

  function feedbackLine(f) {
    if (!f) return '';
    if (f.correct) {
      const paid = [f.xp ? `✧ +${f.xp}` : '', f.coins ? `◈ +${f.coins}` : ''].filter(Boolean).join(' ・ ');
      const capped = f.capped ? t('（今日の コインは ここまで）') : '';
      return `<p class="quiz-feedback ok">${esc(t('せいかい！ {paid}', { paid }))}${esc(capped)}</p>`;
    }
    const answer = typeof f.answer === 'number' ? `${LETTERS[f.answer]}「${esc(question.choices?.[f.answer] ?? '')}」` : `「${esc(f.answer)}」`;
    return `<p class="quiz-feedback ng">${f.close ? esc(t('おしい！')) : ''} ${t('こたえは {a}', { a: answer })}</p>`;
  }

  const actions = () => `<div class="quiz-actions"><button type="button" id="eiken-quit">${esc(t('やめる'))}</button></div>`;
  function wireActions() {
    $('#eiken-quit', dialog).onclick = () => { send('eiken:quit', {}); close(); };
  }

  function render(feedback = null) {
    if (!question) return;
    if (question.skill === 'reading') renderReading(feedback);
    else if (question.skill === 'listening') renderListening(feedback);
    else if (question.skill === 'writing') renderWriting(feedback);
    else renderSpeaking(feedback);
  }

  // ---- the microphone --------------------------------------------------------------------

  function stopListening() { try { recognition?.stop(); } catch { /* ignore */ } recognition = null; }

  function listen() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    const status = $('#eiken-status', dialog);
    if (!Speech) { if (status) status.textContent = t('この端末では 音声入力が 使えません。下の らんに 書いてね。'); return; }
    stopListening();
    try {
      recognition = new Speech();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      if (status) status.textContent = t('聞いています…');
      recognition.onresult = (e) => {
        const heard = e.results[0][0].transcript;
        if (locked) return;
        locked = true;
        if (status) status.textContent = `「${heard}」`;
        // Only what the microphone heard goes to the server. Whether that was the
        // sentence is not this page's to say.
        send('eiken:answer', { heard });
      };
      recognition.onerror = (e) => {
        if (!status) return;
        status.textContent = e.error === 'not-allowed'
          ? t('マイクが 許可されていません。下の らんに 書いてね。')
          : t('うまく 聞き取れませんでした。もう一度か、下の らんに 書いてね。');
      };
      recognition.start();
    } catch { if (status) status.textContent = t('音声入力を 始められませんでした。下の らんに 書いてね。'); }
  }

  // 言語を切り替えたら、**開いているもんだいだけ**描き直す。まる／ばつを出している
  // 途中には触らない（描き直すと 正解の色も 次へ進むタイマーも 巻き戻ってしまう）。
  onLangChange(() => { if (dialog.open && question && !locked) render(); });

  $('#eiken-close', dialog).onclick = () => { send('eiken:quit', {}); close(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); send('eiken:quit', {}); close(); });
  dialog.addEventListener('keydown', (e) => {
    if (!question || question.skill === 'writing' || question.skill === 'speaking') return;
    const i = LETTERS.indexOf(e.key.toUpperCase());
    if (i >= 0) { e.preventDefault(); body().querySelector(`[data-choice="${i}"]`)?.click(); }
  });

  return {
    // What the interact button says at a hall's counter.
    label(spot) {
      const s = SKILL[spot?.skill] || null;
      return s ? `${s.tone} ${t('{s}れんしゅう', { s: t(s.ja) })}` : '';
    },
    enter(spot, islandId) {
      if (!spot || !islandId) return;
      if (!isOnline()) { toast(t('英検の島は クラスに 入っているときだけ 使えます。')); return; }
      send('eiken:start', { island: islandId, hall: spot.id });
    },
    onQuestion(m) {
      question = m;
      locked = false;
      built = [];
      if (m.badge) badge = m.badge;
      if (m.name) hallName = m.name;
      stopListening();
      open();
      render();
      // 聞く is a listening question, so it starts by being read out.
      if (m.skill === 'listening') speak(m.say);
    },
    onResult(m) {
      if (!question) return;
      locked = false;
      stopListening();
      const feedback = {
        correct: m.correct, close: m.close, answer: m.answer, picked: m.picked,
        xp: m.xp, coins: m.coins, capped: m.capped,
      };
      render(feedback);
      if (m.correct && question.skill !== 'listening') learn?.(String(m.answer ?? ''), question.ja || question.q || '');
      if (m.levels > 0) toast(t('レベル {n} に なった！', { n: m.progress.level }));
      if (!m.done) {
        setTimeout(() => {
          if (!m.next) return;
          question = m.next;
          built = [];
          render();
          if (m.next.skill === 'listening') speak(m.next.say);
        }, m.correct ? 1500 : 2600);
        return;
      }
      const skill = question.skill;
      setTimeout(() => {
        const stars = '★'.repeat(Math.min(3, Math.round((m.score / m.total) * 3))) + '☆'.repeat(3 - Math.min(3, Math.round((m.score / m.total) * 3)));
        body().innerHTML = `<div class="quiz-done"><p class="gym-stars">${stars}</p>
          <strong>${esc(t('{n} / {t} せいかい', { n: m.score, t: m.total }))}</strong>
          ${m.perfectBonus ? `<p class="eiken-perfect">${esc(t('パーフェクト！ ◈ +{n}', { n: m.perfectBonus }))}</p>` : ''}
          <p>${esc(t('{badge} の {skill}。つづけると もっと 速く 読めるように なります。', { badge: t(badge), skill: t(SKILL[skill]?.ja || '') }))}</p>
          <div class="quiz-actions"><button type="button" class="primary" id="eiken-again">${esc(t('もう一度'))}</button>
          <button type="button" id="eiken-leave">${esc(t('おわる'))}</button></div></div>`;
        $('#eiken-score', dialog).textContent = `${m.score} / ${m.total}`;
        $('#eiken-again', dialog).onclick = () => send('eiken:start', { island: m.island, hall: m.hall });
        $('#eiken-leave', dialog).onclick = close;
        question = null;
      }, m.correct ? 1500 : 2600);
    },
    onClosed() { close(); },
    onError(m) {
      locked = false;
      if (m?.reason === 'too far') {
        toast(m.spot ? t('{spot} まで あるいて いこう。', { spot: t(m.spot.ja) }) : t('館まで あるいて いこう。'));
        close();
        return;
      }
      toast(t({ 'too fast': 'すこし ゆっくりね。', 'unknown hall': 'その 館は ありません。' }[m?.reason] || 'うまく いきませんでした。'));
      render();
    },
  };
}
