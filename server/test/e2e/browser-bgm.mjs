// 昼と夜の BGM を、本物のブラウザーで鳴らして測る。
//
// 見ているのは「鳴るか」ではなく **「どこで音量が決まっているか」** の4つ：
//   1. 2曲とも本当に配信されている（audio/mpeg で 200）
//   2. 昼は昼の曲、夜は夜の曲 — 世界の時計に合わせて **音量で** 入れ替わる
//   3. 全画面の別ゲームが上がっている間は島が黙る（あちらにはあちらの音がある）
//   4. ♫ を切ったら黙る
//
// **音量を `<audio>` の volume で扱っていたら、ここは全部素通りしてしまう。**
// iPad Safari が volume を無視するせいで、教室の端末でだけ効かない、という出かたを
// するからで、だから測るのは GainNode の値のほう。
//
// Run: node test/e2e/browser-bgm.mjs   (not part of `npm test`)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHelpers, waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2708;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node', ['src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
await waitForServer(PORT);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const { openPage } = makeHelpers({ browser, port: PORT, viewport: { width: 420, height: 320 } });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

// GainNode は setTargetAtTime でじわじわ動く（夕方をかけて入れ替わる作りなので、
// 時定数は2.5秒ある）。落ち着くまで待ってから読む。
const levels = (page) => page.evaluate(() => {
  const st = globalThis.__bgm;
  return {
    day: st.music.day.node.gain.value,
    night: st.music.night.node.gain.value,
    master: st.master.gain.value,
    wind: st.windGain.gain.value,
    dayPlaying: !st.music.day.el.paused,
    nightPlaying: !st.music.night.el.paused,
  };
});
// **時刻はフレームループが毎フレーム書き戻す。** `ambience.setNight()` を外から呼んでも、
// 次のフレームで本物の世界時計の値に戻される（実際それで昼の検査が落ちた）。
// なので差し込むのは世界時計そのものの出口 — `game.js` の `worldClock(net.night.update(…))`。
// ここから先（atmosphere も ambience も）は、いつもと同じ道を通る。11分待てないだけ。
const holdNight = (page, value) => page.evaluate((v) => {
  const n = uspeak.net.night;
  if (!n.__realUpdate) { n.__realUpdate = n.update.bind(n); }
  globalThis.__night = v;
  n.update = (t, dt, space) => {
    const w = n.__realUpdate(t, dt, space);
    return w ? { ...w, night: globalThis.__night } : w;
  };
}, value);

const settle = async (page, want, ms = 14000) => {
  const until = Date.now() + ms;
  for (;;) {
    const got = await levels(page);
    if (want(got)) return got;
    if (Date.now() > until) return got;
    await sleep(500);
  }
};

try {
  // 1. まず配信そのもの。
  for (const key of ['day', 'night']) {
    const res = await fetch(`http://127.0.0.1:${PORT}/assets/bgm/${key}.mp3`);
    const len = Number(res.headers.get('content-length') || 0);
    check(`${key}.mp3 が配信されている`, res.ok && /audio\/mpeg/.test(res.headers.get('content-type') || '') && len > 1e6,
      `${res.status} ${res.headers.get('content-type')} ${(len / 1e6).toFixed(1)}MB`);
    res.body?.cancel();
  }

  const page = await openPage('Ongaku');
  // 最初のタッチが音の許可。ここまでは1バイトも落としていない（曲は arm() のあと）。
  await page.mouse.click(210, 160);
  await page.waitForFunction(() => uspeak.ambience?.state.started, null, { timeout: 30000, polling: 200 });
  // 中を覗くための取っ手。AudioContext のノードは state には出てこない。
  await page.evaluate(() => {
    const a = uspeak.ambience;
    globalThis.__bgm = a.__debug || null;
  });
  const wired = await page.evaluate(() => !!globalThis.__bgm?.music?.day);
  check('2曲とも AudioContext につながっている（volume ではなく GainNode）', wired);
  if (!wired) throw new Error('no music graph');

  // 2. 昼。
  await holdNight(page, 0);
  const day = await settle(page, (g) => g.day > 0.31 && g.night < 0.02);
  check('昼は昼の曲だけが鳴る', day.day > 0.30 && day.night < 0.03,
    `day=${day.day.toFixed(3)} night=${day.night.toFixed(3)}`);
  check('島の音そのものは出ている', day.master > 0.3, `master=${day.master.toFixed(3)}`);
  // **風は曲より一桁小さいこと。** 後ろで「ゴー」と鳴り続ける音は、単体だと気にならなくても
  // 曲と重なると曲を塗りつぶす（実際にうるさいと言われて 0.5 → 0.05 に落とした）。
  check('風は曲より一桁小さい', day.wind > 0 && day.wind < day.day / 5,
    `wind=${day.wind.toFixed(3)} bgm=${day.day.toFixed(3)}`);

  // 夕方：どちらも鳴っていて、合わせても痩せない（等電力なので二乗和が一定）。
  await holdNight(page, 0.5);
  // 落ち着くまで待つ：0.1 を越えた瞬間に読むと、まだ入れ替わっている途中の値が出る。
  const dusk = await settle(page, (g) => Math.abs(g.day - g.night) < 0.02 && g.night > 0.2);
  const power = Math.hypot(dusk.day, dusk.night);
  check('夕方は2曲が重なり、音の力は昼と変わらない', dusk.day > 0.2 && dusk.night > 0.2 && Math.abs(power - 0.34) < 0.03,
    `day=${dusk.day.toFixed(3)} night=${dusk.night.toFixed(3)} power=${power.toFixed(3)}`);

  // 3. 夜。
  await holdNight(page, 1);
  const night = await settle(page, (g) => g.night > 0.31 && g.day < 0.02);
  check('夜は夜の曲に入れ替わっている', night.night > 0.30 && night.day < 0.03,
    `day=${night.day.toFixed(3)} night=${night.night.toFixed(3)}`);

  // 4. 全画面の別ゲーム。フレームループが setBusy を握っているので、開けば黙る。
  await page.evaluate(() => uspeak.net.blockwild.open());
  const busy = await settle(page, (g) => g.master < 0.02 && !g.dayPlaying && !g.nightPlaying);
  check('同梱ゲームが上がっている間、島は黙る', busy.master < 0.02, `master=${busy.master.toFixed(3)}`);
  check('曲は止まる（gain 0 のまま mp3 を解き続けない）', !busy.dayPlaying && !busy.nightPlaying,
    `day=${busy.dayPlaying} night=${busy.nightPlaying}`);
  await page.evaluate(() => uspeak.net.blockwild.close());
  const back = await settle(page, (g) => g.master > 0.3 && g.nightPlaying);
  check('閉じれば島の音が戻る', back.master > 0.3 && back.nightPlaying, `master=${back.master.toFixed(3)}`);

  // 5. ♫ を切る。
  await page.click('#sound');
  const muted = await settle(page, (g) => g.master < 0.02);
  check('♫ を切ったら黙る', muted.master < 0.02, `master=${muted.master.toFixed(3)}`);
  await page.click('#sound');
  const on = await settle(page, (g) => g.master > 0.3);
  check('もう一度押せば戻る', on.master > 0.3, `master=${on.master.toFixed(3)}`);
} catch (err) {
  console.log('E2E ERROR', err);
  results.push({ name: 'script', ok: false });
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
