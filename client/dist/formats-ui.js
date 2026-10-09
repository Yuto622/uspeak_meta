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
  match: [['👆', 'えいごを おす', 'Tap a word'], ['🎨', 'おなじ いみを おす（おなじ いろに なる）', 'Tap its meaning: they turn the same colour']],
  spell: [['👆', 'もじを じゅんばんに おす', 'Tap the letters in order'], ['↩', 'まちがえたら おして もどす', 'Tap a letter to take it back']],
  type: [['⌨', 'もじを うつ', 'Type the letters'], ['⏎', 'Enter で こたえる', 'Press Enter to answer']],
  order: [['👆', 'ことばを じゅんばんに おす', 'Tap the words in order'], ['↩', 'まちがえたら おして もどす', 'Tap a word to take it back']],
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
    // えいごを おして、おなじ いみを おす → 2まいが おなじ いろに なって せんで つながる（どちらから おしてもよい）。
    // つないだ カードを もう一度 おすと はずれる。ぜんぶ つながると Check が光る。
    const PAIR = ['#e27a2d', '#3f8fd6', '#9b5fd0', '#2fa37a', '#d9668d', '#c9a227'];
    body.innerHTML = `<div class="fmt-match"><div class="fmt-col fmt-left">${fmt.left.map((en, i) => `<button type="button" class="fmt-card" data-side="l" data-i="${i}">${esc(en)}</button>`).join('')}</div>
      <svg class="fmt-lines" aria-hidden="true"></svg>
      <div class="fmt-col fmt-right">${fmt.right.map((ja, i) => `<button type="button" class="fmt-card" data-side="r" data-i="${i}">${esc(ja)}</button>`).join('')}</div></div>`;
    const links = new Map(); // left index -> right index
    const colorOf = new Map(); // left index -> pair colour (stays with the word while it is linked)
    let picked = null; // { side, i }
    const svg = body.querySelector('.fmt-lines');
    const card = (side, i) => body.querySelector(`[data-side=${side}][data-i="${i}"]`);
    const draw = (colors = null) => {
      const box = body.querySelector('.fmt-match').getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
      svg.innerHTML = [...links.entries()].map(([l, r]) => {
        const a = card('l', l).getBoundingClientRect();
        const b = card('r', r).getBoundingClientRect();
        const stroke = colors ? colors[l] : colorOf.get(l);
        return `<line x1="${a.right - box.left}" y1="${a.top + a.height / 2 - box.top}" x2="${b.left - box.left}" y2="${b.top + b.height / 2 - box.top}" stroke="${stroke}" stroke-width="5" stroke-linecap="round"/>`;
      }).join('');
      answer = links.size === fmt.left.length ? fmt.left.map((_, i) => fmt.right[links.get(i)]) : null;
      checkBtn.disabled = !answer;
      checkBtn.classList.toggle('ready', !!answer && !locked);
      body.querySelectorAll('.fmt-card').forEach((c) => {
        const i = Number(c.dataset.i);
        const l = c.dataset.side === 'l' ? (links.has(i) ? i : null) : [...links.entries()].find(([, r]) => r === i)?.[0] ?? null;
        c.classList.toggle('linked', l !== null);
        c.style.setProperty('--pair', l !== null ? (colors ? colors[l] : colorOf.get(l)) : '');
        c.classList.toggle('picked', !!picked && picked.side === c.dataset.side && picked.i === i);
      });
      body.querySelector('.fmt-match').dataset.waiting = picked ? (picked.side === 'l' ? 'r' : 'l') : '';
    };
    const nextColor = () => PAIR.find((c) => ![...colorOf.values()].includes(c)) || PAIR[0];
    const connect = (l, r) => {
      for (const [k, v] of links) if (v === r) { links.delete(k); colorOf.delete(k); }
      if (!links.has(l)) colorOf.set(l, nextColor());
      links.set(l, r);
      picked = null;
      say(fmt.left[l]);
      draw();
    };
    const unlink = (side, i) => {
      const l = side === 'l' ? i : [...links.entries()].find(([, r]) => r === i)?.[0];
      if (l === undefined || !links.has(l)) return false;
      links.delete(l); colorOf.delete(l); picked = null; draw();
      return true;
    };
    const tap = (side, i) => {
      if (locked) return;
      if (picked && picked.side !== side) { connect(side === 'r' ? picked.i : i, side === 'r' ? i : picked.i); return; }
      if (picked && picked.side === side && picked.i === i) { picked = null; draw(); return; }
      if (!picked && unlink(side, i)) return;
      picked = { side, i };
      if (side === 'l') say(fmt.left[i]);
      draw();
    };
    body.querySelectorAll('.fmt-card').forEach((c) => {
      c.onclick = () => tap(c.dataset.side, Number(c.dataset.i));
    });
    checkBtn.disabled = true;
    requestAnimationFrame(() => draw());
    window.addEventListener('resize', () => draw(), { once: false });
    root._drawLines = draw;
    root._links = links;
  } else if (fmt.kind === 'spell' || fmt.kind === 'order') {
    // 下の カードを じゅんばんに おすと、上の こたえの ならびに 入る。入れた カードを おすと 下に もどる。
    // （前は「2まい おして いれかえ」だったが、何を すればいいか 分からない子が 多かった。）
    const items = fmt.kind === 'spell' ? fmt.letters : fmt.words;
    const n = items.length;
    body.innerHTML = `${fmt.ja ? `<p class="fmt-ja">${esc(fmt.ja)}</p>` : ''}
      <div class="fmt-build" aria-label="${isJa() ? 'こたえ' : 'Your answer'}"></div>
      <div class="fmt-bank"></div>
      <div class="fmt-tools"><button type="button" class="fmt-undo">↩ <span>${isJa() ? 'ひとつ もどす' : 'Undo'}</span></button><button type="button" class="fmt-clear">🧹 <span>${isJa() ? 'ぜんぶ もどす' : 'Clear'}</span></button></div>`;
    const build = body.querySelector('.fmt-build');
    const bank = body.querySelector('.fmt-bank');
    const placed = [];
    const paint = (states = null) => {
      build.innerHTML = Array.from({ length: n }, (_, pos) => {
        const idx = placed[pos];
        if (idx === undefined) return `<span class="fmt-slot${pos === placed.length ? ' next' : ''}"><i>${pos + 1}</i></span>`;
        return `<button type="button" class="fmt-slot filled ${states ? states[pos] || '' : ''}" data-pos="${pos}">${esc(items[idx])}</button>`;
      }).join('');
      bank.innerHTML = items.map((it, i) => `<button type="button" class="fmt-tile${placed.includes(i) ? ' used' : ''}" data-i="${i}" ${placed.includes(i) ? 'disabled' : ''}>${esc(it)}</button>`).join('');
      answer = placed.length === n ? placed.map((i) => items[i]) : null;
      checkBtn.disabled = !answer;
      checkBtn.classList.toggle('ready', !!answer && !locked);
      build.querySelectorAll('.fmt-slot.filled').forEach((el) => { el.onclick = () => { if (locked) return; placed.splice(Number(el.dataset.pos), 1); paint(); }; });
      bank.querySelectorAll('.fmt-tile:not(.used)').forEach((el) => { el.onclick = () => { if (locked || placed.length >= n) return; placed.push(Number(el.dataset.i)); if (fmt.kind === 'order') say(items[Number(el.dataset.i)]); paint(); }; });
    };
    body.querySelector('.fmt-undo').onclick = () => { if (!locked && placed.length) { placed.pop(); paint(); } };
    body.querySelector('.fmt-clear').onclick = () => { if (!locked) { placed.length = 0; paint(); } };
    paint();
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
