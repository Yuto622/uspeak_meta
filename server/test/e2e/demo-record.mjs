// 営業用デモ動画の 撮影（1 シーンずつ）。node test/e2e/demo-record.mjs <scene> <outdir>
// サーバーを 同じ プロセスで 立てる：クイズの 正解を サーバーの 中から 読んで、正しく 答える 手を 打つため。
process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.PREMIUM_ISLANDS = '';
process.env.CALLS_NEED_TEACHER = 'off';
process.env.TEACHER_KEY = process.env.TEACHER_KEY || 'demo-teacher-key-123';

const { startServer } = await import('../../src/index.js');
const { matchMaker } = (await import('colyseus')).default;
const { launch, openGame, record } = await import('./demo-lib.mjs');
const { CONV } = await import('../../src/game/conv.js');
const { rankings, boardPayload } = await import('../../src/game/rankings.js');
const { Client } = await import('colyseus.js');

const [scene, out] = process.argv.slice(2);
const FPS = Number(process.env.FPS || 15);
const server = await startServer({ port: 0 });
const port = server.server.address().port;
const browser = await launch();

// 時間（秒）に そって 手を 打つ。record の step から 毎コマ 呼ぶ。
function timeline() {
  const q = [];
  return {
    at(t, fn) { q.push({ t, fn }); q.sort((a, b) => a.t - b.t); },
    async run(t) { while (q.length && q[0].t <= t + 1e-6) { const { fn } = q.shift(); await fn(t); } },
  };
}

const roomOf = async (page) => {
  const sid = await page.evaluate(() => uspeak.net.sessionId);
  for (const r of await matchMaker.query({ name: 'class' })) {
    const room = matchMaker.getRoomById(r.roomId);
    if (room?.priv?.has(sid)) return { room, priv: room.priv.get(sid) };
  }
  return null;
};

