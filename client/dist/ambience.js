// 島の音 — 風と、昼と夜の BGM。
//
// Roblox had SoundScatter and MusicManager with its own asset library. None of those
// files are ours to take, so the wind is made by the browser itself; the two pieces of
// music were handed to us (assets/bgm/SOURCE.json). It is quiet on purpose — this plays
// in a classroom of twenty-five iPads, and it must never compete with a child speaking.
//
// **鳥と虫の鳴き声はもう作っていない。** 以前はブラウザーが自分でオシレーターを鳴らして
// いたが（昼は鳥、夜は虫）、どちらも結局は電子音で、後ろで「ピピピ」と鳴り続けるのが
// 耳につくと言われた。曲が入ったいまは、時間帯を伝える仕事は BGM のほうが上手にやる。
//
// Nothing starts until a child touches the screen. iPad Safari refuses to make a sound
// before that, and asking earlier would only produce a warning in the console.

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

// **2曲を同時には落とさない。** 1曲2.85MB で、2つで 5.7MB。実測すると、教室に入る
// ところで流れるバイトの**ほとんどがこれ**だった（ページ全体が 2.6MB なのに対して 5.7MB）。
//
// いま鳴るほうだけを落とし、**もう片方は空が変わりはじめてから**取りに行く（`setNight`）。
// 夕方は120秒あるので、学校の回線でも十分に間に合う。昼のあいだ（300秒）は夜の曲を
// 持たないので、授業のはじめに流れるのは半分で済む。

// 風の強さ。**曲が入るまでは 0.5 だった。** 後ろで「ゴー」と鳴り続ける音は、単体だと
// 気にならなくても、曲と重なると曲の下ごしらえを全部塗りつぶす（うるさいと言われた）。
// 10分の1にしてある。ここは「聞こえる音」ではなく「静かすぎないための音」でよい。
const WIND_LEVEL = 0.05;
const WIND_NIGHT_DROP = 0.48;   // 夜は半分近くまで落ちる

export function createAmbience({ isMuted }) {
  const state = { night: 0, on: false, started: false, busy: false };
  let ctx = null; let master = null; let windGain = null;
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

    startMusic();
    apply();
  }

  // 曲は最初のタッチのあとで読みに行く。1曲3分・約2.8MB あるので、音を切っている
  // 教室に黙って5MB 落とさせない。
  function addTrack(key) {
    if (!ctx || !music || music[key]) return;
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
      return;
    }
    el.play?.().catch(() => { /* まだ許可が下りていない。次のタッチで鳴る */ });
    music[key] = { el, node };
    apply();
  }

  function startMusic() {
    if (music || !ctx) return;
    music = {};
    addTrack(state.night < 0.5 ? 'day' : 'night');
  }

  function apply() {
    if (!ctx) return;
    // 全画面の別ゲームやレースが上がっている間は黙る。あちらには あちらの音がある。
    const wanted = state.on && !state.busy ? 0.5 : 0;
    master.gain.setTargetAtTime(wanted, ctx.currentTime, 0.4);
    // 夜は風も引く。時間帯が変わったことは、見えるだけでなく聞こえてほしい。
    windGain.gain.setTargetAtTime(WIND_LEVEL * (1 - state.night * WIND_NIGHT_DROP), ctx.currentTime, 1.5);
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
      if (music) {
        // **いま鳴るべきほうは必ず持つ。** 最初のタッチが世界の時計より先に来ることが
        // あり（夜に入ってきた子）、そのときは昼の曲だけ持って夜に立っている。
        addTrack(night < 0.5 ? 'day' : 'night');
        // 入れ替わりが始まったら両方。ここが唯一「もう片方」を取りに行くところ。
        if (night > 0.02 && night < 0.98) { addTrack('day'); addTrack('night'); }
      }
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
