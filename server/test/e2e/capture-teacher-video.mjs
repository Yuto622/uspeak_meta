// 先生むけ「宿題の 使い方」動画を 撮りなおす（画面を かえたら）。
//   node test/e2e/capture-teacher-video.mjs <出力フォルダ>
//   → <出力フォルダ>/*.webm を MP4 に：ffmpeg -i X.webm -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart -an client/dist/assets/guide/teacher-homework.mp4
//   表紙：ffmpeg -ss 4 -i teacher-homework.mp4 -frames:v 1 -q:v 4 client/dist/assets/guide/teacher-homework.jpg
//   さいごに 出る marks.json の 秒を server/src/homework/page.js の 章（data-t）に。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
const require = createRequire('/home/user/uspeak_meta/server/package.json');
const { chromium } = require('playwright');
const PORT = 2795; const OUT = process.argv[2];
const srv = spawn('node', ['src/index.js'], { cwd: '/home/user/uspeak_meta/server', env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'file', DATA_DIR: mkdtempSync('/tmp/claude-0/hwvid-'), ADMIN_KEY: 'owner-password-123', REPORT_SECRET: 'test-report-secret-0123456789', LOG_LEVEL: 'error', OPENAI_API_KEY: '' }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break; } catch {} await sleep(300); }
  const base = `http://127.0.0.1:${PORT}`;
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-password-123', redirect: 'manual' });
  const admin = (login.headers.get('set-cookie') || '').split(';')[0];
  await fetch(`${base}/admin/api/classrooms`, { method: 'PUT', headers: { cookie: admin, 'x-requested-with': 'uspeak-admin', 'content-type': 'application/json' }, body: JSON.stringify({ rows: [{ name: 'さくら英会話', classes: 'sakura', password: 'sakura-pass-1' }] }) });
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  // ログインは 録画の 外で すませる
  const pre = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const pp = await pre.newPage();
  await pp.goto(`${base}/teacher/homework`); await pp.fill('input[name=password]', 'sakura-pass-1'); await pp.click('button[type=submit]'); await pp.waitForSelector('#read');
  const cookies = await pre.cookies(); await pre.close();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: OUT, size: { width: 1280, height: 800 } } });
  await ctx.addCookies(cookies);
  await ctx.addInitScript(() => { try { localStorage.setItem('uspeak-hw-first-seen', '1'); } catch {} });
  const p = await ctx.newPage();
  const t0 = Date.now(); const marks = {};
  await p.goto(`${base}/teacher/homework`); await p.waitForSelector('#read');
  // 字幕・マウス・枠
  await p.addStyleTag({ content: `#cap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99;max-width:1000px;padding:14px 22px;border-radius:16px;background:#1b3a2fee;color:#fff;font:800 24px/1.45 "Noto Sans JP",sans-serif;box-shadow:0 10px 30px #0006;text-align:center}
    #cap small{display:block;font-size:17px;font-weight:600;opacity:.85}
    #cur{position:fixed;z-index:100;width:26px;height:26px;margin:-4px 0 0 -4px;pointer-events:none;transition:left .7s ease,top .7s ease}
    #cur::before{content:'';position:absolute;inset:0;background:#fff;clip-path:polygon(0 0,0 80%,22% 62%,38% 100%,52% 94%,36% 58%,64% 58%);filter:drop-shadow(0 0 2px #000) drop-shadow(0 2px 3px #0008)}
    #cur.down::after{content:'';position:absolute;left:-14px;top:-14px;width:40px;height:40px;border-radius:50%;border:4px solid #e27a2d;animation:ring .5s ease-out}
    @keyframes ring{from{transform:scale(.4);opacity:1}to{transform:scale(1.4);opacity:0}}
    .hl{outline:5px solid #e27a2d !important;outline-offset:4px;border-radius:14px;transition:outline-color .3s}` });
  await p.evaluate(() => { const c = document.createElement('div'); c.id = 'cap'; document.body.append(c); const m = document.createElement('div'); m.id = 'cur'; m.style.left = '640px'; m.style.top = '420px'; document.body.append(m); });
  const cap = (t, s = '') => p.evaluate(([t, s]) => { document.getElementById('cap').innerHTML = `${t}${s ? `<small>${s}</small>` : ''}`; }, [t, s]);
  const hl = (sel, on = true) => p.evaluate(([sel, on]) => { document.querySelectorAll('.hl').forEach((e) => e.classList.remove('hl')); const e = sel && document.querySelector(sel); if (e && on) { e.classList.add('hl'); e.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, [sel, on]);
  const move = async (sel) => { const box = await p.locator(sel).first().boundingBox(); if (!box) return; await p.evaluate(([x, y]) => { const c = document.getElementById('cur'); c.style.left = `${x}px`; c.style.top = `${y}px`; }, [box.x + box.width / 2, box.y + box.height / 2]); await sleep(800); };
  const click = async (sel) => { await move(sel); await p.evaluate(() => { const c = document.getElementById('cur'); c.classList.remove('down'); void c.offsetWidth; c.classList.add('down'); }); await p.click(sel); await sleep(500); };
  const mark = (k) => { marks[k] = Math.max(0, Math.round((Date.now() - t0) / 1000) - 1); };

  mark('start');
  await cap('📝 宿題の 使い方（1 分）', 'プリントを 入れる → たしかめる → くばる の 3 ステップです');
  await sleep(3500);
  await cap('① プリントの 写真・PDF・Word・Excel を この わくに おきます', '「ファイルを えらぶ」か「写真を とる」でも 入れられます');
  await hl('#drop'); await move('#drop .pick label'); await sleep(3500);
  await cap('はりつけた 文も 読めます（1 行に 1 もん）', 'れい： apple = りんご');
  await hl('#paste-box'); await click('#paste-box summary'); await sleep(1200);
  await p.fill('#text', 'apple = りんご\nbanana = バナナ\norange = オレンジ\nI (like) cats. わたしは ねこが すきです。\nI play soccer every day. わたしは まいにち サッカーを します。');
  await p.dispatchEvent('#text', 'input'); await sleep(1800);
  await cap('「🔍 読みとる」を おすと、問題と 答えに わけます'); await hl('#read'); await sleep(1200);
  await click('#read'); await p.waitForSelector('#step2:not([hidden])'); await hl(null);
  mark('check');
  await cap('② 読みとった 問題を たしかめます', 'AI は まちがえる ことが あります。くばるまで 子どもには 出ません');
  await hl('#check-banner'); await sleep(3800);
  await cap('ゲームの 形を えらべます（7 しゅるい）', '上の ボタンで ぜんぶ まとめて かえる ことも できます');
  await hl('#kinds'); await move('#kinds [data-kind="mc"]'); await sleep(2600);
  await cap('なおしたい ところは その場で 書きかえるだけ', '赤い 問題は くばる 前に なおします');
  await hl('#rows .q'); await move('#rows .q input[data-f="second"]'); await sleep(2800);
  await cap('「👀 せいとの 画面で みる」で 子どもの 画面を ためせます'); await hl('#preview'); await sleep(1000);
  await click('#preview'); await p.waitForSelector('#pv-dlg[open] .fmt'); await sleep(1500);
  await cap('子どもと おなじ ように おして ○× を ためせます（記録は のこりません）');
  await click('#pv-host .fmt button:has-text("りんご")'); await sleep(2200);
  await click('#pv-dlg [data-close]'); await sleep(600);
  await cap('よければ「つぎへ」'); await hl('#next3'); await click('#next3'); await p.waitForSelector('#step3:not([hidden])'); await hl(null);
  mark('send');
  await cap('③ 名前と しめきりを きめます', '「1 しゅうかんご」などの ボタンで かんたんに えらべます');
  await hl('#title'); await click('#title'); await p.type('#title', 'Unit 3 の ことば', { delay: 60 }); await sleep(600);
  await hl('#quick'); await click('#quick [data-d="7"]'); await sleep(1600);
  await cap('「📤 くばる」で クラスの 子の しゅくだい島に すぐ 出ます', 'あとで やめたり なおしたり できます'); await hl('#savepub'); await sleep(2000);
  await click('#savepub'); await p.waitForSelector('#list-panel:not([hidden]) .card'); await hl(null);
  mark('list');
  await cap('④「📋 くばった 宿題」で すすみぐあいを 見られます', 'はじめた 人・おわった 人・一人ずつの 正解'); await hl('.card'); await sleep(2500);
  await click('[data-prog]'); await sleep(2500);
  await cap('なおす・くばるのを やめる・消す（10 秒 もとに もどせる）も ここから'); await move('[data-menu]'); await click('[data-menu]'); await sleep(2800);
  await p.mouse.click(5, 5); await hl(null);
  await cap('📨 保護者レポートの QR カードは 右上の ボタンから', 'わからない ときは いつでも「❓ 使い方の 動画」'); await move('a[href="/teacher/reports"]'); await sleep(3800);
  mark('end');
  writeFileSync(`${OUT}/marks.json`, JSON.stringify(marks));
  await ctx.close(); await b.close();
  console.log(JSON.stringify(marks));
} finally { srv.kill(); }
