// Teacher console. Every command is validated on the server; this is only the UI.
import { NET } from './net-config.js';

export function createTeacherPanel({ send, toast, getPoint, getSpace, isInsideBuilding, getMissions }) {
  let open = false;
  let roster = [];
  let chatPaused = false;
  let missionId = '';
  let timer = null;
  const root = document.createElement('aside');
  root.id = 'net-teacher';
  root.hidden = true;
  root.innerHTML = `<div class="net-chat-head"><strong>👩‍🏫 先生コンソール</strong><button type="button" id="net-teacher-close" aria-label="閉じる">×</button></div>
  <div class="net-teacher-actions">
    <button type="button" id="net-t-gather" class="primary">📣 全員をここに集合</button>
    <button type="button" id="net-t-chat">⏸ チャットを一時停止</button>
  </div>
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
  $('#net-t-mission').onchange = (e) => send({ cmd: 'mission', id: e.target.value });
  $('#net-teacher-close').onclick = () => toggle(false);

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
    $('#net-roster').innerHTML = rows.map((p) => `<tr class="${p.connected ? '' : 'net-offline'}"><td>${esc(p.name)}${p.connected ? '' : ' <small>(切断中)</small>'}</td><td><small>${esc(p.space)}</small></td><td title="${p.xp ?? 0} XP">${p.level ?? 1}</td><td>${p.coins}</td><td>${p.correct}/${p.attempts}</td><td><button type="button" data-call="${p.id}" title="呼び出す">📢</button><button type="button" data-move="${p.id}" title="ここへ移動">⤵</button></td></tr>`).join('') || '<tr><td colspan="6">生徒はまだいません</td></tr>';
    root.querySelectorAll('[data-call]').forEach((b) => { b.onclick = () => send({ cmd: 'call', target: b.dataset.call }); });
    root.querySelectorAll('[data-move]').forEach((b) => { b.onclick = () => { const p = point(); if (p) send({ cmd: 'move', target: b.dataset.move, ...p }); }; });
    $('#net-t-chat').textContent = chatPaused ? '▶ チャットを再開' : '⏸ チャットを一時停止';
    $('#net-teacher-hint').textContent = `接続中 ${rows.filter((p) => p.connected).length} 人 · 集合・移動は今いる場所（${getSpace()}）へ`;
  }

  function toggle(force) {
    open = force ?? !open;
    root.hidden = !open;
    clearInterval(timer);
    if (open) { fillMissions(); send({ cmd: 'roster' }); timer = setInterval(() => send({ cmd: 'roster' }), NET.ROSTER_REFRESH_MS); }
  }

  return {
    setAvailable(v) { button.hidden = !v; if (!v) toggle(false); },
    onRoster(m) { roster = m.players || []; chatPaused = !!m.chatPaused; if (open) renderRoster(); },
    onAck(m) {
      if (m.ok === false) toast(`先生コマンド失敗: ${m.error || m.cmd}`);
      else if (m.cmd === 'gather') toast(`${m.count} 人に集合を指示しました。`);
      else if (m.cmd === 'chat') { chatPaused = !!m.paused; toast(chatPaused ? 'チャットを一時停止しました。' : 'チャットを再開しました。'); if (open) renderRoster(); }
      else if (m.cmd === 'mission') { missionId = m.id || ''; toast(m.id ? '今日のおつかいを設定しました。' : 'おつかいの指定を解除しました。'); }
      else if (m.cmd === 'call') toast('生徒を呼び出しました。');
      else if (m.cmd === 'move') toast('生徒をここへ移動させました。');
    },
    setChatPaused(v) { chatPaused = v; if (open) renderRoster(); },
    setMission(id) { missionId = id || ''; const select = root.querySelector('#net-t-mission'); if (select) select.value = missionId; },
  };
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
