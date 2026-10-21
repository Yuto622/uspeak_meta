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
  function head(eyebrow, title) { $('.eyebrow', dialog).textContent = eyebrow; $('#daily-title', dialog).textContent = title; dialog.classList.remove('cosmic'); }

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

  // ランキング（2026-10 作りなおし）：やる気の 研究に そって、
  //   ① いちばん上は「前の じぶん」とくらべる（今週・先週・じこベスト・宇宙の 段階＝だれとも くらべない・さがらない）
  //   ② クラス みんなで ためる 目標（きょうりょく）
  //   ③ 指標ごとに 表彰台（上の 3 人・名前だけ）と「きみの まわり」（すぐ 上まで あと いくつ）
  // **ほかの 子の 数は 出さない**（名前と 順位だけ）。**下がった ことは 見せない**（上がった ときだけ ▲）。
  // 数は ぜんぶ 部屋が 決めて 送る（`server/src/game/rankings.js`）。この 画面は ならべる だけ。
  let lastRank = null;
  let pick = 'week_xp';
  const SEEN_KEY = 'uspeak-rank-seen-v1';
  const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; } };
  const writeSeen = (v) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch { /* 見られなくても だいじょうぶ */ } };
  const num = (v) => Number(v) || 0;
  function onRank(m) {
    lastRank = m;
    head('CLASS GALAXY', '🌌 ランキング');
    dialog.classList.add('cosmic');
    const boards = Array.isArray(m.boards) && m.boards.length ? m.boards
      : [{ key: 'week_xp', icon: '✧', ja: 'こんしゅうの XP', unit: 'XP', of: (m.top || []).length, top: (m.top || []).map((r, i) => ({ name: r.name, value: r.xp, rank: i + 1 })), me: null, near: [] }];
    if (!boards.some((b) => b.key === pick)) pick = boards[0].key;
    const b = boards.find((x) => x.key === pick);
    const self = m.self;
    const goal = m.classGoal;
    // 上がった？（この 端末で 前に 見た 順位と くらべる。下がった ときは 何も 出さない）
    const seen = readSeen(); const sk = `${m.classCode}|${m.name}|${b.key}`;
    const was = seen[sk]; const up = b.me && was && b.me.rank < was;
    if (b.me) { seen[sk] = b.me.rank; }
    const tierKey = `${m.classCode}|${m.name}|tier|${self?.tier?.id || ''}`;
    const newTier = self && self.tier.index > 0 && !seen[tierKey];
    if (self) seen[tierKey] = 1;
    writeSeen(seen);
    const unit = (x) => bi(x.unit, x.unitEn);

    const selfHtml = self ? (() => {
      const t = self.tier; const pct = Math.round(8 + t.progress * 92); // すこし 入った ところから（あと すこしに 見える）
      const vs = self.lastWeek ? (self.weekXp > self.lastWeek ? `<b class="cos-up">▲ +${self.weekXp - self.lastWeek}</b> ${bi('せんしゅうより', 'vs last week')}` : `${bi('せんしゅう', 'Last week')} ${self.lastWeek} XP`) : bi('こんしゅうが はじめての しゅう', 'Your first week');
      const best = self.best > 0 ? (self.weekXp >= self.best ? `<b class="cos-up">🏅 ${bi('じこベスト こうしん！', 'New personal best!')}</b>` : `${bi('じこベスト', 'Best')} ${self.best} XP ${bi(`まで あと ${self.best - self.weekXp}`, `— ${self.best - self.weekXp} to go`)}`) : '';
      return `<section class="cos-self${newTier ? ' cos-burst' : ''}">
        <div class="cos-orb" data-tier="${esc(t.id)}"><span>${esc(t.icon)}</span></div>
        <div class="cos-self-main">
          <small>${bi('こんしゅうの きみ', 'You this week')}</small>
          <div class="cos-self-line"><b class="cos-xp">${self.weekXp}<i>XP</i></b><span class="cos-tier">${esc(t.icon)} ${bi(t.ja, t.en)}</span></div>
          <div class="cos-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
          <p class="cos-next">${t.next ? `${bi(`あと ${t.toNext} XP で`, `${t.toNext} XP to`)} ${esc(t.next.icon)} ${bi(t.next.ja, t.next.en)}` : bi('いちばん とおくの ぎんがに ついたよ！', 'You reached the farthest galaxy!')}</p>
          <p class="cos-vs">${vs}${best ? `<span class="cos-dot">・</span>${best}` : ''}</p>
          <ol class="cos-track">${(self.tiers || []).map((x, i) => `<li class="${i <= t.index ? 'on' : ''}" title="${esc(x.ja)}">${esc(x.icon)}</li>`).join('')}</ol>
        </div>
        ${newTier ? `<p class="cos-new">🎉 ${bi(`${t.ja} に とうちゃく！`, `You reached ${t.en}!`)}</p>` : ''}
      </section>`;
    })() : '';

    const goalHtml = goal && goal.kids ? (() => {
      const p = Math.min(1, goal.now / Math.max(1, goal.goal)); const pct = Math.round(p * 100);
      const marks = [0.25, 0.5, 0.75, 1].map((q, i) => `<span class="cos-mark${p >= q ? ' on' : ''}" style="left:${q * 100}%">${['🌍', '🌙', '🪐', '🌟'][i]}</span>`).join('');
      return `<section class="cos-team">
        <div class="cos-team-head"><b>🚀 ${bi('クラス みんなで ワープ！', 'Class warp mission')}</b><span>${goal.now} / ${goal.goal} XP</span></div>
        <div class="cos-team-bar"><i style="width:${pct}%"></i>${marks}<em class="cos-ship" style="left:${pct}%">🚀</em></div>
        <small>${p >= 1 ? bi('ワープ せいこう！ みんな すごい！', 'Warp complete! Amazing, everyone!') : bi(`あと ${goal.goal - goal.now} XP。きみの 1 もんが みんなの ちからに なるよ`, `${goal.goal - goal.now} XP to go. Every answer helps the class`)}</small>
      </section>`;
    })() : '';

    // 表彰台（上の 3 人・名前だけ。2・1・3 の じゅん）
    const top3 = (b.top || []).slice(0, 3);
    const podium = top3.length ? `<div class="cos-podium">${[top3[1], top3[0], top3[2]].map((r, i) => (r ? `<div class="cos-step s${r.rank <= 3 ? r.rank : 3}${r.name === m.name ? ' me' : ''}"><span class="cos-planet">${['🥇', '🥈', '🥉'][Math.min(3, r.rank) - 1]}</span><b>${esc(r.name)}</b><i>${r.rank}</i></div>` : '<div class="cos-step empty"></div>')).join('')}</div>` : '';
    const near = (b.near || []).map((r) => `<li class="${r.me ? 'me' : ''}"><b>${r.rank}</b><span>${esc(r.name)}${r.me ? ` <em>${bi('きみ', 'you')}</em>` : ''}</span>${r.me ? `<strong>${esc(r.value)} ${unit(b)}</strong>${up ? '<span class="cos-up cos-rise">▲</span>' : ''}` : ''}</li>`).join('');
    const target = b.me ? (b.me.rank === 1 ? `🏆 ${bi('いま 1 い！ この ちょうしで', "You're #1 — keep going!")}` : b.gap ? `🎯 ${bi(`あと ${b.gap} ${b.unit} で ${b.ahead} さんに おいつく！`, `${b.gap} ${b.unitEn || ''} to catch ${b.ahead}!`)}` : '')
      : `🌱 ${bi('まだ ここに いないよ。やって みると ここに のるよ', "You're not here yet — play to join!")}`;
    const boardHtml = `<section class="cos-board">
        <h3 class="rank-title">${esc(b.icon)} ${bi(b.ja, b.en)}${b.better === 'low' ? `<small>${bi('（はやい じゅん）', '(fastest first)')}</small>` : ''}</h3>
        ${podium || `<p class="daily-note">${bi('まだ だれも いません。いちばんのりに なろう！', 'Nobody yet — be the first!')}</p>`}
        ${near ? `<h4>${bi('きみの まわり', 'Around you')}</h4><ol class="cos-near">${near}</ol>` : ''}
        <p class="cos-target">${target}</p>
      </section>`;

    body().innerHTML = `<div class="cos">
      <div class="daily-rank-head">
        <div><strong>${bi('クラス', 'Class')} ${esc(m.classCode || '')}</strong><small>${bi(`あと ${m.daysLeft}日で あたらしい しゅう（みんな 0 から）`, `New week in ${m.daysLeft} days (everyone starts at 0)`)}</small></div>
        <span class="daily-season">${esc(m.season?.emoji || '✦')} ${esc(m.season?.ja || '')}</span>
      </div>
      ${selfHtml}${goalHtml}
      <div class="rank-tabs" role="tablist">${boards.map((x) => `<button type="button" role="tab" data-rank-key="${esc(x.key)}" aria-selected="${x.key === pick}">${esc(x.icon)} ${bi(x.ja, x.en)}</button>`).join('')}</div>
      ${boardHtml}
      <p class="cos-fine">${bi('ほかの 子の かずは 見えないよ。くらべるのは きのうの じぶん！', "Other kids' numbers stay private. Beat your past self!")}</p>
      <div class="quiz-actions">
        ${lastBonus ? `<button type="button" id="daily-back">🎁 ${bi('今日のボーナス', "Today's bonus")}</button>` : ''}
        <button type="button" class="primary" id="daily-go">${bi('とじる', 'Close')}</button>
      </div></div>`;
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
