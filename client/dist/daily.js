// 日課 — the login bonus and the weekly ranking.
//
// Neither number is decided here. The bonus arrives already banked (`login:bonus`
// follows the welcome), and the ranking is the server's list of the class. This screen
// only shows them, so a child cannot claim a day twice by reloading the page.
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createDailyUI({ send, isOnline }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'daily-dialog';
  dialog.setAttribute('aria-labelledby', 'daily-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">EVERY DAY</span><h2 id="daily-title">日課</h2></div>
      <button type="button" id="daily-close" aria-label="閉じる">×</button>
    </div><div id="daily-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#daily-body', dialog);
  const close = () => { try { dialog.close(); } catch { /* already closed */ } };
  $('#daily-close', dialog).onclick = close;
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

  // The ranking button lives with the other world buttons, and only while connected:
  // there is no class to rank against offline.
  const button = document.createElement('button');
  button.id = 'rank-button';
  button.className = 'rank-button';
  button.hidden = true;
  button.innerHTML = '<span>♛ 週間ランキング</span><small>今週の ✧ XP</small>';
  button.onclick = () => openRank();
  document.querySelector('.right-rail')?.append(button);

  let lastBonus = null;

  function show() { if (!dialog.open) dialog.showModal(); }

  function stamps(day, cycle, rewards) {
    return `<ol class="daily-stamps">${Array.from({ length: cycle }, (_, i) => {
      const n = i + 1;
      const cls = n < day ? 'done' : n === day ? 'today' : '';
      return `<li class="${cls}"><span>${n}日目</span><b>◈ ${rewards[i] ?? ''}</b></li>`;
    }).join('')}</ol>`;
  }

  // The bonus is already in the wallet by the time this renders; the screen is a receipt.
  function onBonus(m) {
    lastBonus = m;
    body().innerHTML = `<div class="daily-hit">
        <span>🎁</span>
        <h3>ログインボーナス</h3>
        <p><b>◈ ${m.coins}</b> コインを もらいました。</p>
        <small>${m.streak}日 れんぞく ログイン中！</small>
      </div>
      ${stamps(m.day, m.cycle, m.rewards || [])}
      <p class="daily-note">日本時間の おひる12時に つぎの日に なります。${m.cycle}日 つづくと また1日目から。</p>
      <div class="quiz-actions">
        <button type="button" id="daily-rank">♛ ランキング</button>
        <button type="button" class="primary" id="daily-go">ぼうけんに もどる</button>
      </div>`;
    $('#daily-go', dialog).onclick = close;
    $('#daily-rank', dialog).onclick = () => openRank();
    show();
  }

  function openRank() {
    if (!isOnline()) return;
    body().innerHTML = '<p class="daily-note">今週の記録を よみこみ中…</p>';
    show();
    send('rank', {});
  }

  function onRank(m) {
    const top = Array.isArray(m.top) ? m.top : [];
    // The season arrives whole from the server, so its wording cannot drift from the
    // world's.
    const season = m.season && typeof m.season === 'object' ? m.season : { ja: '', emoji: '✦' };
    body().innerHTML = `<div class="daily-rank-head">
        <div><strong>クラス ${esc(m.classCode || '')}</strong><small>今週の ✧ XP · あと ${m.daysLeft}日</small></div>
        <span class="daily-season">${esc(season.emoji)} ${esc(season.ja)}</span>
      </div>
      ${top.length ? `<ol class="daily-rank">${top.map((row, i) => `<li class="${row.name === m.name ? 'me' : ''}">
          <b>${i + 1}</b><span>${esc(row.name)}</span><em>✧ ${row.xp}</em>
        </li>`).join('')}</ol>`
        : '<p class="daily-note">今週は まだ だれも XPを ためていません。いちばんのりに なろう！</p>'}
      <p class="daily-mine">きみの 今週： <b>✧ ${m.mine ?? 0}</b> XP</p>
      <p class="daily-note">ランキングは 毎週 月曜の おひるに リセットされます。</p>
      <div class="quiz-actions">
        ${lastBonus ? '<button type="button" id="daily-back">🎁 今日のボーナス</button>' : ''}
        <button type="button" class="primary" id="daily-go">とじる</button>
      </div>`;
    $('#daily-go', dialog).onclick = close;
    const back = $('#daily-back', dialog);
    if (back) back.onclick = () => onBonus(lastBonus);
  }

  return {
    onBonus,
    onRank,
    open: openRank,
    // Shown only online, and reset when a session ends so an offline page has no button
    // that cannot work.
    setOnline(online) { button.hidden = !online; if (!online) lastBonus = null; },
  };
}
