// Teacher console. Every command is validated on the server; this is only the UI.
import { NET } from './net-config.js';

export function createTeacherPanel({ send, toast, getPoint, getSpace, isInsideBuilding, getMissions }) {
  let open = false;
  let roster = [];
  let notices = [];      // サーバーが選んだ「きょうの気づき」（`server/src/game/retention.js`）
  let exam = null;       // 英検の準会場の見込み（`server/src/game/eiken-ready.js`）
  let child = null;      // いま開いている子（メモ・英検の目安）: { name, notes, exam }
  const reportUrls = new Map();   // なまえ → 保護者レポートのリンク（「保護者レポートのリンク」を押したあと）
  let chatPaused = false;
  let freeChat = true;
  let voiceMode = 'all';
  // 英検の はんていの きびしさ。**押すたびに きびしい → ふつう → やさしい と まわる**
  // （おはなしのボタンと同じ形）。決めるのは先生だけで、採点するのはサーバー。
  let eikenLevel = 'normal';
  const EIKEN_SAID = { strict: '📝 英検：きびしい', normal: '📝 英検：ふつう', easy: '📝 英検：やさしい' };
  const EIKEN_NEXT = { strict: 'normal', normal: 'easy', easy: 'strict' };
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
    <button type="button" id="net-t-eiken">📝 英検：ふつう</button>
    <button type="button" id="net-t-reports">📄 保護者レポートのリンク</button>
    <button type="button" id="net-t-register">🔄 めいぼを読み直す</button>
  </div>
  <div id="net-t-notices"></div>
  <div id="net-t-exam"></div>
  <div id="net-t-child" hidden></div>
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
  // 英検の はんてい。**やさしいは「would like to」を「want」と言っても通す**、
  // ならべかえは となりどうしの入れかえを1か所 見のがす、4たくは2たくになる。
  // きびしいは 1語も ちがえられず、ことばのヒントも出ない。くわしくは
  // `server/src/game/eiken.js` の表。ここは押すだけで、決めるのはサーバー。
  $('#net-t-eiken').onclick = () => send({ cmd: 'eiken', level: EIKEN_NEXT[eikenLevel] || 'normal' });
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

  // 気づき。**サーバーが決めて、ページは並べるだけ**（コインや正誤と同じ理由：
  // 誰に声をかけるかの根拠が端末ごとに違っては困る）。
  //
  // **順位ではない。** 出ているのは全部「その子の先月とくらべて」で、
  // 教室の中で子どもを並べてはいない。
  const NOTICE_SAID = {
    call: { icon: '●', label: '声をかけましょう' },
    watch: { icon: '○', label: '気にしておく' },
    cheer: { icon: '✦', label: 'いいこと' },
  };
  // **声をかけたら、その場で1押し。** 押した記録は「教室のようす」で、2週間のうちに
  // その子が戻ってきたかと一緒に数えられる。いいこと（✦）には声かけボタンを出さない。
  const md = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
  function renderNotices() {
    const box = $('#net-t-notices');
    if (!notices.length) { box.innerHTML = ''; return; }
    const line = (n) => {
      const said = NOTICE_SAID[n.level] || NOTICE_SAID.watch;
      const act = n.level === 'cheer' ? ''
        : n.called ? `<small class="net-t-called">✓ ${esc(md(n.called))} 声かけ済み</small>`
          : `<button type="button" class="net-t-callbtn" data-called="${esc(n.name)}" data-why="${esc(n.why)}">声をかけた</button>`;
      return `<li class="net-t-notice net-t-${esc(n.level)}"><b><button type="button" class="net-t-name" data-child="${esc(n.name)}">${said.icon} ${esc(n.name)}</button></b><span>${esc(n.why)}</span>${act}</li>`;
    };
    box.innerHTML = `<div class="net-t-noticehead">きょうの 気づき<small>先月の その子と くらべています</small></div>
      <ul class="net-t-notices">${notices.map(line).join('')}</ul>`;
    box.querySelectorAll('[data-called]').forEach((b) => {
      b.onclick = () => { b.disabled = true; send({ cmd: 'called', name: b.dataset.called, why: b.dataset.why }); };
    });
    wireChildLinks(box);
  }

  // 英検の準会場。**10人以上で開ける**（2〜5級の志願者の合計）。
  function renderExam() {
    const box = $('#net-t-exam');
    if (!exam || (!exam.readyTotal && !exam.closeTotal)) { box.innerHTML = ''; return; }
    const G = ['g3', 'g4', 'g5'].filter((g) => exam.byGrade?.[g]).map((g) => {
      const x = exam.byGrade[g];
      return `<li><b>${esc(x.label)}</b> 目安に届いた ${x.ready.length}人${x.close.length ? ` · あと一歩 ${x.close.length}人` : ''}</li>`;
    }).join('');
    const head = exam.open ? `▲ 準会場を開ける人数です（${exam.readyTotal}人）`
      : exam.likely ? `● あと一歩の子を合わせて ${exam.outlook}人 — 準会場（${exam.min}人）に届く見込み`
        : `英検の準会場まで あと ${exam.short}人（いま ${exam.readyTotal}人）`;
    box.innerHTML = `<div class="net-t-noticehead">英検の 準会場<small>練習の正解率から。合格の予想ではありません</small></div>
      <p class="net-t-examhead">${esc(head)}</p><ul class="net-t-examlist">${G}</ul>`;
  }

  // 1人ぶんの画面：先生のメモ（保護者に見せる／見せない）と、英検の目安。
  const EXAM_SAID = { ready: '目安に届いた', close: 'あと一歩', practice: '練習中' };
  function renderChild() {
    const box = $('#net-t-child');
    if (!child) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const grades = (child.exam?.grades || []).filter((g) => g.status !== 'none').reverse()
      .map((g) => `<li><b>${esc(g.label)}</b> ${esc(EXAM_SAID[g.status] || '')}${g.status === 'close' && g.missing.length ? `（${esc(g.missing.join('・'))}）` : ''}
        <small>${g.skills.map((x) => `${esc(x.label)} ${x.n ? `${x.acc}%/${x.n}問` : '—'}`).join(' · ')}</small></li>`).join('')
      || '<li><small>まだ英検の島の練習がありません</small></li>';
    const notes = [...(child.notes || [])].reverse().map((n) => `<li class="net-t-note ${n.kind === 'call' ? 'is-call' : ''}">
        <small>${esc(new Date(n.at).toLocaleDateString('ja-JP'))}${n.kind === 'call' ? ' · 声かけ' : n.share ? ' · 保護者に見せる' : ' · 先生だけ'}</small>
        <span>${esc(n.text || '声をかけました')}</span>
        <button type="button" data-unnote="${esc(n.id)}" aria-label="けす" title="けす">×</button></li>`).join('')
      || '<li><small>まだメモはありません</small></li>';
    const url = reportUrls.get(child.name);
    const full = (u) => (/^https?:/i.test(u) ? u : location.origin + u);
    const links = url ? `<p class="net-t-childlinks">
        <a href="${esc(full(url))}&amp;view=meet" target="_blank" rel="noopener">🗣 面談メモを ひらく</a>
        <a href="${esc(full(url))}&amp;format=cert" target="_blank" rel="noopener">📜 学習の記録証</a></p>`
      : '<p class="net-fine">「📄 保護者レポートのリンク」を押すと、面談メモと記録証のリンクもここに出ます。</p>';
    box.innerHTML = `<div class="net-t-noticehead">${esc(child.name)}<button type="button" id="net-t-child-close" aria-label="とじる">×</button></div>
      <p class="net-t-sub">英検の目安</p><ul class="net-t-examlist">${grades}</ul>
      ${links}
      <p class="net-t-sub">先生のメモ</p>
      <textarea id="net-t-note-text" rows="3" maxlength="400" placeholder="面談の前に読み返すメモ（400字まで）"></textarea>
      <label class="net-t-share"><input type="checkbox" id="net-t-note-share"> 保護者のレポートに「先生から」としてのせる</label>
      <button type="button" id="net-t-note-save" class="primary">メモを のこす</button>
      <ul class="net-t-notes">${notes}</ul>`;
    $('#net-t-child-close').onclick = () => { child = null; renderChild(); };
    $('#net-t-note-save').onclick = () => {
      const text = $('#net-t-note-text').value.trim();
      if (!text) { toast('メモが空です。'); return; }
      send({ cmd: 'note', name: child.name, text, share: $('#net-t-note-share').checked });
    };
    box.querySelectorAll('[data-unnote]').forEach((b) => {
      b.onclick = () => { if (confirm('このメモを けしますか？')) send({ cmd: 'unnote', name: child.name, id: b.dataset.unnote }); };
    });
  }

  function openChild(name) {
    child = { name, notes: [], exam: null };
    renderChild();
    send({ cmd: 'notes', name });
    $('#net-t-child').scrollIntoView?.({ block: 'nearest' });
  }
  function wireChildLinks(scope) {
    scope.querySelectorAll('[data-child]').forEach((b) => { b.onclick = () => openChild(b.dataset.child); });
  }

  function renderRoster() {
    const rows = roster.filter((p) => p.role !== 'teacher').sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    $('#net-roster').innerHTML = rows.map((p) => `<tr class="${p.connected ? '' : 'net-offline'}"><td><button type="button" class="net-t-name" data-child="${esc(p.name)}" title="メモと英検の目安">${esc(p.name)}</button>${p.connected ? '' : ' <small>(切断中)</small>'}</td><td><small>${esc(p.space)}</small></td><td title="${p.xp ?? 0} XP">${p.level ?? 1}</td><td>${p.coins}</td><td>${p.correct}/${p.attempts}</td><td><button type="button" data-call="${p.id}" title="呼び出す">📢</button><button type="button" data-move="${p.id}" title="ここへ移動">⤵</button><button type="button" data-stage="${p.id}" class="${staged.has(p.id) ? 'on' : ''}" title="ステージに上げる（大広間でカメラと画面を使えるようにする）">${staged.has(p.id) ? '🎤' : '🎙'}</button></td></tr>`).join('') || '<tr><td colspan="6">生徒はまだいません</td></tr>';
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
    $('#net-t-eiken').textContent = EIKEN_SAID[eikenLevel] || EIKEN_SAID.normal;
    $('#net-teacher-hint').textContent = `接続中 ${rows.filter((p) => p.connected).length} 人 · 集合・移動は今いる場所（${getSpace()}）へ`;
    renderNotices();
    renderExam();
    wireChildLinks($('#net-roster'));
  }

  // One link per child, each signed for that child alone. They are shown rather than
  // sent anywhere: the teacher decides who gets which.
  function showLinks(links, csv = '', classUrl = '') {
    for (const l of links) reportUrls.set(l.name, l.url);
    if (child) renderChild();
    const box = $('#net-t-links');
    box.hidden = !links.length && !csv;
    if (!links.length && !csv) { toast('レポートはまだありません。'); return; }
    // The server sends a path when it does not know its own public address (a tunnel,
    // a laptop, a school's own box). The page is being served from that address, so it
    // is the one thing here that always knows it.
    const full = (u) => (/^https?:/i.test(u) ? u : location.origin + u);
    // 📄 opens that child's designed PDF straight away — the same link with format=pdf,
    // which is what the report page's own button does. A teacher printing a set for
    // parents' evening should not have to open twelve pages first.
    const pdf = (u) => full(u) + (u.includes('?') ? '&' : '?') + 'format=pdf';
    // クラスぜんぶの CSV。**教室の記録は教室のもの**なので、探さなくても目に入る
    // ところに置く（いつでも持ち出せることが分かっているほうが、安心して使える）。
    const sheet = csv ? `<div class="net-t-link"><b>クラス ぜんぶ</b><a class="net-t-csv" href="${esc(full(csv))}" download>⬇ CSV でダウンロード</a></div>` : '';
    // 教室のようす（オーナー向け）。継続率・声かけの結果・英検の準会場。**子どもの名前が
    // 載る**ので、教室の方だけに。
    const owner = classUrl ? `<div class="net-t-link"><b>教室のようす</b><a class="net-t-csv" href="${esc(full(classUrl))}" target="_blank" rel="noopener">🏫 継続率と 英検の準会場</a></div>` : '';
    box.innerHTML = `${owner}${sheet}<p class="net-fine">一人ひとり ちがうリンクです。保護者の方にだけ わたしてください。</p>${links.map((l) => `<div class="net-t-link"><b>${esc(l.name)}</b><input readonly value="${esc(full(l.url))}"><button type="button" data-copy="${esc(full(l.url))}">コピー</button><a class="net-t-pdf" href="${esc(pdf(l.url))}" target="_blank" rel="noopener" title="デザインされた PDF をひらく">📄</a><a class="net-t-pdf" href="${esc(full(l.url))}&amp;view=meet" target="_blank" rel="noopener" title="面談メモ（話すことが上に出ます）">🗣</a>${l.roblox ? `<a class="net-t-pdf" href="${esc(full(l.roblox))}" target="_blank" rel="noopener" title="Roblox の学習レポート">🎮</a>` : ''}</div>`).join('')}`;
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
    onRoster(m) { roster = m.players || []; notices = Array.isArray(m.notices) ? m.notices : []; exam = m.exam || null; chatPaused = !!m.chatPaused; freeChat = m.freeChat !== false; if (m.eikenLevel) eikenLevel = m.eikenLevel; if (open) renderRoster(); },
    onAck(m) {
      if (m.ok === false) {
        const said = { 'not in a big room': 'ステージは おはなし島（大広間）だけです。', 'no such student': 'その生徒が見つかりません。', 'unknown level': 'その きびしさは ありません。',
          'not found': 'その子の記録が見つかりません。', 'empty note': 'メモが空です。', 'could not write': '保存できませんでした。もう一度おしてください。' }[m.error];
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
      else if (m.cmd === 'eiken') {
        eikenLevel = m.level || 'normal';
        toast({
          strict: '英検の はんていを「きびしい」にしました（1語も ちがえられません）。',
          normal: '英検の はんていを「ふつう」にしました。',
          easy: '英検の はんていを「やさしい」にしました（would like to を want でも○）。',
        }[eikenLevel]);
        if (open) renderRoster();
      }
      else if (m.cmd === 'carryover') {
        const moved = (m.moved || []).length;
        const skipped = m.skipped || [];
        toast(moved
          ? `${moved} 人の記録を ${m.from} から 引き継ぎました。${skipped.length ? `（${skipped.length} 人は そのまま）` : ''}`
          : '引き継げる記録が ありませんでした。');
        if (skipped.length) {
          const why = { 'not in the old class': '前のクラスに いません', 'already played in this class': 'もう このクラスで あそんでいます',
            'is online right now': 'いま つないでいます（降りてから）', 'could not read': '読めませんでした', 'could not write': '書けませんでした' };
          console.info('[carryover] 引き継がなかった子:', skipped.map((x) => `${x.name}（${why[x.why] || x.why}）`).join(' / '));
        }
      }
      else if (m.cmd === 'mission') { missionId = m.id || ''; toast(m.id ? '今日のおつかいを設定しました。' : 'おつかいの指定を解除しました。'); }
      else if (m.cmd === 'call') toast('生徒を呼び出しました。');
      else if (m.cmd === 'move') toast('生徒をここへ移動させました。');
      else if (m.cmd === 'register') toast('めいぼを読み直しました。');
      else if (m.cmd === 'reports') showLinks(m.links || [], m.csv || '', m.classUrl || '');
      else if (m.cmd === 'notes') { if (child && child.name === m.name) { child = { name: m.name, notes: m.notes || [], exam: m.exam || null }; renderChild(); } }
      else if (m.cmd === 'note' || m.cmd === 'unnote') {
        toast(m.cmd === 'note' ? (m.entry?.share ? 'メモを のこしました（保護者のレポートにも出ます）。' : 'メモを のこしました（先生だけ）。') : 'メモを けしました。');
        if (child && child.name === m.name) { child.notes = m.notes || child.notes; renderChild(); }
      }
      else if (m.cmd === 'called') {
        toast(`${m.name} さんに「声をかけた」を のこしました。2週間 様子を見ます。`);
        const n = notices.find((x) => x.name === m.name);
        if (n) n.called = m.entry?.at || new Date().toISOString();
        if (child && child.name === m.name) { child.notes = m.notes || child.notes; renderChild(); }
        if (open) renderNotices();
      }
    },
    setChatPaused(v) { chatPaused = v; if (open) renderRoster(); },
    setFree(v) { freeChat = v !== false; if (open) renderRoster(); },
    setVoice(v) { voiceMode = ['rooms', 'all', 'off'].includes(v) ? v : 'all'; if (open) renderRoster(); },
    setEikenLevel(v) { eikenLevel = ['strict', 'normal', 'easy'].includes(v) ? v : 'normal'; if (open) renderRoster(); },
    setMission(id) { missionId = id || ''; const select = root.querySelector('#net-t-mission'); if (select) select.value = missionId; },
  };
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
