// 環境音 — wind, birds and crickets, made by the browser rather than fetched.
//
// Roblox had SoundScatter and MusicManager with its own asset library. None of those
// files are ours to take, so the island makes its own noise: a little filtered wind, a
// few bird calls by day, crickets at night. It is quiet on purpose — this plays in a
// classroom of twenty-five iPads, and it must never compete with a child speaking.
//
// Nothing starts until a child touches the screen. iPad Safari refuses to make a sound
// before that, and asking earlier would only produce a warning in the console.

const DAY_BIRDS = [1046.5, 1318.5, 1568, 1760];   // a pentatonic-ish set: no sour notes

export function createAmbience({ isMuted }) {
  const state = { night: 0, on: false, started: false };
  let ctx = null; let master = null; let windGain = null; let nightGain = null; let timer = 0;

  function noiseBuffer() {
    const seconds = 3;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      // Brown noise: closer to wind and sea than white noise, and much less tiring.
      last = (last + Math.random() * 0.16 - 0.08) * 0.985;
      data[i] = last;
    }
    return buffer;
  }

  function start() {
    if (ctx || state.started) return;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return;
    state.started = true;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer();
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 420;
    windGain = ctx.createGain();
    windGain.gain.value = 0.5;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    // The night's own layer: crickets, kept as a slow pulse rather than a drone.
    nightGain = ctx.createGain();
    nightGain.gain.value = 0;
    nightGain.connect(master);
    apply();
    schedule();
  }

  // One bird call by day, one cricket phrase by night, then wait a while.
  function voice() {
    if (!ctx || !state.on) return;
    const now = ctx.currentTime;
    const night = state.night;
    const g = ctx.createGain();
    const osc = ctx.createOscillator();
    if (night < 0.4) {
      osc.type = 'sine';
      const note = DAY_BIRDS[Math.floor(Math.random() * DAY_BIRDS.length)];
      osc.frequency.setValueAtTime(note, now);
      osc.frequency.exponentialRampToValueAtTime(note * 1.32, now + 0.09);
      osc.frequency.exponentialRampToValueAtTime(note * 0.94, now + 0.2);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.05 * (1 - night), now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      osc.connect(g).connect(master);
      osc.start(now); osc.stop(now + 0.3);
    } else {
      osc.type = 'triangle';
      osc.frequency.value = 2400 + Math.random() * 240;
      // Three short chirps, the way a cricket actually goes.
      g.gain.setValueAtTime(0.0001, now);
      for (let i = 0; i < 3; i += 1) {
        const at = now + i * 0.12;
        g.gain.exponentialRampToValueAtTime(0.02 * night, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      }
      osc.connect(g).connect(nightGain);
      osc.start(now); osc.stop(now + 0.45);
    }
  }

  function schedule() {
    clearTimeout(timer);
    const night = state.night;
    // Birds are sparse; crickets are frequent enough to feel like a chorus.
    const wait = night < 0.4 ? 1800 + Math.random() * 4200 : 700 + Math.random() * 1200;
    timer = setTimeout(() => { voice(); schedule(); }, wait);
  }

  function apply() {
    if (!ctx) return;
    const wanted = state.on ? 0.5 : 0;
    master.gain.setTargetAtTime(wanted, ctx.currentTime, 0.4);
    // The wind drops at night and the crickets come up, so the change of hour is
    // something a child hears as well as sees.
    windGain.gain.setTargetAtTime(0.5 - state.night * 0.24, ctx.currentTime, 1.5);
    nightGain.gain.setTargetAtTime(state.night, ctx.currentTime, 1.5);
  }

  return {
    state,
    // Called every frame from the world's clock; only acts when the hour really moved.
    setNight(night) {
      if (Math.abs(night - state.night) < 0.02) return;
      state.night = night;
      apply();
    },
    setMuted(muted) {
      state.on = !muted;
      if (state.on) start();
      if (ctx?.state === 'suspended' && state.on) ctx.resume().catch(() => {});
      apply();
    },
    // The first touch or key is the browser's permission to make any sound at all.
    arm() {
      if (isMuted()) return;
      state.on = true;
      start();
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
      apply();
    },
  };
}
