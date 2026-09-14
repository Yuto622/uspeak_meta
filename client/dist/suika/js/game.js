/* =========================================================================
 * game.js -- えいご スイカゲーム ほんたい
 * -------------------------------------------------------------------------
 * ・スイカゲームの ルールを そのまま さいげん
 *     おなじ ものが ふれる → つぎの ものに しんか
 *     11 だんかいで さいごの もの、さいご どうしは きえて 大ボーナス
 *     ラインを こえた まま 2びょう で ゲームオーバー
 * ・そこに えいごがくしゅうを ゆうごう
 *     20 この ジャンル(くだもの/どうぶつ/のりもの…)から えらんで あそべる
 *     しんかの たびに えいごたんごカード + はつおん
 *     ミッション「Make an apple!」
 *     おぼえた ことばは ジャンルごとの「ずかん」に たまる
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ------------------------------ せってい ------------------------------ */
  const W = 420;            // せかいの よこはば
  const H = 640;            // せかいの たかさ
  const SPAWN_Y = 64;       // ものが でてくる たかさ
  const DEADLINE = 128;     // これより 上に 2びょう いたら ゲームオーバー
  const OVER_LIMIT = 2.0;   // ゲームオーバーまでの びょうすう
  const DROP_COOLDOWN = 0.42;
  const FIXED_DT = 1 / 120; // ぶつりの きざみ(こまかいほど あんてい)

  // ジャンルごとに きろくを もつので v2 (v1 の きろくとは わける)
  const LS_BEST = 'suikaEigo.v2.best';    // { ジャンルid: さいこうてん }
  const LS_BOOK = 'suikaEigo.v2.book';    // { ジャンルid: [レベル...] }
  const LS_STARS = 'suikaEigo.v2.stars';
  const LS_SOUND = 'suikaEigo.v2.sound';
  const LS_GENRE = 'suikaEigo.v2.genre';

  /* ------------------------------ ほじょ ------------------------------ */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

  function loadJSON(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  /* ============================== ゲーム ============================== */
  class Game {
    constructor() {
      this.canvas = $('board');
      this.ctx = this.canvas.getContext('2d');
      this.world = new Physics.World(W, H, {
        gravity: 1550, substeps: 2, velIterations: 8, posIterations: 4
      });
      this.fx = new Effects();

      this.state = 'title';           // title | playing | over
      this.score = 0;
      this.stars = loadJSON(LS_STARS, 0) || 0;
      this.bests = loadJSON(LS_BEST, {}) || {};   // ジャンルごとの さいこうてん
      this.books = loadJSON(LS_BOOK, {}) || {};   // ジャンルごとの ずかん
      this.mergesTotal = 0;
      this.wordsThisGame = new Set();
      this.mission = null;
      this.generation = 0;            // リスタートすると ふえる(ふるい タイマー よけ)

      // ぜんかい あそんだ ジャンルを ふくげん
      Words.setGenre(loadJSON(LS_GENRE, null));
      this.discovered = new Set(this.books[Words.genre.id] || []);
      this.best = this.bests[Words.genre.id] || 0;

      this.aimX = W / 2;
      this.cooldown = 0;
      this.currentLevel = Words.pickDropLevel();
      this.nextLevel = Words.pickDropLevel();
      this.lastTime = 0;
      this.acc = 0;
      this.pointerDown = false;

      this._setupCanvas();
      this._setupDom();
      this._setupInput();
      this._buildGenrePicker();
      this._buildChain();
      this._buildBook();
      this._paintGenreLabels();
      this.updateHud();
      this._loop = this._loop.bind(this);
      requestAnimationFrame(this._loop);
    }

    /* ------------------------- セットアップ ------------------------- */
    _setupCanvas() {
      const dpr = Math.min(global.devicePixelRatio || 1, 2.5);
      this.canvas.width = W * dpr;
      this.canvas.height = H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.dpr = dpr;
    }

    _setupDom() {
      this.el = {
        score: $('score'), best: $('best'), stars: $('stars'),
        nextEn: $('nextEn'), nextJa: $('nextJa'), nextEmoji: $('nextEmoji'),
        missionEmoji: $('missionEmoji'), missionEn: $('missionEn'), missionJa: $('missionJa'),
        missionSay: $('missionSay'),
        wordBar: $('wordBar'), wordEmoji: $('wordEmoji'), wordEn: $('wordEn'),
        wordJa: $('wordJa'), wordSpell: $('wordSpell'), wordSay: $('wordSay'),
        bookCount: $('bookCount'), engLevel: $('engLevel'), engFill: $('engFill'),
        genreLabel: $('genreLabel'), genreTitleName: $('genreTitleName'),
        chainGenre: $('chainGenre'), bookGenre: $('bookGenre')
      };

      // ボタン
      $('startBtn').addEventListener('click', () => { Sound.unlock(); this.start(); });
      $('retryBtn').addEventListener('click', () => { Sound.unlock(); this.start(); });
      $('helpBtn').addEventListener('click', () => this.openOverlay('helpOverlay'));
      $('helpClose').addEventListener('click', () => this.closeOverlay('helpOverlay'));
      $('bookBtn').addEventListener('click', () => { this._buildBook(); this.openOverlay('bookOverlay'); });
      $('bookClose').addEventListener('click', () => this.closeOverlay('bookOverlay'));
      $('genreBtn').addEventListener('click', () => this.openOverlay('genreOverlay'));
      $('genreTitleBtn').addEventListener('click', () => this.openOverlay('genreOverlay'));
      $('genreClose').addEventListener('click', () => this.closeOverlay('genreOverlay'));
      this.el.missionSay.addEventListener('click', () => {
        if (this.mission) Sound.sayEnThenJa(Words.makeSentence(this.mission), this.mission.ja);
      });
      this.el.wordSay.addEventListener('click', () => {
        const en = this.el.wordEn.textContent.trim();
        if (en) Sound.say(en);
      });
      this.el.wordSpell.addEventListener('click', () => {
        const en = this.el.wordEn.textContent.trim();
        if (en) Sound.spell(en);
      });

      const soundBtn = $('soundBtn');
      const savedSound = loadJSON(LS_SOUND, true);
      Sound.voiceOn = savedSound !== false;
      Sound.sfxOn = savedSound !== false;
      const paintSound = () => {
        soundBtn.textContent = Sound.voiceOn ? '🔊 おと オン' : '🔇 おと オフ';
        soundBtn.classList.toggle('off', !Sound.voiceOn);
      };
      paintSound();
      soundBtn.addEventListener('click', () => {
        Sound.unlock();
        const on = !Sound.voiceOn;
        Sound.voiceOn = on; Sound.sfxOn = on;
        if (!on) Sound.stopVoice();
        saveJSON(LS_SOUND, on);
        paintSound();
      });
    }

    _setupInput() {
      const c = this.canvas;
      const toWorldX = (clientX) => {
        const rect = c.getBoundingClientRect();
        return ((clientX - rect.left) / rect.width) * W;
      };
      const move = (e) => {
        if (this.state !== 'playing') return;
        this.setAim(toWorldX(e.clientX));
      };
      c.addEventListener('pointermove', move);
      c.addEventListener('pointerdown', (e) => {
        Sound.unlock();
        this.pointerDown = true;
        move(e);
        c.setPointerCapture && c.setPointerCapture(e.pointerId);
      });
      c.addEventListener('pointerup', (e) => {
        if (!this.pointerDown) return;
        this.pointerDown = false;
        move(e);
        this.drop();
      });
      c.addEventListener('pointercancel', () => { this.pointerDown = false; });
      c.addEventListener('contextmenu', (e) => e.preventDefault());

      global.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { this.setAim(this.aimX - 18); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { this.setAim(this.aimX + 18); e.preventDefault(); }
        else if (e.key === ' ' || e.key === 'Enter') {
          Sound.unlock();
          if (this.state === 'title') this.start();
          else if (this.state === 'over') this.start();
          else this.drop();
          e.preventDefault();
        }
      });
      global.addEventListener('resize', () => this._setupCanvas());
    }

    /** ジャンル えらびの がめんを つくる(20 こ) */
    _buildGenrePicker() {
      const box = $('genreGrid');
      box.innerHTML = '';
      Words.GENRES.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'genre-card';
        btn.dataset.genre = g.id;
        const book = this.books[g.id] || [];
        btn.innerHTML =
          '<span class="gc-icon">' + g.icon + '</span>' +
          '<span class="gc-ja">' + g.ja + '</span>' +
          '<span class="gc-en">' + g.en + '</span>' +
          '<span class="gc-count">' + book.length + ' / ' + (Words.MAX_LEVEL + 1) + '</span>';
        btn.addEventListener('click', () => {
          Sound.unlock();
          this.closeOverlay('genreOverlay');
          this.setGenre(g.id);
        });
        box.appendChild(btn);
      });
      this._markCurrentGenre();
    }

    _markCurrentGenre() {
      const cur = Words.genre.id;
      document.querySelectorAll('.genre-card').forEach(el => {
        el.classList.toggle('current', el.dataset.genre === cur);
      });
    }

    /**
     * ジャンルを きりかえて、あたらしい ゲームを はじめる。
     * きろく(さいこうてん・ずかん)は ジャンルごとに べつべつに もつ。
     */
    setGenre(id) {
      this._saveProgress();
      Words.setGenre(id);
      saveJSON(LS_GENRE, Words.genre.id);
      this.discovered = new Set(this.books[Words.genre.id] || []);
      this.best = this.bests[Words.genre.id] || 0;
      this._buildChain();
      this._buildBook();
      this._markCurrentGenre();
      this._paintGenreLabels();
      this.start();
    }

    _paintGenreLabels() {
      const g = Words.genre;
      this.el.genreLabel.textContent = g.ja;
      this.el.genreTitleName.textContent = g.ja;
      this.el.chainGenre.textContent = g.ja;
      this.el.bookGenre.textContent = g.ja;
    }

    /** いまの ジャンルの きろくを ほぞん */
    _saveProgress() {
      if (!Words.genre) return;
      this.books[Words.genre.id] = Array.from(this.discovered);
      this.bests[Words.genre.id] = Math.max(this.best || 0, this.bests[Words.genre.id] || 0);
      saveJSON(LS_BOOK, this.books);
      saveJSON(LS_BEST, this.bests);
    }

    /** しんかの じゅんばん ひょう を つくる */
    _buildChain() {
      const box = $('chain');
      box.innerHTML = '';
      Words.LIST.forEach(f => {
        const item = document.createElement('button');
        item.className = 'chain-item';
        item.dataset.lv = String(f.lv);
        item.innerHTML =
          '<span class="chain-emoji">' + f.emoji + '</span>' +
          '<span class="chain-text"><b>' + f.en + '</b><i>' + f.ja + '</i></span>';
        item.addEventListener('click', () => { Sound.unlock(); Sound.sayEnThenJa(f.en, f.ja); });
        box.appendChild(item);
      });
    }

    /** ことばの ずかん */
    _buildBook() {
      const box = $('bookGrid');
      box.innerHTML = '';
      Words.LIST.forEach(f => {
        const got = this.discovered.has(f.lv);
        const card = document.createElement('button');
        card.className = 'book-card' + (got ? '' : ' locked');
        card.innerHTML = got
          ? '<span class="bk-emoji">' + f.emoji + '</span>' +
            '<span class="bk-en">' + f.en + '</span>' +
            '<span class="bk-ja">' + f.ja + '</span>' +
            '<span class="bk-spell">' + Words.letters(f.en).join('·') + '</span>' +
            '<span class="bk-say">🔊</span>'
          : '<span class="bk-emoji">❔</span><span class="bk-en">？？？</span>' +
            '<span class="bk-ja">まだ つくって いないよ</span>';
        if (got) {
          card.addEventListener('click', () => { Sound.unlock(); Sound.sayEnThenJa(f.en, f.ja); });
        }
        box.appendChild(card);
      });
      this.el.bookCount.textContent = this.discovered.size + ' / ' + Words.LIST.length;
      const gc = document.querySelector('.genre-card[data-genre="' + Words.genre.id + '"] .gc-count');
      if (gc) gc.textContent = this.discovered.size + ' / ' + Words.LIST.length;
    }

    openOverlay(id) { $(id).classList.add('show'); }
    closeOverlay(id) { $(id).classList.remove('show'); }

    /* ------------------------- ゲームの ながれ ------------------------- */
    start() {
      this.generation++;
      this.closeOverlay('titleOverlay');
      this.closeOverlay('overOverlay');
      Sound.stopVoice();
      this.world.clear();
      this.fx.reset();
      this.score = 0;
      this.mergesTotal = 0;
      this.wordsThisGame = new Set();
      this.cooldown = 0;
      this.aimX = W / 2;
      this.currentLevel = Words.pickDropLevel();
      this.nextLevel = Words.pickDropLevel();
      this.newMission();
      this.setWordBar(null);
      this.state = 'playing';
      this.lastTime = 0;
      this.updateHud();
    }

    newMission() {
      // いまの じつりょくに あった ミッション(むずかしすぎない)
      const maxSeen = this.discovered.size ? Math.max.apply(null, Array.from(this.discovered)) : 2;
      const hi = clamp(maxSeen + 1, 3, 8);
      const lo = clamp(hi - 3, 2, hi);
      let lv = lo + ((Math.random() * (hi - lo + 1)) | 0);
      if (this.mission && lv === this.mission.lv) lv = clamp(lv + 1, 2, 9);
      this.mission = Words.get(lv);
      this.missionDone = false;
      this.el.missionEmoji.textContent = this.mission.emoji;
      this.el.missionEn.textContent = Words.makeSentence(this.mission);
      this.el.missionJa.textContent = this.mission.ja + ' を つくろう！';
      $('missionCard').classList.remove('done');
    }

    setAim(x) {
      const r = Words.get(this.currentLevel).r;
      this.aimX = clamp(x, r + 2, W - r - 2);
    }

    drop() {
      if (this.state !== 'playing' || this.cooldown > 0) return;
      const f = Words.get(this.currentLevel);
      const body = new Physics.Body(this.aimX, SPAWN_Y, f.r, {
        data: { level: f.lv },
        vy: 60,
        angVel: (Math.random() - 0.5) * 2
      });
      this.world.add(body);
      Sound.drop();
      this.cooldown = DROP_COOLDOWN;
      this.currentLevel = this.nextLevel;
      this.nextLevel = Words.pickDropLevel();
      this.setAim(this.aimX);
      this.updateHud();
    }

    addScore(n, x, y, text) {
      this.score += n;
      if (this.score > this.best) {
        this.best = this.score;
        this.bests[Words.genre.id] = this.best;
        saveJSON(LS_BEST, this.bests);
      }
      if (text) this.fx.scorePopup(x, y, text, '#ffe066');
      this.updateHud();
    }

    /** ごうたい しょり */
    handleMerges() {
      const contacts = this.world.contacts;
      const merged = new Set();
      for (const c of contacts) {
        const a = c.a, b = c.b;
        if (a.dead || b.dead || merged.has(a) || merged.has(b)) continue;
        if (a.data.level !== b.data.level) continue;
        merged.add(a); merged.add(b);
        a.dead = true; b.dead = true;
        const lv = a.data.level;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const f = Words.get(lv);

        this.world.remove(a);
        this.world.remove(b);

        if (lv >= Words.MAX_LEVEL) {
          // スイカ どうし → きえて 大ボーナス(ほんかと おなじ)
          this.addScore(1000, mx, my, '+1000!!');
          this.fx.burst(mx, my, '#ff5470', 40, 420);
          this.fx.ring(mx, my, f.r, '#ff5470');
          this.fx.cheer();
          this.fx.addShake(16);
          Sound.fanfare();
          Sound.say(Words.bonusCheer(f));
          continue;
        }

        const nf = Words.get(lv + 1);
        const nb = new Physics.Body(mx, my, nf.r, {
          data: { level: nf.lv },
          vx: (a.vx + b.vx) * 0.35,
          vy: (a.vy + b.vy) * 0.35 - 70,
          angVel: (a.angVel + b.angVel) * 0.4
        });
        nb.age = 0.9; // うまれた ばかりでも ゲームオーバー はんてい する
        this.world.add(nb);

        this.mergesTotal++;
        this.addScore(nf.score, mx, my - nf.r - 8, '+' + nf.score);
        this.fx.burst(mx, my, nf.c2, 12 + lv * 2, 200 + lv * 22);
        this.fx.ring(mx, my, nf.r * 0.8, nf.c1);
        this.fx.wordPopup(mx, clamp(my - nf.r - 46, 60, H - 60), nf.en, nf.ja, nf.emoji, nf.c2);
        this.fx.addShake(2 + lv * 0.8);
        Sound.merge(nf.lv);

        this.learnWord(nf);

        // ミッション たっせい？
        if (this.mission && nf.lv === this.mission.lv && !this.missionDone) {
          this.missionDone = true;
          this.addScore(100, W / 2, DEADLINE + 40, 'ミッション +100');
          $('missionCard').classList.add('done');
          this.stars++;
          saveJSON(LS_STARS, this.stars);
          Sound.fanfare();
          this.fx.cheer();
          const gen = this.generation;
          setTimeout(() => {
            if (gen === this.generation && this.state !== 'over') this.newMission();
          }, 1800);
        }
      }
    }

    /** えいごの ことばを おぼえた */
    learnWord(f) {
      Sound.say(f.en);
      this.setWordBar(f);
      this.wordsThisGame.add(f.lv);
      if (!this.discovered.has(f.lv)) {
        this.discovered.add(f.lv);
        this.books[Words.genre.id] = Array.from(this.discovered);
        saveJSON(LS_BOOK, this.books);
        this.el.wordBar.classList.add('is-new');
        setTimeout(() => this.el.wordBar.classList.remove('is-new'), 2200);
        this.stars += 2;
        saveJSON(LS_STARS, this.stars);
        this.fx.cheer();
        Sound.star();
        this._buildBook();
      }
      const chip = document.querySelector('.chain-item[data-lv="' + f.lv + '"]');
      if (chip) {
        chip.classList.add('flash');
        setTimeout(() => chip.classList.remove('flash'), 900);
      }
      this.updateHud();
    }

    setWordBar(f) {
      if (!f) {
        this.el.wordEmoji.textContent = '📖';
        this.el.wordEn.textContent = '';
        this.el.wordJa.textContent = 'おなじ ものを くっつけよう！';
        this.el.wordBar.classList.add('empty');
        return;
      }
      this.el.wordBar.classList.remove('empty');
      this.el.wordEmoji.textContent = f.emoji;
      this.el.wordEn.textContent = f.en;
      this.el.wordJa.textContent = f.ja;
    }

    updateHud() {
      this.el.score.textContent = this.score;
      this.el.best.textContent = this.best;
      this.el.stars.textContent = this.stars;
      const nf = Words.get(this.nextLevel);
      this.el.nextEmoji.textContent = nf.emoji;
      this.el.nextEn.textContent = nf.en;
      this.el.nextJa.textContent = nf.ja;
      const lvl = Math.floor(this.stars / 5) + 1;
      this.el.engLevel.textContent = 'レベル ' + lvl;
      this.el.engFill.style.width = ((this.stars % 5) / 5 * 100) + '%';
      this.el.bookCount.textContent = this.discovered.size + ' / ' + Words.LIST.length;
    }

    /* ------------------------- ゲームオーバー ------------------------- */
    checkGameOver(dt) {
      let danger = 0;
      for (const b of this.world.bodies) {
        const top = b.y - b.r;
        if (b.age > 0.75 && top < DEADLINE) {
          b.overTime += dt;
          danger = Math.max(danger, b.overTime / OVER_LIMIT);
          if (b.overTime >= OVER_LIMIT) { this.gameOver(); return 1; }
        } else {
          b.overTime = Math.max(0, b.overTime - dt * 1.6);
        }
      }
      return danger;
    }

    gameOver() {
      if (this.state === 'over') return;
      this.state = 'over';
      Sound.gameover();
      const words = Array.from(this.wordsThisGame).sort((a, b) => a - b);
      $('overScore').textContent = this.score;
      $('overBest').textContent = this.best;
      $('overWordCount').textContent = words.length;
      const list = $('overWords');
      list.innerHTML = '';
      if (!words.length) {
        list.innerHTML = '<p class="over-empty">つぎは おなじ ものを くっつけて えいごを おぼえよう！</p>';
      } else {
        words.forEach(lv => {
          const f = Words.get(lv);
          const b = document.createElement('button');
          b.className = 'over-word';
          b.innerHTML = '<span>' + f.emoji + '</span><b>' + f.en + '</b><i>' + f.ja + '</i>';
          b.addEventListener('click', () => Sound.sayEnThenJa(f.en, f.ja));
          list.appendChild(b);
        });
      }
      this.openOverlay('overOverlay');
    }

    /* ------------------------- ループ ------------------------- */
    _loop(t) {
      requestAnimationFrame(this._loop);
      if (!this.lastTime) this.lastTime = t;
      let dt = (t - this.lastTime) / 1000;
      this.lastTime = t;
      if (dt > 0.1) dt = 0.1; // タブを もどした ときの とびはね ぼうし

      let danger = 0;
      if (this.state === 'playing') {
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.acc += dt;
        let guard = 0;
        while (this.acc >= FIXED_DT && guard++ < 12) {
          this.world.step(FIXED_DT);
          this.handleMerges();
          this.acc -= FIXED_DT;
        }
        danger = this.checkGameOver(dt);
      } else {
        this.acc = 0;
      }
      this.fx.update(dt);
      this.render(t / 1000, danger);
    }

    /* ------------------------- えがく ------------------------- */
    render(time, danger) {
      const ctx = this.ctx;
      ctx.save();
      if (this.fx.shake > 0) {
        ctx.translate((Math.random() - 0.5) * this.fx.shake, (Math.random() - 0.5) * this.fx.shake);
      }
      ctx.clearRect(-30, -30, W + 60, H + 60);

      // はいけい
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#fff9ec');
      bg.addColorStop(1, '#ffeccf');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // うすい よこじま(もくめ ふう)
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#fff3dc';
      for (let y = 0; y < H; y += 56) ctx.fillRect(0, y, W, 28);
      ctx.globalAlpha = 1;

      this.drawDeadline(time, danger);
      for (const b of this.world.bodies) this.drawFruit(b);
      if (this.state === 'playing') this.drawAim();
      this.fx.draw(ctx);

      ctx.restore();
    }

    drawDeadline(time, danger) {
      const ctx = this.ctx;
      const warn = danger > 0.05;
      const pulse = 0.45 + 0.4 * Math.sin(time * (warn ? 12 : 3));
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = warn ? 4 : 2.5;
      ctx.strokeStyle = warn
        ? 'rgba(230,50,60,' + (0.5 + pulse * 0.5) + ')'
        : 'rgba(230,120,80,0.55)';
      ctx.beginPath();
      ctx.moveTo(0, DEADLINE);
      ctx.lineTo(W, DEADLINE);
      ctx.stroke();
      ctx.restore();

      ctx.font = 'bold 13px "Hiragino Maru Gothic ProN", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = warn ? 'rgba(215,35,45,0.95)' : 'rgba(200,110,70,0.7)';
      ctx.fillText(warn ? 'あぶない！ ここを こえないで' : 'ここを こえたら おわり', W - 8, DEADLINE - 5);

      if (warn) {
        const g = ctx.createLinearGradient(0, 0, 0, DEADLINE);
        g.addColorStop(0, 'rgba(255,60,60,' + (0.22 * Math.min(1, danger + 0.3)) + ')');
        g.addColorStop(1, 'rgba(255,60,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, DEADLINE);
      }
    }

    drawFruit(b) {
      const ctx = this.ctx;
      const f = Words.get(b.data.level);
      const r = b.r;

      ctx.save();
      ctx.translate(b.x, b.y);

      // かげ
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#7a4a20';
      ctx.beginPath();
      ctx.ellipse(2, r * 0.72, r * 0.92, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // からだ
      ctx.save();
      ctx.rotate(b.angle);
      const g = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.12, 0, 0, r);
      g.addColorStop(0, f.c1);
      g.addColorStop(1, f.c2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = Math.max(1.5, r * 0.055);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.stroke();

      // てかり
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.24, r * 0.16, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // え(かいてん する)
      ctx.font = (r * 1.02) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.emoji, 0, r >= 30 ? -r * 0.16 : 0);
      ctx.restore(); // かいてん おわり

      // えいごの もじは かならず まっすぐ(よみやすさ ゆうせん)
      if (r >= 29) {
        const fs = Math.max(11, r * 0.34);
        ctx.font = '800 ' + fs + 'px "Baloo 2", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ty = r * 0.52;
        ctx.lineWidth = Math.max(3, fs * 0.34);
        ctx.strokeStyle = 'rgba(60,30,10,0.55)';
        ctx.lineJoin = 'round';
        ctx.strokeText(f.en, 0, ty);
        ctx.fillStyle = '#fff';
        ctx.fillText(f.en, 0, ty);
      }
      ctx.restore();
    }

    drawAim() {
      const ctx = this.ctx;
      const f = Words.get(this.currentLevel);
      const ready = this.cooldown <= 0;

      // ガイドの せん
      ctx.save();
      ctx.setLineDash([7, 9]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = ready ? 'rgba(80,120,90,0.35)' : 'rgba(80,120,90,0.15)';
      ctx.beginPath();
      ctx.moveTo(this.aimX, SPAWN_Y + f.r);
      ctx.lineTo(this.aimX, H - 6);
      ctx.stroke();
      ctx.restore();

      ctx.globalAlpha = ready ? 1 : 0.45;
      const fake = { x: this.aimX, y: SPAWN_Y, r: f.r, angle: 0, data: { level: f.lv } };
      this.drawFruit(fake);
      ctx.globalAlpha = 1;
    }
  }

  global.addEventListener('DOMContentLoaded', () => {
    Sound.init();
    global.game = new Game();
  });
})(window);