// クイズの 1 問を 正しく 答える 手（クリックする 要素の じゅんばん）。
function solveSteps(fmt) {
  const tap = (sel) => ({ sel });
  const text = (scope, t) => ({ scope, text: t });
  switch (fmt.kind) {
    case 'mc': case 'listen': case 'picture': return [tap(`.fmt-choice[data-v="${CSS(fmt.answer ?? fmt.word)}"]`)];
    case 'fill': return [tap(`.fmt-cards .fmt-choice[data-v="${CSS(fmt.answer)}"]`), tap('.fmt-check')];
    case 'spell': return [...[...String(fmt.word)].map((c) => text('.fmt-tile:not(.used)', c)), tap('.fmt-check')];
    case 'order': return [...String(fmt.sentence).split(/\s+/).map((w) => text('.fmt-tile:not(.used)', w)), tap('.fmt-check')];
    case 'match': return [...fmt.pairs.flatMap((p) => [text('.fmt-card[data-side=l]', p.en), text('.fmt-card[data-side=r]', p.ja)]), tap('.fmt-check')];
    case 'type': return [...[...String(fmt.word).toLowerCase()].map((c) => text('.fmt-key', c)), tap('.fmt-key-enter')];
    default: return [];
  }
}
const CSS = (v) => String(v).replace(/["\\]/g, '\\$&');
async function doStep(page, s) {
  await page.evaluate((s) => {
    let el = null;
    if (s.sel) el = document.querySelector(`dialog[open] ${s.sel}`);
    else el = [...document.querySelectorAll(`dialog[open] ${s.scope}`)].find((e) => e.textContent.trim() === s.text);
    if (el) el.click(); else console.warn('demo: no target', JSON.stringify(s));
  }, s);
}

const scenes = {
  // 1) 島を あるく：スタートから 小屋の ほうへ。
  async walk(page) {
    await page.waitForTimeout(2000);
    const tl = timeline();
    tl.at(0.2, () => page.keyboard.down('w'));
    tl.at(2.6, () => page.keyboard.down('d'));
    tl.at(3.4, () => page.keyboard.up('d'));
    tl.at(6.2, () => page.keyboard.up('w'));
    return record(page, out, { seconds: Number(process.env.DUR || 7), fps: FPS, step: (i, t) => tl.run(t) });
  },
  // 2) 英単語ハウス：サーバーが 出す 問題を 正解して コインが ふえる。
  async quiz(page) {
    await page.evaluate(() => { const m = uspeak.rpg.main; const o = m.origin || { x: 0, z: 0 }; uspeak.net.teleportTo({ space: 'main', x: o.x + 22, z: o.z + 2 }); });
    await page.waitForTimeout(2500);
    const tl = timeline();
    let lastQ = null; let busyUntil = 0;
    tl.at(0.4, () => page.evaluate(() => uspeak.net.wordhouse.open('hut_easy')));
    tl.at(1.6, () => doStep(page, { sel: '.wh-go' }));
    const solver = async (i, t) => {
      await tl.run(t);
      if (t < 2.2 || t < busyUntil) return;
      const st = await roomOf(page);
      const set = st?.priv?.wh;
      const it = set?.items?.[set.i];
      if (!it || it.id === lastQ) return;
      const shown = await page.evaluate(() => !!document.querySelector('dialog[open] .fmt-body') && !document.querySelector('dialog[open] .fmt-feedback:not([hidden])'));
      if (!shown) return;
      lastQ = it.id;
      const steps = solveSteps(it.fmt);
      const gap = it.fmt.kind === 'type' || it.fmt.kind === 'spell' ? 0.22 : 0.4;
      let at = t + 0.9;
      for (const s of steps) { tl.at(at, () => doStep(page, s)); at += gap; }
      busyUntil = at + 0.5;
    };
    return record(page, out, { seconds: Number(process.env.DUR || 16), fps: FPS, step: solver });
  },

  // 3) AI えいかいわ：カフェの 家で ウーピーと 話す（鍵が 無い ときは 台本の 相手）。
  async conv(page) {
    const cafe = CONV.spotById.get('cafe');
    await page.evaluate(({ id, x, z }) => uspeak.net.teleportTo({ space: id, x, z }), { id: CONV.id, x: cafe.wx, z: cafe.wz + 2 });
    await page.waitForTimeout(3000);
    // ウーピーの 2 本の 動画（ふつう・口が うごく）を 撮る 前に 読みこんでおく（仮の 時計の 間は 読みこみが はじまらない）。
    await page.evaluate(() => uspeak.net.conv.enter('cafe'));
    await page.waitForFunction(() => [...document.querySelectorAll('#conv-stage video')].every((v) => v.readyState >= 3), null, { timeout: 30000 }).catch(() => console.log('demo: videos not ready'));
    await page.evaluate(() => document.querySelector('#conv-close')?.click());
    await page.waitForTimeout(800);
    const tl = timeline();
    const typeLine = (t0, text) => { [...text].forEach((_, k) => tl.at(t0 + k * 0.05, () => page.evaluate((v) => { const b = document.querySelector('#conv-text'); if (b) b.value = v; }, text.slice(0, k + 1)))); return t0 + text.length * 0.05; };
    tl.at(0.3, () => page.evaluate(() => uspeak.net.conv.enter('cafe')));
    tl.at(1.8, () => doStep(page, { sel: '[data-topic="hello"]' }));
    let e = typeLine(4.0, 'Hi! My name is Kai.');
    tl.at(e + 0.4, () => doStep(page, { sel: '#conv-send' }));
    e = typeLine(e + 3.6, 'I like soccer and pizza.');
    tl.at(e + 0.4, () => doStep(page, { sel: '#conv-send' }));
    return record(page, out, { seconds: Number(process.env.DUR || 15), fps: FPS, step: (i, t) => tl.run(t) });
  },
  // 4) ランキング：クラスの いろいろな 指標（中身は サーバーの rankings.js で 作った 見本の クラス）。
  async rank(page) {
    await page.waitForTimeout(1500);
    const names = ['Kai', 'Hina', 'Sota', 'Yui', 'Riku', 'Mei', 'Haru', 'Aoi', 'Ren', 'Sakura', 'Yuto', 'Koharu'];
    const rnd = (k) => { const x = Math.sin(k * 99.7) * 10000; return x - Math.floor(x); };
    const recs = names.map((name, i) => ({ name, week_key: 1, week_xp: Math.round(120 + rnd(i) * 480), level: 3 + Math.round(rnd(i + 20) * 9), xp: 40, correct: Math.round(150 + rnd(i + 40) * 600), attempts: Math.round(260 + rnd(i + 40) * 700), study_ms: Math.round((60 + rnd(i + 60) * 300) * 60000), study_days: Math.round(8 + rnd(i + 80) * 30), login_streak: Math.round(2 + rnd(i + 100) * 20), coins: Math.round(300 + rnd(i + 120) * 2400), catches: Math.round(rnd(i + 140) * 60), chats: Math.round(10 + rnd(i + 160) * 90) }));
    recs[0].week_xp = 560; recs[0].correct = 702;
    const boards = boardPayload(rankings(recs, { weekKey: 1 }), 'Kai');
    const tl = timeline();
    tl.at(0.3, () => page.evaluate(() => document.querySelector('#rank-button')?.click()));
    const fake = () => page.evaluate((b) => uspeak.net.room.onMessageHandlers.emit('rank', { boards: b, name: 'Kai', top: [], mine: null }), boards);
    tl.at(0.9, fake);
    tl.at(3.4, () => doStep(page, { sel: '[data-rank-key="correct"]' }));
    tl.at(5.4, () => doStep(page, { sel: '[data-rank-key="study_min"]' }));
    tl.at(7.4, () => doStep(page, { sel: '[data-rank-key="streak"]' }));
    return record(page, out, { seconds: Number(process.env.DUR || 9.5), fps: FPS, step: (i, t) => tl.run(t) });
  },
  // 5) 先生の じゅぎょうモード：生徒の 一覧 → ぜんいん ストップ。
  async teacher(page) {
    await page.waitForTimeout(1500);
    const tl = timeline();
    tl.at(0.4, () => page.evaluate(() => document.querySelector('#class-mode-button')?.click()));
    tl.at(3.0, () => doStep(page, { sel: '#cm-freeze' }));
    tl.at(4.6, () => page.evaluate(() => { const b = [...document.querySelectorAll('#cm-confirm button')].find((x) => /Yes|はい|OK/i.test(x.textContent)) || document.querySelector('#cm-confirm button'); b?.click(); }));
    return record(page, out, { seconds: Number(process.env.DUR || 8), fps: FPS, step: (i, t) => tl.run(t) });
  },
  // 6) 生徒の 画面：先生が ストップ を おすと、ぜんいんの 画面が とまる。
  async freeze(page) {
    await page.waitForTimeout(1500);
    const teacher = await new Client(`ws://127.0.0.1:${port}`).joinOrCreate('class', { classCode: 'demo', name: 'Tanaka', teacherKey: process.env.TEACHER_KEY });
    teacher.onMessage('*', () => {});
    await page.waitForTimeout(1500);
    const tl = timeline();
    tl.at(0.2, () => page.keyboard.down('w'));
    tl.at(1.6, () => { teacher.send('class:freeze', { on: true }); });
    tl.at(1.8, () => page.keyboard.up('w'));
    tl.at(5.6, () => { teacher.send('class:freeze', { on: false }); });
    return record(page, out, { seconds: Number(process.env.DUR || 7), fps: FPS, step: async (i, t) => { await tl.run(t); if (i % 3 === 0) await page.waitForTimeout(60); } });
  },
};

// 先生の 画面の うしろに いる 生徒（同じ クラスに つなぐ だけ）。
async function joinStudents(n) {
  const names = ['Hina', 'Sota', 'Yui', 'Riku', 'Mei', 'Haru', 'Aoi', 'Ren'];
  const out = [];
  for (const name of names.slice(0, n)) { const r = await new Client(`ws://127.0.0.1:${port}`).joinOrCreate('class', { classCode: 'demo', name }); r.onMessage('*', () => {}); out.push(r); }
  return out;
}

try {
  if (scene === 'teacher') await joinStudents(8);
  const { page } = await openGame(browser, port, { name: process.env.NAME || (scene === 'teacher' ? 'Tanaka' : 'Kai'), teacher: scene === 'teacher' });
  page.on('console', (m) => { if (/demo:|Error/.test(m.text())) console.log('[page]', m.text().slice(0, 200)); });
  const t0 = Date.now();
  const n = await scenes[scene](page);
  console.log(scene, n, 'frames in', Math.round((Date.now() - t0) / 1000), 's');
} finally {
  await browser.close();
  await server.shutdown('demo').catch(() => {});
  process.exit(0);
}
