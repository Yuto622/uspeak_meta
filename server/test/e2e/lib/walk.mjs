// Shared browser-driving helpers: join a class, and walk the avatar somewhere with the
// keyboard. Both island e2e scripts steer a real character rather than teleporting it,
// because walking is the thing being tested.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function makeHelpers({ browser, port, viewport = { width: 420, height: 320 } }) {
  async function openPage(name, { klass = 'e2e', teacherKey = '', initScript = null } = {}) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    // Runs before the page's own scripts: how a test stands something in for a device the
    // headless browser does not have.
    if (initScript) await page.addInitScript(initScript);
    await page.route('**/fonts.googleapis.com/**', (r) => r.abort());
    page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console.error`, m.text()); });
    // Generous: a headless container with no GPU renders these islands at a few frames a
    // second, and a third browser on the same four cores takes minutes to reach the avatar
    // screen. The test waits on the page, never on the clock.
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'commit', timeout: 240000 });
    await page.waitForSelector('#avatar-dialog[open]', { timeout: 240000 });
    await page.click('#avatar-confirm');
    await page.waitForSelector('#net-lobby[open]', { timeout: 60000 });
    await page.fill('#net-name', name);
    await page.fill('#net-class', klass);
    // A teacher joins through the same lobby, with the key in the 先生用 section — which
    // is folded shut, so it is opened first, exactly as a teacher would.
    if (teacherKey) {
      await page.evaluate(() => { document.querySelector('#net-teacher-details').open = true; });
      await page.fill('#net-key', teacherKey);
    }
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

  const pos = (page) => page.evaluate(() => ({ x: uspeak.player.position.x, z: uspeak.player.position.z, space: uspeak.net.currentSpace(), facing: uspeak.player.rotation.y }));

  const COMBOS = [['w'], ['w', 'a'], ['a'], ['s', 'a'], ['s'], ['s', 'd'], ['d'], ['w', 'd']];

  // Walk there. Camera yaw is not exposed, so calibrate once by taking a step: 'w' moves
  // the avatar along one world heading, and the other seven combos sit at 45-degree steps
  // from it.
  //
  // The heading is measured from where the avatar actually ended up, not from what it
  // says it is facing. A browser rendering three frames a second can swallow a short
  // press entirely, and reading the facing then returns the direction it was already
  // pointing — which sends the whole walk off by whatever that happened to be.
  async function calibrate(page) {
    const before = await pos(page);
    await page.keyboard.down('w');
    let now = before;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      await sleep(120);
      now = await pos(page);
      if (Math.hypot(now.x - before.x, now.z - before.z) > 0.4) break;
    }
    await page.keyboard.up('w');
    await sleep(150);
    const moved = Math.hypot(now.x - before.x, now.z - before.z);
    // Walking into a wall teaches nothing; fall back to what the avatar says it faces.
    return moved > 0.15 ? Math.atan2(now.x - before.x, now.z - before.z) : now.facing;
  }

  async function walkTo(page, name, tx, tz, base, { arrive = 2.5, timeout = 45000 } = {}) {
    const t0 = Date.now();
    // Walking to a building now takes the child inside it, and inside is a different
    // set of coordinates. That is an arrival, not a wander, so the walk ends there.
    const from = (await pos(page)).space;
    let held = [];
    const release = async () => { for (const k of held) await page.keyboard.up(k).catch(() => {}); held = []; };
    let best = Infinity;
    let stuckSince = Date.now();
    let detour = 0;              // steps to swing aside when a shop is in the way
    while (Date.now() - t0 < timeout) {
      const p = await pos(page);
      if (p.space !== from) { console.log(`  walked into ${name} (${p.space})`); break; }
      const dx = tx - p.x;
      const dz = tz - p.z;
      const gap = Math.hypot(dx, dz);
      // Any progress at all counts. A browser rendering three frames a second walks a
      // child slowly, and treating slow as stuck sends it round in circles.
      if (gap < best - 0.05) { best = gap; stuckSince = Date.now(); detour = 0; }
      if (gap < arrive) break;
      // Walking into a building gets you nowhere; step round it, as a child would.
      if (Date.now() - stuckSince > 2500) { detour = detour === 2 ? -2 : detour + 1; stuckSince = Date.now(); }
      // Heading we want, expressed the way the game expresses facing.
      const want = Math.atan2(dx, dz);
      const turn = (((want - base) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const step = ((Math.round(turn / (Math.PI / 4)) + detour) % 8 + 8) % 8;
      const keys = COMBOS[step];
      if (keys.join() !== held.join()) {
        await release();
        for (const k of keys) await page.keyboard.down(k);
        held = keys;
      }
      await sleep(gap > 8 ? 200 : 90);
    }
    await release();
    await sleep(250);
    const p = await pos(page);
    if (p.space !== from) return 0;
    const gap = Math.hypot(tx - p.x, tz - p.z);
    console.log(`  walked to ${name}: gap ${gap.toFixed(2)} (closest ${best.toFixed(2)}) in ${Date.now() - t0} ms`);
    return gap;
  }

  return { openPage, pos, calibrate, walkTo, sleep };
}
