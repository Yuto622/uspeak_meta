// 「ABC と おと」の みじかい うた（チャンツ）— はくの 音に あわせて 1 行ずつ 声で 読む。音の ファイルは 持たない。
//
//   import { playChant, stopChant } from './abc-chant.js';
//   playChant([{ text: 'A, a, apple' }, { text: 'A, a, ant' }], { accent: 'us', slow: false, onLine(i, line) {}, onEnd() {} });
//
// ・はく（ドン・チッ・ドン・チッ）は WebAudio で その場で 作る。sfx.js と 同じ AudioContext・同じ ♫ の スイッチ
//   （♫ を 切って いる ときは 音も 声も 出さず、行だけ 同じ はやさで 進める＝画面は 動く）。
// ・声は いつもの 道（speech.js の playVoice＝サーバーの 自然な 声 → だめなら 端末の 声）。
//   **サーバーの 声は アメリカ式だけ**（/api/tts に なまりの 指定が ない）。accent: 'uk' の ときは 端末の イギリスの 声
//   （en-GB）が あれば それで 読み、なければ いつもの 声で 読む。
// ・どこで 失敗しても 例外を 外に 出さない（声が 出なくても 行は 進み、onEnd は 呼ばれる）。
import { playVoice, stopVoice } from './speech.js';
import { sfxContext, sfxMuted } from './sfx.js';
import { playSounds, stopSounds } from './phonics-play.js';

let token = 0;
let nodes = [];   // 予約した 音（止める とき用）
let timers = [];

const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
function hush() {
  for (const t of timers) clearTimeout(t);
  timers = [];
  for (const nd of nodes) { try { nd.stop?.(); } catch { /* もう 止まって いる */ } try { nd.disconnect?.(); } catch { /* */ } }
  nodes = [];
}

export function stopChant() {
  token += 1;
  hush();
  try { stopVoice(); } catch { /* */ }
  try { stopSounds(); } catch { /* */ }
  try { globalThis.speechSynthesis?.cancel(); } catch { /* */ }
}

// ドン（低い たいこ）と チッ（小さな シェーカー）。
function kick(ctx, at, vol = 0.5) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(48, at + 0.13);
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  o.connect(g); g.connect(ctx.destination); o.start(at); o.stop(at + 0.22); nodes.push(o, g);
}
let noiseBuf = null;
function tick(ctx, at, vol = 0.16) {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  }
  const src = ctx.createBufferSource(); const hp = ctx.createBiquadFilter(); const g = ctx.createGain();
  src.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 5200; g.gain.value = vol;
  src.connect(hp); hp.connect(g); g.connect(ctx.destination); src.start(at); nodes.push(src, hp, g);
}
function clap(ctx, at) { tick(ctx, at, 0.3); tick(ctx, at + 0.012, 0.22); }
// 1 小節（4 はく）を 予約する。
function bar(ctx, at, beat) {
  for (let b = 0; b < 4; b += 1) { if (b % 2 === 0) kick(ctx, at + b * beat); else tick(ctx, at + b * beat); tick(ctx, at + b * beat + beat / 2, 0.07); }
}

// 端末の 声で 読む（lang の 声が あれば それ）。読みおわり・失敗で done()。
function device(text, lang, slow, done) {
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance !== 'function') { done(); return; }
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = slow ? 0.7 : 0.92; u.pitch = 1.1;
    const voice = (synth.getVoices?.() || []).find((v) => String(v.lang).replace('_', '-').toLowerCase() === lang.toLowerCase());
    if (voice) u.voice = voice;
    u.onend = done; u.onerror = done;
    synth.cancel(); synth.speak(u);
  } catch { done(); }
}
const hasBritish = () => { try { return (globalThis.speechSynthesis?.getVoices?.() || []).some((v) => /^en[-_]GB/i.test(String(v.lang))); } catch { return false; } };

export function playChant(lines, { accent = 'us', slow = false, onLine, onEnd } = {}) {
  stopChant();
  const me = token;
  const list = (Array.isArray(lines) ? lines : []).filter((l) => l && typeof l.text === 'string' && l.text.trim()).slice(0, 24);
  const safe = (fn, ...a) => { try { fn?.(...a); } catch { /* 画面の 都合で 止めない */ } };
  if (!list.length) { safe(onEnd); return; }
  const beat = 60 / (slow ? 76 : 96);       // 1 はくの 秒
  const barMs = beat * 4 * 1000;
  let muted = false; let ctx = null;
  try { muted = sfxMuted(); if (!muted) ctx = sfxContext(); } catch { ctx = null; }
  const uk = accent === 'uk' && hasBritish();

  function line(i) {
    if (me !== token) return;
    if (i >= list.length) {
      // おわり：パン・パン
      try { if (ctx && !muted) { const at = ctx.currentTime + 0.05; clap(ctx, at); clap(ctx, at + beat / 2); } } catch { /* */ }
      later(() => { if (me === token) { hush(); safe(onEnd); } }, beat * 1000);
      return;
    }
    safe(onLine, i, list[i]);
    const started = Date.now();
    let bars = 0; let spoken = false; let moved = false;
    // 小節を 1 つずつ 足しながら、声が おわった つぎの 小節の 頭で 次の 行へ（さいだい 4 小節）。
    const addBar = () => {
      if (me !== token || moved) return;
      if (spoken && bars >= 1) { moved = true; line(i + 1); return; }
      if (bars >= 4) { moved = true; try { stopVoice(); globalThis.speechSynthesis?.cancel(); } catch { /* */ } line(i + 1); return; }
      try { if (ctx && !muted) bar(ctx, ctx.currentTime + 0.03, beat); } catch { /* 音が 出なくても 進める */ }
      bars += 1;
      later(addBar, barMs);
    };
    const done = () => { if (me === token) spoken = true; };
    addBar();
    if (muted) { spoken = true; return; }
    const text = list[i].text.trim();
    // 行に steps（{say} と フォニックスの おと {snd}）が あれば、その じゅんに 鳴らす（"S … sss sss … sun"）。
    if (Array.isArray(list[i].steps) && list[i].steps.length) {
      (async () => {
        for (const st of list[i].steps) {
          if (me !== token) return;
          try {
            if (st.snd) await playSounds(st.snd, { gap: st.gap ?? 0.25 });
            else if (st.say) {
              await new Promise((res) => {
                const t = setTimeout(res, 1400 + String(st.say).length * 110);
                const end = () => { clearTimeout(t); res(); };
                if (uk) device(st.say, 'en-GB', slow, end);
                else playVoice(st.say, { japanese: false, slow, onend: end, fallback: () => device(st.say, 'en-US', slow, end) });
              });
            }
          } catch { /* つぎへ */ }
        }
        done();
      })();
      later(() => { if (me === token && !spoken && Date.now() - started >= barMs * 3 - 50) spoken = true; }, barMs * 3);
      return;
    }
    try {
      if (uk) device(text, 'en-GB', slow, done);
      else playVoice(text, { japanese: false, slow, onend: done, fallback: () => { if (me === token) device(text, 'en-US', slow, done); } });
    } catch { done(); }
    // 声の おわりが 知らされない 端末でも 止まらない ように（小節 2 つ ぶんで おわった ことに する）。
    later(() => { if (me === token && !spoken && Date.now() - started >= barMs * 2 - 50) spoken = true; }, barMs * 2);
  }
  line(0);
}
