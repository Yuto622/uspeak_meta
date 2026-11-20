// 「ABC と おと」— 幼児モードの ホームの カードから ひらく がめん（`#abc-dialog`）。
//
// ・1 がめん 1 もん・おすだけ。てがきも はつおんの はんていも ない。**正解・すすみ・記録は 部屋**（server/src/game/abc.js）。
//   ページは 選択肢を 出して、えらんだ ものを 送るだけ（答えは へんじで はじめて とどく）。
// ・こどもに 見せる 文字は ひらがな＋えいご＋アイコンだけ（かんじ・カタカナの ことばを 入れない。検査が 見て いる）。
// ・**ぜんぶの 文に 🔊**：もんだい・えらぶ もの・ボタンの なまえ・せつめい・うた。
// ・声：アメリカしきは いつもの 声（speech.js の playVoice）。イギリスしきは たんまつの イギリスの 声（なければ いつもの 声）。
//   **もじの「おと」（フォニックス）は 音の ファイル**（phonics-play.js・/phonics/<id>）。合成の 声は おと 1 つだけを 正しく 言えないため。
//   もじ → なまえ（声）・おと（ファイル）・ことば（声）。つなげて よむ もんだいは おとを 1 つずつ → つなげて（blendSounds）。
// ・え は サーバーが かく（/abc-art/…）。うたは abc-chant.js（はくの 音＋声）。
import { isJa } from './i18n.js';
import { playVoice, stopVoice } from './speech.js';
import { playChant, stopChant } from './abc-chant.js';
import { letterSound } from './phonics.js';
import { playSounds, blendSounds, stopSounds, preloadSounds, setPhonicsVersion } from './phonics-play.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (en, ja) => (isJa() ? ja : en);

