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
  narrate: { label: '絵の ストーリー', ja: 'コマの じゅんに 話そう（はじめの 文から）' },
  opinion: { label: 'あなたの 意見', ja: 'Yes / No（さんせい・はんたい）と 理由を 言おう' },
  speech: { label: 'スピーチ', ja: 'じぶんの 考えと 理由を 2 分で 話そう' },
};
// 2026-10 の 作りなおし（英会話島の 会話と 同じ 考え・Google Read Along・Duolingo の 話す 練習）：
// ・まんなかに 大きな「🎤 おして はなす」。聞こえた ことばは その場で 出る（interimResults）。もう一度 おすと おわり。
// ・音読は 読めた ことばが 光る（Read Along の 追いかけ）。本番と 同じく さいしょは だまって 読む 時間（20 びょう・とばせる）。
// ・日本語は 本番に ないので ふだんは かくす（🇯🇵 で 出す）。🔁 もう一度・🐢 ゆっくりで。
// ・長く 話す 形（意見・絵の ストーリー・スピーチ）は 語数の メーター（この 語数で ○ に なる）。
// ・答えた あとは「✓／△ ＋ お手本 🔊」を 次の しつもんの 上に のこす（聞いて まねできる）。
const LONG = new Set(['narrate', 'opinion', 'speech']);
const PREP = { read: 20, narrate: 30, speech: 30 };
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);

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
    showJa: false,
    kbd: false,
    listening: false,
    live: '',
    feedback: null,   // { correct, model } — まえの しつもんの けっか
    prep: 0,
  };
  let recognition = null;
  let prepTimer = 0;

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
        <div class="iv-live" id="iv-live" hidden></div>
        <button type="button" id="iv-mic" class="iv-mic"><span class="iv-mic-ico">🎤</span><b>おして はなす</b><small id="iv-mic-sub"></small></button>
        <div class="iv-acts">
          <button type="button" id="iv-again" title="もう一度 聞く">🔁 もう一度</button>
          <button type="button" id="iv-slow" title="ゆっくり 聞く">🐢 ゆっくりで</button>
          <button type="button" id="iv-jabtn" title="日本語の いみ" aria-pressed="false">🇯🇵 いみ</button>
          <button type="button" id="iv-tip">？ ヒント</button>
          <button type="button" id="iv-kbd" title="書いて こたえる" aria-pressed="false">⌨️</button>
        </div>
        <div class="iv-write" id="iv-write" hidden>
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
    const total = state.of + (state.card?.noRead ? 0 : 1); // the reading is one of the parts（準1級・1級は 音読なし）
    const cells = [];
    for (let i = 0; i < total; i += 1) {
      const mark = state.marks[i];
      const now = state.marks.length === i && state.stage !== 'done';
      cells.push(`<i class="${mark ? (mark.correct ? 'ok' : 'no') : now ? 'now' : ''}"></i>`);
    }
    $('#iv-marks', dialog).innerHTML = cells.join('');
  }

  const esc2 = esc;
  function sceneHtml(q) {
    if (!q.scene) return '';
    const panels = String(q.scene).split(/[／]/).map((x) => x.trim()).filter(Boolean);
    const emo = q.emoji ? `<span class="iv-scene-emo">${esc2(q.emoji)}</span>` : '';
    if (panels.length > 1) return `<div class="iv-scene iv-panels">${emo}<ol>${panels.map((p) => `<li>${esc2(p)}</li>`).join('')}</ol></div>`;
    return `<p class="iv-scene">${emo}${esc2(q.scene)}</p>`;
  }
  function feedbackHtml() {
    const f = state.feedback;
    if (!f) return '';
    return `<div class="iv-fb ${f.correct ? 'ok' : 'no'}">${f.correct ? '✓ よく できました' : '△ もう一歩'}${f.model ? `<span>お手本： <b translate="no">${esc2(f.model)}</b> <button type="button" class="iv-say" data-say="${esc2(f.model)}" title="お手本を 聞く">🔊</button></span>` : ''}</div>`;
  }
  function render() {
    const part = state.stage === 'read' ? PART.read : PART[state.question?.kind] || PART.passage;
    $('#iv-step', dialog).textContent = state.stage === 'done' ? 'おわり'
      : state.stage === 'read' ? '音読' : `${state.at + 1} / ${state.of}`;
    renderMarks();
    const card = $('#iv-card', dialog);
    const ja = (t) => (t ? `<p class="iv-ja"${state.showJa ? '' : ' hidden'}>${esc2(t)}</p>` : '');
    const prep = state.prep > 0 ? `<p class="iv-prep">⏳ ${state.stage === 'read' ? 'だまって 読もう' : 'じゅんびの 時間'} <b>${state.prep}</b> びょう <button type="button" class="iv-prep-skip">とばす</button></p>` : '';
    if (state.stage === 'read' && state.card) {
      // The passage, big enough to read aloud from at arm's length on an iPad. ことばごとに 光る。
      const tokens = String(state.card.passage).split(/(\s+)/).map((t) => (/\s+/.test(t) ? t : `<span class="iv-w">${esc2(t)}</span>`)).join('');
      card.innerHTML = `<p class="iv-part">${esc2(part.label)}<small>${esc2(part.ja)}</small></p>${prep}
        <p class="iv-passage">${tokens}</p>${ja(state.card.ja)}`;
    } else if (state.question) {
      const need = state.question.minWords || 0;
      card.innerHTML = `${feedbackHtml()}<p class="iv-part">${esc2(part.label)}<small>${esc2(part.ja)}</small></p>${prep}
        ${sceneHtml(state.question)}
        <p class="iv-q">${esc2(state.question.q)}</p>${ja(state.question.ja)}
        ${LONG.has(state.question.kind) && need ? `<p class="iv-need">${esc2(`${need} ご いじょう 話そう`)}</p>` : ''}
        ${state.hint ? `<p class="iv-hint">${esc2(state.hint)}</p>` : ''}`;
    } else {
      card.innerHTML = feedbackHtml();
    }
    card.querySelector('.iv-prep-skip')?.addEventListener('click', () => { stopPrep(); render(); });
    card.querySelectorAll('.iv-say').forEach((b) => { b.onclick = () => upee.say(b.dataset.say, { keepLine: true }); });
    const off = state.busy || state.stage === 'done';
    for (const id of ['#iv-mic', '#iv-send', '#iv-tip', '#iv-again', '#iv-slow']) $(id, dialog).disabled = off && !(id === '#iv-mic' && state.listening);
    const mic = $('#iv-mic', dialog);
    mic.classList.toggle('on', state.listening);
    mic.querySelector('b').textContent = state.listening ? 'おわったら もう一度 おす' : 'おして はなす';
    $('#iv-mic-sub', dialog).textContent = state.listening ? '聞いて います…' : state.stage === 'read' ? '文を 声に 出して 読もう' : '';
    $('#iv-jabtn', dialog).setAttribute('aria-pressed', String(state.showJa));
    $('#iv-kbd', dialog).setAttribute('aria-pressed', String(state.kbd));
    $('#iv-write', dialog).hidden = !state.kbd;
    paintLive();
  }

  // 聞こえて いる ことば（その場で）と、長い 答えの 語数メーター。音読は 読めた ことばを 光らせる。
  function paintLive() {
    const box = $('#iv-live', dialog);
    const text = state.live;
    box.hidden = !text;
    const need = state.stage === 'ask' && LONG.has(state.question?.kind) ? state.question.minWords || 0 : 0;
    const n = words(text).length;
    box.innerHTML = text ? `<span translate="no">${esc2(text)}</span>${need ? `<em class="${n >= need ? 'ok' : ''}">${n} / ${need} ご</em>` : ''}` : '';
    if (state.stage === 'read') {
      const heard = words(text);
      let k = 0;
      for (const el of $('#iv-card', dialog).querySelectorAll('.iv-w')) {
        const w = words(el.textContent)[0];
        const at = w ? heard.indexOf(w, k) : -1;
        const hit = at >= 0 && at - k <= 3;
        el.classList.toggle('hit', hit);
        if (hit) k = at + 1;
      }
    }
  }

  function startPrep(kind) {
    stopPrep();
    const sec = PREP[kind] || 0;
    if (!sec) return;
    state.prep = sec;
    prepTimer = setInterval(() => {
      state.prep -= 1;
      if (state.prep <= 0) { stopPrep(); status('さあ、🎤 を おして はなそう。'); }
      const b = $('#iv-card .iv-prep b', dialog);
      if (b) b.textContent = String(state.prep); else render();
      if (state.prep <= 0) render();
    }, 1000);
  }
  function stopPrep() { clearInterval(prepTimer); prepTimer = 0; state.prep = 0; }

  // ---- the microphone ---------------------------------------------------------------------

  let cancelSend = false;
  function stopListening(send = true) { cancelSend = !send; try { recognition?.stop(); } catch { /* ignore */ } }

  // おして はなす：もう一度 おすと おわり（長い 答えは とちゅうで 切れない ように continuous）。
  function listen() {
    if (state.listening) { stopListening(true); return; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { state.kbd = true; render(); status('この端末では 音声入力が つかえません。下に 書いてね。'); return; }
    if (state.busy || state.stage === 'done') return;
    upee.hush();                     // the examiner stops talking when the child starts
    stopPrep();
    const long = state.stage === 'read' || LONG.has(state.question?.kind);
    let finals = '';
    try {
      const rec = new Speech();
      recognition = rec;
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = long;
      rec.maxAlternatives = 1;
      cancelSend = false;
      state.listening = true; state.live = ''; render();
      status('聞いています…');
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const r = e.results[i];
          if (r.isFinal) finals += `${r[0].transcript} `; else interim += r[0].transcript;
        }
        state.live = `${finals}${interim}`.replace(/\s+/g, ' ').trim();
        paintLive();
      };
      rec.onerror = (e) => {
        status(e.error === 'not-allowed'
          ? 'マイクが きょかされていません。⌨️ で 書いてね。'
          : e.error === 'no-speech' ? '聞こえなかったよ。もう一度 🎤 を おして はなしてね。' : 'うまく 聞き取れませんでした。もう一度か、⌨️ で 書いてね。');
      };
      rec.onend = () => {
        if (recognition !== rec) return;
        recognition = null;
        state.listening = false;
        const heard = (finals || state.live).replace(/\s+/g, ' ').trim();
        render();
        if (!cancelSend && heard) { status(`「${heard.slice(0, 120)}」`); answer(heard); }
      };
      rec.start();
    } catch { state.listening = false; render(); status('音声入力を はじめられませんでした。⌨️ で 書いてね。'); }
  }

  // What the microphone heard, or what was typed. Whether it counted is the server's.
  function answer(text) {
    const heard = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!heard || state.busy || state.stage === 'done') return;
    state.busy = true;
    state.hint = '';
    state.live = '';
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
  // An on-screen keyboard covers the bottom of the page. Bring the box into view by
  // scrolling the column it lives in — scrollIntoView() scrolls every ancestor, and on a
  // phone held sideways that pushed the whole dialog up and cut off its own header.
  $('#iv-text', dialog).addEventListener('focus', () => setTimeout(() => {
    const side = $('.iv-side', dialog);
    if (side) side.scrollTop = side.scrollHeight;
    dialog.scrollTop = 0;
  }, 250));
  const line = () => (state.stage === 'read' ? state.card?.passage : state.question?.q);
  $('#iv-again', dialog).onclick = () => { if (line()) upee.say(line(), { keepLine: true }); };
  $('#iv-slow', dialog).onclick = () => { if (line()) upee.say(line(), { slow: true, keepLine: true }); };
  $('#iv-jabtn', dialog).onclick = () => { state.showJa = !state.showJa; render(); };
  $('#iv-kbd', dialog).onclick = () => { state.kbd = !state.kbd; render(); if (state.kbd) setTimeout(() => $('#iv-text', dialog).focus(), 30); };
  // The hint is the Japanese, said out loud in English is not — a child who is stuck in an
  // interview needs to be told how to start, not given the answer.
  $('#iv-tip', dialog).onclick = () => {
    const k = state.question?.kind;
    status(state.stage === 'read' ? 'ゆっくりで いいよ。ピリオドで ひと呼吸。'
      : k === 'opinion' ? 'Yes / No（I think …）の あとに because … で 理由を 1 つ。'
        : k === 'narrate' ? 'はじめの 文を 言ってから、コマの じゅんに 1 コマ 1〜2 文。'
          : k === 'speech' ? 'I believe … → First, … → Second, … → In conclusion, … の じゅんで。'
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
    stopListening(false);
    stopPrep();
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
      state.feedback = null; state.live = ''; state.showJa = false;
      state.kbd = !(window.SpeechRecognition || window.webkitSpeechRecognition);
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
      startPrep(state.stage === 'read' ? 'read' : state.question?.kind);
      render();
    },
    onTurn(m) {
      state.marks.push({ kind: m.kind, correct: m.correct });
      state.busy = false;
      state.hint = '';
      state.feedback = { correct: !!m.correct, model: m.correct ? '' : (m.model || '') };
      if (m.next) {
        state.stage = m.next.stage;
        state.question = m.next.question;
        state.at = m.next.at || 0;
        state.of = m.next.of || state.of;
      } else {
        state.stage = 'done';
        state.question = null;
      }
      if (m.next) startPrep(state.question?.kind);
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
        premium: '🔒 プレミアムの しまです。せんせいに きいてね。',
        'too fast': 'ちょっと まってから こたえてね。',
        'nothing heard': 'なにか 言ってから おくってね。',
        'unknown island': 'この島には めんせつの間が ありません。',
      }[m?.reason];
      if (said) { status(said); toast(said); }
    },
  };
}
