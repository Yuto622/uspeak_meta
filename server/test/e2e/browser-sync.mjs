// Browser end-to-end check: 3 real Chromium pages (teacher + 2 students) against a local
// server. Verifies movement sync + interpolation, chat + pause, gather/call, wallet
// override, reconnect after a dropped socket, auto-rejoin after reload, offline mode.
//
// Requires Playwright: `npm i -D playwright && npx playwright install chromium`
// (or set PLAYWRIGHT_MODULE_DIR to a global install and CHROMIUM_PATH to a binary).
// Run: node test/e2e/browser-sync.mjs   (not part of `npm test`; takes a few minutes)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '../..');
const require = createRequire(process.env.PLAYWRIGHT_MODULE_DIR ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, '/') : import.meta.url);
const { chromium } = require('playwright');
const SHOTS = path.resolve(serverDir, 'loadtest-results');

const PORT = 2611;
const server = spawn('node', ['src/index.js'], { cwd: serverDir, env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', TEACHER_KEY: 'testkey12345', LOG_LEVEL: 'info', ANSWER_MIN_INTERVAL_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
server.stderr.on('data', (d) => process.stdout.write('[server:err] ' + d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

async function openPage(name, { teacherKey = '', coins = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 240 } });
  const page = await ctx.newPage();
  await page.route('**/fonts.googleapis.com/**', (r) => r.abort()); // sandbox has no internet; fonts are optional
  page.on('requestfailed', (r) => console.log(`[${name}] requestfailed`, r.url(), r.failure()?.errorText));
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${name}] console.${m.type()}`, m.text()); });
  if (coins !== null) await ctx.addInitScript((c) => { localStorage.setItem('uspeak-fishing-v1', JSON.stringify({ coins: c })); }, coins);
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit', timeout: 90000 });
  await page.waitForSelector('#avatar-dialog[open]', { timeout: 90000 });
  console.log(`[${name}] page ready`);
  await page.click('#avatar-confirm');
  await page.waitForSelector('#net-lobby[open]', { timeout: 5000 });
  await page.fill('#net-name', name);
  await page.fill('#net-class', 'e2e');
  if (teacherKey) { await page.click('#net-teacher-details summary'); await page.fill('#net-key', teacherKey); }
  await page.click('#net-join');
  await page.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 30000, polling: 250 });
  await page.evaluate(async () => {
    const { STARTERS } = await import('./magic-data.js');
    if (!uspeak.rpg.adventure.progress.state.starter) uspeak.rpg.adventure.progress.chooseStarter(STARTERS[0].id);
    uspeak.rpg.close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
  });
  await sleep(300);
  return page;
}
// The chip is an icon, a count and a label in separate elements, so that narrow
// screens can drop the words and keep the number: read the whole chip.
const status = (page) => page.evaluate(() => document.querySelector('#net-status').textContent);
const pos = (page) => page.evaluate(() => ({ x: uspeak.player.position.x, z: uspeak.player.position.z, space: uspeak.net.currentSpace() }));
const remoteOf = (page, sessionId) => page.evaluate((id) => { const r = uspeak.net.remotes.get(id); return r ? { x: r.pos.x, z: r.pos.z, visible: r.group.visible, space: r.space, anim: r.anim, name: r.name } : null; }, sessionId);
const sid = (page) => page.evaluate(() => uspeak.net.sessionId);

try {
  const t0 = Date.now();
  const teacher = await openPage('Sensei', { teacherKey: 'testkey12345' });
  const a = await openPage('Aki', { coins: 500 });
  const b = await openPage('Ben');
  console.log('pages joined in', Date.now() - t0, 'ms');
  await sleep(800);
  check('status shows 3 players', (await status(a)).includes('3人'), await status(a));
  check('teacher console visible only for teacher', !(await teacher.$eval('#net-teacher-button', (e) => e.hidden)) && (await a.$eval('#net-teacher-button', (e) => e.hidden)));
  check('server wallet overrides local coins (500 -> 0)', (await a.evaluate(() => uspeak.fishing.store.state.coins)) === 0);

  // Movement sync: A walks right for 1.2 s, B should see A's remote near A's own position.
  await a.bringToFront();
  await a.keyboard.down('d'); await sleep(1200); await a.keyboard.up('d');
  await sleep(400);
  const pa = await pos(a); const ra = await remoteOf(b, await sid(a));
  const dist = ra ? Math.hypot(pa.x - ra.x, pa.z - ra.z) : Infinity;
  check('B sees A within 0.5 units after moving', dist < 0.5, `A=(${pa.x.toFixed(2)},${pa.z.toFixed(2)}) remote=(${ra?.x.toFixed(2)},${ra?.z.toFixed(2)}) visible=${ra?.visible} dist=${dist.toFixed(2)}`);

  // Interpolation smoothness: sample B's view of A while A moves; consecutive frames must not jump.
  await a.keyboard.down('a');
  const samples = [];
  // One round-trip per sample, not two: asking for A's id inside the loop halved the
  // sampling rate, and under a software renderer that left too few moving frames to
  // judge interpolation by.
  const aid = await sid(a);
  for (let i = 0; i < 30; i++) { samples.push(await remoteOf(b, aid)); await sleep(33); }
  await a.keyboard.up('a');
  const jumps = samples.slice(1).map((s, i) => Math.hypot(s.x - samples[i].x, s.z - samples[i].z));
  check('remote motion is interpolated (max frame step < 0.6 units)', Math.max(...jumps) < 0.6 && jumps.filter((j) => j > 0).length > 10, `maxStep=${Math.max(...jumps).toFixed(3)} movingFrames=${jumps.filter((j) => j > 0).length}`);

  // Chat: A sends a phrase, B and teacher receive it.
  await a.click('#net-chat-button');
  await a.click('[data-phrase="hello"]');
  const delivered = await b.waitForFunction(() => (document.querySelector('#net-chat-log')?.textContent || '').includes('Hello!'), null, { timeout: 10000, polling: 200 }).then(() => true).catch(() => false);
  check('chat phrase delivered', delivered);
  // じゆうにゅうりょく: A types their own words, on an island, with nobody in a call.
  await a.fill('#net-chat-text', 'I am on the beach!');
  await a.click('#net-chat-send');
  const typed = await b.waitForFunction(() => (document.querySelector('#net-chat-log')?.textContent || '').includes('I am on the beach!'), null, { timeout: 10000, polling: 200 }).then(() => true).catch(() => false);
  check('a typed message reaches the class without anybody joining a call', typed);
  // And the words that must not travel do not.
  await a.fill('#net-chat-text', 'call me on 090-1234-5678');
  await a.click('#net-chat-send');
  await sleep(700);
  check('a telephone number does not reach another child',
    !(await b.evaluate(() => document.querySelector('#net-chat-log')?.textContent || '')).includes('090'),
    await a.evaluate(() => document.querySelector('#toast')?.textContent || ''));

  // Teacher pauses chat.
  await teacher.click('#net-teacher-button');
  await teacher.waitForSelector('#net-t-chat');
  await teacher.click('#net-t-chat');
  await sleep(400);
  await a.click('[data-phrase="bye"]');
  await sleep(400);
  check('chat pause blocks students', !(await b.evaluate(() => document.querySelector('#net-chat-log')?.textContent || '')).includes('Goodbye'));
  await teacher.click('#net-t-chat');
  await sleep(300);

  // Teacher gathers everyone: teacher walks first, then gather; A/B positions should match.
  await teacher.bringToFront();
  await teacher.keyboard.down('s'); await sleep(900); await teacher.keyboard.up('s');
  await sleep(300);
  await teacher.click('#net-t-gather');
  await sleep(600);
  const pt = await pos(teacher); const pa2 = await pos(a); const pb2 = await pos(b);
  check('gather teleports students to teacher', Math.hypot(pt.x - pa2.x, pt.z - pa2.z) < 0.05 && Math.hypot(pt.x - pb2.x, pt.z - pb2.z) < 0.05, `T=(${pt.x.toFixed(2)},${pt.z.toFixed(2)}) A=(${pa2.x.toFixed(2)},${pa2.z.toFixed(2)}) B=(${pb2.x.toFixed(2)},${pb2.z.toFixed(2)})`);

  // Call a student: banner appears on A; clicking moves A to teacher.
  await teacher.evaluate(() => uspeak.net.room.send('teacher', { cmd: 'roster' }));
  await sleep(300);
  const aId = await sid(a);
  await teacher.click(`[data-call="${aId}"]`);
  await a.waitForSelector('#net-call', { timeout: 3000 });
  check('call banner shown on student', true);
  await a.click('#net-call-go');

  // Reconnect after a dropped socket (iPad background): must be back online within 3 s.
  const t1 = Date.now();
  await a.evaluate(() => uspeak.net.room.leave(false));
  await a.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 10000, polling: 250 });
  const recon = Date.now() - t1;
  check('reconnect after socket drop < 3000 ms', recon < 3000, `${recon} ms`);
  check('B still sees A after reconnect', !!(await remoteOf(b, await sid(a))));
  check('A keeps its sessionId on token reconnect', (await sid(a)) === aId);

  // Full page reload (Safari memory purge): auto-rejoin by name without the lobby.
  const t2 = Date.now();
  await a.reload({ waitUntil: 'commit', timeout: 120000 });
  await a.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 120000, polling: 250 });
  check('auto-rejoin after reload (no lobby)', !(await a.$eval('#net-lobby', (d) => d.open)), `${Date.now() - t2} ms`);
  await sleep(500);
  check('player count back to 3 after takeover', (await status(b)).includes('3人'), await status(b));

  // Server-judged answers via the real hook path: Aki answers a Willow lesson question.
  await a.evaluate(() => uspeak.hooks.emit('answer', { q: 'lesson:0:0', c: 0 }));
  await sleep(300);
  await teacher.evaluate(() => uspeak.net.room.send('teacher', { cmd: 'roster' }));
  await sleep(400);
  const rosterText = await teacher.evaluate(() => document.querySelector('#net-roster').textContent);
  check('teacher roster shows Aki 1/1 correct', /Aki[\s\S]*1\/1/.test(rosterText), rosterText.replace(/\s+/g, ' ').slice(0, 120));

  // Offline mode still works: B leaves, plays alone.
  await b.evaluate(() => uspeak.net.leave());
  await sleep(300);
  check('offline mode after leaving', (await status(b)).includes('オフライン'));
  await sleep(300);
  check('others see B removed', (await status(a)).includes('2人'), await status(a));
  const { mkdirSync } = await import('node:fs'); mkdirSync(SHOTS, { recursive: true });
  await a.screenshot({ path: path.join(SHOTS, 'e2e-student.png') });
  await teacher.screenshot({ path: path.join(SHOTS, 'e2e-teacher.png') });
} catch (err) {
  console.log('E2E ERROR', err);
  results.push({ name: 'script', ok: false, detail: String(err) });
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
