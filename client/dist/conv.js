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

import { createCharacter, characterStageHtml } from './character.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    lastJa: '',         // …and the same line in easy Japanese, when the AI gave one (🇯🇵 いみ)
    showJa: false,
    suggestions: [],    // こたえの れい: two or three things the child could say next
    help: false,        // the こたえの れい row is open
    picked: '',         // the example the child tapped (to say it after ウーピー)
    fails: 0,           // the microphone heard nothing / did not work, in a row
    listening: false,
    heard: '',          // what the microphone is hearing right now (live)
    confirm: '',        // a sentence the microphone was not sure about, waiting for ✓
    typing: false,      // the ⌨ box is open
    recap: null,        // the end of a scene: what was said, and what to say better
  };
  let quietTimer = 0;
  // The island file is fetched once, when this is built: the HUD asks for the name of the
  // house a child is standing in before they have opened anything.
  let data = null;
  loadConvData().then((d) => { data = d; });
  let recognition = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'conv-dialog';
  dialog.innerHTML = `<header class="conv-head">
      <div><small id="conv-place">英会話島</small><h2 id="conv-title">ウーピーと はなそう</h2></div>
      <div class="conv-head-right"><span id="conv-turn"></span><button type="button" id="conv-close" aria-label="とじる">×</button></div>
    </header>
    <div class="conv-body">
      <section class="conv-stage" id="conv-stage" data-mouth="idle" data-video="on">
        ${characterStageHtml('conv')}
        <p id="conv-ja" class="conv-ja" translate="no" hidden></p>
        <span class="conv-ear" aria-hidden="true">👂</span>
      </section>
      <section class="conv-side">
        <div id="conv-picker" class="conv-picker" hidden></div>
        <ul id="conv-aims" class="conv-aims" hidden></ul>
        <ol id="conv-log" class="conv-log" aria-live="polite"></ol>
        <p id="conv-hint" class="conv-hint" hidden></p>
        <div id="conv-recap" class="conv-recap" hidden></div>
      </section>
    </div>
    <footer class="conv-foot" id="conv-foot" hidden>
      <div id="conv-help" class="conv-help" hidden>
        <small>こう いって みよう（おすと ウーピーが いうよ → まねして 🎤）</small>
        <div id="conv-chips" class="conv-chips" translate="no"></div>
      </div>
      <div id="conv-confirm" class="conv-confirm" hidden>
        <span>この 文で おくる？</span><b id="conv-confirm-text" translate="no"></b>
        <button type="button" id="conv-yes" class="primary">✓ おくる</button><button type="button" id="conv-no">🎤 もう一度</button>
      </div>
      <div class="conv-main">
        <div class="conv-acts">
          <button type="button" id="conv-again" title="もう一度 きく">🔊<small>もう一度</small></button>
          <button type="button" id="conv-slow" title="ゆっくり きく">🐢<small>ゆっくりで</small></button>
          <button type="button" id="conv-mean" title="にほんごの いみ">🇯🇵<small>いみ</small></button>
        </div>
        <button type="button" id="conv-mic" class="conv-mic"><span class="conv-mic-ic" aria-hidden="true">🎤</span><b id="conv-mic-label">おして はなす</b></button>
        <div class="conv-acts">
          <button type="button" id="conv-tip" title="こたえの れい">💡<small>れい</small></button>
          <button type="button" id="conv-write" title="キーボードで かく">⌨️<small>かく</small></button>
          <button type="button" id="conv-quit" title="やめる">🚪<small>やめる</small></button>
        </div>
      </div>
      <div class="conv-type" id="conv-type" hidden><input id="conv-text" type="text" inputmode="latin" autocomplete="off" placeholder="英語で 書いてもいいよ" maxlength="160"><button type="button" id="conv-send">おくる</button></div>
      <p id="conv-status" class="conv-status" aria-live="polite"></p>
    </footer>`;
  document.body.append(dialog);

  const idle = $('#conv-idle', dialog);
  const talk = $('#conv-talk', dialog);
  const stage = $('#conv-stage', dialog);

  // ウーピー himself — the two clips, the voice and the mouth — is character.js, shared
  // with the めんせつの間 on the 英検 islands. What is left here is the conversation.
  const upee = createCharacter({ stage, idle, talk, line: $('#conv-line', dialog) });
  const loadVideo = () => upee.load();
  // ウーピーが 話しおわったら「だまって いる」を 数えはじめる（9 秒 なにも しなければ こたえの れいを 出す）。
  const say = (text, { slow = false, keep = false } = {}) => {
    if (!keep) state.last = text;
    clearTimeout(quietTimer);
    upee.say(text, { slow, keepLine: keep, onend: () => { if (!keep) waitForChild(); } });
  };
  const SPEECH = window.SpeechRecognition || window.webkitSpeechRecognition;
  function waitForChild() {
    clearTimeout(quietTimer);
    if (!state.topic || state.done || state.busy || state.help) return;
    quietTimer = setTimeout(() => {
      if (!state.topic || state.done || state.busy || state.listening || state.typing || state.help || !dialog.open) return;
      openHelp('こまったら れいを おして みてね。');
    }, 9000);
  }
  function openHelp(note = '') {
    if (!state.suggestions.length) return;
    state.help = true;
    if (note) status(note);
    render();
  }
  const hush = () => upee.hush();

  // ---- the screen --------------------------------------------------------------------

  function render() {
    $('#conv-place', dialog).textContent = state.house ? `${state.house.tone || state.house.icon || ""} ${state.house.name}`.trim() : '英会話島';
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
    $('#conv-log', dialog).innerHTML = state.log.map((line, i) => (
      `<li class="conv-${line.who}"><b>${line.who === 'me' ? 'じぶん' : 'ウーピー'}</b>${esc(line.text)}${line.who === 'upee' ? `<button type="button" class="conv-replay" data-line="${i}" aria-label="もう一度 きく">🔊</button>` : ''}</li>`
    )).join('')
      // 考えて いる あいだは すぐ「…」（へんじが くるまで 何も うごかないと、きこえなかったと 思って しまう）。
      + (state.busy ? '<li class="conv-upee conv-think"><b>ウーピー</b><i></i><i></i><i></i></li>' : '')
      + (state.listening && state.heard ? `<li class="conv-me conv-live"><b>じぶん</b>${esc(state.heard)}…</li>` : '');
    const log = $('#conv-log', dialog);
    log.scrollTop = log.scrollHeight;
    const hint = $('#conv-hint', dialog);
    hint.hidden = !state.hint;
    hint.textContent = state.hint ? `💡 ${state.hint}` : '';
    const mic = $('#conv-mic', dialog);
    mic.disabled = state.busy || state.done || !SPEECH;
    mic.classList.toggle('on', state.listening);
    mic.classList.toggle('copy', !!state.picked && !state.listening);
    $('#conv-mic-label', dialog).textContent = !SPEECH ? 'マイクは つかえません' : state.listening ? 'きいてるよ… おわったら もう一度 おす' : state.busy ? 'ウーピーが かんがえ中…' : state.picked ? 'まねして いって みよう' : 'おして はなす';
    stage.dataset.listen = state.listening ? '1' : '';
    $('#conv-send', dialog).disabled = state.busy || state.done;
    $('#conv-text', dialog).disabled = state.busy || state.done;
    $('#conv-type', dialog).hidden = !(state.typing || !SPEECH) || state.done;
    $('#conv-write', dialog).classList.toggle('on', state.typing);
    $('#conv-tip', dialog).classList.toggle('on', state.help);
    $('#conv-tip', dialog).disabled = !state.suggestions.length || state.done;
    const mean = $('#conv-mean', dialog);
    mean.hidden = !state.lastJa;
    mean.classList.toggle('on', state.showJa);
    const ja = $('#conv-ja', dialog);
    ja.hidden = !(state.showJa && state.lastJa);
    ja.textContent = state.lastJa;
    const help = $('#conv-help', dialog);
    help.hidden = !state.help || !state.suggestions.length || state.done || state.busy;
    $('#conv-chips', dialog).innerHTML = state.suggestions.map((t, i) => `<button type="button" data-chip="${i}" class="${t === state.picked ? 'on' : ''}">🔊 ${esc(t)}</button>`).join('');
    $('#conv-confirm', dialog).hidden = !state.confirm;
    $('#conv-confirm-text', dialog).textContent = state.confirm;
    const recap = $('#conv-recap', dialog);
    recap.hidden = !state.recap;
    if (state.recap) recap.innerHTML = recapHtml(state.recap);
    $('#conv-log', dialog).hidden = !!state.recap;
    $('#conv-hint', dialog).hidden = !!state.recap || !state.hint;
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

  function stopListening() { try { recognition?.stop(); } catch { /* ignore */ } }

  // おして はなす：1 回 おすと きく、もう一度 おすと おわる（だまれば じぶんで おわる）。
  // 聞こえて いる ことばは その場で 出す（なにが きこえたか 見えると、子どもは じぶんで 言いなおせる）。
  function listen() {
    if (!SPEECH) { state.typing = true; status('この端末では 音声入力が つかえません。下に 書いてね。'); render(); return; }
    if (state.busy || state.done) return;
    if (state.listening) { stopListening(); return; }
    clearTimeout(quietTimer);
    hush();                       // ウーピー stops talking when a child starts
    state.confirm = '';
    try {
      const rec = new SPEECH();
      recognition = rec;
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let finalText = ''; let conf = 1; let got = false;
      rec.onstart = () => { state.listening = true; state.heard = ''; status(''); render(); };
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const r = e.results[i];
          if (r.isFinal) { finalText += `${r[0].transcript} `; conf = Math.min(conf, r[0].confidence || 1); got = true; }
          else interim += r[0].transcript;
        }
        state.heard = `${finalText}${interim}`.trim();
        render();
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { state.typing = true; status('マイクが きょかされていません。下に 書いてね。'); }
        else if (e.error === 'no-speech') status('きこえなかったよ。マイクに ちかづいて、もう一度 おしてね。');
        else if (e.error !== 'aborted') status('うまく 聞き取れませんでした。もう一度 おしてね。');
      };
      rec.onend = () => {
        if (recognition === rec) recognition = null;
        state.listening = false;
        const said = (finalText || (got ? '' : state.heard)).trim();
        state.heard = '';
        if (!said) {
          // 2 回 つづけて だめなら、こたえの れいを 出す（子どもの 声は 機械に とどきにくい）。
          state.fails += 1;
          if (state.fails >= 2) openHelp('れいを おして、まねして いって みよう。かいても いいよ（⌨️）。');
          render();
          return;
        }
        state.fails = 0;
        // 自信の ない ときだけ たしかめる（iPad は いつも 0 を かえすので 0 は たしかめない）。
        if (conf > 0 && conf < 0.5) { state.confirm = said; status(''); render(); return; }
        speakUp(said);
      };
      rec.start();
    } catch { state.listening = false; status('音声入力を はじめられませんでした。下に 書いてね。'); state.typing = true; render(); }
  }

  // What was heard, or what was typed. Either way it is only what the child said: whether
  // it counted is the server's to answer.
  function speakUp(text) {
    const said = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!said || state.busy || state.done) return;
    clearTimeout(quietTimer);
    state.busy = true;
    state.help = false; state.picked = ''; state.confirm = ''; state.showJa = false;
    state.log.push({ who: 'me', text: said });
    status('');
    render();
    send('conv:say', { text: said });
  }

  // ふりかえり：できた こと、言えた 文、「こう いうと もっと いいよ」（3 つまで・🔊 で きける）。
  function recapHtml(r) {
    const met = state.aims.filter((a) => state.aimsMet.includes(a.id));
    const tips = (r.tips || []).map((t, i) => `<li><span class="conv-said" translate="no">${esc(t.said)}</span><span class="conv-arrow">→</span><b translate="no">${esc(t.better)}</b><button type="button" data-tip="${i}" aria-label="きく">🔊</button></li>`).join('');
    return `<h3>${state.aimsMet.length >= state.aims.length ? '🎉 ぜんぶ できた！' : '👏 よく がんばったね'}</h3>
      <p class="conv-recap-aims">${met.map((a) => `✓ ${esc(a.ja)}`).join('　') || 'つぎは 目あてを 1 つ やって みよう'}</p>
      ${r.said?.length ? `<h4>いえた 文</h4><ul class="conv-recap-said" translate="no">${r.said.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${tips ? `<h4>こう いうと もっと いいよ</h4><ul class="conv-recap-tips">${tips}</ul>` : ''}
      <div class="conv-recap-acts"><button type="button" data-recap="again" class="primary">🔁 もう一度 はなす</button><button type="button" data-recap="other">🏠 ほかの はなし</button><button type="button" data-recap="end">おわる</button></div>`;
  }

  $('#conv-mic', dialog).onclick = () => listen();
  $('#conv-send', dialog).onclick = () => { const box = $('#conv-text', dialog); speakUp(box.value); box.value = ''; };
  $('#conv-text', dialog).onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#conv-send', dialog).click(); } };
  $('#conv-text', dialog).oninput = () => clearTimeout(quietTimer);
  $('#conv-again', dialog).onclick = () => { if (state.last) say(state.last); };
  $('#conv-slow', dialog).onclick = () => { if (state.last) say(state.last, { slow: true }); };
  $('#conv-mean', dialog).onclick = () => { state.showJa = !state.showJa; render(); };
  $('#conv-write', dialog).onclick = () => { state.typing = !state.typing; render(); if (state.typing) $('#conv-text', dialog).focus(); };
  $('#conv-yes', dialog).onclick = () => { const t = state.confirm; state.confirm = ''; speakUp(t); };
  $('#conv-no', dialog).onclick = () => { state.confirm = ''; render(); listen(); };
  // こたえの れい：おすと ウーピーが お手本を いう → 子どもが まねして 🎤。**おしただけでは おくらない**（言うのは 子ども）。
  $('#conv-chips', dialog).onclick = (e) => {
    const b = e.target.closest('[data-chip]'); if (!b) return;
    const t = state.suggestions[+b.dataset.chip]; if (!t) return;
    state.picked = t;
    render();
    say(t, { keep: true });
  };
  $('#conv-log', dialog).onclick = (e) => {
    const b = e.target.closest('[data-line]'); if (!b) return;
    const line = state.log[+b.dataset.line]; if (line) say(line.text, { keep: true });
  };
  $('#conv-recap', dialog).onclick = (e) => {
    const tip = e.target.closest('[data-tip]');
    if (tip) { const t = state.recap?.tips?.[+tip.dataset.tip]; if (t) say(t.better, { keep: true }); return; }
    const b = e.target.closest('[data-recap]'); if (!b) return;
    if (b.dataset.recap === 'again' && state.topic) send('conv:start', { topic: state.topic.id, again: true });
    else if (b.dataset.recap === 'other') { const h = state.house; send('conv:end', {}); close(); if (h) api.enter(h); }
    else { send('conv:end', {}); close(); }
  };
  // 💡 れい：こたえの れいを 出す／しまう。れいが なければ 前の ヒント（目あての お手本の 文）。
  $('#conv-tip', dialog).onclick = () => {
    if (state.suggestions.length) { state.help = !state.help; render(); return; }
    const topic = (state.house?.topics || []).find((t) => t.id === state.topic?.id);
    if (!topic) return;
    const at = topic.goals.findIndex((g) => !state.aimsMet.includes(g.id));
    const said = at < 0 ? null : topic.hints?.[at];
    if (!said) { status('もう ぜんぶ 言えたね！'); return; }
    state.hint = `${said}（${topic.goals[at].ja}）`;
    render();
    say(said, { keep: true });
  };
  $('#conv-quit', dialog).onclick = () => { send('conv:end', {}); close(); };
  $('#conv-close', dialog).onclick = () => { send('conv:end', {}); close(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); send('conv:end', {}); close(); });

  function close() {
    hush();
    stopListening();
    clearTimeout(quietTimer);
    state.topic = null;
    state.busy = false;
    state.listening = false;
    if (dialog.open) dialog.close();
  }
  // 場面が かわる たびに 手助けの ものを もとに もどす。
  function fresh() {
    Object.assign(state, { lastJa: '', showJa: false, suggestions: [], help: false, picked: '', fails: 0, heard: '', confirm: '', recap: null });
  }

  // ---- what the island calls ----------------------------------------------------------

  const api = {
    state,
    // Walking into a house and pressing E. The scene list is drawn from conv.json, the
    // same file the island is built from and the server judges positions against.
    // spotId は 英会話島の 家の id か、家そのもの（メインの島の お店は main_island.json に ある）。
    async enter(spotId) {
      if (!isOnline()) { toast('オンラインのときに ウーピーと 話せます。'); return; }
      data = data || await loadConvData();
      const house = typeof spotId === 'object' ? spotId : (data?.island?.spots || []).find((s) => s.id === spotId);
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
      fresh();
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
      fresh();
      state.suggestions = Array.isArray(m.suggestions) ? m.suggestions.slice(0, 3) : [];
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
      state.lastJa = m.replyJa || '';
      state.showJa = false;
      state.suggestions = Array.isArray(m.suggestions) ? m.suggestions.slice(0, 3) : [];
      state.help = false;
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
      if (m.recap) state.recap = m.recap;
      render();
      say(m.reply);
    },
    onClosed() { close(); },
    onError(m) {
      state.busy = false;
      state.listening = false;
      const said = {
        'too far': 'その 家の 中で 話せます。',
        'premium': '🔒 プレミアムの しまです。せんせいに きいてね。',
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
  return api;
}
