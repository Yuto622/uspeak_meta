// 共通の問題画面（Roblox の USpeakFormatUI の見た目と操作）。
//
// `renderFormat(host, fmt, opts)` が 1 問を描く。ヘッダーは形式ごとの色（formats-core の
// FORMAT_META）、右上に ✕、下に 🔊 と ①② の手順つきの吹き出しと「✅ Check / こたえあわせ」。
// 答えはここには無い：`opts.onCheck(answer)` で送り、`ctl.showResult(...)` で○×を描く。
//
// 学習の中身（英単語・日本語の意味）は `.fmt-learn` の中に置き、`translate="no"` を付ける
// （画面ぜんぶを訳す層が触らない。i18n-dom.js の LEARNING）。
import { t as tr, isJa } from './i18n.js';
import { FORMAT_META } from './formats-core.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const HOWTO = {
  mc: [['👀', 'えいごを よむ', 'Read the word'], ['👆', 'いみを えらぶ', 'Tap the meaning']],
  match: [['👆', 'ひだりを おす', 'Tap the left card'], ['👆', 'みぎを おす（せんが つながる）', 'Tap the right card to draw a line']],
  spell: [['👆', '2まい おして いれかえ', 'Tap two cards to swap'], ['✅', 'ならんだら Check', 'Then press Check']],
  type: [['⌨', 'もじを うつ', 'Type the letters'], ['⏎', 'Enter で こたえる', 'Press Enter to answer']],
  order: [['👆', '2まい おして いれかえ', 'Tap two cards to swap'], ['✅', 'ぶんに なったら Check', 'Then press Check']],
  fill: [['👆', 'カードを おすと はいる', 'Tap a card to fill the blank'], ['✅', 'Check を おす', 'Then press Check']],
  listen: [['🔊', 'おとを きく', 'Listen'], ['👆', 'えいごを えらぶ', 'Tap the word']],
};

// 英語だけを読み上げる（日本語や記号は読まない）。
const englishOnly = (s) => String(s ?? '').replace(/[^A-Za-z0-9' ,.?!-]+/g, ' ').replace(/\s+/g, ' ').trim();

// 問題文を読むときは 空欄（____）と 日本語のヒント「(月曜)」を落とす（英語の声のまま 読ませる）。
const spoken = (s) => String(s || '').replace(/[（(][^)）]*[\u3040-\u30ff\u4e00-\u9fff][^)）]*[)）]/g, '').replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();

