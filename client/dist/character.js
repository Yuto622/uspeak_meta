// ウーピー、画面の中の。Two clips and a voice, shared by every screen the character
// appears on (英会話島 の conv.js と、英検の島の めんせつの間 の interview.js).
//
// The screens own their own markup and their own CSS — a conversation and an interview
// do not look alike — and this owns the one thing they must agree about: the mouth moves
// while, and only while, ウーピー is speaking. `data-mouth` on the stage element is the
// whole signal; everything else here is about making that true on real devices.
//
// The clips are two: idle (breathing, blinking) and talking. They share a first and last
// frame, so a short crossfade in CSS hides the join. Nothing is lip-synced: a child
// hears the sentence and sees a mouth moving, which at this age is the same thing.
export const MIN_TALK_MS = 900;         // even "Good!" should not be a flicker
export const READ_MS_PER_CHAR = 55;     // roughly how long a sentence takes to say

export function createCharacter({ stage, idle, talk, line, lang = 'en-US', rate = 0.92 }) {
  let loaded = false;
  let timer = 0;
  let last = '';

  // Fetched the first time a child actually opens a screen with ウーピー on it: an island
  // nobody visits costs nobody three megabytes.
  function load() {
    if (loaded) return;
    loaded = true;
    idle.src = 'assets/character/idle.mp4';
    talk.src = 'assets/character/talking.mp4';
    // A browser without the codec (or without the files) says so here, and the drawn owl
    // takes over. Nothing else changes.
    for (const v of [idle, talk]) v.addEventListener('error', () => { stage.dataset.video = 'off'; }, { once: true });
    idle.play?.().catch(() => { /* a tap will start it */ });
  }

  function mouth(open) {
    stage.dataset.mouth = open ? 'talking' : 'idle';
    if (open) {
      try { talk.currentTime = 0; } catch { /* not loaded yet */ }
      talk.play?.().catch(() => {});
    } else {
      talk.pause?.();
      idle.play?.().catch(() => {});
    }
  }

  // A line, spoken aloud if the browser can, with the mouth moving for as long as it
  // takes either way.
  function say(text) {
    clearTimeout(timer);
    last = text;
    if (line) line.textContent = text;
    mouth(true);
    const stop = () => { clearTimeout(timer); mouth(false); };
    const wait = Math.max(MIN_TALK_MS, String(text).length * READ_MS_PER_CHAR);
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') {
      timer = setTimeout(stop, wait);
      return;
    }
    try {
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = rate;
      utter.onend = stop;
      utter.onerror = stop;
      synth.speak(utter);
      // Some browsers never fire onend (Safari, when the tab loses focus). The clock is
      // the backstop, so the mouth never keeps moving after the room has gone quiet.
      timer = setTimeout(stop, wait + 2500);
    } catch {
      timer = setTimeout(stop, wait);
    }
  }

  function hush() {
    clearTimeout(timer);
    try { globalThis.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
    mouth(false);
  }

  return { load, say, hush, mouth, get last() { return last; } };
}

// The markup both screens use for the stage itself. Written here so the two videos, the
// drawn fallback and the line can never drift apart; the classes are styled by whichever
// screen it is dropped into.
export const characterStageHtml = (prefix) => `<video id="${prefix}-idle" class="char-idle" muted playsinline loop preload="auto" aria-hidden="true"></video>
      <video id="${prefix}-talk" class="char-talk" muted playsinline loop preload="auto" aria-hidden="true"></video>
      <div class="conv-owl" aria-hidden="true"><span class="conv-owl-face">🦉</span><i class="conv-owl-beak"></i></div>
      <p class="conv-line" id="${prefix}-line"></p>`;
