// よみもの島の 画面 — 本だな と 1 冊（👂 きく → 📖 よむ → 🎤 おんどく → ❓ クイズ）。
//
// ・本は 部屋から もらう（read:book。本文・絵の 場面・ことば）。**クイズの 正解は 来ない**：1 問ずつ 選択肢だけ 来て、
//   答えると 部屋が ○× と 正解を 返す。✓・★・コインも 部屋（server/src/game/reading.js）。
// ・絵は「場面」（背景 1 つ＋絵文字の 登場人物）を CSS で うごかす。画像ファイルも WebGL も 使わない（古い iPad でも 軽い）。
// ・読み上げは 自然な 声（speech.js の playVoice＝/api/tts）。再生の 時間に あわせて ことばを 光らせる。
// ・本文・ことば・クイズは 学習の 中身＝translate="no"。説明は 英語と ひらがなを 両方 書いて CSS が えらぶ（.en / .ja）。
import { playVoice, stopVoice } from './speech.js';
import { isJa, onLangChange } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, ja) => `<b class="en">${en}</b><i class="ja">${ja}</i>`;
const L = (en, ja) => (isJa() ? ja : en);
const clean = (w) => String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '');

// 背景：空の 色・地面の 色・とおくの かざり（絵文字, x%, y%, 大きさ, うすさ）。
const BG = {
  meadow: ['linear-gradient(#8fd3ff,#d8f3ff 62%)', '#7fc96b', [['☁️', 18, 14, 2.2, .9], ['☁️', 72, 22, 1.6, .8], ['🌼', 12, 86, 1, 1], ['🌼', 88, 90, 1, 1]]],
  forest: ['linear-gradient(#7ec8a0,#cfeedd 60%)', '#4f9a55', [['🌲', 8, 52, 3.4, .9], ['🌲', 90, 50, 3.8, .9], ['🌳', 24, 46, 2.6, .7], ['🌳', 76, 44, 2.4, .7]]],
  sea: ['linear-gradient(#7fd0ff,#c9efff 48%)', '#2f8fd6', [['☁️', 22, 14, 2, .9], ['⛵', 84, 46, 1.4, .8], ['🌊', 14, 88, 1.4, .7], ['🌊', 70, 92, 1.4, .7]]],
  beach: ['linear-gradient(#8fd9ff,#dff6ff 55%)', '#f1d79a', [['☀️', 84, 14, 2.4, 1], ['🌴', 8, 52, 3.4, 1], ['🌊', 60, 60, 1.6, .6]]],
  sky: ['linear-gradient(#58b6ff,#bfe6ff)', '#eaf7ff', [['☁️', 14, 30, 3, .95], ['☁️', 80, 20, 2.4, .9], ['☁️', 50, 78, 3.4, .9]]],
  night: ['linear-gradient(#141a4a,#3a3f8a 70%)', '#27405a', [['🌙', 84, 14, 2.4, 1], ['⭐', 20, 14, 1, 1], ['⭐', 44, 24, .8, .9], ['⭐', 64, 10, .9, .9], ['✨', 32, 34, .9, .8]]],
  room: ['linear-gradient(#ffe9c9,#fff5e3 68%)', '#c99b6a', [['🖼️', 16, 22, 1.8, 1], ['🪟', 80, 24, 2.6, 1]]],
  kitchen: ['linear-gradient(#fff1d6,#fff8ea 66%)', '#e3c08f', [['🍳', 14, 26, 1.6, 1], ['🪟', 78, 22, 2.4, 1], ['🧂', 30, 30, 1, .9]]],
  school: ['linear-gradient(#dff0d8,#f3faee 66%)', '#c8a57a', [['🕒', 50, 12, 1.4, 1], ['📚', 10, 54, 1.8, 1], ['🪟', 84, 24, 2.4, 1]]],
  city: ['linear-gradient(#9fd0ff,#e6f4ff 60%)', '#9aa3ad', [['🏢', 10, 44, 3.6, .9], ['🏬', 86, 46, 3.2, .9], ['🏙️', 48, 40, 2.6, .5]]],
  snow: ['linear-gradient(#bfe2ff,#f1f9ff 60%)', '#f7fbff', [['❄️', 16, 16, 1.2, .9], ['❄️', 60, 24, 1, .8], ['❄️', 84, 12, 1.3, .9], ['🌲', 8, 54, 3, .9]]],
  farm: ['linear-gradient(#9bd8ff,#e2f6ff 60%)', '#b9d36a', [['☀️', 14, 14, 2.2, 1], ['🏠', 84, 46, 3, 1], ['🌾', 10, 84, 1.4, 1], ['🌾', 30, 90, 1.4, 1]]],
  space: ['radial-gradient(circle at 30% 20%,#3b2a7a,#0b0b2b 70%)', '#2a2350', [['🪐', 82, 18, 2.6, 1], ['⭐', 14, 16, 1, 1], ['✨', 36, 30, 1, .9], ['⭐', 60, 12, .8, .9], ['🌍', 12, 70, 1.8, .9]]],
  cave: ['linear-gradient(#4a4257,#7a6f86 70%)', '#5c5266', [['💎', 12, 30, 1.2, .9], ['🪨', 88, 70, 2.2, 1], ['🦇', 76, 16, 1.2, .8]]],
  garden: ['linear-gradient(#a6e0ff,#e6f8ff 60%)', '#86cc6a', [['🌷', 8, 80, 1.6, 1], ['🌻', 90, 74, 2, 1], ['🌷', 22, 88, 1.3, 1], ['🦋', 70, 24, 1, .9]]],
  mountain: ['linear-gradient(#8ecbff,#e3f3ff 58%)', '#8fbf7a', [['⛰️', 20, 44, 4.2, .9], ['🏔️', 78, 40, 4.6, .9], ['☁️', 48, 14, 2, .9]]],
  river: ['linear-gradient(#9ad8ff,#e4f6ff 56%)', '#6fc0e6', [['🌳', 8, 46, 3, .9], ['🌿', 90, 60, 1.6, 1], ['☁️', 60, 14, 2, .9]]],
  desert: ['linear-gradient(#ffd89a,#fff0cf 58%)', '#e9c27a', [['☀️', 82, 14, 2.6, 1], ['🌵', 10, 56, 2.8, 1], ['🌵', 90, 62, 2, .9]]],
  park: ['linear-gradient(#93d6ff,#e2f6ff 60%)', '#8ad06f', [['🌳', 8, 48, 3.4, 1], ['⛲', 86, 56, 2.4, .9], ['☁️', 44, 14, 2, .9]]],
  shop: ['linear-gradient(#ffe3ef,#fff3f8 66%)', '#d9b08c', [['🏷️', 14, 20, 1.4, 1], ['🧺', 88, 62, 1.8, 1], ['🪟', 50, 16, 2.2, .8]]],
};

