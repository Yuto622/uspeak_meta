/**
 * Sound, synthesised on the fly with Web Audio.
 *
 * Nothing is loaded from disk: the game ships as one HTML file, and embedding
 * samples would dwarf it. Everything here is oscillators and envelopes, which
 * also means a pop can be pitched to the chain it belongs to rather than being
 * the same clip every time.
 *
 * Browsers refuse to start audio before the user interacts with the page, so
 * the context is created lazily and resumed on the first input.
 */

/** Semitone offsets of a major pentatonic scale, the safe-sounding one. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

/** A4 in Hz; every pitch here is a semitone offset from it. */
const A4 = 440;

/** @param {number} semitones from A4 @returns {number} Hz */
function pitch(semitones) {
  return A4 * 2 ** (semitones / 12);
}

export class SoundBoard {
  /** @param {{muted?: boolean, volume?: number}} [options] */
  constructor({ muted = false, volume = 0.5 } = {}) {
    this.muted = muted;
    this.volume = volume;
    /** @type {AudioContext|null} */
    this.context = null;
    this.master = null;
    this.failed = false;
  }

  /**
   * Brings the audio context up. Safe to call on every input: it is a no-op
   * once running, and the first call is what satisfies the autoplay policy.
   */
  unlock() {
    if (this.failed) return;
    if (!this.context) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) {
        this.failed = true;
        return;
      }
      try {
        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.context.destination);
      } catch {
        // No audio available: the game plays on in silence.
        this.failed = true;
        return;
      }
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  /** @param {boolean} muted */
  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.now, 0.01);
    }
  }

  get now() {
    return this.context ? this.context.currentTime : 0;
  }

  /**
   * One enveloped note.
   *
   * @param {{
   *   at?: number, freq: number, duration?: number, type?: OscillatorType,
   *   gain?: number, sweep?: number, attack?: number,
   * }} options
   *   sweep: ratio to glide the pitch to over the note, 1 for a steady tone
   */
  note({ at = 0, freq, duration = 0.18, type = 'triangle', gain = 0.3, sweep = 1, attack = 0.005 }) {
    if (this.failed || this.muted) return;
    this.unlock();
    if (!this.context) return;

    const start = this.now + at;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (sweep !== 1) {
      oscillator.frequency.exponentialRampToValueAtTime(freq * sweep, start + duration);
    }
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  /** A short burst of filtered noise, for thuds and nuisance. */
  noise({ at = 0, duration = 0.12, gain = 0.2, frequency = 900 }) {
    if (this.failed || this.muted) return;
    this.unlock();
    if (!this.context) return;

    const start = this.now + at;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, start);

    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.master);
    source.start(start);
  }

  // -- game sounds ----------------------------------------------------------

  /**
   * A word popping: one rising note per letter, so a long word is audibly a
   * bigger event than a short one, and the whole run is transposed up by the
   * chain it landed in.
   *
   * @param {{length: number, chain?: number, common?: boolean}} options
   */
  word({ length, chain = 1, common = false }) {
    const base = 4 + (chain - 1) * 3;
    const notes = Math.min(length, PENTATONIC.length);
    for (let i = 0; i < notes; i += 1) {
      this.note({
        at: i * 0.055,
        freq: pitch(base + PENTATONIC[i]),
        duration: 0.2,
        type: 'triangle',
        gain: 0.26,
      });
      // A second voice a fifth up thickens the longer words.
      if (length >= 5) {
        this.note({
          at: i * 0.055,
          freq: pitch(base + PENTATONIC[i] + 7),
          duration: 0.16,
          type: 'sine',
          gain: 0.1,
        });
      }
    }
    // Everyday words get a small chime on top -- the ones worth remembering.
    if (common) {
      this.note({
        at: notes * 0.055 + 0.02,
        freq: pitch(base + 24),
        duration: 0.3,
        type: 'sine',
        gain: 0.14,
      });
    }
  }

  /**
   * A colour group popping. The pitch steps up with each link, the way the
   * original game's chain voice does.
   *
   * @param {number} chain
   */
  chain(chain) {
    const base = 2 + Math.min(chain - 1, 11) * 2;
    this.note({ freq: pitch(base), duration: 0.16, type: 'square', gain: 0.14 });
    this.note({ at: 0.02, freq: pitch(base + 7), duration: 0.2, type: 'triangle', gain: 0.22 });
  }

  /** The pair coming to rest. */
  land() {
    this.noise({ duration: 0.09, gain: 0.16, frequency: 520 });
    this.note({ freq: pitch(-17), duration: 0.1, type: 'sine', gain: 0.16, sweep: 0.6 });
  }

  /** Sideways nudge. Quiet enough to hold a key down through. */
  move() {
    this.note({ freq: pitch(6), duration: 0.035, type: 'square', gain: 0.045 });
  }

  rotate() {
    this.note({ freq: pitch(11), duration: 0.05, type: 'square', gain: 0.06, sweep: 1.25 });
  }

  /** Nuisance raining in. */
  garbage() {
    for (let i = 0; i < 4; i += 1) {
      this.noise({ at: i * 0.045, duration: 0.1, gain: 0.13, frequency: 380 });
    }
  }

  /** Field swept clean. */
  allClear() {
    [0, 4, 7, 12, 16, 19].forEach((step, i) => {
      this.note({
        at: i * 0.07,
        freq: pitch(4 + step),
        duration: 0.42,
        type: 'triangle',
        gain: 0.2,
      });
    });
  }

  gameOver() {
    [0, -3, -6, -12].forEach((step, i) => {
      this.note({
        at: i * 0.16,
        freq: pitch(2 + step),
        duration: 0.5,
        type: 'triangle',
        gain: 0.22,
      });
    });
  }

  levelUp() {
    [0, 5, 12].forEach((step, i) => {
      this.note({ at: i * 0.06, freq: pitch(6 + step), duration: 0.22, gain: 0.16, type: 'sine' });
    });
  }
}
