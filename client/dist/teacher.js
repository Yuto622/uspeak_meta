// Teacher console. Every command is validated on the server; this is only the UI.
import { NET } from './net-config.js';

export function createTeacherPanel({ send, toast, getPoint, getSpace, isInsideBuilding, getMissions }) {
  let open = false;
  let roster = [];
  let chatPaused = false;
  let freeChat = true;
  let voiceMode = 'all';
  const staged = new Set();   // children the teacher has put on the stage (大広間だけ)
  let missionId = '';
  let timer = null;
  const root = document.createElement('aside');
  root.id = 'net-teacher';
  root.hidden = true;
  root.innerHTML = `<div class="net-chat-head"><strong>👩‍🏫 先生コンソール</strong><button type="button" id="net-teacher-close" aria-label="閉じる">×</button></div>
  <div class="net-teacher-actions">
    <button type="button" id="net-t-gather" class="primary">📣 全員をここに集合</button>
    <button type="button" id="net-t-chat">⏸ チャットを一時停止</button>
    <button type="button" id="net-t-free">✏ じゆうにゅうりょく：オン</button>
    <button type="button" id="net-t-voice">🎙 おはなし：どの島でも</button>
    <button type="button" id="net-t-reports">📄 保護者レポートのリンク</button>
    <button type="button" id="net-t-register">🔄 めいぼを読み直す</button>
  </div>
  <div id="net-t-links" hidden></div>
  <label class="net-t-field" for="net-t-mission">今日のおつかい</label>
  <select id="net-t-mission"><option value="">指定しない</option></select>
  <p class="net-fine" id="net-teacher-hint"></p>
  <table class="net-roster"><thead><tr><th>名前</th><th>場所</th><th>Lv</th><th>◈</th><th>正解</th><th></th></tr></thead><tbody id="net-roster"></tbody></table>`;
  document.body.append(root);
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'net-teacher-button';
  button.className = 'net-fab';
  button.hidden = true;
  button.textContent = '👩‍🏫';
  button.setAttribute('aria-label', '先生コンソールを開く');
  document.body.append(button);
  const $ = (s) => root.querySelector(s);

  function point() {
    if (isInsideBuilding()) { toast('建物の中からは集合できません。外に出てから使ってください。'); return null; }
    return { ...getPoint(), space: getSpace() };
  }
  $('#net-t-gather').onclick = () => { const p = point(); if (p) send({ cmd: 'gather', ...p }); };
  $('#net-t-chat').onclick = () => send({ cmd: 'chat', paused: !chatPaused });
  // じゆうにゅうりょく. Off leaves the chat running with the preset phrases only, which
  // is what a lesson wants when the writing is meant to be English and not chatter.
  $('#net-t-free').onclick = () => send({ cmd: 'free', on: !freeChat });
  // 通話. おはなし島 is always open — that island is one room and children go there to
  // talk. This button is for the rest of the world: press once to open every building on
  // every island, again to close all of it (the island included), again to go back.
  $('#net-t-voice').onclick = () => send({ cmd: 'voice', mode: { all: 'rooms', rooms: 'off', off: 'all' }[voiceMode] || 'all' });
  $('#net-t-mission').onchange = (e) => send({ cmd: 'mission', id: e.target.value });
  $('#net-teacher-close').onclick = () => toggle(false);
  $('#net-t-reports').onclick = () => send({ cmd: 'reports' });
  $('#net-t-register').onclick = () => send({ cmd: 'register' });

  function fillMissions() {
    const select = $('#net-t-mission');
    const list = getMissions?.() || [];
    if (!list.length || select.options.length > 1) return;
    for (const m of list) {
      const option = document.createElement('option');
      option.value = m.id;
      // The place matters now: it decides how far the class has to walk.
      option.textContent = `${m.grade}級 · ${m.title} — ${m.place}`;
      select.append(option);
    }
    select.value = missionId;
  }
  button.onclick = () => toggle();

  function renderRoster() {
    const rows = roster.filter((p) => p.role !== 'teacher').sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    $('#net-roster').innerHTML = rows.map((p) => `<tr class="${p.connected ? '' : 'net-offline'}"><td>${esc(p.name)}${p.connected ? '' : ' <small>(切断中)</small>'}</td><td><small>${esc(p.space)}</small></td><td title="${p.xp ?? 0} XP">${p.level ?? 1}</td><td>${p.coins}</td><td>${p.correct}/${p.attempts}</td><td><button type="button" data-call="${p.id}" title="呼び出す">📢</button><button type="button" data-move="${p.id}" title="ここへ移動">⤵</button><button type="button" data-stage="${p.id}" class="${staged.has(p.id) ? 'on' : ''}" title="ステージに上げる（大広間でカメラと画面を使えるようにする）">${staged.has(p.id) ? '🎤' : '🎙'}</button></td></tr>`).join('') || '<tr><td colspan="6">生徒はまだいません</td></tr>';
    root.querySelectorAll('[data-call]').forEach((b) => { b.onclick = () => send({ cmd: 'call', target: b.dataset.call }); });
    root.querySelectorAll('[data-move]').forEach((b) => { b.onclick = () => { const p = point(); if (p) send({ cmd: 'move', target: b.dataset.move, ...p }); }; });
    // ステージ: in 大広間（おはなし島）only the teacher is seen, so this is how a child gets
    // to show the hall their face and their screen. Small rooms never need it.
    root.querySelectorAll('[data-stage]').forEach((b) => {
      b.onclick = () => { const id = b.dataset.stage; send({ cmd: 'stage', target: id, on: !staged.has(id) }); };
    });
    $('#net-t-chat').textContent = chatPaused ? '▶ チャットを再開' : '⏸ チャットを一時停止';
    $('#net-t-free').textContent = freeChat ? '✏ じゆうにゅうりょく：オン' : '✏ じゆうにゅうりょく：オフ';
    $('#net-t-voice').textContent = { all: '🎙 おはなし：どの島でも', rooms: '🎙 おはなし：おはなし島だけ', off: '🔇 おはなし：とじている' }[voiceMode];
    $('#net-teacher-hint').textContent = `接続中 ${rows.filter((p) => p.connected).length} 人 · 集合・移動は今いる場所（${getSpace()}）へ`;
  }

  // One link per child, each signed for that child alone. They are shown rather than
  // sent anywhere: the teacher decides who gets which.
  function showLinks(links) {
    const box = $('#net-t-links');
    box.hidden = !links.length;
    if (!links.length) { toast('レポートはまだありません。'); return; }
    // The server sends a path when it does not know its own public address (a tunnel,
    // a laptop, a school's own box). The page is being served from that address, so it
    // is the one thing here that always knows it.
    const full = (u) => (/^https?:/i.test(u) ? u : location.origin + u);
    // 📄 opens that child's designed PDF straight away — the same link with format=pdf,
    // which is what the report page's own button does. A teacher printing a set for
    // parents' evening should not have to open twelve pages first.
    const pdf = (u) => full(u) + (u.includes('?') ? '&' : '?') + 'format=pdf';
    box.innerHTML = `<p class="net-fine">一人ひとり ちがうリンクです。保護者の方にだけ わたしてください。</p>${links.map((l) => `<div class="net-t-link"><b>${esc(l.name)}</b><input readonly value="${esc(full(l.url))}"><button type="button" data-copy="${esc(full(l.url))}">コピー</button><a class="net-t-pdf" href="${esc(pdf(l.url))}" target="_blank" rel="noopener" title="デザインされた PDF をひらく">📄</a></div>`).join('')}`;
    box.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = async () => {
        try { await navigator.clipboard.writeText(b.dataset.copy); toast('リンクをコピーしました。'); }
        catch { b.previousElementSibling.select(); toast('選択しました。長押しでコピーしてください。'); }
      };
    });
  }

  function toggle(force) {
    open = force ?? !open;
    root.hidden = !open;
    clearInterval(timer);
    if (open) { fillMissions(); send({ cmd: 'roster' }); timer = setInterval(() => send({ cmd: 'roster' }), NET.ROSTER_REFRESH_MS); }
  }

  return {
    setAvailable(v) { button.hidden = !v; if (!v) toggle(false); },
    onRoster(m) { roster = m.players || []; chatPaused = !!m.chatPaused; freeChat = m.freeChat !== false; if (open) renderRoster(); },
    onAck(m) {
      if (m.ok === false) {
        const said = { 'not in a big room': 'ステージは おはなし島（大広間）だけです。', 'no such student': 'その生徒が見つかりません。' }[m.error];
        toast(said || `先生コマンド失敗: ${m.error || m.cmd}`);
      }
      else if (m.cmd === 'gather') toast(`${m.count} 人に集合を指示しました。`);
      else if (m.cmd === 'voice') {
        voiceMode = m.mode || 'rooms';
        toast({ all: 'どの島のどの部屋でも話せるようにしました。', rooms: 'おはなしはおはなし島だけになりました。', off: 'おはなしをとじました。' }[voiceMode]);
        if (open) renderRoster();
      }
      else if (m.cmd === 'stage') {
        if (m.on) staged.add(m.target); else staged.delete(m.target);
        toast(m.on ? 'ステージに上げました。カメラと画面が使えます。' : 'ステージから下ろしました。');
        if (open) renderRoster();
      }
      else if (m.cmd === 'chat') { chatPaused = !!m.paused; toast(chatPaused ? 'チャットを一時停止しました。' : 'チャットを再開しました。'); if (open) renderRoster(); }
      else if (m.cmd === 'free') { freeChat = !!m.free; toast(freeChat ? 'じゆうにゅうりょくを オンにしました。' : 'じゆうにゅうりょくを オフにしました（フレーズだけ）。'); if (open) renderRoster(); }
      else if (m.cmd === 'mission') { missionId = m.id || ''; toast(m.id ? '今日のおつかいを設定しました。' : 'おつかいの指定を解除しました。'); }
      else if (m.cmd === 'call') toast('生徒を呼び出しました。');
      else if (m.cmd === 'move') toast('生徒をここへ移動させました。');
      else if (m.cmd === 'register') toast('めいぼを読み直しました。');
      else if (m.cmd === 'reports') showLinks(m.links || []);
    },
    setChatPaused(v) { chatPaused = v; if (open) renderRoster(); },
    setFree(v) { freeChat = v !== false; if (open) renderRoster(); },
    setVoice(v) { voiceMode = ['rooms', 'all', 'off'].includes(v) ? v : 'all'; if (open) renderRoster(); },
    setMission(id) { missionId = id || ''; const select = root.querySelector('#net-t-mission'); if (select) select.value = missionId; },
  };
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
