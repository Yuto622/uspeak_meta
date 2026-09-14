/* =========================================================================
 * quiz.js -- えいごクイズ (3しゅるい)
 * -------------------------------------------------------------------------
 *  1. listen : えいごを きいて、え を えらぶ        (リスニング)
 *  2. picture: え を みて、えいごの つづりを えらぶ (たんごの けいたい)
 *  3. letter : この たんごの さいしょの もじは?     (フォニックス)
 *
 * 小学校ていがくねん むけなので
 *   ・まちがえても ペナルティなし(もういちど チャレンジ)
 *   ・せんたくしは 3つだけ
 *   ・こたえの あとは かならず はつおん + つづりを みせる
 * ========================================================================= */
(function (global) {
  'use strict';

  const KINDS = ['listen', 'picture', 'letter'];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  class Quiz {
    /**
     * @param {object} refs  DOM の さんしょう
     * @param {object} hooks {onFinish(correct, question)}
     */
    constructor(refs, hooks) {
      this.refs = refs;
      this.hooks = hooks || {};
      this.current = null;
      this.answered = false;
      this.stats = { asked: 0, correct: 0 };

      refs.replayBtn.addEventListener('click', () => this.replay());
      refs.nextBtn.addEventListener('click', () => this.finish());
    }

    /** しゅつだいする たんごを きめる(おぼえた ものを ゆうせん) */
    _pool(discovered) {
      const seen = Fruits.LIST.filter(f => discovered.has(f.lv));
      if (seen.length >= 3) return seen;
      return Fruits.LIST.slice(0, Math.max(4, seen.length + 3));
    }

    start(discovered, forcedKind) {
      const pool = this._pool(discovered);
      const kind = forcedKind || KINDS[(Math.random() * KINDS.length) | 0];
      const picked = shuffle(pool);
      const answer = picked[0];
      const others = picked.slice(1, 3);
      // せんたくしが たりない ときは ほかから おぎなう
      let i = 0;
      while (others.length < 2) {
        const cand = Fruits.LIST[i++];
        if (cand && cand.lv !== answer.lv && !others.some(o => o.lv === cand.lv)) others.push(cand);
        if (i > Fruits.MAX_LEVEL) break;
      }
      const choices = shuffle([answer].concat(others));

      this.current = { kind: kind, answer: answer, choices: choices };
      this.answered = false;
      this.stats.asked++;
      this._render();
      this.show();
      // リスニングは すぐ おとを ながす
      if (kind === 'listen') setTimeout(() => Sound.say(answer.en), 420);
      else if (kind === 'letter') setTimeout(() => Sound.say(answer.en), 420);
      return this.current;
    }

    _render() {
      const q = this.current;
      const r = this.refs;
      r.result.className = 'quiz-result';
      r.result.innerHTML = '';
      r.nextBtn.hidden = true;
      r.choices.innerHTML = '';
      r.choices.classList.remove('text-mode', 'letter-mode');

      if (q.kind === 'listen') {
        r.title.textContent = 'きいて えらぼう！';
        r.sub.textContent = 'なんの ことばか きこえるかな？';
        r.stage.innerHTML = '<div class="quiz-ear">👂</div>';
        r.replayBtn.hidden = false;
      } else if (q.kind === 'picture') {
        r.title.textContent = 'えいごで かくと どれ？';
        r.sub.textContent = 'この え の えいごを えらぼう';
        r.stage.innerHTML = '<div class="quiz-big-emoji">' + q.answer.emoji + '</div>' +
                            '<div class="quiz-ja">' + q.answer.ja + '</div>';
        r.choices.classList.add('text-mode');
        r.replayBtn.hidden = true;
      } else {
        r.title.textContent = 'さいしょの もじは？';
        // ここで えいごの つづりを みせると こたえが わかって しまうので、
        // え と おと だけを ヒントに する
        r.sub.textContent = 'きこえた ことばの さいしょの アルファベットは どれ？';
        r.stage.innerHTML = '<div class="quiz-big-emoji">' + q.answer.emoji + '</div>' +
                            '<div class="quiz-ja">' + q.answer.ja + '</div>';
        r.choices.classList.add('letter-mode');
        r.replayBtn.hidden = false;
      }

      if (q.kind === 'letter') {
        // さいしょの もじを 3たくで
        const right = q.answer.en[0].toUpperCase();
        const set = new Set([right]);
        const ABC = 'ABCDEFGHIJKLMNOPRSTW';
        while (set.size < 3) set.add(ABC[(Math.random() * ABC.length) | 0]);
        const letters = shuffle(Array.from(set));
        letters.forEach(L => {
          const btn = document.createElement('button');
          btn.className = 'choice';
          btn.innerHTML = '<span class="choice-letter">' + L + '</span>';
          btn.addEventListener('click', () => this.answer(L === right, btn, L));
          r.choices.appendChild(btn);
        });
      } else {
        q.choices.forEach(f => {
          const btn = document.createElement('button');
          btn.className = 'choice';
          if (q.kind === 'listen') {
            btn.innerHTML = '<span class="choice-emoji">' + f.emoji + '</span>' +
                            '<span class="choice-ja">' + f.ja + '</span>';
          } else {
            btn.innerHTML = '<span class="choice-word">' + f.en + '</span>';
          }
          btn.addEventListener('click', () => this.answer(f.lv === q.answer.lv, btn, f.en));
          r.choices.appendChild(btn);
        });
      }
    }

    replay() {
      if (!this.current) return;
      Sound.say(this.current.answer.en);
    }

    answer(isCorrect, btn, label) {
      if (this.answered) return;
      const q = this.current;
      const r = this.refs;

      if (!isCorrect) {
        // ていがくねん むけ: まちがえても もういちど チャレンジできる
        btn.classList.add('wrong');
        btn.disabled = true;
        Sound.wrong();
        r.result.className = 'quiz-result try-again';
        r.result.textContent = 'おしい！ もういちど きいてみよう 🎧';
        Sound.say(q.answer.en);
        const left = Array.from(r.choices.children).filter(c => !c.disabled);
        if (left.length <= 1) {
          // のこり 1つ → こたえを おしえて おわり
          left.forEach(c => c.classList.add('correct'));
          this._reveal(false);
        }
        return;
      }

      this.answered = true;
      btn.classList.add('correct');
      Array.from(r.choices.children).forEach(c => { c.disabled = true; });
      Sound.correct();
      this.stats.correct++;
      this._reveal(true);
    }

    _reveal(gotIt) {
      const q = this.current;
      const r = this.refs;
      this.answered = true;
      const spell = Fruits.letters(q.answer.en)
        .map(ch => '<b>' + ch + '</b>').join('<i>-</i>');
      r.result.className = 'quiz-result ' + (gotIt ? 'ok' : 'ng');
      r.result.innerHTML =
        '<div class="rv-head">' + (gotIt ? 'せいかい！ ⭐' : 'こたえは こちら') + '</div>' +
        '<div class="rv-word">' + q.answer.emoji + ' <span>' + q.answer.en + '</span></div>' +
        '<div class="rv-ja">' + q.answer.ja + '</div>' +
        '<div class="rv-spell">' + spell + '</div>';
      r.nextBtn.hidden = false;
      setTimeout(() => Sound.spell(q.answer.en), 700);
      if (this.hooks.onAnswered) this.hooks.onAnswered(gotIt, q);
    }

    show() { this.refs.overlay.classList.add('show'); }

    /** リスタート などで むりやり とじる(コールバックは よばない) */
    forceClose() {
      this.refs.overlay.classList.remove('show');
      this.current = null;
      this.answered = false;
    }

    finish() {
      this.refs.overlay.classList.remove('show');
      Sound.stopVoice();
      const q = this.current;
      this.current = null;
      if (this.hooks.onFinish) this.hooks.onFinish(q);
    }
  }

  global.Quiz = Quiz;
})(window);
