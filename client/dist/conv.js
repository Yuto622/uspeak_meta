// 英会話島 — talking to ウーピー, who is on the screen.
//
// The character is two ten-second videos shot in the same place with the same light:
// idle.mp4 (breathing, blinking) and talking.mp4 (the mouth moving). Nothing here tries to
// lip-sync; what it does is simpler and reads as alive: while ウーピー's line is being
// spoken aloud, the talking clip is showing, and the moment the voice stops it fades back
// to idle. The two clips start and end on the same frame, so the fade is invisible.
//
// A browser that cannot decode the clips — or a school that stripped the assets — still
// gets the whole lesson: the stage falls back to a drawn owl that opens its beak on the
// same signal. The conversation never depends on the video.
//
// Nothing about the English is decided here. The page sends what the microphone heard (or
// what the child typed) and renders what the server says came back: the reply, which aims
// were met, and what that was worth.
import { loadConvData } from './conv-island.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// How long the mouth keeps moving when there is no speech synthesis to follow: about the
// pace of a read-aloud sentence, so the character is not still while a child reads.
const READ_MS_PER_CHAR = 62;
const MIN_TALK_MS = 900;

export function createConvUI({ send, toast, isOnline }) {
  const state = {
    house: null,        // the house walked into
    topic: null,        // the scene being talked through
    aims: [],
    aimsMet: [],
    turn: 0,
    turnLimit: 14,
    log: [],            // { who: 'upee' | 'me', text }
    hint: '',
    busy: false,        // a turn is with the server
    done: false,
    last: '',           // ウーピー's last line, for 「もう一度」
  };
  // The island file is fetched once, when this is built: the HUD asks for the name of the
  // house a child is standing in before they have opened anything.
  let data = null;
  loadConvData().then((d) => { data = d; });
  let recognition = null;
  let talkTimer = 0;

  const dialog = document.createElement('dialog');
  dialog.id = 'conv-dialog';
  dialog.innerHTML = `<header class="conv-head">
      <div><small id="conv-place">英会話島</small><h2 id="conv-title">ウーピーと はなそう</h2></div>
      <div class="conv-head-right"><span id="conv-turn"></span><button type="button" id="conv-close" aria-label="とじる">×</button></div>
    </header>
    <div class="conv-body">
      <section class="conv-stage" id="conv-stage" data-mouth="idle" data-video="on">
        <video id="conv-idle" muted playsinline loop preload="auto" aria-hidden="true"></video>
        <video id="conv-talk" muted playsinline loop preload="auto" aria-hidden="true"></video>
        <div class="conv-owl" aria-hidden="true"><span class="conv-owl-face">🦉</span><i class="conv-owl-beak"></i></div>
        <p class="conv-line" id="conv-line"></p>
      </section>
      <section class="conv-side">
        <div id="conv-picker" class="conv-picker" hidden></div>
        <ul id="conv-aims" class="conv-aims" hidden></ul>
        <ol id="conv-log" class="conv-log" aria-live="polite"></ol>
        <p id="conv-hint" class="conv-hint" hidden></p>
      </section>
    </div>
    <footer class="conv-foot" id="conv-foot" hidden>
      <button type="button" id="conv-mic" class="primary">🎤 はなす</button>
      <div class="conv-type"><input id="conv-text" type="text" inputmode="latin" autocomplete="off" placeholder="英語で 書いてもいいよ" maxlength="160"><button type="button" id="conv-send">おくる</button></div>
      <div class="conv-acts"><button type="button" id="conv-again">🔊 もう一度</button><button type="button" id="conv-tip">💡 ヒント</button><button type="button" id="conv-quit">やめる</button></div>
      <p id="conv-status" class="conv-status"></p>
    </footer>`;
  document.body.append(dialog);

  const idle = $('#conv-idle', dialog);
  const talk = $('#conv-talk', dialog);
  const stage = $('#conv-stage', dialog);

  // The clips are only fetched when a child first walks into a house: an island nobody
  // visits costs nobody three megabytes.
  let loaded = false;
  function loadVideo() {
    if (loaded) return;
    loaded = true;
    idle.src = 'assets/character/idle.mp4';
    talk.src = 'assets/character/talking.mp4';
    // A browser without the codec (or without the files) says so here, and the drawn owl
    // takes over. Nothing else changes.
    for (const v of [idle, talk]) v.addEventListener('error', () => { stage.dataset.video = 'off'; }, { once: true });
    idle.play?.().catch(() => { /* a tap will start it */ });
  }

  // The one signal the character runs on: is ウーピー speaking right now.
  function mouth(open) {
    stage.dataset.mouth = open ? 'talking' : 'idle';
    if (open) {
      try { talk.currentTime = 0; } catch { /* not loaded yet */ }
      talk.play?.().catch(() => {});
    } else {
      talk.pause?.();
      idle.play?.().catch(() => {});
    }
  }

  // ウーピー's line, spoken aloud if the browser can, and the mouth moving for as long as
  // it takes either way.
  function say(text) {
    clearTimeout(talkTimer);
    state.last = text;
    $('#conv-line', dialog).textContent = text;
    mouth(true);
    const stop = () => { clearTimeout(talkTimer); mouth(false); };
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') {
      talkTimer = setTimeout(stop, Math.max(MIN_TALK_MS, text.length * READ_MS_PER_CHAR));
      return;
    }
    try {
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      utter.rate = 0.92;
      utter.onend = stop;
      utter.onerror = stop;
      synth.speak(utter);
      // Some browsers never fire onend (Safari, when the tab loses focus). The clock is
      // the backstop, so the mouth never keeps moving after the room has gone quiet.
      talkTimer = setTimeout(stop, Math.max(MIN_TALK_MS, text.length * READ_MS_PER_CHAR) + 2500);
    } catch {
      talkTimer = setTimeout(stop, Math.max(MIN_TALK_MS, text.length * READ_MS_PER_CHAR));
    }
  }

  function hush() {
    clearTimeout(talkTimer);
    try { globalThis.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
    mouth(false);
  }

  // ---- the screen --------------------------------------------------------------------

  function render() {
    $('#conv-place', dialog).textContent = state.house ? `${state.house.tone} ${state.house.name}` : '英会話島';
    $('#conv-title', dialog).textContent = state.topic ? state.topic.title : 'なにを はなす？';
    $('#conv-turn', dialog).textContent = state.topic ? `${state.turn} / ${state.turnLimit}` : '';
    const picking = !state.topic;
    $('#conv-picker', dialog).hidden = !picking;
    $('#conv-aims', dialog).hidden = picking;
    $('#conv-foot', dialog).hidden = picking;
    if (picking) return;
    $('#conv-aims', dialog).innerHTML = state.aims.map((aim) => {
      const met = state.aimsMet.includes(aim.id);
      return `<li class="${met ? 'met' : ''}"><span>${met ? '✓' : '・'}</span>${esc(aim.ja)}</li>`;
    }).join('');
    $('#conv-log', dialog).innerHTML = state.log.map((line) => (
      `<li class="conv-${line.who}"><b>${line.who === 'me' ? 'じぶん' : 'ウーピー'}</b>${esc(line.text)}</li>`
    )).join('');
    const log = $('#conv-log', dialog);
    log.scrollTop = log.scrollHeight;
    const hint = $('#conv-hint', dialog);
    hint.hidden = !state.hint;
    hint.textContent = state.hint ? `💡 ${state.hint}` : '';
    $('#conv-mic', dialog).disabled = state.busy || state.done;
    $('#conv-send', dialog).disabled = state.busy || state.done;
    $('#conv-text', dialog).disabled = state.busy || state.done;
  }

  function renderPicker() {
    const list = state.house?.topics || [];
    $('#conv-picker', dialog).innerHTML = `<p class="conv-pick-lead">${esc(state.house?.ja || '')}</p>`
      + list.map((t) => `<button type="button" data-topic="${esc(t.id)}"><strong>${esc(t.title)}</strong><small>${esc(t.en || '')}</small></button>`).join('')
      + '<p class="conv-fine">ウーピーは まちがいを なおしません。つたわれば 大丈夫。</p>';
    dialog.querySelectorAll('[data-topic]').forEach((b) => {
      b.onclick = () => { send('conv:start', { topic: b.dataset.topic }); };
    });
  }

  const status = (text) => { const el = $('#conv-status', dialog); if (el) el.textContent = text; };

  // ---- the microphone ----------------------------------------------------------------

  function stopListening() { try { recognition?.stop(); } catch { /* ignore */ } recognition = null; }

  function listen() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { status('この端末では 音声入力が つかえません。下に 書いてね。'); return; }
    if (state.busy || state.done) return;
    hush();                       // ウーピー stops talking when a child starts
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
        speakUp(heard);
      };
      recognition.onerror = (e) => {
        status(e.error === 'not-allowed'
          ? 'マイクが きょかされていません。下に 書いてね。'
          : 'うまく 聞き取れませんでした。もう一度か、下に 書いてね。');
      };
      recognition.start();
    } catch { status('音声入力を はじめられませんでした。下に 書いてね。'); }
  }

  // What was heard, or what was typed. Either way it is only what the child said: whether
  // it counted is the server's to answer.
  function speakUp(text) {
    const said = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!said || state.busy || state.done) return;
    state.busy = true;
    state.log.push({ who: 'me', text: said });
    render();
    send('conv:say', { text: said });
  }

  $('#conv-mic', dialog).onclick = () => listen();
  $('#conv-send', dialog).onclick = () => { const box = $('#conv-text', dialog); speakUp(box.value); box.value = ''; };
  $('#conv-text', dialog).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#conv-send', dialog).click(); } };
  $('#conv-again', dialog).onclick = () => { if (state.last) say(state.last); };
  // The model sentence for the first thing still to be said. It comes from conv.json,
  // which the page already has because the island is built from it — and a child who is
  // stuck in a conversation should be shown a sentence, not left to guess at one. It is
  // shown on request only: reading it out is still the child's own work.
  $('#conv-tip', dialog).onclick = () => {
    const topic = (state.house?.topics || []).find((t) => t.id === state.topic?.id);
    if (!topic) return;
    const at = topic.goals.findIndex((g) => !state.aimsMet.includes(g.id));
    const said = at < 0 ? null : topic.hints?.[at];
    if (!said) { status('もう ぜんぶ 言えたね！'); return; }
    state.hint = `${said}（${topic.goals[at].ja}）`;
    render();
    say(said);
  };
  $('#conv-quit', dialog).onclick = () => { send('conv:end', {}); close(); };
  $('#conv-close', dialog).onclick = () => { send('conv:end', {}); close(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); send('conv:end', {}); close(); });

  function close() {
    hush();
    stopListening();
    state.topic = null;
    state.busy = false;
    if (dialog.open) dialog.close();
  }

  // ---- what the island calls ----------------------------------------------------------

  return {
    state,
    // Walking into a house and pressing E. The scene list is drawn from conv.json, the
    // same file the island is built from and the server judges positions against.
    async enter(spotId) {
      if (!isOnline()) { toast('オンラインのときに ウーピーと 話せます。'); return; }
      data = data || await loadConvData();
      const house = (data?.island?.spots || []).find((s) => s.id === spotId);
      if (!house) return;
      state.house = house;
      state.topic = null;
      state.log = [];
      state.hint = '';
      state.aims = [];
      state.aimsMet = [];
      state.turn = 0;
      state.done = false;
      state.busy = false;
      loadVideo();
      renderPicker();
      render();
      if (!dialog.open) dialog.showModal();
      idle.play?.().catch(() => { /* the tap that opened this was the gesture */ });
    },
    label: (spotId) => {
      const house = (data?.island?.spots || []).find((s) => s.id === spotId);
      return house ? `${house.name}で はなす` : 'ウーピーと はなす';
    },
    // ---- what the server says
    onOpened(m) {
      state.topic = { id: m.topic, title: m.title, en: m.en };
      state.aims = m.aims || [];
      state.aimsMet = m.aimsMet || [];
      state.turn = m.turn || 0;
      state.turnLimit = m.turnLimit || 14;
      state.done = !!m.done;
      state.busy = false;
      state.hint = '';
      if (!m.resumed) state.log = [];
      state.log.push({ who: 'upee', text: m.opening });
      status(m.resumed ? 'つづきから はなそう。' : '');
      render();
      if (!dialog.open) dialog.showModal();
      say(m.opening);
    },
    onReply(m) {
      state.busy = false;
      state.turn = m.turn ?? state.turn;
      state.aimsMet = m.aimsMet || state.aimsMet;
      state.hint = m.hint || '';
      state.log.push({ who: 'upee', text: m.reply });
      if (m.gained?.length) {
        const names = m.gained.map((id) => state.aims.find((a) => a.id === id)?.ja).filter(Boolean);
        if (names.length) toast(`✓ ${names.join('・')}（+${m.xp} XP）`);
      }
      if (m.done) {
        state.done = true;
        status(`できた！ +${m.coins || 0}🪙 ・ +${(m.xp || 0) + (m.bonusXp || 0)} XP`);
        toast(m.capped ? 'ぜんぶ できた！ 今日のコインは 上限です。' : `ぜんぶ できた！ +${m.coins}🪙`);
      } else if (state.turn >= state.turnLimit) {
        status('今日の おはなしは ここまで。また 来てね。');
        state.done = true;
      }
      render();
      say(m.reply);
    },
    onClosed() { close(); },
    onError(m) {
      state.busy = false;
      const said = {
        'too far': 'その 家の 中で 話せます。',
        'too fast': 'ちょっと まってね。',
        'turn limit': '今日の おはなしは ここまで。また 来てね。',
        'daily limit': '今日は たくさん 話したね。また あした！',
        'ai unavailable': 'ウーピーが いま 出られません。少し してから もう一度。',
        'unknown topic': 'その おはなしは ありません。',
      }[m?.reason];
      if (said) { status(said); toast(said); }
      render();
    },
    get open() { return dialog.open; },
    dialog,
  };
}
