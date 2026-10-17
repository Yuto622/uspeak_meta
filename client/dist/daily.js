// 日課 — the login bonus and the weekly ranking.
//
// Neither number is decided here. The bonus arrives already banked (`login:bonus`
// follows the welcome), and the ranking is the server's list of the class. This screen
// only shows them, so a child cannot claim a day twice by reloading the page.
const $ = (s, root = document) => root.querySelector(s);
const bi = (ja, en) => `<span class="ja">${esc(ja)}</span><span class="en">${esc(en ?? ja)}</span>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createDailyUI({ send, isOnline }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'daily-dialog';
  dialog.setAttribute('aria-labelledby', 'daily-title');
  dialog.innerHTML = `<div class="quiz-head">
      <div><span class="eyebrow">EVERY DAY</span><h2 id="daily-title">まいにちの ごほうび</h2></div>
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
  button.innerHTML = '<b class="en">♛ Ranking</b><i class="ja">ランキング</i>';
  button.onclick = () => openRank();
  document.querySelector('.right-rail')?.append(button);

  let lastBonus = null;

  function show() { if (!dialog.open) dialog.showModal(); }
  // 見出しは 画面ごとに かえる（ごほうび ⇔ ランキング）。
  function head(eyebrow, title) { $('.eyebrow', dialog).textContent = eyebrow; $('#daily-title', dialog).textContent = title; }

  function stamps(day, cycle, rewards) {
    return `<ol class="daily-stamps">${Array.from({ length: cycle }, (_, i) => {
      const n = i + 1;
      const cls = n < day ? 'done' : n === day ? 'today' : '';
      return `<li class="${cls}"><span>${n}日目</span><b>◈ ${rewards[i] ?? ''}</b></li>`;
    }).join('')}</ol>`;
  }

  // The bonus is already in the wallet by the time this renders; the screen is a receipt.
  function onBonus(m, { quiet = false } = {}) {
    lastBonus = m;
    head('EVERY DAY', 'まいにちの ごほうび');
    // はじめて 来た 日は 画面を ひらかない（島を 見る 前に 表が 出ると なにを すれば いいか まよう）。
    if (quiet) return;
    body().innerHTML = `<div class="daily-hit">
        <span>🎁</span>
        <h3>ログインボーナス</h3>
        <p><b>◈ ${m.coins}</b> コインを もらいました。</p>
        <small>${m.streak}にちめ の ログイン！</small>
      </div>
      ${stamps(m.day, m.cycle, m.rewards || [])}
      <p class="daily-note">おひるの 12じに つぎの ひに なるよ。${m.cycle}かい あそぶと また 1にちめから。</p>
      <div class="quiz-actions">
        <button type="button" id="daily-rank">♛ ランキング</button>
        <button type="button" class="primary" id="daily-go">ぼうけんに もどる</button>
      </div>`;
    $('#daily-go', dialog).onclick = close;
    $('#daily-rank', dialog).onclick = () => openRank();
    show();
  }

  // 🎁 デイリーログイン（メインの島のボタン）。もらうのは入ったとき（部屋が決める）。ここは きょうの ぶんを見せるだけ。
  function openLogin(streak = 0) {
    if (lastBonus) return onBonus(lastBonus);
    const cycle = 7;
    const rewards = [100, 150, 200, 250, 300, 350, 400];
    const day = streak > 0 ? ((streak - 1) % cycle) + 1 : 0;
    body().innerHTML = `<div class="daily-hit">
        <span>🎁</span>
        <h3>ログインボーナス</h3>
        <p>きょうの ぶんは もう もらったよ。</p>
        ${streak > 0 ? `<small>${streak}にちめ の ログイン！</small>` : ''}
      </div>
      ${stamps(day, cycle, rewards)}
      <p class="daily-note">おひるの 12じに つぎの ひに なるよ。${cycle}かい あそぶと また 1にちめから。</p>
      <div class="quiz-actions">
        <button type="button" id="daily-rank">♛ ランキング</button>
        <button type="button" class="primary" id="daily-go">とじる</button>
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

  // ランキング：指標ごとの タブ（部屋が 決めた ならびを 出すだけ。`server/src/game/rankings.js`）。
  let lastRank = null;
  let pick = 'week_xp';
  const MEDAL = ['🥇', '🥈', '🥉'];
  function onRank(m) {
    lastRank = m;
    head('CLASS RANKING', '♛ ランキング');
    const boards = Array.isArray(m.boards) && m.boards.length ? m.boards
      : [{ key: 'week_xp', icon: '✧', ja: 'こんしゅうの XP', unit: 'XP', of: (m.top || []).length, top: (m.top || []).map((r, i) => ({ name: r.name, value: r.xp, rank: i + 1 })), me: null }];
    if (!boards.some((b) => b.key === pick)) pick = boards[0].key;
    const b = boards.find((x) => x.key === pick);
    // The season arrives whole from the server, so its wording cannot drift from the
    // world's.
    const season = m.season && typeof m.season === 'object' ? m.season : { ja: '', emoji: '✦' };
    const row = (r, me) => `<li class="${me ? 'me' : ''}"><b>${MEDAL[r.rank - 1] || r.rank}</b><span>${esc(r.name)}</span><em>${esc(r.value)} ${bi(b.unit, b.unitEn)}</em></li>`;
    const meIn = b.me && b.top.some((r) => r.name === b.me.name);
    body().innerHTML = `<div class="daily-rank-head">
        <div><strong>クラス ${esc(m.classCode || '')}</strong><small>${b.key === 'week_xp' ? `あと ${m.daysLeft}日で リセット` : 'いままで ぜんぶ'}</small></div>
        <span class="daily-season">${esc(season.emoji)} ${esc(season.ja)}</span>
      </div>
      <div class="rank-tabs" role="tablist">${boards.map((x) => `<button type="button" role="tab" data-rank-key="${esc(x.key)}" aria-selected="${x.key === pick}">${esc(x.icon)} ${bi(x.ja, x.en)}</button>`).join('')}</div>
      <h3 class="rank-title">${esc(b.icon)} ${bi(b.ja, b.en)}${b.better === 'low' ? '<small>（はやい じゅん）</small>' : ''}</h3>
      ${b.top.length ? `<ol class="daily-rank">${b.top.map((r) => row(r, r.name === m.name)).join('')}</ol>`
        : '<p class="daily-note">まだ だれも いません。いちばんのりに なろう！</p>'}
      ${b.me && !meIn ? `<ol class="daily-rank rank-mine">${row(b.me, true)}</ol>` : ''}
      <p class="daily-mine">${b.me ? `きみは ${b.me.rank}い（${b.of}にん の なか）` : 'きみは まだ ここに いないよ。やって みよう！'}</p>
      <div class="quiz-actions">
        ${lastBonus ? '<button type="button" id="daily-back">🎁 今日のボーナス</button>' : ''}
        <button type="button" class="primary" id="daily-go">とじる</button>
      </div>`;
    body().querySelectorAll('[data-rank-key]').forEach((t) => { t.onclick = () => { pick = t.dataset.rankKey; onRank(lastRank); body().querySelector('[aria-selected="true"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' }); }; });
    $('#daily-go', dialog).onclick = close;
    const back = $('#daily-back', dialog);
    if (back) back.onclick = () => onBonus(lastBonus);
  }

  return {
    onBonus,
    onRank,
    open: openRank,
    openLogin,
    // Shown only online, and reset when a session ends so an offline page has no button
    // that cannot work.
    setOnline(online) { button.hidden = !online; if (!online) lastBonus = null; },
  };
}
