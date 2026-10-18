// 営業用デモ動画の撮影の部品：時計を止めて 1 コマずつ 進めて 写す（このコンテナは 1 秒に 数コマしか 描けないため）。
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { waitForServer } from './lib/walk.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
export const serverDir = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');


// 動画用の 仮の 時計：performance.now と requestAnimationFrame だけ 差しかえる。
// ふだんは 本物と 同じ。__vt.manual = true の 間は __vt.step(ms) で 1 コマずつ すすむ。
const VT_SHIM = `(() => {
  const realNow = performance.now.bind(performance), realRaf = window.requestAnimationFrame.bind(window);
  const realSet = window.setTimeout.bind(window), realClear = window.clearTimeout.bind(window);
  const realSetI = window.setInterval.bind(window), realClearI = window.clearInterval.bind(window);
  const vt = window.__vt = { manual: false, t: 0, off: 0, q: [], timers: new Map(), seq: 1e6 };
  performance.now = () => vt.manual ? vt.t : realNow() - vt.off;
  window.requestAnimationFrame = (cb) => { if (vt.manual) { vt.q.push(cb); return vt.q.length; } return realRaf((ts) => cb(performance.now())); };
  // 仮の 時計の 間に 作られた タイマーは 仮の 時間で 鳴る（CSS の アニメと 画面の 切りかえが 動画の 時間に そろう）。
  window.setTimeout = (fn, ms = 0, ...args) => { if (!vt.manual || typeof fn !== 'function') return realSet(fn, ms, ...args); const id = ++vt.seq; vt.timers.set(id, { at: vt.t + Math.max(0, +ms || 0), fn, args }); return id; };
  window.clearTimeout = (id) => { if (vt.timers.has(id)) vt.timers.delete(id); else realClear(id); };
  window.setInterval = (fn, ms = 0, ...args) => { if (!vt.manual || typeof fn !== 'function') return realSetI(fn, ms, ...args); const id = ++vt.seq; vt.timers.set(id, { at: vt.t + Math.max(16, +ms || 0), every: Math.max(16, +ms || 0), fn, args }); return id; };
  window.clearInterval = (id) => { if (vt.timers.has(id)) vt.timers.delete(id); else realClearI(id); };
  const anims = () => { try { return document.getAnimations(); } catch { return []; } };
  vt.start = () => { vt.t = performance.now(); vt.manual = true; for (const a of anims()) a.pause(); };
  vt.step = (ms) => {
    const end = vt.t + ms;
    for (;;) {
      let next = null;
      for (const [id, tm] of vt.timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
      if (!next) break;
      const [id, tm] = next; vt.t = Math.max(vt.t, tm.at);
      if (tm.every) tm.at += tm.every; else vt.timers.delete(id);
      try { tm.fn(...tm.args); } catch (e) { console.error(e); }
    }
    vt.t = end;
    for (const a of anims()) { try { if (a.playState === 'running') a.pause(); if (a.playState === 'paused') a.currentTime = (a.currentTime || 0) + ms; } catch {} }
    // 動画（ウーピー）も 仮の 時間で 1 コマずつ すすめる。ページが play() した ものだけ（vtPlaying）。
    for (const v of document.querySelectorAll('video')) {
      try {
        if (!v.paused) { v.dataset.vtPlaying = '1'; realPause.call(v); }
        if (v.dataset.vtPlaying === '1' && v.duration > 0) v.currentTime = (v.currentTime + ms / 1000) % v.duration;
      } catch {}
    }
    const q = vt.q; vt.q = []; for (const cb of q) { try { cb(vt.t); } catch (e) { console.error(e); } }
  };
  // 動画の シークが 終わるまで まつ（本物の 時計で、長くても 1.5 秒）。
  vt.settle = () => new Promise((resolve) => { const t0 = realNow(); const poll = () => { const busy = [...document.querySelectorAll('video')].some((v) => v.seeking); if (!busy || realNow() - t0 > 1500) resolve(); else realSet(poll, 15); }; poll(); });
  const realPlay = HTMLMediaElement.prototype.play, realPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function () { if (vt.manual) { this.dataset.vtPlaying = '1'; if (this.readyState < 2) { const v = this; realPlay.call(v).then(() => { if (vt.manual) realPause.call(v); }).catch(() => {}); } return Promise.resolve(); } return realPlay.call(this); };
  HTMLMediaElement.prototype.pause = function () { if (vt.manual) { this.dataset.vtPlaying = ''; } return realPause.call(this); };
  vt.stop = () => {
    vt.off = realNow() - vt.t; vt.manual = false;
    const q = vt.q; vt.q = []; for (const cb of q) realRaf(() => cb(performance.now()));
    for (const [, tm] of vt.timers) { const left = Math.max(0, tm.at - vt.t); if (tm.every) realSet(() => realSetI(tm.fn, tm.every, ...tm.args), left); else realSet(tm.fn, left, ...tm.args); }
    vt.timers.clear();
    for (const a of anims()) { try { if (a.playState === 'paused') a.play(); } catch {} }
  };
})();`;

