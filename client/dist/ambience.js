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
// 通話中の曲の大きさ（ふだんの何倍か）。聞こえなくはしない：島にいることは分かるように。
const DUCK = 0.18;
const WIND_NIGHT_DROP = 0.48;   // 夜は半分近くまで落ちる

export function createAmbience({ isMuted }) {
  const state = { night: 0, on: false, started: false, busy: false, ducked: false };
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

  // ---- 足音と とびらの 音（ファイルは なく、ブラウザーが 作る。風と 同じ 考え）---------------------
  // 足音：白い ノイズの 短い つぶ（80ms）を 帯域で 絞った もの。外は 低め（土・草）、家の 中は 高め（木の 床）。
  // 歩くと 0.42 秒に 1 歩、走ると 0.28 秒、そっと 歩くと 0.7 秒で 小さく。master を 通るので ミュート・全画面で 黙る。
  let tap = null; let stepPhase = 0;
  function tapBuffer() {
    if (tap) return tap;
    tap = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.09), ctx.sampleRate);
    const d = tap.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    return tap;
  }
  function footstep({ running = false, sneaking = false, indoors = false } = {}) {
    if (!ctx || !state.on || state.busy || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = tapBuffer();
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = (indoors ? 1100 : 420) * (0.9 + Math.random() * 0.2); bp.Q.value = indoors ? 2.2 : 0.9;
    const g = ctx.createGain();
    const level = (sneaking ? 0.08 : running ? 0.34 : 0.22) * (indoors ? 0.8 : 1);
    g.gain.setValueAtTime(level, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (indoors ? 0.07 : 0.1));
    src.connect(bp).connect(g).connect(master);
    src.start(now); src.stop(now + 0.12);
  }
  // とびら：あけると 低い コトッ（110Hz）＋ 上がる 2 音（ド→ソ）、しめると コトッ＋ 下がる 1 音。
  function tone(freq, at, dur, level, type = 'sine') {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, at);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(master); o.start(at); o.stop(at + dur + 0.02);
  }
  function door(opening) {
    if (!ctx || !state.on || state.busy || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    tone(110, now, 0.16, 0.28, 'triangle');            // コトッ
    footstep({ indoors: true });                         // 木の 当たる 音
    if (opening) { tone(523, now + 0.06, 0.18, 0.12); tone(784, now + 0.17, 0.26, 0.12); }
    else tone(392, now + 0.06, 0.22, 0.1);
  }

  function apply() {
    if (!ctx) return;
    // 全画面の別ゲームやレースが上がっている間は黙る。あちらには あちらの音がある。
    // 通話中は曲を下げる。スピーカーから出た曲はマイクが拾い、相手には「雑音」になる。
    // ブラウザーのエコー消しは自分の出した音を完全には消せない（とくに iPad）。
    const wanted = state.on && !state.busy ? (state.ducked ? 0.5 * DUCK : 0.5) : 0;
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
    // 毎フレーム：歩いている 間だけ 歩幅の 時計を 進め、1 歩ごとに 足音。止まると 時計は 戻る（次の 1 歩目が すぐ 鳴る）。
    step(dt, { moving = false, running = false, sneaking = false, indoors = false } = {}) {
      if (!moving) { stepPhase = 0.3; return; }
      const period = sneaking ? 0.7 : running ? 0.28 : 0.42;
      stepPhase += dt;
      if (stepPhase >= period) { stepPhase -= period; footstep({ running, sneaking, indoors }); }
    },
    // 建物に 入った（true）／出た（false）とき。
    door,
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
    // 通話に入っているあいだ、曲を小さくする（`voice.js` が hooks の 'call' で知らせる）。
    setDucked(on) {
      if (state.ducked === !!on) return;
      state.ducked = !!on;
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
