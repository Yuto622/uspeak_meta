// クラスのチャット — the preset phrases, and now the child's own words.
//
// This panel is open on every island and everywhere else: it is not part of the call, it
// does not need a room, and a child standing alone on a beach can still write to the
// class. That is the point of it. The phrases stay, because tapping a whole English
// sentence is how a child who cannot yet write one takes part.
//
// Nothing here judges what may be sent. The length, the words, the teacher's switch and
// the log are all on the server (`server/src/game/say.js`); this shows what came back.
const MAX = 120;      // the same limit the server enforces; the box just stops earlier
const LOG_MAX = 24;

export function createChat({ onSend, onSay, speak, toast, isPaused, isFree }) {
  let phrases = { categories: [] };
  let byId = new Map();
  let open = false;
  const log = [];
  const root = document.createElement('div');
  root.id = 'net-chat';
  root.hidden = true;
  root.innerHTML = `<div class="net-chat-head"><strong>💬 English Chat</strong><span id="net-chat-paused" hidden>先生が一時停止中</span><button type="button" id="net-chat-close" aria-label="閉じる">×</button></div>
  <nav id="net-chat-tabs" aria-label="フレーズの種類"></nav><div id="net-chat-phrases"></div><ol id="net-chat-log" aria-live="polite"></ol>
  <form id="net-chat-say" autocomplete="off"><input id="net-chat-text" type="text" maxlength="${MAX}" placeholder="じゆうに かいてみよう" aria-label="メッセージを書く"><button type="submit" id="net-chat-send">おくる</button></form>
  <p id="net-chat-fine" class="net-fine">クラスの みんなに とどきます。先生も 見ています。</p>`;
  document.body.append(root);
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'net-chat-button';
  button.className = 'net-fab';
  button.hidden = true;
  button.textContent = '💬';
  button.setAttribute('aria-label', 'チャットを開く');
  document.body.append(button);
  const $ = (s) => root.querySelector(s);
  let category = '';

  async function load() {
    try {
      const res = await fetch('phrases.json', { cache: 'no-cache' });
      phrases = await res.json();
    } catch (err) {
      console.warn('[chat] phrases.json failed to load', err);
      phrases = { categories: [] };
    }
    byId = new Map();
    for (const c of phrases.categories) for (const p of c.phrases) byId.set(p.id, p);
    category = phrases.categories[0]?.id || '';
    render();
  }

  function render() {
    $('#net-chat-tabs').innerHTML = phrases.categories.map((c) => `<button type="button" data-cat="${c.id}" aria-pressed="${c.id === category}">${c.label}</button>`).join('');
    const c = phrases.categories.find((x) => x.id === category);
    $('#net-chat-phrases').innerHTML = (c?.phrases || []).map((p) => `<button type="button" data-phrase="${p.id}"><strong>${p.en}</strong><small>${p.ja}</small></button>`).join('');
    root.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { category = b.dataset.cat; render(); }; });
    root.querySelectorAll('[data-phrase]').forEach((b) => { b.onclick = () => send(b.dataset.phrase); });
    $('#net-chat-paused').hidden = !isPaused();
    renderLog();
    renderSay();
  }

  function renderLog() {
    const list = $('#net-chat-log');
    list.innerHTML = log.map((m) => (m.text
      ? `<li><b>${escapeHtml(m.who)}</b> ${escapeHtml(m.text)}</li>`
      : `<li><b>${escapeHtml(m.who)}</b> ${escapeHtml(m.en)} <small>${escapeHtml(m.ja)}</small></li>`)).join('');
    list.scrollTop = list.scrollHeight;
  }

  // Free typing is a class setting, not a page setting: when a teacher turns it off the
  // box goes away and says so, rather than taking words the server will refuse.
  function renderSay() {
    const free = isFree();
    $('#net-chat-say').hidden = !free;
    $('#net-chat-fine').textContent = free
      ? 'クラスの みんなに とどきます。先生も 見ています。'
      : 'いまは えらんだ フレーズだけ 送れます。';
  }

  function send(id) {
    const p = byId.get(id);
    if (!p) return;
    if (isPaused()) { toast('チャットは先生によって一時停止中です。'); return; }
    onSend(id);
    speak?.(p.en);
  }

  function say() {
    const box = $('#net-chat-text');
    const text = box.value.trim();
    if (!text) return;
    if (isPaused()) { toast('チャットは先生によって一時停止中です。'); return; }
    onSay(text);
    box.value = '';
  }

  // A message from the class: a preset phrase, or somebody's own words.
  function receive({ name, id, text, mine }) {
    const who = mine ? 'あなた' : name;
    if (typeof text === 'string' && text) {
      log.push({ who, text });
    } else {
      const p = byId.get(id);
      if (!p) return null;
      log.push({ who, en: p.en, ja: p.ja });
    }
    while (log.length > LOG_MAX) log.shift();
    renderLog();
    return text ? null : byId.get(id);
  }

  function toggle(force) {
    open = force ?? !open;
    root.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) { render(); $('#net-chat-text').focus({ preventScroll: true }); }
  }

  button.onclick = () => toggle();
  $('#net-chat-close').onclick = () => toggle(false);
  $('#net-chat-say').addEventListener('submit', (e) => { e.preventDefault(); say(); });
  // The world reads WASD from the document. A child writing "we walk" would otherwise
  // walk while writing, so keys typed in the box stay in the box.
  for (const type of ['keydown', 'keyup', 'keypress']) {
    $('#net-chat-text').addEventListener(type, (e) => e.stopPropagation());
  }
  // An on-screen keyboard covers the bottom of the page, which is where this box is. The
  // log is what should move, not the panel: scrollIntoView() scrolls every ancestor, and
  // the panel scrolling takes its own header off the screen.
  $('#net-chat-text').addEventListener('focus', () => setTimeout(() => {
    const list = $('#net-chat-log');
    if (list) list.scrollTop = list.scrollHeight;
    root.scrollTop = 0;
  }, 250));
  load();
  return {
    receive, toggle, phrase: (id) => byId.get(id) || null,
    setPaused() { $('#net-chat-paused').hidden = !isPaused(); },
    setFree() { renderSay(); },
    setAvailable(v) { button.hidden = !v; if (!v) toggle(false); },
    // What the server refused, in words a child can act on.
    blocked(reason, max = MAX) {
      const said = {
        paused: 'チャットは先生によって一時停止中です。',
        rate: 'ちょっと まってから おくってね。',
        'free off': 'いまは えらんだ フレーズだけ 送れます。',
        long: `ながすぎます（${max}文字まで）。`,
        empty: 'なにか かいてから おくってね。',
        spam: 'おなじ もじが おおすぎます。',
        same: 'さっきと おなじ メッセージです。',
        contact: 'でんわばんごう や リンクは おくれません。',
        word: 'その ことばは 送れません。ちがう いいかたを かんがえてみよう。',
      }[reason];
      if (said) toast(said);
    },
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
