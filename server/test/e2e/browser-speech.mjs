// 読み上げが、日本語と英語で ちゃんと 分かれているか。実ブラウザで。
//
// **文字を直すところ（speech.js）は tests/regression.mjs が見ている。** ここで見るのは
// その先 — 実際に SpeechSynthesisUtterance に何が渡るか。lang が ja-JP になっているか、
// 声が日本語のものに差し替わっているか、速さが変わっているか。ここが違うと、文だけ
// きれいにしても「ロボットみたい」は直らない。
//
// **読み上げ機能そのものは、この端末には無い**（Chromium に音声エンジンが入っていない）。
// なので `speechSynthesis` を こちらで置き換えて、渡された中身を記録する。
// 実際に声が出るかは iPad で聞いて確かめること。
//
// Run: node test/e2e/browser-speech.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForServer } from './lib/walk.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');

const PORT = 2715;
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
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 620 } });
  const page = await ctx.newPage();
  // ページのスクリプトより先に、読み上げの口を こちらのものに替える。
  // 日本語と英語の声を1つずつ用意して、選べているかも見る。
  await page.addInitScript(() => {
    globalThis.__said = [];
    class FakeUtterance {
      constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null; }
    }
    const VOICES = [
      { name: 'Samantha', lang: 'en-US', default: true },
      { name: 'Kyoko', lang: 'ja-JP', default: false },
      { name: 'Alex', lang: 'en-US', default: false },
    ];
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, writable: true });
    Object.defineProperty(globalThis, 'speechSynthesis', {
      value: {
        getVoices: () => VOICES,
        cancel() {},
        speak(u) { globalThis.__said.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice?.name || null }); },
      },
      writable: true,
    });
  });
  await page.route('**/*', (r) => (r.request().url().includes('127.0.0.1') ? r.continue() : r.abort()));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 240000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
  await page.fill('#net-name', 'Koe'); await page.fill('#net-class', 'speech');
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 120000, polling: 250 });
  // **相棒を選んでいない子には冒険ノートが開く。** 開いたままだと ♫ のクリックを
  // ダイアログが吸ってしまう（lib/walk.mjs の openPage と同じ手当て）。
  await page.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await sleep(1200);

  const say = async (text) => {
    await page.evaluate((t) => { globalThis.__said = []; uspeak.speak(t); }, text);
    await sleep(250);
    return page.evaluate(() => globalThis.__said[0] || null);
  };

  const ja = await say('すきな 色は？');
  check('日本語は 日本語の声で読む', ja?.lang === 'ja-JP', `lang=${ja?.lang} voice=${ja?.voice}`);
  check('…日本語の声に ちゃんと 差し替わる', ja?.voice === 'Kyoko', `voice=${ja?.voice}`);
  check('…「？」は 声に渡さない', !!ja && !/[？?]/.test(ja.text), JSON.stringify(ja?.text));
  check('…速さは ふつう（遅いと間延びして機械っぽい）', ja?.rate === 1, `rate=${ja?.rate}`);

  const en = await say('What is your name?');
  check('英語は 英語の声で読む', en?.lang === 'en-US', `lang=${en?.lang} voice=${en?.voice}`);
  check('…英語の「?」は 残す（抑揚を作るので）', en?.text === 'What is your name?', JSON.stringify(en?.text));
  check('…英語は ゆっくり（聞き取って まねるため）', en?.rate < 0.9, `rate=${en?.rate}`);

  const mixed = await say('「みかん」は orange です！');
  check('日本語まじりの文も 日本語あつかい', mixed?.lang === 'ja-JP' && !/[「」！]/.test(mixed.text), JSON.stringify(mixed?.text));

  // ♫ を切ったら、声も出ないこと。
  await page.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); });
  await page.evaluate(() => document.querySelector('#sound').click());
  const muted = await say('すきな 色は？');
  check('♫ を切ったら 読み上げない', muted === null);
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
