// えいごアリーナ — the battle screen.
//
// Renders HP, the four moves, and the question a strong move asks. It never computes
// damage and never knows the answer; both arrive from the server, the answer only after
// the child has committed.
import { createBattleStage } from './battle-stage.js';

const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// renderer（島の WebGLRenderer）が あれば 3D の たいせんがめん（battle-stage.js）。なければ いままでの カードの 画面。
export function createBattleUI({ send, speak, toast, isOnline, renderer = null, getPet = () => null }) {
  const stage = renderer ? createBattleStage({ renderer }) : null;
  let state = null;      // the last battle:state / battle:turn payload
  let quiz = null;       // a pending question
  let busy = false;
  let timer = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'battle-dialog';
  dialog.setAttribute('aria-labelledby', 'battle-title');
  dialog.innerHTML = `<canvas id="battle-stage" aria-hidden="true"></canvas><div class="quiz-head">
      <div><span class="eyebrow">WORD ARENA</span><h2 id="battle-title">えいごアリーナ</h2></div>
      <span id="battle-turn"></span>
      <button type="button" id="battle-close" aria-label="閉じる">×</button>
    </div><div id="battle-body"></div>`;
  document.body.append(dialog);
  const body = () => $('#battle-body', dialog);

  function open() {
    if (dialog.open) return;
    dialog.showModal();
    // 3D の 舞台。描けない 端末では class が つかず、カードの 画面の まま。
    const staged = !!stage && stage.start($('#battle-stage', dialog), { pet: getPet()?.species || '' });
    dialog.classList.toggle('staged', staged);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function close() { stopTimer(); stage?.stop(); state = null; quiz = null; busy = false; if (dialog.open) dialog.close(); }
  // 部屋の できごとを 舞台の うごきに（見せるだけ。数字は 部屋の もの）。
  function act(events = []) {
    let delay = 0;
    for (const e of events) {
      if (e.who === 'you' && e.fizzled) stage?.play('fizzle', 'you', delay);
      else if (e.who === 'you' && e.heal) stage?.play('heal', 'you', delay);
      else if (e.who === 'you') stage?.play('attack', 'you', delay, ['poyon', 'beam', 'super'].includes(e.waza) ? e.waza : 'poyon');   // わざごとの 光
      else if (e.missed) stage?.play('miss', 'foe', delay);
      else stage?.play('attack', 'foe', delay, 'void');
      delay += e.who === 'you' && e.waza === 'super' ? 1.6 : 1.25;
    }
    return delay;
  }

  const bar = (who, label, hp, max) => `<div class="battle-side ${who}">
      <div class="battle-name"><strong>${esc(label)}</strong><span>${hp} / ${max}</span></div>
      <div class="battle-hp"><i style="width:${Math.max(0, Math.round((hp / max) * 100))}%"></i></div>
    </div>`;

  function renderMoves(events = []) {
    stopTimer();
    const s = state;
    $('#battle-turn', dialog).textContent = `${s.turn} ターンめ`;
    body().innerHTML = `${bar('foe', `マスターウーピー（${esc(s.cpu)}）`, s.foe.hp, s.foe.max)}
      ${eventLine(events)}
      ${bar('you', 'じぶん', s.you.hp, s.you.max)}
      <p class="battle-hint">つよい わざは 英語のもんだいに 答えると 出せます。</p>
      <div class="battle-waza">${s.waza.map((w) => `<button type="button" data-waza="${esc(w.id)}" ${busy ? 'disabled' : ''}>
        <strong>${esc(w.name)}</strong>
        <small>${w.heal ? `かいふく ${w.heal}` : `ダメージ ${w.damage}`}${w.quiz ? ' · えいごの もんだい' : ''}</small></button>`).join('')}</div>
      <div class="quiz-actions"><button type="button" id="battle-quit">やめる</button></div>`;
    body().querySelectorAll('[data-waza]').forEach((b) => {
      b.onclick = () => {
        if (busy) return;
        busy = true;
        body().querySelectorAll('[data-waza]').forEach((x) => { x.disabled = true; });
        send('battle:waza', { waza: b.dataset.waza });
      };
    });
    $('#battle-quit', dialog).onclick = () => { send('battle:quit', {}); close(); };
  }

  function eventLine(events) {
    if (!events?.length) return '<p class="battle-events">わざを えらぼう</p>';
    return `<p class="battle-events">${events.map((e) => {
      if (e.who === 'you' && e.fizzled) return 'わざが 出せなかった…';
      if (e.who === 'you' && e.heal) return `にこにこヒール！ +${e.heal}`;
      if (e.who === 'you') return `${esc(state.waza.find((w) => w.id === e.waza)?.name || '')}！ ${e.damage} ダメージ`;
      if (e.missed) return 'あいての こうげきは 外れた！';
      return `あいての こうげき！ ${e.damage} ダメージ`;
    }).map((t) => `<span>${t}</span>`).join('<i aria-hidden="true">　→　</i>')}</p>`;
  }

  function renderQuiz() {
    const q = quiz;
    let left = q.seconds;
    $('#battle-turn', dialog).textContent = `${state.turn} ターンめ`;
    body().innerHTML = `${bar('foe', `マスターウーピー（${esc(state.cpu)}）`, state.foe.hp, state.foe.max)}
      <div class="battle-quiz">
        <small>${esc(state.waza.find((w) => w.id === q.waza)?.name || '')} を 出すには…</small>
        <p id="battle-q">${esc(q.q)}</p>
        <button type="button" id="battle-listen">▷ もう一度きく</button>
        <div class="battle-clock"><i id="battle-clock-bar"></i></div>
        <span id="battle-left">${left}</span>
      </div>
      <div class="battle-choices">${q.choices.map((c, i) => `<button type="button" data-answer="${i}"><b>${'ABC'[i]}</b><span>${esc(c)}</span></button>`).join('')}</div>`;
    $('#battle-listen', dialog).onclick = () => speak(q.q);
    const commit = (choice, timedOut = false) => {
      if (busy) return;
      busy = true;
      stopTimer();
      body().querySelectorAll('[data-answer]').forEach((x) => { x.disabled = true; });
      send('battle:answer', { choice, timedOut });
    };
    body().querySelectorAll('[data-answer]').forEach((b) => { b.onclick = () => commit(Number(b.dataset.answer)); });
    speak(q.q);
    stopTimer();
    timer = setInterval(() => {
      left -= 1;
      const bar2 = $('#battle-clock-bar', dialog);
      const num = $('#battle-left', dialog);
      if (bar2) bar2.style.width = `${Math.max(0, (left / q.seconds) * 100)}%`;
      if (num) num.textContent = String(Math.max(0, left));
      if (left <= 0) commit(-1, true);
    }, 1000);
  }

  function renderEnd(m) {
    stopTimer();
    const capped = m.capped ? `<p class="battle-capped">今日の アリーナの コインは ここまで（1日 ${150}◈ まで）。バトルは まだ できます。</p>` : '';
    body().innerHTML = `<div class="quiz-done">
        <strong>${m.won ? 'かった！' : 'まけた…'}</strong>
        <p>◈ ${m.paid} コインを もらいました。</p>${capped}
        <div class="quiz-actions"><button type="button" class="primary" id="battle-again">もういちど</button>
        <button type="button" id="battle-leave">おわる</button></div></div>`;
    $('#battle-turn', dialog).textContent = m.won ? 'WIN' : 'LOSE';
    $('#battle-again', dialog).onclick = () => send('battle:start', { stand: m.stand });
    $('#battle-leave', dialog).onclick = close;
  }

  // ダイアログが **どの 道で とじても**（ほかの 画面が dialog.close() した・島を うつった・つなぎなおし）舞台を 止めて 島を かえす。
  // 2026-11：止めわすれて 舞台の 絵が のこり、島が 描かれず「ぬけ出せない」に なった。
  dialog.addEventListener('close', () => { stopTimer(); stage?.stop(); dialog.classList.remove('staged'); });
  $('#battle-close', dialog).onclick = () => { send('battle:quit', {}); close(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); send('battle:quit', {}); close(); });

  return {
    get stage() { return stage; },   // 検査・撮影用
    get staged() { if (stage?.running && !dialog.open) stage.stop(); return !!stage?.running && dialog.open; },
    label(spot) {
      if (spot.kind === 'pvp') return `${spot.tone} ${spot.name}（じゅんび中）`;
      return `${spot.tone} ${spot.name} で バトル`;
    },
    enter(spot) {
      if (!spot) return;
      if (spot.kind === 'pvp') { toast('たいせん台は じゅんび中です。いまは 3つの台で バトルできます。'); return; }
      if (!isOnline()) { toast('アリーナは クラスに入っているときだけ 遊べます。'); return; }
      send('battle:start', { stand: spot.id });
    },
    onState(m) { state = m; quiz = null; busy = false; open(); stage?.reset(); renderMoves(); },
    onQuiz(m) { quiz = m; busy = false; renderQuiz(); },
    onTurn(m) {
      state = { ...state, ...m };
      state.stand = state.stand || m.stand;
      quiz = null;
      busy = false;
      const took = act(m.events);
      if (m.over) { stage?.end(!!m.won, took); renderEnd({ ...m, stand: state.stand }); return; }
      renderMoves(m.events);
    },
    onClosed() { close(); },
    onError(m) {
      busy = false;
      if (m?.reason === 'too far') {
        toast(m.stand ? `${m.stand.ja} まで あるいて行こう。` : 'その台まで あるいて行こう。');
        close();
        return;
      }
      toast({ 'unknown stand': 'その台は 見つかりません。', 'answer first': 'さきに もんだいに 答えてね。' }[m?.reason] || 'うまくいきませんでした。');
      if (state && !quiz) renderMoves();
    },
    restore(b) {
      if (!b) return;
      state = b;
      open();
      if (b.quiz) { quiz = b.quiz; renderQuiz(); } else renderMoves();
    },
  };
}
