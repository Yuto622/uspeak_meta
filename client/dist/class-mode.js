// 授業モード（Class Mode）と 苦手単語の 復習（Review）の 画面。Roblox 版と 同じ 4 つの 操作・同じ 文言。
//
// - **先生だけ**に「🎓 Class Mode」の ボタンが 出る（welcome の role。名簿の「先生」列か 講師キー）。
//   押すと パネル：つながっている 生徒の 一覧（名前・いる場所・ストップ中か）と 4 つの ボタン
//   （📣 Gather ／ ⏸ Freeze ↔ ▶ Resume ／ 📚 Review weak words ／ 🌍 Move together）。どれも 確認つき。
// - 生徒の 画面：ストップ（全画面「✋ Listen to your teacher!」・操作を 受けつけない）、あつまる 帯、
//   いどうの 5 秒カウントダウン、復習（🔊 を 聞いて 4 つから えらぶ）、1 日 1 回の「Review time!」カード。
// 判定・制限（1 秒・5 秒・15 秒・10 分）は ぜんぶ 部屋（server/src/game/class-mode.js・review.js）。ここは 出すだけ。
// 表示は 英語を 大きく、日本語を 小さく。日本語も 両方 いつも 出すので、入れ物は translate="no"（画面の 訳の 層に 触らせない）。

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="cm-en">${esc(en)}</b><small class="cm-ja">${esc(ja)}</small>`;

export function createClassMode({ send, toast, speak, getHere, getGatherPoint, goPlace }) {
  let role = 'student';
  let online = false;
  let state = { paused: false, students: [], destinations: [] };
  let pollTimer = null;

  // ---- 先生のボタンと パネル -----------------------------------------------------------------
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'class-mode-button';
  button.hidden = true;
  button.setAttribute('translate', 'no');
  button.innerHTML = `<span class="cm-cap">🎓</span><span>${bi('Class Mode', 'じゅぎょうモード')}</span>`;
  document.body.append(button);

  const panel = document.createElement('dialog');
  panel.id = 'class-mode-panel';
  panel.setAttribute('translate', 'no');
  panel.innerHTML = `
    <div class="cm-head"><span class="cm-cap">🎓</span><div>${bi('Class Mode', 'じゅぎょうモード')}<em id="cm-class"></em></div>
      <button type="button" class="cm-x" id="cm-close" aria-label="Close">×</button></div>
    <div class="cm-body">
      <div class="cm-grid">
        <button type="button" class="cm-act" data-act="gather"><i>📣</i>${bi('Gather', 'みんなを あつめる')}</button>
        <button type="button" class="cm-act" data-act="freeze" id="cm-freeze"><i>⏸</i>${bi('Freeze', 'ぜんいん ストップ')}</button>
        <button type="button" class="cm-act review" data-act="review"><i>📚</i>${bi('Review weak words', 'にがてを ふくしゅう')}</button>
        <button type="button" class="cm-act" data-act="move"><i>🌍</i>${bi('Move together', 'みんなで いどう（せんせいも いっしょ）')}</button>
      </div>
      <div id="cm-confirm" hidden></div>
      <div id="cm-dests" hidden></div>
      <div id="cm-result" hidden></div>
      <h3 class="cm-h">${bi('Students online', 'いま つながっている せいと')} <span id="cm-count"></span></h3>
      <ul id="cm-students"></ul>
    </div>`;
  document.body.append(panel);
  const $ = (s) => panel.querySelector(s);

  function renderPanel() {
    const fz = $('#cm-freeze');
    fz.innerHTML = state.paused ? `<i>▶</i>${bi('Resume', 'さいかい')}` : `<i>⏸</i>${bi('Freeze', 'ぜんいん ストップ')}`;
    fz.classList.toggle('on', state.paused);
    $('#cm-count').textContent = String(state.students.length);
    $('#cm-students').innerHTML = state.students.map((s) => `<li><b>${esc(s.name)}</b><span>${esc(s.place || '—')}</span>${s.paused ? '<em>✋ STOP</em>' : ''}</li>`).join('')
      || `<li class="cm-empty">${bi('No students yet', 'まだ だれも いません')}</li>`;
  }
  function ask(en, ja, onYes) {
    const box = $('#cm-confirm');
    $('#cm-dests').hidden = true;
    box.hidden = false;
    box.innerHTML = `<p>${bi(en, ja)}</p><div class="cm-row"><button type="button" class="cm-yes">${bi('Yes', 'はい')}</button><button type="button" class="cm-no">${bi('Cancel', 'やめる')}</button></div>`;
    box.querySelector('.cm-yes').onclick = () => { box.hidden = true; onYes(); };
    box.querySelector('.cm-no').onclick = () => { box.hidden = true; };
  }
  const n = () => state.students.length;
  function showDests() {
    const here = getHere();
    // 今いる 場所は 一覧から のぞく。
    const list = state.destinations.filter((d) => d.id !== here.id);
    const box = $('#cm-dests');
    $('#cm-confirm').hidden = true;
    box.hidden = false;
    box.innerHTML = `<div class="cm-dgrid">${list.map((d) => `<button type="button" data-to="${esc(d.id)}"><i>${esc(d.icon || '🏝')}</i>${bi(d.en, d.jp)}</button>`).join('')}</div>`;
    box.onclick = (e) => {
      const b = e.target.closest('[data-to]');
      if (!b) return;
      const d = state.destinations.find((x) => x.id === b.dataset.to);
      ask(`Move ${n()} students to ${d.en}?`, `せいと ${n()} にんと ${d.jp} へ いどうしますか？`, () => { box.hidden = true; send('class:move', { to: d.id }); });
    };
  }
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('.cm-act');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'gather') {
      const p = getGatherPoint();
      if (!p) { toast('Step outside a building first · たてものの そとに でてから'); return; }
      ask(`Gather ${n()} students here?`, `せいと ${n()} にんを ここに あつめますか？`, () => send('class:gather', p));
    } else if (act === 'freeze') {
      if (state.paused) ask('Resume everyone?', 'みんなを さいかい しますか？', () => send('class:freeze', { on: false }));
      else ask(`Freeze ${n()} students?`, `せいと ${n()} にんを ストップ しますか？`, () => send('class:freeze', { on: true }));
    } else if (act === 'review') {
      ask(`Give ${n()} students their weak-word review?`, `せいと ${n()} にんに にがてな たんごの ふくしゅうを だしますか？`, () => send('class:review', {}));
    } else if (act === 'move') showDests();
  });
  $('#cm-close').onclick = () => panel.close();
  panel.addEventListener('close', () => { clearInterval(pollTimer); pollTimer = null; });
  button.onclick = () => {
    if (!panel.open) panel.showModal();
    send('class:get', {});
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (panel.open) send('class:get', {}); }, 4000);
  };

  // ---- 生徒の 画面（ストップ・あつまる・いどう）-------------------------------------------------
  const cover = document.createElement('div');
  cover.id = 'class-mode-cover';
  cover.hidden = true;
  cover.setAttribute('translate', 'no');
  document.body.append(cover);
  const band = document.createElement('div');
  band.id = 'class-mode-band';
  band.hidden = true;
  band.setAttribute('translate', 'no');
  document.body.append(band);
  let bandTimer = null;
  function showBand(html, ms = 3500) {
    band.innerHTML = html;
    band.hidden = false;
    clearTimeout(bandTimer);
    bandTimer = setTimeout(() => { band.hidden = true; }, ms);
  }
  function setPaused(on) {
    document.body.dataset.classPause = on ? '1' : '';
    if (!on) delete document.body.dataset.classPause;
    cover.hidden = !on;
    if (on) {
      cover.innerHTML = `<div class="cm-stop"><span>✋</span>${bi('Listen to your teacher!', 'せんせいの はなしを きこう')}</div>`;
      // 開いている 画面（クイズ・つり・お店）は 閉じる（部屋も 答えを 受けつけない）。
      for (const d of document.querySelectorAll('dialog[open]')) if (d.id !== 'net-lobby' && d.id !== 'class-mode-panel') d.close();
    }
  }
  let gotoTimer = null; let failTimer = null;
  function countdown(m) {
    clearInterval(gotoTimer); clearTimeout(failTimer);
    let left = Number(m.sec) || 5;
    const paint = () => {
      cover.hidden = false;
      cover.innerHTML = `<div class="cm-go"><span>🚀</span>${bi(`Let's go to ${m.en}!`, `せんせいと みんなで ${m.jp} へ いくよ`)}<strong>${left}</strong></div>`;
    };
    paint();
    gotoTimer = setInterval(() => {
      left -= 1;
      if (left > 0) { paint(); return; }
      clearInterval(gotoTimer);
      const ok = goPlace(m);
      if (ok) { cover.hidden = true; if (document.body.dataset.classPause) setPaused(true); showBand(`✨ ${bi('We are here!', 'ついたよ！')}`, 2500); }
      // うまく 行かなくても 画面を 固めない：25 秒で 表示を 閉じて 元に もどす。
      else failTimer = setTimeout(() => { cover.hidden = true; }, 25000);
    }, 1000);
  }

  // ---- 復習（Review）---------------------------------------------------------------------
  const rv = document.createElement('dialog');
  rv.id = 'review-dialog';
  rv.setAttribute('translate', 'no');
  document.body.append(rv);
  let set = null; let at = 0; let locked = false; let correct = 0;
  function sayIt() { const w = set?.items?.[at]?.say; if (w) speak(w); }
  function paintQuestion() {
    const it = set.items[at];
    locked = false;
    rv.innerHTML = `<div class="rv-head"><div>${bi('📚 Review', 'にがてを ふくしゅう')}</div><span class="rv-prog">${at + 1} / ${set.items.length}</span><button type="button" class="cm-x" id="rv-close" aria-label="Close">×</button></div>
      <div class="rv-body"><button type="button" class="rv-speak" id="rv-speak" aria-label="Listen">🔊</button>
      <p class="rv-lead">${bi('Listen and choose', 'きいて えらぼう')}</p>
      <div class="rv-opts">${it.options.map((o) => `<button type="button" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      <p class="rv-msg" id="rv-msg"></p></div>`;
    rv.querySelector('#rv-speak').onclick = sayIt;
    rv.querySelector('#rv-close').onclick = () => { send('review:quit', {}); set = null; rv.close(); };
    rv.querySelector('.rv-opts').onclick = (e) => {
      const b = e.target.closest('[data-o]');
      if (!b || locked) return;
      locked = true;
      b.classList.add('picked');
      send('review:answer', { i: at, choice: b.dataset.o });
    };
    setTimeout(sayIt, 250);
  }
  function startReview(m) {
    set = m; at = 0; correct = 0;
    hideOffer();
    for (const d of document.querySelectorAll('dialog[open]')) if (d !== rv && d.id !== 'net-lobby') d.close();
    if (!rv.open) rv.showModal();
    paintQuestion();
  }
  function onResult(m) {
    if (!set || m.i !== at) return;
    const opts = rv.querySelectorAll('.rv-opts button');
    for (const b of opts) {
      if (b.dataset.o.toLowerCase() === String(m.word).toLowerCase()) b.classList.add('right');
      else if (b.classList.contains('picked')) b.classList.add('wrong');
    }
    if (m.ok) correct += 1;
    rv.querySelector('#rv-msg').innerHTML = m.ok ? `✅ ${bi('Correct!', 'せいかい！')}${m.coins ? ` <span class="rv-coin">+${m.coins} 🪙</span>` : ''}` : `${bi(`Answer: ${m.word}`, 'こたえ')}`;
    if (!m.ok) speak(m.word);
    setTimeout(() => {
      if (!set) return;
      if (at < set.items.length - 1) { at += 1; paintQuestion(); }
    }, 1300);
  }
  function onDone(m) {
    setTimeout(() => {
      if (!rv.open) return;
      rv.innerHTML = `<div class="rv-end"><span>🎉</span>${bi('Great job!', 'よくできました')}<strong>${m.correct} / ${m.total}</strong></div>`;
      set = null;
      setTimeout(() => rv.close(), 2500);
    }, 1300);
  }
  function onNone() {
    for (const d of document.querySelectorAll('dialog[open]')) if (d !== rv && d.id !== 'net-lobby') d.close();
    rv.innerHTML = `<div class="rv-end"><span>🌟</span>${bi('No weak words!', 'にがてな たんごは ありません')}</div>`;
    if (!rv.open) rv.showModal();
    setTimeout(() => rv.close(), 2500);
  }
  // 1 日 1 回の 小さな カード（30 秒で 消える）。
  const offer = document.createElement('div');
  offer.id = 'review-offer';
  offer.hidden = true;
  offer.setAttribute('translate', 'no');
  document.body.append(offer);
  let offerTimer = null;
  function hideOffer() { offer.hidden = true; clearTimeout(offerTimer); }
  function showOffer(m) {
    offer.innerHTML = `<span class="ro-ic">📚</span><div>${bi('Review time!', `ふくしゅう ${m.n} こ`)}</div>
      <button type="button" class="ro-go">${bi('Start', 'はじめる')}</button><button type="button" class="ro-later">${bi('Later', 'あとで')}</button>`;
    offer.hidden = false;
    offer.querySelector('.ro-go').onclick = () => { hideOffer(); send('review:start', {}); };
    offer.querySelector('.ro-later').onclick = hideOffer;
    clearTimeout(offerTimer);
    offerTimer = setTimeout(hideOffer, 30000);
  }

  function setAvailable() {
    const isTeacher = online && role === 'teacher';
    button.hidden = !isTeacher;
    document.body.classList.toggle('cm-teacher', isTeacher);
    if (!isTeacher && panel.open) panel.close();
  }

  return {
    setRole(r) { role = r === 'teacher' ? 'teacher' : 'student'; setAvailable(); },
    setOnline(v) { online = !!v; setAvailable(); if (!online) setPaused(false); },
    handle(type, m) {
      switch (type) {
        case 'class:state': state = { paused: !!m.paused, students: m.students || [], destinations: m.destinations || [] }; renderPanel(); return true;
        case 'class:toast': toast(m.text); return true;
        case 'class:reviewStarted': toast(`📚 Review started: ${m.started} · ふくしゅう スタート ${m.started} にん${m.none ? `（にがて なし ${m.none} にん）` : ''}`); return true;
        case 'class:result': {
          const box = $('#cm-result');
          box.hidden = false;
          box.innerHTML = `<p>${bi(`Class result: ${m.correct} / ${m.total}`, 'クラスの せいかい')}</p>${m.weak?.length ? `<p>${bi(`Weak words: ${m.weak.join(', ')}`, 'にがてな たんご（おおく まちがえた じゅん）')}</p>` : ''}`;
          toast(`Class result ${m.correct} / ${m.total}`);
          return true;
        }
        case 'class:pause': setPaused(true); return true;
        case 'class:resume': setPaused(false); return true;
        case 'class:incoming': showBand(`📣 ${bi(`Gather at ${m.by}!`, `${m.by} せんせいの ところに あつまるよ！`)}`, 2500); return true;
        case 'class:arrived': showBand(`✨ ${bi('We are here!', 'ついたよ！')}`, 2500); return true;
        case 'class:goto': if (panel.open) panel.close(); countdown(m); return true;
        case 'review:offer': showOffer(m); return true;
        case 'review:start': startReview(m); return true;
        case 'review:none': onNone(m); return true;
        case 'review:result': onResult(m); return true;
        case 'review:done': onDone(m); return true;
        case 'review:error': if (m.reason === 'too fast') locked = false; return true;
        default: return false;
      }
    },
    setPaused,
    get paused() { return document.body.dataset.classPause === '1'; },
  };
}
