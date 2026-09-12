// めんせつの間 — the 英検 second stage, practised with ウーピー.
//
// The four halls on these islands are quizzes: a child chooses, or builds, or says one
// sentence, and the screen is a question and some buttons. This is not that. It is an
// interview, so it looks like one: the examiner is on the screen, there is a card with a
// passage to read aloud, and the questions come one at a time with nothing else on the
// page — because that is what makes it feel like the real thing and not a worksheet.
//
// Nothing here marks anything. The page sends what the microphone heard and is told
// afterwards whether it counted, what the model answer was, and what to practise. The
// bank, the marking and the money are all in server/src/game/interview.js.
import { createCharacter, characterStageHtml } from './character.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// What the parts of an interview are called on the screen, in the child's language.
const PART = {
  read: { label: '音読', ja: 'パッセージを 声に出して 読もう' },
  passage: { label: 'パッセージの しつもん', ja: 'いま 読んだ 文に ついての しつもん' },
  picture: { label: 'イラストの しつもん', ja: '絵を 見て こたえる しつもん' },
  self: { label: 'あなたの こと', ja: 'あなた自身に ついての しつもん' },
};

export function createInterviewUI({ send, toast, isOnline }) {
  const state = {
    island: '',       // which 英検 island the room is on
    badge: '',
    open: false,
    stage: 'read',    // read | ask | done
    card: null,       // the passage card
    question: null,   // the question being asked, or null while reading
    at: 0,
    of: 0,
    marks: [],        // one per part, as they come back
    busy: false,
    hint: '',
    result: null,
  };
  let recognition = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'iv-dialog';
  dialog.innerHTML = `<header class="iv-head">
      <div><small id="iv-badge">英検</small><h2 id="iv-title">めんせつの間</h2></div>
      <div class="iv-head-right"><span id="iv-step"></span><button type="button" id="iv-close" aria-label="とじる">×</button></div>
    </header>
    <div class="iv-body">
      <section class="conv-stage iv-stage" id="iv-stage" data-mouth="idle" data-video="on">
        ${characterStageHtml('iv')}
      </section>
      <section class="iv-side">
        <div class="iv-marks" id="iv-marks" aria-label="どこまで すすんだか"></div>
        <div class="iv-card" id="iv-card"></div>
        <p class="iv-status" id="iv-status" aria-live="polite"></p>
        <div class="iv-acts">
          <button type="button" id="iv-mic" class="primary">🎤 こたえる</button>
          <button type="button" id="iv-again">🔁 もう一度 聞く</button>
          <button type="button" id="iv-tip">？ ヒント</button>
        </div>
        <div class="iv-write">
          <input id="iv-text" type="text" maxlength="200" placeholder="書いても こたえられます" aria-label="英語で こたえを 書く">
          <button type="button" id="iv-send">おくる</button>
        </div>
        <p class="iv-fine">本番と 同じ 順番です。まちがえても 最後まで すすみます。</p>
      </section>
    </div>
    <div class="iv-result" id="iv-result" hidden></div>`;
  document.body.append(dialog);

  const upee = createCharacter({
    stage: $('#iv-stage', dialog),
    idle: $('#iv-idle', dialog),
    talk: $('#iv-talk', dialog),
    line: $('#iv-line', dialog),
  });

  const status = (text) => { $('#iv-status', dialog).textContent = text; };

  // ---- what is on the page ---------------------------------------------------------------

  function renderMarks() {
    const total = state.of + 1;                       // the reading is one of the parts
    const cells = [];
    for (let i = 0; i < total; i += 1) {
      const mark = state.marks[i];
      const now = state.marks.length === i && state.stage !== 'done';
      cells.push(`<i class="${mark ? (mark.correct ? 'ok' : 'no') : now ? 'now' : ''}"></i>`);
    }
    $('#iv-marks', dialog).innerHTML = cells.join('');
  }

  function render() {
    const part = state.stage === 'read' ? PART.read : PART[state.question?.kind] || PART.passage;
    $('#iv-step', dialog).textContent = state.stage === 'done' ? 'おわり'
      : state.stage === 'read' ? '音読' : `${state.at + 1} / ${state.of}`;
    renderMarks();
    const card = $('#iv-card', dialog);
    if (state.stage === 'read' && state.card) {
      // The passage, big enough to read aloud from at arm's length on an iPad.
      card.innerHTML = `<p class="iv-part">${esc(part.label)}<small>${esc(part.ja)}</small></p>
        <p class="iv-passage">${esc(state.card.passage)}</p>
        <p class="iv-ja">${esc(state.card.ja)}</p>`;
    } else if (state.question) {
      card.innerHTML = `<p class="iv-part">${esc(part.label)}<small>${esc(part.ja)}</small></p>
        ${state.question.scene ? `<p class="iv-scene"><span>${esc(state.question.emoji || '🖼')}</span>${esc(state.question.scene)}</p>` : ''}
        <p class="iv-q">${esc(state.question.q)}</p>
        <p class="iv-ja">${esc(state.question.ja)}</p>
        ${state.hint ? `<p class="iv-hint">${esc(state.hint)}</p>` : ''}`;
    } else {
      card.innerHTML = '';
    }
    for (const id of ['#iv-mic', '#iv-send', '#iv-tip']) $(id, dialog).disabled = state.busy || state.stage === 'done';
  }

  // ---- the microphone ---------------------------------------------------------------------

  function stopListening() { try { recognition?.stop(); } catch { /* ignore */ } recognition = null; }

  function listen() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { status('この端末では 音声入力が つかえません。下に 書いてね。'); return; }
    if (state.busy || state.stage === 'done') return;
    upee.hush();                     // the examiner stops talking when the child starts
    stopListening();
    try {
      recognition = new Speech();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      status('聞いています…');
      recognition.onresult = (e) => {
        const heard = e.results[0][0].transcript;
        status(`「${heard}」`);
        answer(heard);
      };
      recognition.onerror = (e) => {
        status(e.error === 'not-allowed'
          ? 'マイクが きょかされていません。下に 書いてね。'
          : 'うまく 聞き取れませんでした。もう一度か、下に 書いてね。');
      };
      recognition.start();
    } catch { status('音声入力を はじめられませんでした。下に 書いてね。'); }
  }

  // What the microphone heard, or what was typed. Whether it counted is the server's.
  function answer(text) {
    const heard = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!heard || state.busy || state.stage === 'done') return;
    state.busy = true;
    state.hint = '';
    render();
    send('interview:say', { heard });
  }

  $('#iv-mic', dialog).onclick = () => listen();
  $('#iv-send', dialog).onclick = () => { const box = $('#iv-text', dialog); answer(box.value); box.value = ''; };
  $('#iv-text', dialog).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#iv-send', dialog).click(); } };
  // WASD belongs to the world, not to a child writing an English sentence.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    $('#iv-text', dialog).addEventListener(type, (e) => e.stopPropagation());
  }
  $('#iv-again', dialog).onclick = () => {
    const line = state.stage === 'read' ? state.card?.passage : state.question?.q;
    if (line) upee.say(line);
  };
  // The hint is the Japanese, said out loud in English is not — a child who is stuck in an
  // interview needs to be told how to start, not given the answer.
  $('#iv-tip', dialog).onclick = () => {
    status(state.stage === 'read'
      ? 'ゆっくりで いいよ。ピリオドで ひと呼吸。'
      : 'まず 主語（He / She / I）から 言ってみよう。');
  };
  $('#iv-close', dialog).onclick = () => quit();
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); quit(); });

  function quit() {
    if (state.stage !== 'done') send('interview:quit', {});
    close();
  }

  function close() {
    upee.hush();
    stopListening();
    state.open = false;
    state.busy = false;
    if (dialog.open) dialog.close();
  }

  // ---- what the island and the server call -------------------------------------------------

  return {
    state,
    // Walking into the room and pressing E.
    enter(islandId) {
      if (!isOnline()) { toast('めんせつの れんしゅうは オンラインで できます。'); return; }
      state.island = islandId;
      state.busy = true;
      state.result = null;
      state.marks = [];
      state.hint = '';
      status('');
      $('#iv-result', dialog).hidden = true;
      upee.load();
      send('interview:start', { island: islandId });
    },
    label: () => '🎙 めんせつの れんしゅう',
    close,
    // ---- what the server says
    onCard(m) {
      state.badge = m.badge || '';
      state.card = m.card;
      state.stage = m.stage;
      state.question = m.question;
      state.at = m.at || 0;
      state.of = m.of || 0;
      state.marks = [];
      state.busy = false;
      state.open = true;
      // The grade's own title already says which grade it is; saying it twice is noise.
      $('#iv-badge', dialog).textContent = m.title || m.badge || '';
      $('#iv-title', dialog).textContent = m.card?.title ? `${m.card.title}` : 'めんせつの間';
      $('#iv-result', dialog).hidden = true;
      $('#iv-result', dialog).innerHTML = '';
      render();
      if (!dialog.open) dialog.showModal();
      $('#iv-idle', dialog).play?.().catch(() => { /* the tap that opened this was the gesture */ });
      // The examiner speaks first, exactly as they do in the room.
      upee.say(m.opening || 'Please read the passage aloud.');
      status(m.howto || '');
    },
    onTurn(m) {
      state.marks.push({ kind: m.kind, correct: m.correct });
      state.busy = false;
      state.hint = m.correct ? '' : (m.model ? `お手本： ${m.model}` : '');
      if (m.next) {
        state.stage = m.next.stage;
        state.question = m.next.question;
        state.at = m.next.at || 0;
        state.of = m.next.of || state.of;
      } else {
        state.stage = 'done';
        state.question = null;
      }
      render();
      // ウーピー's line, then the next question in the same breath, the way an examiner
      // reads it out. The child can press 🔁 to hear the question again.
      const next = m.next?.question?.q;
      upee.say(next ? `${m.line} ${next}` : m.line);
      if (!m.correct && m.hint) status(m.hint);
    },
    onDone(m) {
      state.stage = 'done';
      state.result = m;
      state.busy = false;
      render();
      const box = $('#iv-result', dialog);
      const rows = (m.marks || []).map((mark, i) => `<li class="${mark.correct ? 'ok' : 'no'}">
          <b>${i === 0 ? '音読' : `Q${i}`}</b><span>${mark.correct ? 'よくできました' : 'もう一歩'}</span></li>`).join('');
      box.innerHTML = `<h3>${m.right} / ${m.total}${m.perfect ? '　ぜんぶ せいかい！' : ''}</h3>
        <ol class="iv-result-marks">${rows}</ol>
        ${m.comment ? `<p class="iv-comment">${esc(m.comment.en)}</p><p class="iv-comment-ja">${esc(m.comment.ja)}</p>` : ''}
        <p class="iv-prize">◈ +${m.coins || 0}　✧ +${m.xp || 0} XP${m.capped ? '（今日のコインは 上限です）' : ''}</p>
        <div class="iv-result-acts">
          <button type="button" id="iv-again-run" class="primary">もう一度 めんせつ</button>
          <button type="button" id="iv-done">とじる</button>
        </div>`;
      box.hidden = false;
      $('#iv-again-run', box).onclick = () => { box.hidden = true; this.enter(state.island); };
      $('#iv-done', box).onclick = () => close();
      if (m.comment?.en) upee.say(m.comment.en);
      else upee.say('Thank you very much. This is the end of the test.');
    },
    onClosed(m) {
      if (m?.reason === 'time') toast('じかんが たったので めんせつを おわりました。');
      close();
    },
    onError(m) {
      state.busy = false;
      render();
      const said = {
        'too far': 'めんせつの間の 中で できます。',
        'too fast': 'ちょっと まってから こたえてね。',
        'nothing heard': 'なにか 言ってから おくってね。',
        'unknown island': 'この島には めんせつの間が ありません。',
      }[m?.reason];
      if (said) { status(said); toast(said); }
    },
  };
}
