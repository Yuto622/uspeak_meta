// 正解・不正解の 効果音（ピンポン／ブッブー）。ファイルは 使わず WebAudio で その場で 作る（軽い・オフラインでも 鳴る）。
// 判定は いつも サーバー（または オフラインの その画面）。ここは 音を 鳴らす だけ。
//   import { sfx } from './sfx.js';  sfx.judge(correct)   // true → ピンポン、false → ブッブー
// ♫ を 切って いる ときは 鳴らさない（game.js が configureSfx({ isMuted }) を わたす）。
let ctx = null; let isMuted = () => false; let last = 0;

export function configureSfx(opts = {}) { if (typeof opts.isMuted === 'function') isMuted = opts.isMuted; }

function audio() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;
  try { ctx ||= new Ctx(); if (ctx.state === 'suspended') ctx.resume?.(); return ctx; } catch { return null; }
}
// iPad は さわった あとで ないと 鳴らないので、さいしょの タップで 起こして おく。
if (typeof addEventListener === 'function') {
  const wake = () => { removeEventListener('pointerdown', wake, true); audio(); };
  addEventListener('pointerdown', wake, true);
}

function tone(a, { at, freq, to = freq, len, type = 'sine', vol = 0.12 }) {
  const o = a.createOscillator(); const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, at + len);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, at + len);
  o.connect(g); g.connect(a.destination);
  o.start(at); o.stop(at + len + 0.02);
  o.onended = () => { o.disconnect(); g.disconnect(); };
}

function play(kind) {
  if (isMuted()) return false;
  const now = Date.now();
  if (now - last < 120) return false; // 同じ 答えで 2 回 鳴らない
  last = now;
  const a = audio();
  if (!a) return false;
  try {
    const t = a.currentTime + 0.01;
    if (kind === 'right') {
      // ピンポン：明るい 2 音（E6 → C6 ではなく 上がる 2 音で「できた！」）
      tone(a, { at: t, freq: 1046.5, len: 0.16, type: 'triangle', vol: 0.14 });
      tone(a, { at: t + 0.11, freq: 1568, len: 0.32, type: 'triangle', vol: 0.13 });
      tone(a, { at: t + 0.11, freq: 3136, len: 0.18, type: 'sine', vol: 0.025 });
    } else {
      // ブッブー：ひくく やわらかい 2 回（こわく ならない 音の 大きさ）
      tone(a, { at: t, freq: 220, to: 196, len: 0.16, type: 'square', vol: 0.045 });
      tone(a, { at: t + 0.2, freq: 196, to: 165, len: 0.26, type: 'square', vol: 0.045 });
    }
    return true;
  } catch { return false; }
}

export const sfx = {
  right: () => play('right'),
  wrong: () => play('wrong'),
  // correct が true / false の ときだけ 鳴らす（エラーの 返事などは 鳴らさない）
  judge(correct) { if (correct === true) return play('right'); if (correct === false) return play('wrong'); return false; },
};