export async function startServer(port, env = {}) {
  const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(port), STORE_BACKEND: 'memory', LOG_LEVEL: 'error', PREMIUM_ISLANDS: '', CALLS_NEED_TEACHER: 'off', ...env }, stdio: 'ignore' });
  await waitForServer(port);
  return server;
}
export async function launch() {
  return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
}
export async function openGame(browser, port, { name, cls = 'demo', teacher = false, w = 1280, h = 720, scale = 1.5, clock = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, hasTouch: false });
  await ctx.addInitScript(VT_SHIM);
  // 撮影用の Chromium には 声が ない（読み上げが すぐ おわって、ウーピーの 口が 動かない）。
  // 声なしに して、ゲームの「文字数 × 55ms だけ 口を 動かす」道を 使わせる。
  if (process.env.CHAR_WEBM_DIR) await ctx.addInitScript(() => { try { Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }); } catch {} });
  const page = await ctx.newPage();
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
  // 撮影用の Chromium は H.264 を 再生できない。同じ 動画の WebM 版を わたす（ゲームの ファイルは そのまま）。
  if (process.env.CHAR_WEBM_DIR) {
    // シークは Range（206）で 取りにくるので、その 形で かえす（まるごと 返すと シークが 止まる）。
    await page.route('**/assets/character/*.mp4', (r) => {
      const file = path.join(process.env.CHAR_WEBM_DIR, path.basename(new URL(r.request().url()).pathname).replace(/\.mp4$/, '.webm'));
      const buf = fs.readFileSync(file);
      const m = /bytes=(\d+)-(\d*)/.exec(r.request().headers().range || '');
      if (!m) return r.fulfill({ status: 200, body: buf, headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-length': String(buf.length) } });
      const start = Number(m[1]); const end = m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
      return r.fulfill({ status: 206, body: buf.subarray(start, end + 1), headers: { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${buf.length}`, 'content-length': String(end - start + 1) } });
    });
  }
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await page.evaluate(() => document.querySelector('#avatar-confirm').click());
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.fill('#net-name', name); await page.fill('#net-class', cls);
  if (teacher) await page.evaluate((k) => { document.querySelector('#net-key').value = k; }, process.env.TEACHER_KEY || 'demo-teacher-key-123');
  await page.evaluate(() => document.querySelector('#net-join').click());
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  return { ctx, page };
}

// 時計を 止めて、fps で seconds 秒ぶん 1 コマずつ 写す。step(i, t) は 毎コマの 前に 呼ばれる（キー・クリックなど）。
export async function record(page, dir, { seconds, fps = 30, step = null, settle = 0 }) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  await page.evaluate(() => window.__vt.start());
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) {
    if (step) await step(i, i / fps);
    await page.evaluate((ms) => window.__vt.step(ms), 1000 / fps);
    await page.evaluate(() => window.__vt.settle());
    if (settle) await page.waitForTimeout(settle);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 88, timeout: 120000 });
  }
  await page.evaluate(() => window.__vt.stop());
  return n;
}
