// 宿題の 画面（しゅくだい島の いえ）— 先生が くばった 宿題の 一覧 → 1 問ずつ 7 形式で とく → おわり。
//
// **この 画面は 答えを 知らない。** 問題は 1 問ずつ 部屋から 届き（hw:ask）、押した ものを 送り（hw:answer）、
// ○× は 部屋が 返す（hw:result）。形の 部品は つり島と 同じ formats-ui.js（1 回 まちがえたら もう 1 回）。
import { t as tr, applyDom } from './i18n.js';
import { renderFormat, confetti } from './formats-ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');

export function createHomework({ send, speak = null, toast = () => {}, isOnline = () => true }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'homework-dialog';
  dialog.setAttribute('aria-labelledby', 'hw-title');
  dialog.innerHTML = `<header class="hw-head"><div><small>HOMEWORK</small><h2 id="hw-title" data-t="しゅくだい">しゅくだい</h2></div>
    <span class="hw-count" id="hw-count"></span><button type="button" class="hw-x" aria-label="とじる" data-t-label="とじる">×</button></header>
    <div class="hw-body" id="hw-body"></div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('#hw-body');
  const count = dialog.querySelector('#hw-count');
  const state = { view: 'list', items: [], ask: null, ctl: null };
  dialog.querySelector('.hw-x').onclick = () => close();
  dialog.addEventListener('close', () => { state.ctl?.destroy?.(); state.ctl = null; if (state.view === 'ask') send('hw:quit'); state.view = 'list'; });

  function open() {
    if (!isOnline()) { toast(tr('しゅくだいは クラスに はいって いる ときに できるよ。')); return false; }
    state.view = 'list';
    body.innerHTML = `<p class="hw-wait">${esc(tr('よみこみ中…'))}</p>`;
    count.textContent = '';
    if (!dialog.open) dialog.showModal();
    send('hw:list');
    return true;
  }
  function close() { if (dialog.open) dialog.close(); }

  // ---- 一覧 ----
  function onList(m) {
    state.items = Array.isArray(m?.items) ? m.items : [];
    if (!dialog.open || state.view !== 'list') return;
    const left = state.items.filter((h) => !h.done).length;
    count.textContent = state.items.length ? tr('のこり {0}', [left]) : '';
    if (!state.items.length) {
      body.innerHTML = `<div class="hw-empty"><b>📚</b><p>${esc(tr('いまは しゅくだいが ないよ。'))}</p><small>${esc(tr('先生が くばると ここに 出るよ。'))}</small></div>`;
      return;
    }
    body.innerHTML = `<ul class="hw-list">${state.items.map((h) => {
      const tag = h.done ? `<span class="hw-tag done">✅ ${esc(tr('おわり'))} ${h.correct}/${h.total}</span>`
        : h.overdue ? `<span class="hw-tag late">⏰ ${esc(tr('しめきり すぎ'))}</span>`
          : h.answered ? `<span class="hw-tag mid">${esc(tr('とちゅう'))} ${h.answered}/${h.total}</span>` : `<span class="hw-tag new">${esc(tr('あたらしい'))}</span>`;
      const redo = h.done && h.correct < h.total;
      return `<li class="hw-card${h.done ? ' is-done' : ''}">
        <div class="hw-card-main"><b class="hw-name" translate="no">${esc(h.title)}</b>${tag}
          <small>${esc(tr('{0} もん', [h.total]))}${h.due ? ` · ${esc(tr('しめきり {0}', [day(h.due)]))}` : ''}</small>
          ${h.note ? `<small class="hw-note" translate="no">${esc(h.note)}</small>` : ''}
          <div class="hw-bar"><i style="width:${h.total ? Math.round((h.answered / h.total) * 100) : 0}%"></i></div></div>
        <div class="hw-card-go">${!h.done ? `<button type="button" class="hw-go" data-go="${esc(h.id)}">${esc(h.answered ? tr('つづける') : tr('はじめる'))} →</button>` : ''}
          ${redo ? `<button type="button" class="hw-redo" data-redo="${esc(h.id)}">${esc(tr('まちがえた ところを もう いちど'))}</button>` : ''}</div></li>`;
    }).join('')}</ul>`;
    applyDom(body);
  }
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    // redo は × だった 問題だけ もう いちど。
    if (b.dataset.go) { state.view = 'ask'; send('hw:start', { aid: b.dataset.go }); }
    if (b.dataset.redo) { state.view = 'ask'; send('hw:start', { aid: b.dataset.redo, redo: true }); }
    if (b.dataset.back !== undefined) { state.view = 'list'; send('hw:list'); }
  });

  // ---- 1 問 ----
  function onAsk(m) {
    if (!dialog.open) return;
    state.view = 'ask';
    state.ask = m;
    count.textContent = `${m.index} / ${m.total}`;
    state.ctl?.destroy?.();
    body.innerHTML = `<div class="hw-progress"><b translate="no">${esc(m.title)}</b><div class="hw-bar"><i style="width:${Math.round(((m.index - 1) / m.total) * 100)}%"></i></div></div><div class="hw-q"></div>`;
    state.ctl = renderFormat(body.querySelector('.hw-q'), m.format, {
      speak,
      onQuit: () => { state.ctl?.destroy?.(); state.ctl = null; send('hw:quit'); state.view = 'list'; send('hw:list'); },
      onCheck: (answer) => send('hw:answer', { qid: m.qid, answer }),
    });
  }
  function onResult(m) {
    if (!state.ctl || !state.ask || m.qid !== state.ask.qid) return;
    state.ctl.showResult(m.correct, { diff: m.diff, reveal: m.reveal, escaped: m.escaped });
    if (m.correct || m.escaped) {
      // おなじ 回の つぎの 問題（部屋が この 回で もう やった 問題を おぼえて いる）。
      const next = () => { if (state.view === 'ask' && dialog.open) send('hw:next'); };
      setTimeout(next, m.correct ? 1000 : 2400);
    } else if (m.format) {
      setTimeout(() => { if (state.view === 'ask') onAsk({ ...state.ask, format: m.format }); }, 1500);
    }
  }

  // ---- おわり ----
  function onDone(m) {
    if (!dialog.open) return;
    state.ctl?.destroy?.(); state.ctl = null;
    state.view = 'done';
    count.textContent = '';
    const perfect = m.correct === m.total;
    body.innerHTML = `<div class="hw-done"><b class="hw-medal">${perfect ? '🏆' : m.done ? '🎉' : '👍'}</b>
      <h3>${esc(m.done ? tr('しゅくだい おわり！') : tr('ここまで できたよ'))}</h3>
      <p class="hw-score"><b>${m.correct}</b> / ${m.total} <small>${esc(tr('せいかい'))}</small></p>
      ${m.coins ? `<p class="hw-coins">◈ +${m.coins} ${esc(tr('コイン'))}</p>` : ''}
      ${m.correct < m.total ? `<button type="button" class="hw-redo" data-redo="${esc(m.id)}">${esc(tr('まちがえた ところを もう いちど'))}</button>` : ''}
      <button type="button" class="hw-go" data-back>${esc(tr('しゅくだいの いちらんへ'))}</button></div>`;
    applyDom(body);
    if (m.done) confetti(body);
  }
  function onError(m) {
    if (m?.reason === 'too fast') return;
    if (m?.reason === 'no such homework' || m?.reason === 'gone') { toast(tr('その しゅくだいは もう ないよ。')); state.view = 'list'; send('hw:list'); }
  }

  return { open, close, onList, onAsk, onResult, onDone, onError, get isOpen() { return dialog.open; } };
}
