// Preset-phrase chat. No free text: only ids from phrases.json travel over the wire.
export function createChat({ onSend, speak, toast, isPaused }) {
  let phrases = { categories: [] };
  let byId = new Map();
  let open = false;
  const root = document.createElement('div');
  root.id = 'net-chat';
  root.hidden = true;
  root.innerHTML = `<div class="net-chat-head"><strong>💬 English Chat</strong><span id="net-chat-paused" hidden>先生が一時停止中</span><button type="button" id="net-chat-close" aria-label="閉じる">×</button></div>
  <nav id="net-chat-tabs" aria-label="フレーズの種類"></nav><div id="net-chat-phrases"></div><ol id="net-chat-log" aria-live="polite"></ol>`;
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
  }

  function send(id) {
    const p = byId.get(id);
    if (!p) return;
    if (isPaused()) { toast('チャットは先生によって一時停止中です。'); return; }
    onSend(id);
    speak?.(p.en);
  }

  function receive({ name, id, mine }) {
    const p = byId.get(id);
    if (!p) return null;
    const li = document.createElement('li');
    li.innerHTML = `<b>${mine ? 'あなた' : escapeHtml(name)}</b> ${escapeHtml(p.en)} <small>${escapeHtml(p.ja)}</small>`;
    const log = $('#net-chat-log');
    log.append(li);
    while (log.children.length > 8) log.firstChild.remove();
    return p;
  }

  function toggle(force) {
    open = force ?? !open;
    root.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) render();
  }

  button.onclick = () => toggle();
  $('#net-chat-close').onclick = () => toggle(false);
  load();
  return {
    receive, toggle, phrase: (id) => byId.get(id) || null,
    setPaused() { $('#net-chat-paused').hidden = !isPaused(); },
    setAvailable(v) { button.hidden = !v; if (!v) toggle(false); },
  };
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
