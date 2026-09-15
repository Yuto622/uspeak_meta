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

// 昼と夜の BGM。渡された音源をそのまま置いてある（assets/bgm/SOURCE.json）。
//
// **2曲は同時に流し、音量だけで混ぜる。** 時間帯で鳴らし分けて切り替えると、夕方の
// その一瞬で曲が変わり、そこだけ場面転換のように聞こえる。世界の時計は昼から夜へ
// なめらかに動くので、音もそう動かす — 夕方は2曲が重なり、夜になりきったときに
// 昼の曲は消えている。
//
// **音量は `<audio>` の volume ではなく GainNode で扱う。** iPad の Safari は
// `audio.volume` を無視する（読むだけ）。あそこで混ぜようとすると、教室で使う端末で
// だけ効かない、というたちの悪い出かたをする。
const BGM = { day: 'assets/bgm/day.mp3', night: 'assets/bgm/night.mp3' };
const BGM_LEVEL = 0.34;   // 環境音と同じ考え方：子どもの声に勝ってはいけない

// 風の強さ。**曲が入るまでは 0.5 だった。** 後ろで「ゴー」と鳴り続ける音は、単体だと
// 気にならなくても、曲と重なると曲の下ごしらえを全部塗りつぶす（うるさいと言われた）。
// 10分の1にしてある。ここは「聞こえる音」ではなく「静かすぎないための音」でよい。
const WIND_LEVEL = 0.05;
const WIND_NIGHT_DROP = 0.48;   // 夜は半分近くまで落ちる（虫の声と入れ替わる）

export function createAmbience({ isMuted }) {
  const state = { night: 0, on: false, started: false, busy: false };
  let ctx = null; let master = null; let windGain = null; let nightGain = null; let timer = 0;
  let music = null; let hush = 0;

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
    windGain.gain.value = WIND_LEVEL;
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();

    // The night's own layer: crickets, kept as a slow pulse rather than a drone.
    nightGain = ctx.createGain();
    nightGain.gain.value = 0;
    nightGain.connect(master);
    startMusic();
    apply();
    schedule();
  }

  // 曲は最初のタッチのあとで読みに行く。1曲3分・約2.8MB あるので、音を切っている
  // 教室に黙って5MB 落とさせない。
  function startMusic() {
    if (music || !ctx) return;
    music = {};
    for (const key of Object.keys(BGM)) {
      const el = new Audio(BGM[key]);
      el.loop = true;
      el.preload = 'auto';
      const node = ctx.createGain();
      node.gain.value = 0;
      try {
        ctx.createMediaElementSource(el).connect(node).connect(master);
      } catch {
        // **つなげなかったら、その曲は鳴らさない。** ここで諦めずに play() すると、
        // master を通らない＝音量つまみもミュートも効かない BGM が全開で出る。
        // 教室でそれをやるくらいなら、曲なしのほうがいい。
        continue;
      }
      el.play?.().catch(() => { /* まだ許可が下りていない。次のタッチで鳴る */ });
      music[key] = { el, node };
    }
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
    // 全画面の別ゲームやレースが上がっている間は黙る。あちらには あちらの音がある。
    const wanted = state.on && !state.busy ? 0.5 : 0;
    master.gain.setTargetAtTime(wanted, ctx.currentTime, 0.4);
    // The wind drops at night and the crickets come up, so the change of hour is
    // something a child hears as well as sees.
    windGain.gain.setTargetAtTime(WIND_LEVEL * (1 - state.night * WIND_NIGHT_DROP), ctx.currentTime, 1.5);
    nightGain.gain.setTargetAtTime(state.night, ctx.currentTime, 1.5);
    if (!music) return;
    // 等電力の混ぜかた。足して1にすると、ちょうど半分のところで音が痩せて聞こえる。
    // 時定数が長いのはわざと：夕方のあいだをかけて、昼の曲が夜の曲に入れ替わる。
    const turn = state.night * Math.PI / 2;
    music.day?.node.gain.setTargetAtTime(Math.cos(turn) * BGM_LEVEL, ctx.currentTime, 2.5);
    music.night?.node.gain.setTargetAtTime(Math.sin(turn) * BGM_LEVEL, ctx.currentTime, 2.5);
    // 黙っているあいだは曲そのものを止める。gain 0 のまま流しても音は出ないが、
    // iPad は mp3 を解き続けていて、そのぶんだけ電池が減る。消え終わってから止める。
    clearTimeout(hush);
    if (wanted === 0) hush = setTimeout(() => { for (const m of Object.values(music)) m.el.pause(); }, 900);
    else for (const m of Object.values(music)) if (m.el.paused) m.el.play?.().catch(() => {});
  }

  return {
    state,
    // 検査用の取っ手（`browser-bgm.mjs`）。AudioContext のノードは state には出てこないが、
    // **音量がどこで決まっているかを外から測れないと、iPad でだけ効かない直しが通ってしまう。**
    get __debug() { return ctx ? { ctx, master, music, windGain } : null; },
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
    // 全画面のもの（同梱ゲーム・グランプリ）が上がっている間は、島の音をしまう。
    // 毎フレーム呼ばれるので、変わったときだけ動く。
    setBusy(busy) {
      if (state.busy === !!busy) return;
      state.busy = !!busy;
      apply();
    },
    // The first touch or key is the browser's permission to make any sound at all.
    arm() {
      if (isMuted()) return;
      // すでに鳴っている（か、全画面のゲーム中でわざと黙らせている）なら、ここから先は
      // 毎回やる必要がない。arm() はタッチのたびに呼ばれる。
      const stopped = Object.values(music || {}).some((m) => m.el.paused);
      if (state.started && ctx?.state === 'running' && (state.busy || !stopped)) return;
      state.on = true;
      start();
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
      // 1回目のタッチで play() が弾かれることがある（音の許可が下りる順番は端末による）。
      // タッチのたびに押し直すのは安いので、鳴っていなければもう一度頼む。
      if (!state.busy) for (const m of Object.values(music || {})) if (m.el.paused) m.el.play?.().catch(() => {});
      apply();
    },
  };
}