export function renderFormat(host, fmt, { speak = null, onCheck, onQuit, onAnswer = null } = {}) {
  const meta = FORMAT_META[fmt.kind] || FORMAT_META.mc;
  const attempt = fmt.attempt || 1;
  let locked = false;
  let answer = null;
  let touched = false;
  const say = (text) => { const en = englishOnly(text); if (en && speak) speak(en, { japanese: false, rate: 0.85 }); };

  host.innerHTML = `<section class="fmt" data-kind="${esc(fmt.kind)}">
    <header class="fmt-head" style="background:${meta.color}">
      <span class="fmt-icon">${meta.icon}</span>
      <div class="fmt-title"><b>${esc(meta.en)}</b><small>${esc(meta.ja)}</small></div>
      ${attempt >= 2 ? `<span class="fmt-again" data-t="もういちど！">もういちど！</span>` : ''}
      <button type="button" class="fmt-quit" aria-label="やめる" data-t-label="やめる">✕</button>
    </header>
    <div class="fmt-body fmt-learn" translate="no"></div>
    <div class="fmt-feedback" role="status" hidden></div>
    <footer class="fmt-foot">
      <button type="button" class="fmt-speak" aria-label="よみあげる" data-t-label="よみあげる">🔊</button>
      <div class="fmt-howto">${(HOWTO[fmt.kind] || []).map(([ic, ja, en], i) => `<span><i>${i + 1}</i>${ic} ${isJa() ? esc(ja) : esc(en)}</span>`).join('')}</div>
      <button type="button" class="fmt-check primary"><b>✅ Check</b><small data-t="こたえあわせ">こたえあわせ</small></button>
    </footer>
  </section>`;
  const root = host.querySelector('.fmt');
  const body = root.querySelector('.fmt-body');
  const feedback = root.querySelector('.fmt-feedback');
  const checkBtn = root.querySelector('.fmt-check');
  root.querySelector('.fmt-quit').onclick = () => onQuit?.();
  root.querySelector('.fmt-speak').onclick = () => say(spoken(fmt.prompt) || fmt.word || '');

  const submit = () => { if (locked || answer === null || answer === undefined) return; locked = true; checkBtn.disabled = true; onCheck?.(answer); };
  checkBtn.onclick = submit;

  // ---- 形式ごとの中身 ----
  if (fmt.kind === 'mc') {
    checkBtn.hidden = true;
    body.innerHTML = `${fmt.prompt ? `<h3 class="fmt-q fmt-prompt">${esc(fmt.prompt)}</h3>` : `<h3 class="fmt-q">What is "<span class="fmt-word">${esc(fmt.word)}</span>"?</h3>`}
      <div class="fmt-choices">${fmt.choices.map((c) => `<button type="button" class="fmt-choice" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    body.querySelectorAll('.fmt-choice').forEach((b) => { b.onclick = () => { if (locked) return; answer = b.dataset.v; b.classList.add('picked'); submit(); }; });
    say(spoken(fmt.prompt) || fmt.word);
  } else if (fmt.kind === 'listen') {
    checkBtn.hidden = true;
    body.innerHTML = `<button type="button" class="fmt-ear" aria-label="きく"><span class="fmt-ring"></span>🔊</button>
      <p class="fmt-sub" data-t="きいて、えいごを えらぼう">きいて、えいごを えらぼう</p>
      <div class="fmt-choices fmt-en">${fmt.choices.map((c) => `<button type="button" class="fmt-choice" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    body.querySelector('.fmt-ear').onclick = () => say(fmt.word);
    body.querySelectorAll('.fmt-choice').forEach((b) => { b.onclick = () => { if (locked) return; answer = b.dataset.v; b.classList.add('picked'); submit(); }; });
    say(fmt.word);
  } else if (fmt.kind === 'match') {
    body.innerHTML = `<div class="fmt-match"><div class="fmt-col fmt-left">${fmt.left.map((en, i) => `<button type="button" class="fmt-card" data-side="l" data-i="${i}">${esc(en)}</button>`).join('')}</div>
      <svg class="fmt-lines" aria-hidden="true"></svg>
      <div class="fmt-col fmt-right">${fmt.right.map((ja, i) => `<button type="button" class="fmt-card" data-side="r" data-i="${i}">${esc(ja)}</button>`).join('')}</div></div>`;
    const links = new Map(); // left index -> right index
    let picked = null;
    const svg = body.querySelector('.fmt-lines');
    const draw = (colors = null) => {
      const box = body.querySelector('.fmt-match').getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      svg.innerHTML = [...links.entries()].map(([l, r]) => {
        const a = body.querySelector(`[data-side=l][data-i="${l}"]`).getBoundingClientRect();
        const b = body.querySelector(`[data-side=r][data-i="${r}"]`).getBoundingClientRect();
        const stroke = colors ? colors[l] : '#e27a2d';
        return `<line x1="${a.right - box.left}" y1="${a.top + a.height / 2 - box.top}" x2="${b.left - box.left}" y2="${b.top + b.height / 2 - box.top}" stroke="${stroke}" stroke-width="4" stroke-linecap="round"/>`;
      }).join('');
      answer = links.size === fmt.left.length ? fmt.left.map((_, i) => fmt.right[links.get(i)]) : null;
      checkBtn.disabled = !answer;
      body.querySelectorAll('[data-side=l]').forEach((c) => c.classList.toggle('linked', links.has(Number(c.dataset.i))));
      body.querySelectorAll('[data-side=r]').forEach((c) => c.classList.toggle('linked', [...links.values()].includes(Number(c.dataset.i))));
    };
    const connect = (l, r) => {
      for (const [k, v] of links) if (v === r) links.delete(k);
      links.set(l, r);
      picked = null;
      body.querySelectorAll('[data-side=l]').forEach((c) => c.classList.remove('picked'));
      draw();
    };
    body.querySelectorAll('.fmt-card').forEach((c) => {
      c.onclick = () => {
        if (locked) return;
        const i = Number(c.dataset.i);
        if (c.dataset.side === 'l') { picked = i; body.querySelectorAll('[data-side=l]').forEach((x) => x.classList.toggle('picked', x === c)); }
        else if (picked !== null) connect(picked, i);
      };
      // Dragging from a left card onto a right card also draws the line.
      c.addEventListener('pointerdown', (e) => {
        if (locked || c.dataset.side !== 'l') return;
        picked = Number(c.dataset.i);
        body.querySelectorAll('[data-side=l]').forEach((x) => x.classList.toggle('picked', x === c));
        const up = (ev) => {
          const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-side=r]');
          if (el) connect(picked, Number(el.dataset.i));
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointerup', up);
        e.preventDefault();
      });
    });
    checkBtn.disabled = true;
    requestAnimationFrame(() => draw());
    window.addEventListener('resize', () => draw(), { once: false });
    root._drawLines = draw;
    root._links = links;
    say(fmt.left[0]);
  } else if (fmt.kind === 'spell' || fmt.kind === 'order') {
    const items = fmt.kind === 'spell' ? fmt.letters : fmt.words;
    const label = fmt.kind === 'spell' ? ['← よみかた の じゅんに →', '← in reading order →'] : ['← ぶんの あたまから おわりへ →', '← from the start of the sentence to the end →'];
    body.innerHTML = `<p class="fmt-ja">${esc(fmt.ja)}</p>
      <div class="fmt-slots">${items.map((_, i) => `<span class="fmt-slot"><i>${i + 1}</i></span>`).join('')}</div>
      <div class="fmt-tiles">${items.map((it, i) => `<button type="button" class="fmt-tile" data-i="${i}">${esc(it)}</button>`).join('')}</div>
      <p class="fmt-arrow">${isJa() ? label[0] : label[1]}</p>
      <div class="fmt-hand" aria-hidden="true">👆</div>`;
    const tiles = body.querySelector('.fmt-tiles');
    let order = items.map((_, i) => i);
    let sel = null;
    const paint = (states = null) => {
      tiles.innerHTML = order.map((idx, pos) => `<button type="button" class="fmt-tile ${sel === pos ? 'picked' : ''} ${states ? states[pos] : ''}" data-pos="${pos}">${esc(items[idx])}</button>`).join('');
      answer = order.map((idx) => items[idx]);
      checkBtn.disabled = false;
      wire();
    };
    const swap = (a, b) => { [order[a], order[b]] = [order[b], order[a]]; sel = null; paint(); };
    const hand = body.querySelector('.fmt-hand');
    const stopHand = () => { touched = true; hand.hidden = true; };
    function wire() {
      tiles.querySelectorAll('.fmt-tile').forEach((tile) => {
        tile.onclick = () => {
          if (locked) return;
          stopHand();
          const pos = Number(tile.dataset.pos);
          if (sel === null) { sel = pos; paint(); } else if (sel === pos) { sel = null; paint(); } else swap(sel, pos);
        };
        // Drag a tile and drop it on another to swap them.
        tile.addEventListener('pointerdown', (e) => {
          if (locked) return;
          stopHand();
          const from = Number(tile.dataset.pos);
          tile.classList.add('dragging');
          const up = (ev) => {
            tile.classList.remove('dragging');
            const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.fmt-tile');
            if (el && el !== tile) swap(from, Number(el.dataset.pos));
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointerup', up);
          e.preventDefault();
        });
      });
    }
    paint();
    // The first few seconds: a hand moves the first tile onto the second, as a demonstration.
    if (items.length >= 2) {
      hand.hidden = false;
      setTimeout(() => { if (!touched) hand.hidden = true; }, 6000);
    } else hand.hidden = true;
    root._paintTiles = (states) => paint(states);
  } else if (fmt.kind === 'fill') {
    body.innerHTML = `${fmt.ja ? `<p class="fmt-ja">${esc(fmt.ja)}</p>` : ''}
      <p class="fmt-sentence fmt-en"><span>${esc(fmt.before)}</span> <span class="fmt-blank" data-v=""></span> <span>${esc(fmt.after)}</span></p>
      <div class="fmt-choices fmt-en fmt-cards">${fmt.cards.map((c) => `<button type="button" class="fmt-choice" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    const blank = body.querySelector('.fmt-blank');
    const set = (v) => {
      answer = v || null;
      blank.textContent = v || '';
      blank.dataset.v = v || '';
      blank.classList.toggle('filled', !!v);
      body.querySelectorAll('.fmt-cards .fmt-choice').forEach((b) => { b.classList.toggle('used', b.dataset.v === v); });
      checkBtn.disabled = !answer;
    };
    body.querySelectorAll('.fmt-cards .fmt-choice').forEach((b) => { b.onclick = () => { if (locked) return; set(b.dataset.v === answer ? '' : b.dataset.v); }; });
    blank.onclick = () => { if (!locked) set(''); };
    checkBtn.disabled = true;
    say(`${fmt.before} ${fmt.after}`);
  } else if (fmt.kind === 'type') {
    const n = fmt.length;
    let typed = '';
    body.innerHTML = `<p class="fmt-ja">${esc(fmt.ja)}</p>
      <div class="fmt-boxes">${Array.from({ length: n }, (_, i) => `<span class="fmt-box" data-i="${i}"></span>`).join('')}</div>
      ${fmt.hint ? `<p class="fmt-hint">💡 ${isJa() ? 'ヒント：さいしょの もじは' : 'Hint: the first letter is'}「 <b>${esc(fmt.hint)}</b> 」</p>` : ''}
      <div class="fmt-keys">${KEY_ROWS.map((row, r) => `<div class="fmt-keyrow">${r === 2 ? '<button type="button" class="fmt-key fmt-key-del" data-k="⌫"><b>⌫</b><small>けす</small></button>' : ''}${[...row].map((k) => `<button type="button" class="fmt-key" data-k="${k}">${k}</button>`).join('')}${r === 2 ? '<button type="button" class="fmt-key fmt-key-enter" data-k="⏎" disabled><b>Enter ⏎</b></button>' : ''}</div>`).join('')}</div>`;
    const boxes = [...body.querySelectorAll('.fmt-box')];
    const enter = body.querySelector('.fmt-key-enter');
    const paint = () => { boxes.forEach((b, i) => { b.textContent = typed[i] || ''; b.classList.toggle('filled', !!typed[i]); }); enter.disabled = typed.length < n; answer = typed.length === n ? typed : null; checkBtn.disabled = !answer; };
    const press = (k) => {
      if (locked) return;
      if (k === '⌫') typed = typed.slice(0, -1);
      else if (k === '⏎') { if (typed.length === n) submit(); return; }
      else if (/^[a-z]$/i.test(k) && typed.length < n) typed += k;
      paint();
    };
    body.querySelectorAll('.fmt-key').forEach((b) => { b.onclick = () => press(b.dataset.k); });
    root._onKey = (e) => {
      if (locked) return;
      if (e.key === 'Backspace') { press('⌫'); e.preventDefault(); } else if (e.key === 'Enter') { press('⏎'); e.preventDefault(); } else if (/^[a-zA-Z]$/.test(e.key)) { press(e.key); e.preventDefault(); }
    };
    window.addEventListener('keydown', root._onKey);
    paint();
    root._paintBoxes = (states) => boxes.forEach((b, i) => { b.classList.remove('ok', 'ng'); if (states?.[i]) b.classList.add(states[i]); });
    root._reveal = (word) => { typed = String(word); paint(); boxes.forEach((b) => { b.classList.remove('ng'); b.classList.add('ok'); }); };
  }

  // ---- ○× ----
  function showResult(correct, { diff = null, reveal = null, escaped = false } = {}) {
    locked = true;
    feedback.hidden = false;
    feedback.className = `fmt-feedback ${correct ? 'ok' : 'ng'}`;
    if (correct) {
      feedback.innerHTML = `<b>🎉 Correct!</b><small data-t="せいかい！">せいかい！</small>`;
      confetti(root);
    } else {
      feedback.innerHTML = escaped ? `<b>Not quite…</b><small data-t="こたえは こちら">こたえは こちら</small>` : `<b>Not quite…</b><small data-t="もういちど！">もういちど！</small>`;
    }
    if (fmt.kind === 'mc' || fmt.kind === 'listen' || fmt.kind === 'fill') {
      const want = reveal?.answer;
      body.querySelectorAll('.fmt-choice').forEach((b) => {
        if (b.classList.contains('picked') || (fmt.kind === 'fill' && b.classList.contains('used'))) b.classList.add(correct ? 'right' : 'wrong');
        if (!correct && want && b.dataset.v === want) b.classList.add('right');
      });
      if (fmt.kind === 'fill' && !correct && want) { const blank = body.querySelector('.fmt-blank'); blank.textContent = want; blank.classList.add('right'); }
    }
    if (fmt.kind === 'match') {
      const colors = correct ? fmt.left.map(() => '#2f8f5b') : (diff || []).map((d) => (d === 'ok' ? '#2f8f5b' : '#c43d2e'));
      root._drawLines(colors);
      if (!correct && reveal?.pairs) {
        setTimeout(() => {
          root._links.clear();
          for (const p of reveal.pairs) root._links.set(fmt.left.indexOf(p.en), fmt.right.indexOf(p.ja));
          root._drawLines(fmt.left.map(() => '#2f8f5b'));
        }, 900);
      }
    }
    if (fmt.kind === 'spell' || fmt.kind === 'order') {
      root._paintTiles(correct ? answer.map(() => 'ok') : (diff || []));
      if (!correct && reveal) {
        const text = reveal.sentence || reveal.answer || '';
        body.insertAdjacentHTML('beforeend', `<p class="fmt-answer">Answer: <b>${esc(text)}</b></p>`);
      }
    }
    if (fmt.kind === 'type') {
      if (correct) root._paintBoxes(answer.split('').map(() => 'ok'));
      else if (reveal?.answer) root._reveal(reveal.answer);
      else root._paintBoxes(diff || []);
    }
  }

  function destroy() { if (root._onKey) window.removeEventListener('keydown', root._onKey); }

  return { showResult, destroy, get answer() { return answer; } };
}

// 紙吹雪。CSS だけで散って消える 24 枚。
export function confetti(root) {
  const box = document.createElement('div');
  box.className = 'fmt-confetti';
  box.setAttribute('aria-hidden', 'true');
  const colors = ['#e27a2d', '#ffd246', '#58a0dc', '#78c882', '#b27aff', '#ff963c'];
  box.innerHTML = Array.from({ length: 24 }, (_, i) => `<i style="left:${(i / 24) * 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 6) * 60}ms;animation-duration:${900 + (i % 5) * 120}ms"></i>`).join('');
  root.append(box);
  setTimeout(() => box.remove(), 1800);
}

// 「もういちど」のための小さな一言。
export const RETRY_WORD = { ja: 'もういちど！', en: 'One more time!' };
export const tr2 = tr;
