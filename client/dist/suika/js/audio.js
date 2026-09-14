/* =========================================================================
 * audio.js -- えいごの はつおん(Web Speech API)と こうかおん(Web Audio API)
 * -------------------------------------------------------------------------
 * ネットに つながって いなくても うごくように、こうかおんは その場で
 * つくって いる(おんがくファイルを ダウンロードしない)。
 * ========================================================================= */
(function (global) {
  'use strict';

  const Sound = {
    voiceOn: true,
    sfxOn: true,
    _ctx: null,
    _enVoice: null,
    _jaVoice: null,
    _ready: false,

    init() {
      if (global.speechSynthesis) {
        this._loadVoices();
        // Chrome は voice の よみこみが おくれるので イベントでも ひろう
        global.speechSynthesis.onvoiceschanged = () => this._loadVoices();
      }
    },

    _loadVoices() {
      if (!global.speechSynthesis) return;
      const voices = global.speechSynthesis.getVoices() || [];
      if (!voices.length) return;
      const en = voices.filter(v => /^en(-|_)/i.test(v.lang) || /^en$/i.test(v.lang));
      // こどもが ききとりやすい はっきりした こえを ゆうせん
      const prefer = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny',
                      'Karen', 'Moira', 'Alex', 'Daniel'];
      let best = null;
      for (const name of prefer) {
        best = en.find(v => v.name.indexOf(name) >= 0);
        if (best) break;
      }
      this._enVoice = best || en.find(v => /en-US/i.test(v.lang)) || en[0] || null;
      this._jaVoice = voices.find(v => /^ja/i.test(v.lang)) || null;
      this._ready = true;
    },

    /** ブラウザの おとの ロックを はずす(さいしょの タップで よぶ) */
    unlock() {
      try {
        if (!this._ctx) {
          const AC = global.AudioContext || global.webkitAudioContext;
          if (AC) this._ctx = new AC();
        }
        if (this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
      } catch (e) { /* おとが なくても ゲームは できる */ }
      if (global.speechSynthesis && !this._ready) this._loadVoices();
    },

    /** えいごを ゆっくり しゃべる */
    say(text, opts) {
      opts = opts || {};
      if (!this.voiceOn || !global.speechSynthesis) return;
      try {
        global.speechSynthesis.cancel();
        const u = new global.SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        if (this._enVoice) u.voice = this._enVoice;
        u.rate = opts.rate != null ? opts.rate : 0.78;  // こどもむけに ゆっくり
        u.pitch = opts.pitch != null ? opts.pitch : 1.1;
        u.volume = 1;
        global.speechSynthesis.speak(u);
      } catch (e) { /* ignore */ }
    },

    /** えいご → すこし まって にほんご、の じゅんばんで よむ */
    sayEnThenJa(en, ja) {
      if (!this.voiceOn || !global.speechSynthesis) return;
      this.say(en);
      if (!this._jaVoice || !ja) return;
      try {
        const u = new global.SpeechSynthesisUtterance(ja);
        u.lang = 'ja-JP';
        u.voice = this._jaVoice;
        u.rate = 0.95;
        u.volume = 0.85;
        global.speechSynthesis.speak(u); // キューに つづけて はいる
      } catch (e) { /* ignore */ }
    },

    /** つづりを 1もじずつ よむ (A - P - P - L - E) */
    spell(word) {
      if (!this.voiceOn || !global.speechSynthesis) return;
      this.say(word.toUpperCase().split('').join(', '), { rate: 0.6 });
    },

    stopVoice() {
      if (global.speechSynthesis) {
        try { global.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      }
    },

    /* ------------------------- こうかおん ------------------------- */
    _tone(freq, dur, type, gain, delay, slideTo) {
      if (!this.sfxOn) return;
      this.unlock();
      const ctx = this._ctx;
      if (!ctx) return;
      const t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    },

    drop() { this._tone(320, 0.09, 'sine', 0.10, 0, 200); },

    /** ごうたいの おと。レベルが 上がるほど 高く・はなやかに */
    merge(level) {
      const base = 380 + level * 52;
      this._tone(base, 0.14, 'triangle', 0.18);
      this._tone(base * 1.5, 0.16, 'sine', 0.12, 0.05);
      if (level >= 6) this._tone(base * 2, 0.2, 'sine', 0.10, 0.1);
    },

    fanfare() {
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((f, i) => this._tone(f, 0.25, 'triangle', 0.16, i * 0.11));
    },

    correct() {
      this._tone(784, 0.13, 'triangle', 0.18, 0);
      this._tone(1046, 0.2, 'triangle', 0.18, 0.11);
    },

    wrong() {
      this._tone(230, 0.16, 'sawtooth', 0.10, 0, 160);
    },

    gameover() {
      const notes = [523, 440, 349, 262];
      notes.forEach((f, i) => this._tone(f, 0.34, 'sine', 0.16, i * 0.2));
    },

    star() {
      this._tone(1200, 0.1, 'sine', 0.12, 0, 1800);
    }
  };

  global.Sound = Sound;
})(window);