export function createAbcUI({ send, toast = () => {}, speak = null, isOnline = () => true, openShelf = null }) {
  const state = { view: 'home', st: null, q: null, result: null, summary: null, picked: null, row: [], artV: 1, waiting: false, chanting: -1 };

  const dialog = document.createElement('dialog');
  dialog.id = 'abc-dialog';
  dialog.innerHTML = '<div class="ab-root" translate="no"></div>';
  document.body.append(dialog);
  const root = dialog.firstElementChild;
  let seqToken = 0;
  const quiet = () => { seqToken += 1; try { stopChant(); } catch { /* */ } try { stopSounds(); } catch { /* */ } try { stopVoice(); } catch { /* */ } try { globalThis.speechSynthesis?.cancel(); } catch { /* */ } state.chanting = -1; };
  dialog.addEventListener('close', quiet);
  dialog.addEventListener('cancel', (e) => { if (state.view !== 'home') { e.preventDefault(); toHome(); } });

  // ---- 声 ----
  const accent = () => (state.st?.accent === 'uk' ? 'uk' : 'us');
  function sayEn(text, { slow = false } = {}) {
    quiet();
    const t = String(text || ''); if (!t) return;
    if (accent() === 'uk') {
      // イギリスしき：たんまつの イギリスの 声が あれば それで。なければ いつもの 声。
      try {
        const synth = globalThis.speechSynthesis; const v = synth?.getVoices?.().find((x) => /^en[-_]GB/i.test(x.lang));
        if (v) { const u = new SpeechSynthesisUtterance(t); u.voice = v; u.lang = 'en-GB'; u.rate = slow ? 0.6 : 0.85; synth.speak(u); return; }
      } catch { /* いつもの 声へ */ }
    }
    playVoice(t, { japanese: false, slow, fallback: () => speak?.(t, { japanese: false, slow }) });
  }
  function sayJa(text) { quiet(); const t = String(text || ''); if (t) playVoice(t, { japanese: true, fallback: () => speak?.(t, { japanese: true }) }); }
  // がめんの 文（にほんご／えいご）を 読む。
  const sayText = (en, ja) => (isJa() ? sayJa(ja) : sayEn(en));
  // 声 1 つ（おわったら resolve。おわりが 知らされない 端末でも 止まらない ように 時間でも すすむ）。
  const say1 = (text, { slow = false } = {}) => new Promise((resolve) => {
    let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
    const t = setTimeout(fin, 1400 + String(text).length * 110);
    const end = () => { clearTimeout(t); setTimeout(fin, 120); };
    try {
      if (accent() === 'uk') {
        const synth = globalThis.speechSynthesis; const v = synth?.getVoices?.().find((x) => /^en[-_]GB/i.test(x.lang));
        if (v) { const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = 'en-GB'; u.rate = slow ? 0.6 : 0.85; u.onend = end; u.onerror = end; synth.speak(u); return; }
      }
      playVoice(text, { japanese: false, slow, onend: end, fallback: () => speak?.(text, { japanese: false, slow }) });
    } catch { end(); }
  });
  // 声と おとを じゅんばんに（{say}・{snd:[…], gap}・{blend:[…]}・{wait}）。ほかの 音が はじまったら とまる。
  async function seq(steps) {
    quiet(); const me = seqToken;
    for (const st of steps) {
      if (me !== seqToken) return;
      try {
        if (st.say) await say1(st.say, st);
        else if (st.snd) await playSounds(st.snd, { gap: st.gap ?? 0.3, onStep: st.onStep });
        else if (st.blend) await blendSounds(st.blend, { onStep: st.onStep });
        else if (st.wait) await new Promise((r) => setTimeout(r, st.wait));
      } catch { /* つぎへ */ }
    }
  }
  // もじ 1 つの「おと」を 2 かい（"sss… sss"）。
  const sayLetterSound = (l) => { const id = letterSound(l); if (id) seq([{ snd: [id, id], gap: 0.35 }]); else sayEn(upper(l)); };
  // つみき（つづりの かたまり）を 1 つずつ 光らせて 鳴らす。
  const lightPart = (i) => root.querySelectorAll('.ab-parts .ab-part').forEach((el, k) => el.classList.toggle('on', i === 'all' ? !el.classList.contains('silent') : k === i));
  const blendIt = (sounds, then = []) => seq([{ blend: sounds, onStep: lightPart }, ...then]);

  // ---- ぶひん ----
  const art = { letter: (l, c) => `/abc-art/letter/${encodeURIComponent(l)}.svg?case=${c || state.st?.caseFirst || 'both'}&v=${state.artV}`, word: (w) => `/abc-art/word/${encodeURIComponent(w)}.svg?v=${state.artV}`, cover: () => `/abc-art/cover.svg?v=${state.artV}` };
  const img = (src, cls = '') => `<img class="ab-img ${cls}" src="${esc(src)}" alt="" draggable="false" decoding="async">`;
  // 文＋🔊（ぜんぶの 文に つける）。
  const text = (en, ja, cls = '') => `<span class="ab-t ${cls}"><button type="button" class="ab-say" data-en="${esc(en)}" data-ja="${esc(ja)}" aria-label="${esc(L('Listen', 'きく'))}">🔊</button><span>${esc(L(en, ja))}</span></span>`;
  // ボタン＋その なまえを 読む 🔊。
  const btn = (act, en, ja, { cls = '', icon = '', disabled = false } = {}) => `<span class="ab-btnwrap"><button type="button" class="ab-btn ${cls}" data-act="${act}"${disabled ? ' disabled' : ''}>${icon ? `<span aria-hidden="true">${icon}</span>` : ''}<b>${esc(L(en, ja))}</b></button><button type="button" class="ab-say sm" data-en="${esc(en)}" data-ja="${esc(ja)}" aria-label="${esc(L('Listen', 'きく'))}">🔊</button></span>`;
  const upper = (l) => String(l).toUpperCase();
  const shown = (l) => { const c = state.st?.caseFirst || 'both'; return c === 'upper' ? upper(l) : c === 'lower' ? l : `${upper(l)}${l}`; };
  const spellOut = (w) => String(w).toUpperCase().split('').join(', ');

  function head() {
    const st = state.st; let bar = '';
    if (st?.placed && st.track === 'kinder') {
      bar = `<div class="ab-bar az" role="img" aria-label="${st.lettersDone} / 26">${st.letters.map((x) => `<i class="${x.done ? 'on' : ''}${st.next?.letter === x.l ? ' now' : ''}">${esc(upper(x.l))}</i>`).join('')}</div>`;
    } else if (st?.placed) {
      bar = `<div class="ab-bar rules" role="img" aria-label="${st.rulesDone} / ${st.rulesTotal}"><b>${esc(L(`I can read ${st.rulesDone} rules`, `よめる きまり ${st.rulesDone} こ`))}</b><span>${st.rules.map((x) => `<i class="${x.done ? 'on' : ''}${st.next?.unit === x.id ? ' now' : ''}"></i>`).join('')}</span></div>`;
    }
    return `<header class="ab-head"><button type="button" class="ab-x" data-act="${state.view === 'home' ? 'close' : 'home'}" aria-label="${esc(L('Back', 'もどる'))}">${state.view === 'home' ? '✕' : '←'}</button>
      <h2>${esc(L('ABC and Sounds', 'ABC と おと'))}</h2>${bar}</header>`;
  }

  // ---- はじめの がめん ----
  function homeHtml() {
    const st = state.st;
    if (!st) return `${head()}<div class="ab-wait">${text('Getting ready…', 'よういして いるよ…')}</div>`;
    if (!st.ready) return `${head()}<div class="ab-wait">${text('Not ready yet. Please tell your teacher.', 'まだ つかえないよ。せんせいに きいてね。')}</div>`;
    const nx = st.next || {};
    let what; let go = btn('start', 'Start', 'はじめる', { cls: 'main', icon: '▶' });
    if (nx.type === 'place') what = text('First, a few questions to find where you start.', 'はじめに すこし きくよ。どこから はじめるか きめるね。');
    else if (nx.type === 'letter') what = `<div class="ab-nextcard">${img(art.letter(nx.letter))}</div>${text(`Today's letter is ${upper(nx.letter)}.`, `きょうの もじは ${upper(nx.letter)}。`)}`;
    else if (nx.type === 'unit') what = `<div class="ab-nextrule"><b>${esc(nx.kind === 'spell' ? 'a b c' : nx.label)}</b></div>${nx.kind === 'spell' ? text('Put the letter blocks in order and make words.', 'もじの つみきを ならべて、ことばを つくろう。') : nx.kind === 'cvc' ? text('Put three sounds together and read.', 'みっつの おとを つなげて よもう。') : nx.kind === 'digraph' ? text('Two letters make one sound.', 'ふたつの もじで ひとつの おと。') : text('The last e changes the sound.', 'さいごの e で おとが かわるよ。')}`;
    else { what = `${text('You did it all! Now read books on the bookshelf.', 'ぜんぶ できたね！ ほんだなで ほんを よもう。')}`; go = btn('shelf', 'Go to my bookshelf', 'ほんだなへ', { cls: 'main', icon: '📚' }); }
    const review = st.weak > 0 ? btn('review', 'Practice my hard ones', 'にがてを まとめて ふくしゅう', { icon: '💪' }) : '';
    const count = st.placed ? (st.track === 'kinder' ? text(`Letters I know: ${st.lettersDone} of 26`, `おぼえた もじ ${st.lettersDone} / 26`, 'count') : text(`Rules I can read: ${st.rulesDone}`, `よめる きまり ${st.rulesDone} こ`, 'count')) : '';
    return `${head()}<div class="ab-home"><div class="ab-cover">${img(art.cover())}</div><div class="ab-homebody">${count}<div class="ab-what">${what}</div><div class="ab-acts">${go}${review}</div></div></div>`;
  }

  // ---- 1 もん ----
  const PROMPT = {
    show: ['Look and listen.', 'みて、きいて みよう。'],
    chant: ['Sing the little song.', 'みじかい うたを うたおう。'],
    name: ['Listen. Which letter is it?', 'きいてね。どの もじかな？'],
    sound: ['Listen. Which letter does it start with?', 'きいてね。どの もじで はじまる？'],
    soundEnd: ['Listen. Which letter does it end with?', 'きいてね。どの もじで おわる？'],
    picture: ['Which picture starts with this sound?', 'おなじ おとで はじまる えは どれ？'],
    pictureEnd: ['Which picture ends with this sound?', 'おなじ おとで おわる えは どれ？'],
    rule: ['Look and listen to the rule.', 'きまりを みて、きいて みよう。'],
    blend: ['Put the sounds together. Which picture is it?', 'おとを つなげて よもう。どの え かな？'],
    pair: ['Listen. Which two letters make the sound?', 'きいてね。どの ふたつの もじの おと？'],
    word: ['Listen. Which spelling is right?', 'きいてね。ただしい つづりは どれ？'],
    spell: ['Put the blocks in order to make the word.', 'もじの つみきを ならべて、ことばを つくろう。'],
  };
  const tiles = (parts, sounds = []) => `<div class="ab-parts">${parts.map((p, i) => (sounds[i] ? `<button type="button" class="ab-part" data-snd="${esc(sounds[i])}">${esc(p)}</button>` : `<b class="ab-part${sounds.length ? ' silent' : ''}">${esc(p)}</b>`)).join('<i>·</i>')}</div>`;
  // 「つなげて きく」の ボタン（おとを 1 つずつ → つなげて）。
  const blendBtn = (sounds) => (sounds?.length ? `<button type="button" class="ab-blend" data-blend="${esc(sounds.map((x) => x || '').join(','))}">🔉 <b>${esc(L('Blend', 'つなげて きく'))}</b></button>` : '');
  // もじの「おと」の ボタン。
  const soundBtn = (l) => (letterSound(l) ? `<button type="button" class="ab-snd" data-lsound="${esc(l)}">🔉 <b>${esc(L('Sound', 'おと'))}</b></button>` : '');
  const hear = (enText, { big = true } = {}) => `<button type="button" class="ab-hear${big ? ' big' : ''}" data-hear="${esc(enText)}" aria-label="${esc(L('Listen', 'きく'))}">🔊</button>`;

  function choiceHtml(q, c, i) {
    const r = state.result; const isAnswer = r && c === r.answer; const mine = c === state.picked;
    const cls = r ? (isAnswer ? ' right' : mine ? ' wrong' : ' dim') : '';
    let inner; let sayIt;
    let lsnd = '';
    if (q.kind === 'name') { inner = img(art.letter(c), 'letter'); sayIt = upper(c); }
    else if (q.kind === 'sound') { inner = img(art.letter(c), 'letter'); sayIt = upper(c); lsnd = c; }
    else if (q.kind === 'picture' || q.kind === 'blend') { inner = img(art.word(c), 'pic'); sayIt = c; }
    else if (q.kind === 'pair') { inner = `<b class="ab-big">${esc(c)}</b>`; sayIt = spellOut(c); lsnd = c; }
    else { inner = `<b class="ab-big word">${esc(c)}</b>`; sayIt = spellOut(c); }
    return `<div class="ab-choice${cls}"><button type="button" class="ab-pick" data-pick="${esc(c)}" ${r || state.waiting ? 'disabled' : ''} aria-label="${'ABC'[i] || ''}">${inner}</button>${lsnd && letterSound(lsnd) ? `<button type="button" class="ab-say sm" data-lsound="${esc(lsnd)}" aria-label="${esc(L('Sound', 'おと'))}">🔉</button>` : `<button type="button" class="ab-say sm" data-hear="${esc(sayIt)}" aria-label="${esc(L('Listen', 'きく'))}">🔊</button>`}</div>`;
  }

  function questionHtml() {
    const q = state.q; const r = state.result;
    if (!q) return `${head()}<div class="ab-wait">${text('Getting ready…', 'よういして いるよ…')}</div>`;
    const end = q.end && (q.kind === 'sound' || q.kind === 'picture');
    const [pe, pj] = PROMPT[end ? `${q.kind}End` : q.kind] || PROMPT.show;
    const dots = `<div class="ab-dots">${Array.from({ length: q.of }, (_, i) => `<i class="${i + 1 === q.n ? 'on' : i + 1 < q.n ? 'past' : ''}"></i>`).join('')}</div>`;
    let stage = ''; let foot = '';
    if (q.kind === 'show') {
      stage = `<div class="ab-show"><div class="ab-card">${img(art.letter(q.letter), 'letter')}<div class="ab-hears"><button type="button" class="ab-snd name" data-hear="${esc(upper(q.letter))}">🔊 <b>${esc(L('Name', 'なまえ'))}</b></button>${soundBtn(q.letter)}</div></div><div class="ab-card">${img(art.word(q.word), 'pic')}<b class="ab-word">${esc(q.word)}</b>${hear(q.word)}</div></div>`;
      foot = btn('seen', 'Next', 'つぎへ', { cls: 'main', icon: '→' });
    } else if (q.kind === 'chant') {
      stage = `<div class="ab-chant">${q.lines.map((ln, i) => `<div class="ab-line${state.chanting === i ? ' on' : ''}" data-line="${i}">${img(art.word(ln.word), 'pic')}<b>${esc(ln.parts ? ln.parts.join(' · ') : ln.text)}</b>${ln.parts ? `<em>${esc(ln.word)}</em>` : ''}${hear(ln.text, { big: false })}</div>`).join('')}</div>`;
      foot = `${btn('sing', 'Play the song', 'うたを きく', { icon: '🎵' })}${btn('seen', 'Next', 'つぎへ', { cls: 'main', icon: '→' })}`;
    } else if (q.kind === 'rule') {
      stage = `<div class="ab-show"><div class="ab-card rule"><b class="ab-rule">${esc(q.rule)}</b>${tiles(q.parts, q.sounds)}${blendBtn(q.sounds)}</div><div class="ab-card">${img(art.word(q.word), 'pic')}<b class="ab-word">${esc(q.word)}</b>${hear(q.word)}</div></div>`;
      foot = btn('seen', 'Next', 'つぎへ', { cls: 'main', icon: '→' });
    } else if (q.kind === 'spell') {
      const left = q.blocks.filter((b) => !state.row.includes(b.id));
      const rowBlocks = state.row.map((id) => q.blocks.find((b) => b.id === id)).filter(Boolean);
      const slots = q.blocks.map((_, i) => (rowBlocks[i] ? `<button type="button" class="ab-block in${r ? (r.correct ? ' right' : ' wrong') : ''}" data-out="${esc(rowBlocks[i].id)}" ${r ? 'disabled' : ''}>${esc(rowBlocks[i].t)}</button>` : '<i class="ab-slot"></i>')).join('');
      stage = `<div class="ab-spell"><div class="ab-ask">${img(art.word(q.word), 'pic')}${hear(q.say)}</div>
        <div class="ab-row">${slots}</div>
        ${r && !r.correct && r.parts ? `<div class="ab-row answer">${r.parts.map((p) => `<b class="ab-block right">${esc(p)}</b>`).join('')}</div>` : ''}
        <div class="ab-tray">${left.map((b) => `<button type="button" class="ab-block" data-in="${esc(b.id)}" data-s="${esc(b.s || '')}" ${r || state.waiting ? 'disabled' : ''}>${esc(b.t)}</button>`).join('')}</div></div>`;
      if (!r) foot = btn('spell', 'Done', 'できた', { cls: 'main', icon: '✓', disabled: state.row.length !== q.blocks.length || state.waiting });
    } else {
      const top = q.kind === 'name' ? hear(q.say)
        : q.kind === 'sound' ? `<div class="ab-ask">${img(art.word(q.say), 'pic')}${hear(q.say)}</div>`
          : q.kind === 'picture' ? `<div class="ab-ask">${img(art.letter(q.letter), 'letter')}${soundBtn(q.letter) || hear(upper(q.letter))}</div>`
            : q.kind === 'blend' ? `<div class="ab-ask">${tiles(q.parts, q.sounds)}${blendBtn(q.sounds)}</div>`
              : `<div class="ab-ask">${img(art.word(q.word), 'pic')}${hear(q.say)}</div>`;
      stage = `<div class="ab-q">${top}<div class="ab-choices n${q.choices.length}">${q.choices.map((c, i) => choiceHtml(q, c, i)).join('')}</div></div>`;
    }
    if (r && !q.teach) {
      const verdict = r.correct ? text('Correct!', 'せいかい！', 'ok') : text('The green one is the answer.', 'みどりが こたえだよ。', 'ng');
      foot = `${verdict}${btn('next', r.over ? 'See how I did' : 'Next', r.over ? 'けっかを みる' : 'つぎへ', { cls: 'main', icon: '→' })}`;
    }
    return `${head()}<div class="ab-play">${dots}<div class="ab-prompt">${text(pe, pj)}</div>${stage}<footer class="ab-foot">${foot}</footer></div>`;
  }

  // ---- おわり ----
  function summaryHtml() {
    const s = state.summary; const st = state.st; if (!s) return homeHtml();
    let msg; let icon = '👍';
    if (s.mode === 'place') { icon = '🌱'; msg = s.placed?.track === 'elem' ? text('You know your letters! Let us read words.', 'もじは しって いるね！ ことばを よもう。') : text('Good. Let us start with letters.', 'いいね。もじから はじめよう。'); }
    else if (s.advanced?.finished) { icon = '🏆'; msg = text('You did it all! Now read books on the bookshelf.', 'ぜんぶ できたね！ ほんだなで ほんを よもう。'); }
    else if (s.advanced?.letter) { icon = '⭐'; msg = text(`You learned ${upper(s.advanced.letter)}!`, `${upper(s.advanced.letter)} を おぼえたよ！`); }
    else if (s.advanced?.unit) { icon = '⭐'; msg = text('You can read a new rule!', 'あたらしい きまりが よめたよ！'); }
    else if (s.mode === 'review') { icon = '💪'; msg = text('Nice practice!', 'よく れんしゅう したね！'); }
    else msg = text('Almost! Try it one more time.', 'おしい！ もう いちど やって みよう。');
    const score = s.of ? `<p class="ab-score">${text(`${s.right} of ${s.of}`, `${s.of} もん ちゅう ${s.right} もん せいかい`)}</p>` : '';
    const more = st?.finished ? btn('shelf', 'Go to my bookshelf', 'ほんだなへ', { cls: 'main', icon: '📚' }) : btn('start', 'Keep going', 'つづける', { cls: 'main', icon: '▶' });
    return `${head()}<div class="ab-sum"><span class="ab-sumicon" aria-hidden="true">${icon}</span><div class="ab-summsg">${msg}</div>${score}<div class="ab-acts">${more}${btn('home', 'Stop for now', 'おわる', { icon: '🏠' })}</div></div>`;
  }

  function paint() {
    root.innerHTML = state.view === 'play' ? questionHtml() : state.view === 'summary' ? summaryHtml() : homeHtml();
    root.querySelectorAll('.ab-say').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); if (el.dataset.hear !== undefined) sayEn(el.dataset.hear); else sayText(el.dataset.en, el.dataset.ja); }; });
    root.querySelectorAll('.ab-hear, .ab-snd[data-hear]').forEach((el) => { el.onclick = () => sayEn(el.dataset.hear); });
    root.querySelectorAll('[data-act]').forEach((el) => { el.onclick = () => act(el.dataset.act); });
    root.querySelectorAll('[data-pick]').forEach((el) => { el.onclick = () => pick(el.dataset.pick); });
    root.querySelectorAll('[data-in]').forEach((el) => { el.onclick = () => { const snd = el.dataset.s; state.row.push(el.dataset.in); paint(); if (snd) seq([{ snd: [snd] }]); }; });
    root.querySelectorAll('[data-lsound]').forEach((el) => { el.onclick = (e) => { e.stopPropagation(); sayLetterSound(el.dataset.lsound); }; });
    root.querySelectorAll('.ab-part[data-snd]').forEach((el) => { el.onclick = () => { const all = [...root.querySelectorAll('.ab-parts .ab-part')]; const i = all.indexOf(el); seq([{ snd: [el.dataset.snd], onStep: (k) => lightPart(k < 0 ? -1 : i) }]); }; });
    root.querySelectorAll('[data-blend]').forEach((el) => { el.onclick = () => blendIt(el.dataset.blend.split(',').map((x) => x || null)); });
    root.querySelectorAll('[data-out]').forEach((el) => { el.onclick = () => { state.row = state.row.filter((id) => id !== el.dataset.out); paint(); }; });
    root.querySelectorAll('img.ab-img').forEach((el) => { el.onerror = () => { el.style.visibility = 'hidden'; }; });
  }

  // 1 もんが 出た とき：もんだいを こえで きかせる（きく もんだいは きく ことばを）。
  function introduce(q) {
    if (!q) return;
    preloadSounds([...(q.sounds || []), ...(q.blocks || []).map((b) => b.s), q.sound, ...((q.choices || []).map((c) => letterSound(c)))]);
    const ls = q.letter ? letterSound(q.letter) : null;
    if (q.kind === 'name' || q.kind === 'sound' || q.kind === 'pair' || q.kind === 'word' || q.kind === 'spell') sayEn(q.say);
    // もじ：なまえ → おと 2 かい → ことば（"S … sss sss … sun"）。
    else if (q.kind === 'show') seq([{ say: `${upper(q.letter)}.` }, ...(ls ? [{ snd: [ls, ls], gap: 0.35 }] : []), { say: `${q.word}.` }]);
    // きまり：おとを つなげて → ことば。
    else if (q.kind === 'rule') blendIt(q.sounds || [], [{ say: q.word }]);
    else if (q.kind === 'blend') { const [pe, pj] = PROMPT.blend; seq([isJa() ? { wait: 1 } : { say: pe }, { blend: q.sounds || [], onStep: lightPart }]); }
    else if (q.kind === 'picture' && ls) { const [pe, pj] = PROMPT[q.end ? 'pictureEnd' : 'picture']; if (isJa()) { sayJa(pj); setTimeout(() => sayLetterSound(q.letter), 2200); } else seq([{ say: pe }, { snd: [ls, ls], gap: 0.35 }]); }
    else if (q.kind === 'chant') sing();
    else { const end = q.end && q.kind === 'picture'; const [pe, pj] = PROMPT[end ? 'pictureEnd' : q.kind]; sayText(pe, pj); }
  }
  function sing() {
    const q = state.q; if (!q?.lines) return;
    quiet();
    const mark = (i) => { state.chanting = i; root.querySelectorAll('.ab-line').forEach((el) => el.classList.toggle('on', Number(el.dataset.line) === i)); };
    // もじの うた＝なまえ・おと・おと・ことば（"S, sss sss, sun"）。きまりの うた＝おとを つなげて・ことば。
    const steps = (ln) => (ln.sound ? [{ say: `${ln.name}.` }, { snd: [ln.sound, ln.sound], gap: 0.25 }, { say: ln.word }] : ln.sounds ? [{ snd: ln.sounds, gap: 0.12 }, { say: ln.word }] : null);
    try { playChant(q.lines.map((ln) => ({ text: ln.text, steps: steps(ln) })), { accent: accent(), slow: false, onLine: (i) => mark(i), onEnd: () => mark(-1) }); } catch { /* うたが 出なくても つぎへ すすめる */ }
  }

  function toHome() { quiet(); state.view = 'home'; state.q = null; state.result = null; state.summary = null; state.row = []; state.waiting = false; paint(); send('abc:open', {}); }
  function act(kind) {
    if (kind === 'close') { dialog.close(); return; }
    if (kind === 'home') { toHome(); return; }
    if (kind === 'shelf') { dialog.close(); openShelf?.(); return; }
    if (!isOnline()) { toast(L('Play online.', 'オンラインで あそべます。')); return; }
    if (kind === 'start' || kind === 'review') { quiet(); state.view = 'play'; state.q = null; state.result = null; state.summary = null; state.row = []; state.waiting = true; paint(); send('abc:start', kind === 'review' ? { review: true } : {}); return; }
    if (kind === 'sing') { sing(); return; }
    if (kind === 'seen') { if (state.waiting) return; quiet(); state.waiting = true; send('abc:answer', { seen: true }); return; }
    if (kind === 'spell') { if (state.waiting || state.result) return; state.waiting = true; paint(); send('abc:answer', { order: state.row }); return; }
    if (kind === 'next') {
      const r = state.result; if (!r) return;
      quiet();
      if (r.over) { state.view = 'summary'; state.result = null; state.q = null; paint(); const s = state.summary; if (s?.advanced || s?.mode === 'place') sayText('Well done!', 'よく できました！'); return; }
      state.q = r.next; state.result = null; state.picked = null; state.row = []; paint(); introduce(state.q);
    }
  }
  function pick(choice) { if (state.result || state.waiting) return; state.picked = choice; state.waiting = true; paint(); send('abc:answer', { choice }); }

  function handle(type, m) {
    if (type === 'abc:state') { state.st = m; if (m.artV) state.artV = m.artV; if (m.phonicsV) setPhonicsVersion(m.phonicsV); if (state.view === 'home') paint(); return; }
    if (type === 'abc:ask') { state.q = m; state.result = null; state.picked = null; state.row = []; state.waiting = false; state.view = 'play'; paint(); introduce(m); return; }
    if (type === 'abc:result') {
      state.waiting = false;
      if (m.state) { state.st = m.state; if (m.state.artV) state.artV = m.state.artV; if (m.state.phonicsV) setPhonicsVersion(m.state.phonicsV); }
      if (m.summary) state.summary = m.summary;
      if (m.teach) { // おしえる がめん：そのまま つぎへ
        if (m.over) { state.view = 'summary'; state.q = null; state.result = null; paint(); return; }
        state.q = m.next; state.result = null; state.picked = null; state.row = []; paint(); introduce(state.q); return;
      }
      state.result = m; paint();
      // つなげて よむ：こたえが でたら おとを つなげて → ことば。つづる：こたえの ことば。
      if (state.q?.kind === 'blend' && m.answer) blendIt(state.q.sounds || [], [{ say: m.answer }]);
      else if (state.q?.kind === 'spell') sayEn(state.q.say);
      return;
    }
    if (type === 'abc:error') {
      state.waiting = false;
      if (m?.reason === 'no review') toast(L('Nothing to practice now.', 'いまは にがてが ないよ。'));
      else if (m?.reason === 'no data') { state.st = { ready: false }; }
      toHome();
    }
  }

  function open() {
    if (!isOnline()) { toast(L('Play online.', 'オンラインで あそべます。')); return false; }
    state.view = 'home'; state.st = null; state.q = null; state.result = null; state.summary = null; state.row = []; state.waiting = false;
    paint();
    if (!dialog.open) dialog.showModal();
    send('abc:open', {});
    return true;
  }
  return { open, handle, close: () => { if (dialog.open) dialog.close(); }, get isOpen() { return dialog.open; }, state };
}