function sceneHtml(scene, { small = false } = {}) {
  const [sky, ground, deco] = BG[scene?.bg] || BG.meadow;
  const one = (e, x, y, s, extra = '', cls = '') => `<span class="rs-i ${cls}" style="left:${x}%;top:${y}%;--s:${s};${extra}">${e}</span>`;
  return `<div class="rs${small ? ' small' : ''}" style="background:${sky}" aria-hidden="true">
    <i class="rs-ground" style="background:${ground}"></i>
    ${deco.map(([e, x, y, s, o]) => one(e, x, y, s, `opacity:${o}`, 'deco')).join('')}
    ${(scene?.items || []).map((it, k) => one(esc(it.e), it.x, it.y, it.s, `animation-delay:${-(k * 0.37).toFixed(2)}s`, `mv-${it.a || 'none'}${it.flip ? ' flip' : ''}`)).join('')}
  </div>`;
}

export function createReadingUI({ send, toast = () => {}, isOnline = () => true, speak = null }) {
  const state = { view: 'shelf', shelf: null, book: null, mode: 'listen', page: 0, slow: false, showJa: false, playing: false, quiz: null, picked: null, result: null, done: null,
    heard: [], listening: false, aloudStart: 0, aloud: null, viewStage: '', pop: null, reached: 0 };
  const Speech = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  let rec = null; let raf = 0; let turnTimer = 0;

  const dialog = document.createElement('dialog');
  dialog.id = 'reading-dialog';
  dialog.innerHTML = '<div class="rd-root" translate="no"></div>';
  document.body.append(dialog);
  const root = dialog.firstElementChild;
  dialog.addEventListener('close', () => { quiet(); });
  dialog.addEventListener('cancel', (e) => { if (state.view !== 'shelf') { e.preventDefault(); toShelf(); } });

  function quiet() { stopVoice(); try { globalThis.speechSynthesis?.cancel(); } catch { /* */ } cancelAnimationFrame(raf); clearTimeout(turnTimer); stopMic(); state.playing = false; }
  const say = (text, opts = {}) => { quiet(); playVoice(text, { japanese: false, slow: !!opts.slow, fallback: () => speak?.(text, { japanese: false, slow: !!opts.slow }) }); };

  // ---------------------------------------------------------------- 本だな
  function shelfHtml() {
    const s = state.shelf;
    if (!s) return `<div class="rd-wait">${bi('Opening the library…', 'としょかんを あけています…')}</div>`;
    const band = { now: bi('Just right for you', 'いまの きみに ぴったり'), easy: bi('Easy reads', 'かんたんに よめる'), next: bi('Challenge', 'ちょうせん') };
    const stars = (n) => `<span class="rd-stars">${'★'.repeat(n)}<i>${'★'.repeat(4 - n)}</i></span>`;
    const book = (b) => `<button type="button" class="rd-book${b.done ? ' done' : ''}" data-book="${esc(b.id)}">
        <span class="rd-cover">${sceneHtml(b.cover, { small: true })}<span class="rd-spine"></span>${b.done ? '<em class="rd-check">✓</em>' : ''}</span>
        <b class="rd-title">${esc(b.title)}</b><small class="rd-sub">${esc(b.titleJa)}</small>
        <span class="rd-meta">${stars(b.stars)}<small>${b.words} ${L('words', 'ご')}</small></span></button>`;
    const pct = s.totals.stageAll ? Math.round((s.totals.stageDone / s.totals.stageAll) * 100) : 0;
    const stagePick = s.teacher ? `<label class="rd-teach">${bi('Level (teacher)', 'だんかい（先生）')} <select id="rd-stage">${['A', 'B', 'C', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((id) => `<option value="${id}"${id === s.stage ? ' selected' : ''}>${id}</option>`).join('')}</select></label>` : '';
    return `<header class="rd-head"><div class="rd-brand"><span class="rd-logo">📚</span><div><small>BOOK ISLAND</small><h2>${bi('My Bookshelf', 'わたしの ほんだな')}</h2></div></div>
        <div class="rd-stats"><span title="books">📖 <b>${s.totals.done}</b><small>${bi('books', 'さつ')}</small></span><span>🔤 <b>${s.totals.words.toLocaleString()}</b><small>${bi('words', 'ご')}</small></span><span>⭐ <b>${s.totals.stars}</b></span></div>
        <button type="button" class="rd-x" aria-label="close">✕</button></header>
      <div class="rd-level"><span class="rd-badge">${bi('Level', 'レベル')} <b>${esc(s.stage)}</b></span>
        <div class="rd-bar"><i style="width:${pct}%"></i></div><small>${s.totals.stageDone} / ${s.totals.stageAll} ${bi('books at this level', 'さつ よんだ')}</small>${stagePick}</div>
      <div class="rd-rows">${s.rows.map((r) => `<section class="rd-row ${r.band}"><h3><span>${band[r.band]}</span><small>${bi(`Level ${esc(r.stage)} · ${esc(r.en)}`, `レベル ${esc(r.stage)}・${esc(r.ja)}`)}</small></h3><div class="rd-books">${r.books.map(book).join('')}</div></section>`).join('') || `<p class="rd-wait">${bi('No books yet.', 'まだ 本が ないよ。')}</p>`}
        <p class="rd-how">${bi('👂 Listen → 📖 Read → 🎤 Read aloud → ❓ Quiz. Finish a book to get coins!', '👂 きく → 📖 よむ → 🎤 こえに だす → ❓ クイズ。1 さつ よめたら コイン！')}</p></div>`;
  }

  // ---------------------------------------------------------------- 1 冊
  const tokens = (text) => String(text).split(/\s+/).filter(Boolean);
  function textHtml(p) { return tokens(p.text).map((w, i) => `<span class="rd-w" data-i="${i}" data-w="${esc(clean(w))}">${esc(w)}</span>`).join(' '); }
  const MODES = [['listen', '👂', 'Listen', 'きく'], ['read', '📖', 'Read', 'よむ'], ['aloud', '🎤', 'Read aloud', 'こえに だす'], ['quiz', '❓', 'Quiz', 'クイズ']];
  const stepDone = (b, m) => (m === 'aloud' ? !!b.steps.aloud : m === 'quiz' ? b.steps.quiz !== null && b.steps.quiz / b.quizCount >= 0.8 : !!b.steps[m]);

  function bookHtml() {
    const b = state.book;
    if (!b) return `<div class="rd-wait">${bi('Opening the book…', '本を ひらいています…')}</div>`;
    const tabs = MODES.map(([id, ic, en, ja]) => `<button type="button" class="rd-tab${state.mode === id ? ' on' : ''}${stepDone(b, id) ? ' ok' : ''}" data-mode="${id}"><span>${ic}</span>${bi(en, ja)}${stepDone(b, id) ? '<em>★</em>' : ''}</button>`).join('');
    const head = `<header class="rd-head book"><button type="button" class="rd-back" aria-label="back">←</button>
      <div class="rd-bt"><h2>${esc(b.title)}</h2><small>${esc(b.titleJa)}・${bi(`Level ${esc(b.stage)}`, `レベル ${esc(b.stage)}`)}</small></div>
      <nav class="rd-tabs">${tabs}</nav><button type="button" class="rd-x" aria-label="close">✕</button></header>`;
    if (state.mode === 'quiz') return head + quizHtml();
    if (state.aloud) return head + aloudResultHtml();
    const p = b.pages[state.page]; const last = state.page === b.pages.length - 1;
    const dots = b.pages.map((_, i) => `<i class="${i === state.page ? 'on' : i < state.page ? 'past' : ''}"></i>`).join('');
    const mic = state.mode === 'aloud'
      ? (Speech ? `<button type="button" class="rd-mic${state.listening ? ' live' : ''}" data-act="mic"><span>🎤</span>${state.listening ? bi('Listening… tap to stop', 'きいてるよ… おすと とまる') : bi('Tap and read aloud', 'おして こえに だして よもう')}</button>`
        : `<p class="rd-nomic">${bi('This device cannot hear you. Try Chrome or Safari.', 'この たんまつでは こえを きけないよ。Chrome か Safari で ためしてね。')}</p>`)
      : '';
    const hint = { listen: bi('Listen and follow the glowing words.', 'ひかる ことばを 目で おいながら きこう。'), read: bi('Read by yourself. Tap a word to hear it.', 'じぶんで よもう。ことばを おすと きこえるよ。'), aloud: bi('Read the page aloud. Words you say turn green.', 'こえに だして よもう。よめた ことばが みどりに なるよ。') }[state.mode];
    const nextLabel = last ? (state.mode === 'aloud' ? bi('Finish ✓', 'おわり ✓') : bi('Finish ✓', 'おわり ✓')) : bi('Next →', 'つぎへ →');
    return `${head}<div class="rd-spread" data-turn="0">
        <div class="rd-pic">${sceneHtml(p.scene)}<span class="rd-pageno">${state.page + 1} / ${b.pages.length}</span></div>
        <div class="rd-page">
          <p class="rd-hint">${hint}</p>
          <p class="rd-text s-${esc(b.stage)}">${textHtml(p)}</p>
          <p class="rd-ja"${state.showJa ? '' : ' hidden'}>${esc(p.ja)}</p>
          <div class="rd-pop" hidden></div>
          ${mic}
          <div class="rd-tools">
            <button type="button" class="rd-tool" data-act="again" aria-label="again">🔊 ${bi('Again', 'もう一度')}</button>
            <button type="button" class="rd-tool${state.slow ? ' on' : ''}" data-act="slow">🐢 ${bi('Slow', 'ゆっくり')}</button>
            <button type="button" class="rd-tool${state.showJa ? ' on' : ''}" data-act="ja">🇯🇵 ${bi('Meaning', 'いみ')}</button>
          </div>
        </div></div>
      <footer class="rd-foot"><button type="button" class="rd-nav" data-act="prev" ${state.page === 0 ? 'disabled' : ''}>${bi('← Back', '← もどる')}</button>
        <div class="rd-dots">${dots}</div><button type="button" class="rd-nav main" data-act="next">${nextLabel}</button></footer>`;
  }

  function quizHtml() {
    const b = state.book; const q = state.quiz;
    if (state.done) return doneHtml();
    if (!q) return `<div class="rd-wait">${bi('Getting the quiz…', 'クイズを よういしています…')}</div>`;
    const dots = Array.from({ length: q.of }, (_, i) => `<i class="${i + 1 === q.n ? 'on' : i + 1 < q.n ? (state.marks?.[i] ? 'ok' : 'ng') : ''}">${i + 1}</i>`).join('');
    const r = state.result;
    return `<div class="rd-quiz"><div class="rd-qdots">${dots}</div>
      <div class="rd-q"><button type="button" class="rd-say" data-say="${esc(q.q)}" aria-label="listen">🔊</button><div><p class="rd-qen">${esc(q.q)}</p><p class="rd-qja">${esc(q.ja)}</p></div></div>
      <div class="rd-choices">${q.choices.map((c, i) => {
        const cls = r ? (c === r.answer ? ' right' : c === state.picked ? ' wrong' : ' dim') : '';
        return `<div class="rd-choice${cls}"><button type="button" class="rd-say" data-say="${esc(c)}" aria-label="listen">🔊</button><button type="button" class="rd-pick" data-pick="${esc(c)}" ${r ? 'disabled' : ''}><b>${'ABCD'[i]}</b><span>${esc(c)}</span></button></div>`;
      }).join('')}</div>
      <div class="rd-qfoot">${r ? `<span class="rd-verdict ${r.correct ? 'ok' : 'ng'}">${r.correct ? bi('⭕ Correct!', '⭕ せいかい！') : bi('❌ The answer is shown in green.', '❌ みどりが こたえだよ。')}</span><button type="button" class="rd-nav main" data-act="qnext">${r.over ? bi('See result →', 'けっかを みる →') : bi('Next →', 'つぎへ →')}</button>` : `<span class="rd-verdict">${bi('Tap 🔊 to hear it. Pick one.', '🔊 で きける。1 つ えらぼう。')}</span>`}</div></div>`;
  }

  function doneHtml() {
    const d = state.done; const b = state.book;
    const stars = `<div class="rd-bigstars">${[0, 1, 2, 3].map((i) => `<span class="${i < d.stars ? 'on' : ''}" style="animation-delay:${i * 0.15}s">★</span>`).join('')}</div>`;
    const need = [];
    if (d.needs?.listen) need.push(`<button type="button" class="rd-nav" data-mode="listen">👂 ${bi('Listen', 'きく')}</button>`);
    if (d.needs?.read) need.push(`<button type="button" class="rd-nav" data-mode="read">📖 ${bi('Read', 'よむ')}</button>`);
    const msg = d.done ? bi('You finished this book!', 'この 本を よみおえたよ！') : d.passed ? bi('Quiz passed! Listen and read to finish the book.', 'クイズ ごうかく！ きく と よむ も やると 本が おわるよ。') : bi('Almost! Read it once more and try again.', 'おしい！ もう一度 よんでから ちょうせん しよう。');
    return `<div class="rd-done${d.done ? ' win' : ''}">${d.done ? '<div class="rd-confetti" aria-hidden="true">' + '🎉⭐📚✨🌟🎈⭐✨'.match(/./gu).map((e, i) => `<i style="left:${6 + i * 12}%;animation-delay:${(i % 4) * 0.25}s">${e}</i>`).join('') + '</div>' : ''}
      <div class="rd-donecard"><span class="rd-doneicon">${d.done ? '🏆' : d.passed ? '👍' : '💪'}</span><h3>${esc(b.title)}</h3>${stars}
        <p class="rd-score">${bi('Quiz', 'クイズ')} <b>${d.score} / ${d.of}</b></p><p class="rd-msg">${msg}</p>
        ${d.coins ? `<p class="rd-coin">◈ +${d.coins} ${bi('coins', 'コイン')}</p>` : d.capped ? `<p class="rd-coin dim">${bi("Today's coins are full. Come back tomorrow!", 'きょうの コインは いっぱい。あした また よもう！')}</p>` : ''}
        <div class="rd-doneacts">${need.join('')}${d.passed ? '' : `<button type="button" class="rd-nav" data-act="retry">❓ ${bi('Try the quiz again', 'クイズに もう一度')}</button>`}
          <button type="button" class="rd-nav main" data-act="shelf">📚 ${bi('Back to my bookshelf', 'ほんだなに もどる')}</button></div></div></div>`;
  }

  function aloudResultHtml() {
    const a = state.aloud; const pct = Math.round(a.acc * 100);
    return `<div class="rd-done"><div class="rd-donecard"><span class="rd-doneicon">🎤</span><h3>${bi('Read aloud', 'こえに だして よめたよ')}</h3>
      <div class="rd-ring" style="--p:${pct}"><b>${pct}<small>%</small></b><span>${bi('accuracy', 'せいかくさ')}</span></div>
      <p class="rd-score">${a.hit} / ${a.total} ${bi('words', 'ご')}・${a.wpm} ${bi('words a minute', 'ご / ふん')}</p>
      <p class="rd-msg">${a.good ? bi('Beautiful reading!', 'とても じょうずに よめたね！') : a.hit ? bi('Nice try! Listen once more and read again.', 'いいね！ もう一度 きいてから よんで みよう。') : bi("I couldn't hear you. Check the microphone.", 'こえが きこえなかったよ。マイクを たしかめてね。')}</p>
      <div class="rd-doneacts"><button type="button" class="rd-nav" data-act="aloud-again">🎤 ${bi('Read again', 'もう一度 よむ')}</button><button type="button" class="rd-nav main" data-mode="quiz">❓ ${bi('Go to the quiz', 'クイズへ')}</button></div></div></div>`;
  }

  // ---------------------------------------------------------------- 描く・つなぐ
  function paint() {
    root.dataset.view = state.view;
    root.innerHTML = state.view === 'shelf' ? shelfHtml() : bookHtml();
    root.querySelector('.rd-x')?.addEventListener('click', () => dialog.close());
    root.querySelector('.rd-back')?.addEventListener('click', toShelf);
    root.querySelectorAll('[data-book]').forEach((el) => { el.onclick = () => openBook(el.dataset.book); });
    root.querySelector('#rd-stage')?.addEventListener('change', (e) => { state.viewStage = e.target.value; send('read:shelf', { stage: state.viewStage }); });
    root.querySelectorAll('[data-mode]').forEach((el) => { el.onclick = () => setMode(el.dataset.mode); });
    root.querySelectorAll('[data-act]').forEach((el) => { el.onclick = () => act(el.dataset.act); });
    root.querySelectorAll('[data-say]').forEach((el) => { el.onclick = () => say(el.dataset.say); });
    root.querySelectorAll('[data-pick]').forEach((el) => { el.onclick = () => pick(el.dataset.pick); });
    root.querySelectorAll('.rd-w').forEach((el) => { el.onclick = () => tapWord(el); });
    if (state.view === 'book' && state.mode === 'aloud' && !state.aloud) markHeard();
  }

  function toShelf() { quiet(); state.view = 'shelf'; state.book = null; state.quiz = null; state.done = null; state.aloud = null; paint(); send('read:shelf', state.viewStage ? { stage: state.viewStage } : {}); }
  function openBook(id) { quiet(); state.view = 'book'; state.book = null; state.mode = 'listen'; state.page = 0; state.reached = 0; state.quiz = null; state.done = null; state.aloud = null; state.result = null; state.heard = []; paint(); send('read:open', { id }); }

  function setMode(mode) {
    quiet();
    state.mode = mode; state.page = 0; state.reached = 0; state.aloud = null; state.done = null; state.result = null; state.picked = null; state.heard = [];
    if (mode === 'quiz') { state.quiz = null; state.marks = []; send('read:quiz', { id: state.book.id }); }
    paint();
    if (mode === 'listen') playPage();
  }

  // きく：その ページを 読み上げ、再生の 時間に あわせて ことばを 光らせる。おわったら つぎの ページへ。
  function playPage({ auto = true } = {}) {
    const b = state.book; if (!b) return;
    const p = b.pages[state.page]; const page = state.page;
    const spans = [...root.querySelectorAll('.rd-w')];
    const toks = tokens(p.text);
    const weight = toks.map((w) => clean(w).length + 2 + (/[.!?]["']?$/.test(w) ? 5 : /[,;:]$/.test(w) ? 3 : 0));
    const total = weight.reduce((s, n) => s + n, 0) || 1;
    const edges = []; let acc = 0; for (const w of weight) { acc += w; edges.push(acc / total); }
    const light = (u) => { const k = edges.findIndex((e) => u < e); spans.forEach((el, i) => el.classList.toggle('lit', i === (k < 0 ? spans.length - 1 : k))); };
    const finish = () => {
      if (state.view !== 'book' || state.page !== page || state.mode !== 'listen') return;
      state.playing = false; cancelAnimationFrame(raf); spans.forEach((el) => el.classList.remove('lit'));
      if (!auto) return;
      turnTimer = setTimeout(() => { if (state.mode === 'listen' && state.page === page) act('next', { auto: true }); }, 650);
    };
    quiet(); state.playing = true;
    const byClock = (seconds) => { const t0 = performance.now(); const tick = () => { const u = (performance.now() - t0) / (seconds * 1000); if (u >= 1) { finish(); return; } light(u); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); };
    playVoice(p.text, { japanese: false, slow: state.slow,
      onstart: (audio) => { const tick = () => { if (!state.playing) return; const d = audio.duration; if (d > 0) light(Math.min(0.999, audio.currentTime / d)); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); },
      onend: finish,
      // サーバーの 声が ない とき：端末の 声で 読み、時間は 語数から みつもる。
      fallback: () => { speak?.(p.text, { japanese: false, slow: state.slow }); byClock(Math.max(1.2, toks.length * (state.slow ? 0.62 : 0.44))); } });
  }

  function tapWord(el) {
    if (state.mode === 'listen' && state.playing) return;
    const w = el.dataset.w; if (!w) return;
    say(el.textContent.replace(/[^A-Za-z0-9'’ -]/g, ''));
    root.querySelectorAll('.rd-w.tap').forEach((x) => x.classList.remove('tap')); el.classList.add('tap');
    const g = state.book.glossary.find((x) => clean(x.en) === w || clean(x.en).split(' ').includes(w));
    const pop = root.querySelector('.rd-pop');
    if (pop) { pop.hidden = !g; if (g) pop.innerHTML = `<b>${esc(g.en)}</b><span>${esc(g.ja)}</span>`; }
  }

  function turn(to) {
    const spread = root.querySelector('.rd-spread');
    state.page = to; state.reached = Math.max(state.reached, to);
    if (spread) spread.dataset.turn = '1';
    paint();
    if (state.mode === 'listen') playPage();
  }

  function act(kind, { auto = false } = {}) {
    const b = state.book;
    if (kind === 'shelf') return toShelf();
    if (kind === 'retry') return setMode('quiz');
    if (kind === 'aloud-again') return setMode('aloud');
    if (kind === 'qnext') { if (state.result?.over) { state.done = state.pendingDone; state.result = null; paint(); } else { state.quiz = state.result.next; state.result = null; state.picked = null; paint(); } return; }
    if (!b) return;
    if (kind === 'again') { if (state.mode === 'listen') playPage({ auto: false }); else say(b.pages[state.page].text, { slow: state.slow }); return; }
    if (kind === 'slow') { state.slow = !state.slow; paint(); if (state.mode === 'listen') playPage(); return; }
    if (kind === 'ja') { state.showJa = !state.showJa; root.querySelector('.rd-ja').hidden = !state.showJa; root.querySelector('[data-act="ja"]').classList.toggle('on', state.showJa); return; }
    if (kind === 'mic') return state.listening ? stopMic() : startMic();
    if (kind === 'prev') { if (state.page > 0) { quiet(); turn(state.page - 1); } return; }
    if (kind === 'next') {
      if (!auto) quiet();
      if (state.mode === 'aloud') stopMic();
      if (state.page < b.pages.length - 1) { turn(state.page + 1); return; }
      // さいごの ページ：その モードを おえた。
      if (state.mode === 'listen' || state.mode === 'read') { send('read:step', { id: b.id, step: state.mode }); setMode(state.mode === 'listen' ? 'read' : (Speech ? 'aloud' : 'quiz')); toast(state.mode === 'read' ? L('★ Listened! Now read it yourself.', '★ きけたね！ つぎは じぶんで よもう。') : L('★ Read! Next step.', '★ よめたね！ つぎへ。')); return; }
      if (state.mode === 'aloud') { const seconds = (performance.now() - (state.aloudStart || performance.now())) / 1000; send('read:aloud', { id: b.id, heard: b.pages.map((_, i) => state.heard[i] || ''), seconds }); root.querySelector('.rd-foot .main').disabled = true; }
    }
  }

  // おんどく：この ページを 声に 出して 読む。聞きとった 文字を ためて、さいごに 部屋へ 送る（判定は 部屋）。
  function startMic() {
    if (!Speech || state.listening) return;
    quiet();
    try {
      rec = new Speech(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
      const page = state.page; const base = state.heard[page] || '';
      if (!state.aloudStart) state.aloudStart = performance.now();
      rec.onresult = (e) => { let text = ''; for (let i = 0; i < e.results.length; i += 1) text += ` ${e.results[i][0].transcript}`; state.heard[page] = `${base} ${text}`.trim(); if (state.page === page) markHeard(); };
      rec.onend = () => { state.listening = false; rec = null; if (state.view === 'book' && state.mode === 'aloud' && !state.aloud) { const m = root.querySelector('.rd-mic'); if (m) { m.classList.remove('live'); m.innerHTML = `<span>🎤</span>${bi('Tap and read aloud', 'おして こえに だして よもう')}`; } } };
      rec.onerror = () => { /* onend が 片づける */ };
      rec.start(); state.listening = true;
      const m = root.querySelector('.rd-mic'); if (m) { m.classList.add('live'); m.innerHTML = `<span>🎤</span>${bi('Listening… tap to stop', 'きいてるよ… おすと とまる')}`; }
    } catch { state.listening = false; toast(L('The microphone could not start.', 'マイクを つかえませんでした。')); }
  }
  function stopMic() { try { rec?.stop(); } catch { /* */ } state.listening = false; }
  // 聞きとった 語を 本文と 順に てらして、読めた 語を 緑に（見た目だけ。点は 部屋が つける）。
  function markHeard() {
    const got = String(state.heard[state.page] || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
    let from = 0;
    root.querySelectorAll('.rd-w').forEach((el) => { const at = got.indexOf(el.dataset.w, from); const ok = at >= 0 && at - from <= 4; if (ok) from = at + 1; el.classList.toggle('said', ok); });
  }

  function pick(choice) { if (state.result) return; state.picked = choice; root.querySelectorAll('.rd-pick').forEach((b) => { b.disabled = true; }); send('read:answer', { id: state.book.id, choice }); }

  // ---------------------------------------------------------------- 部屋から
  function handle(type, m = {}) {
    if (type === 'read:shelf') { state.shelf = m; if (state.view === 'shelf' && dialog.open) paint(); return; }
    if (type === 'read:error') { toast(m.reason === 'not on your shelf' ? L('That book is not on your shelf yet.', 'その 本は まだ ほんだなに ないよ。') : L('Could not open the book.', '本を ひらけませんでした。')); if (state.view === 'book' && !state.book) toShelf(); return; }
    if (!dialog.open) return;
    if (type === 'read:book') { state.book = m; state.view = 'book'; state.mode = 'listen'; state.page = 0; paint(); playPage(); return; }
    if (type === 'read:progress') { if (state.book?.id === m.id && m.book) { state.book = m.book; if (m.firstDone) toast(L(`Book finished! ◈ +${m.coins}`, `1 さつ よめた！ ◈ +${m.coins}`)); root.querySelectorAll('.rd-tab').forEach((el) => { el.classList.toggle('ok', stepDone(state.book, el.dataset.mode)); }); } return; }
    if (type === 'read:aloud') { if (state.book?.id === m.id) { if (m.book) state.book = m.book; state.aloud = m; state.aloudStart = 0; paint(); } return; }
    if (type === 'read:ask') { if (state.book?.id === m.id) { state.quiz = m; state.result = null; state.picked = null; state.marks = []; paint(); say(m.q); } return; }
    if (type === 'read:result') { if (state.book?.id !== m.id) return; (state.marks ||= []).push(!!m.correct); state.result = m; if (m.book) state.book = m.book; state.pendingDone = m.done || null; paint(); }
  }

  function open() {
    if (!isOnline()) { toast(L('Join your class to read books.', 'クラスに 入ると 本が よめるよ。')); return false; }
    state.view = 'shelf'; state.book = null; state.shelf = null;
    if (!dialog.open) dialog.showModal();
    paint(); send('read:shelf', state.viewStage ? { stage: state.viewStage } : {});
    return true;
  }
  onLangChange(() => { if (dialog.open && !state.result && !state.playing) paint(); });
  return { open, handle, close: () => dialog.close(), get isOpen() { return dialog.open; }, state };
}
