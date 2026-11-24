// セットアップ（サインイン）動画の 写真を 撮る： node test/e2e/capture-setup.mjs [web|roblox|cards]
// ・Web 版は この サーバーを 立てて 本物の 画面を 撮る。
// ・Roblox 版は roblox.com と アプリストアの 公開ページを 撮る（外へ 出られる 環境だけ。サインインは しない・れいの 文字を 入れるだけ）。
// ・どの 写真にも「ここを おす」の ネオンの わくと 番号を ページの 上に かさねてから 撮る（あとから 絵に 足さない＝ずれない）。
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }
const OUT = path.resolve(here, '../../../docs/figures');
const ONLY = process.argv.slice(2);
const want = (k) => !ONLY.length || ONLY.includes(k);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 2697;

// わくと 番号を かさねる。marks = [{ sel | rect:[x,y,w,h] | text, n, label, side, no:true(✕) }]
async function mark(page, marks) {
  for (const m of marks) {
    if (m.text) { const b = await page.getByText(m.text, { exact: m.exact ?? true }).first().boundingBox().catch(() => null); if (b) m.rect = [b.x, b.y, b.width, b.height]; }
    if (m.sel && !m.rect) { const b = await page.locator(m.sel).first().boundingBox().catch(() => null); if (b) m.rect = [b.x, b.y, b.width, b.height]; }
  }
  await page.evaluate((marks) => {
    document.querySelectorAll('.setup-mark').forEach((e) => e.remove());
    const host = document.querySelector('dialog[open]:modal') || document.body;
    for (const m of marks) {
      if (!m.rect) continue;
      const [x, y, w, h] = m.rect; const pad = m.pad ?? 8; const col = m.no ? '#ff5a7a' : '#ffb066';
      const box = document.createElement('div'); box.className = 'setup-mark';
      box.style.cssText = `position:fixed;z-index:2147483647;pointer-events:none;left:${x - pad}px;top:${y - pad}px;width:${w + pad * 2}px;height:${h + pad * 2}px;border:4px solid ${col};border-radius:14px;box-shadow:0 0 0 3px #8ff0c8aa,0 0 22px ${col},inset 0 0 14px ${col}55;box-sizing:border-box;`;
      if (m.no) box.style.background = 'linear-gradient(to top right, transparent calc(50% - 3px), #ff5a7a calc(50% - 3px), #ff5a7a calc(50% + 3px), transparent calc(50% + 3px))';
      host.append(box);
      if (m.n || m.label) {
        const tag = document.createElement('div'); tag.className = 'setup-mark';
        const side = m.side || 'left';
        if (m.n) { const b = document.createElement('b'); b.textContent = m.n; b.style.cssText = 'display:inline-grid;place-items:center;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#ffb066,#8ff0c8);color:#08160f;font:900 26px/1 sans-serif;'; tag.append(b); }
        if (m.label) { const sp = document.createElement('span'); sp.textContent = m.label; sp.style.cssText = `padding:8px 14px;border-radius:12px;background:#123528ee;border:2px solid ${col};color:#fff;font:800 20px/1.2 'Noto Sans CJK JP',sans-serif;white-space:nowrap;`; tag.append(sp); }
        tag.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;display:flex;align-items:center;gap:8px;';
        host.append(tag);
        const tw = tag.getBoundingClientRect().width, th = tag.getBoundingClientRect().height;
        let tx, ty;
        if (side === 'left') { tx = x - pad - tw - 10; ty = y + h / 2 - th / 2; }
        else if (side === 'right') { tx = x + w + pad + 10; ty = y + h / 2 - th / 2; }
        else if (side === 'top') { tx = x + w / 2 - tw / 2; ty = y - pad - th - 10; }
        else { tx = x + w / 2 - tw / 2; ty = y + h + pad + 10; }
        tx = Math.max(8, Math.min(innerWidth - tw - 8, tx)); ty = Math.max(8, Math.min(innerHeight - th - 8, ty));
        tag.style.left = tx + 'px'; tag.style.top = ty + 'px';
      }
    }
  }, marks);
}
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 92, timeout: 180000 }); console.log('  ' + name + '.jpg'); };

// 文だけの カード（じゅんび・こまったとき）。異次元の 見た目。
const card = (step, title, rows, foot = '') => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:"Noto Sans CJK JP",sans-serif;color:#fff;background:radial-gradient(900px 600px at 80% 10%,#b8601f 0,transparent 60%),radial-gradient(800px 600px at 10% 90%,#2f8f6a 0,transparent 60%),#08160f;}
.s{position:absolute;inset:0;background-image:radial-gradient(1.5px 1.5px at 20% 30%,#fff,transparent),radial-gradient(1.5px 1.5px at 70% 60%,#fff,transparent),radial-gradient(1px 1px at 40% 80%,#fff4d6,transparent),radial-gradient(1px 1px at 85% 25%,#fff4d6,transparent),radial-gradient(1.5px 1.5px at 55% 15%,#fff,transparent),radial-gradient(1px 1px at 10% 60%,#fff,transparent);}
main{position:absolute;inset:56px 70px;display:flex;flex-direction:column;gap:20px}
.step{align-self:flex-start;padding:8px 22px;border-radius:999px;background:linear-gradient(90deg,#ffb066,#8ff0c8);color:#08160f;font-weight:900;font-size:24px;letter-spacing:.06em}
h1{margin:0;font-size:58px;line-height:1.2;text-shadow:0 0 24px #ffb06688}
ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:16px}
li{display:flex;align-items:center;gap:20px;padding:18px 26px;border-radius:20px;background:#123528cc;border:2px solid #ffb06688;font-size:32px;font-weight:700;box-shadow:0 0 18px #ffb06633}
li b{flex:none;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#ffb066,#8ff0c8);color:#08160f;font-size:30px;font-weight:900}
li small{display:block;font-size:22px;font-weight:500;color:#cfe8d8;margin-top:4px}
li.no{border-color:#ff5a7a} li.no b{background:#ff5a7a;color:#fff}
p{margin:auto 0 0;font-size:24px;color:#cfe8d8}
</style><div class="s"></div><main><span class="step">${step}</span><h1>${title}</h1><ul>${rows.map(([i, t, s, no]) => `<li class="${no ? 'no' : ''}"><b>${i}</b><span>${t}${s ? `<small>${s}</small>` : ''}</span></li>`).join('')}</ul><p>${foot}</p></main>`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'], ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
let srv = null;
try {
  if (want('cards')) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const cards = {
      'setup-web-ready': ['じゅんび', 'ウェブ版に サインイン する', [['1', 'iPad・パソコン・スマホ の どれか', 'アプリは いりません。ブラウザで ひらきます'], ['2', 'ユーザーネーム', '先生から もらった なまえ'], ['3', 'パスワード', '先生から もらった クラスの パスワード（または 教室の ＱＲ）']], 'uspeak-multiplayer.fly.dev'],
      'setup-web-url': ['ステップ １', 'ブラウザで ＵＲＬを ひらく', [['1', 'Safari か Chrome を ひらく', 'iPad・iPhone は Safari、パソコン・Android は Chrome'], ['2', '上の らんに ＵＲＬを 入れる', 'uspeak-multiplayer.fly.dev'], ['3', 'ＱＲが ある 教室は カメラで 読みとるだけ', 'ＵＲＬを 打たなくて よい']], 'アプリの インストールも、アカウントの 新規登録も いりません'],
      'setup-web-help': ['こまったとき', '入れない ときは', [['？', 'パスワードが ちがう と 出る', '大文字・小文字、数字の 0 と 英字の O を たしかめる'], ['？', 'ユーザーネームが ちがう と 出る', '名簿の なまえと 同じ 字か、先生に きく'], ['？', '画面が 小さい・古い', 'ページを 読みこみ なおす（パソコンは Ctrl＋F5）']], 'それでも 入れない ときは、教室の 先生へ'],
      'setup-rb-ready': ['じゅんび', 'Roblox 版に サインイン する', [['1', 'iPad・パソコン・スマホ の どれか', 'Roblox アプリを 入れます（無料）'], ['2', 'Roblox の ユーザーネームと パスワード', '教室から もらった もの'], ['×', '新しい アカウントは つくりません', '「新規登録」では なく「ログイン」を えらぶ', 1]], 'クラスコード（４けた）も 先生から もらって おきます'],
      'setup-rb-pc': ['ステップ １ ・ パソコン', 'パソコンに Roblox を 入れる', [['1', 'ブラウザで roblox.com を ひらく', ''], ['2', '右上の「ログイン」で サインイン', 'つぎの 画面で くわしく'], ['3', 'U-Speak の ページで ▶ を おす', 'はじめての ときだけ Roblox の ダウンロードが はじまります'], ['4', 'ダウンロードした ファイルを ひらく', 'インストールが おわると、▶ で ゲームが ひらきます']], '２回目からは ▶ を おすだけ'],
      'setup-rb-help': ['こまったとき', 'ログイン できない ときは', [['？', 'パスワードが ちがう と 出る', '大文字・小文字を たしかめる。わからなければ 先生へ'], ['？', 'パズルや 確認コードが 出た', 'Roblox の 本人確認です。画面の とおりに すすめる'], ['×', '「新規登録」を おして しまった', '左上の もどる で もどり、「ログイン」を おす', 1]], 'アカウントを もう１つ つくると、きろくが 分かれて しまいます'],
    };
    for (const [name, [step, title, rows, foot]] of Object.entries(cards)) { await p.setContent(card(step, title, rows, foot)); await sleep(300); await shot(p, name); }
    await p.close();
  }

  if (want('web')) {
    srv = spawn('node', ['src/index.js'], { cwd: path.resolve(here, '../..'), env: { ...process.env, PORT: String(PORT), STORE_BACKEND: 'memory', LOG_LEVEL: 'error' } });
    for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/`); break; } catch { await sleep(1000); } }
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } }); p.setDefaultTimeout(240000);
    await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
    await p.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit' });
    await p.waitForSelector('#avatar-dialog[open]'); await sleep(3000);
    await mark(p, [{ sel: '#avatar-confirm', n: 'A', label: 'えらんで きめる', side: 'bottom' }, { sel: '#avatar-cancel', n: 'B', label: 'あとで えらぶ（スキップ）', side: 'bottom' }]);
    await shot(p, 'setup-web-avatar');
    await p.evaluate(() => { document.querySelectorAll('.setup-mark').forEach((e) => e.remove()); document.querySelector('#avatar-cancel').click(); });
    await p.waitForSelector('#net-lobby[open]'); await sleep(1500);
    await mark(p, [{ sel: '#net-name', n: 1, label: 'ユーザーネーム', side: 'left' }, { sel: '#net-class', n: 2, label: 'パスワード', side: 'left' }, { sel: '#net-join', n: 3, label: 'クラスに はいる', side: 'left' }]);
    await shot(p, 'setup-web-lobby');
    await p.fill('#net-name', 'たろう'); await p.fill('#net-class', 'demo2026'); await sleep(400);
    await mark(p, [{ sel: '#net-name', n: 1, label: 'れい：たろう', side: 'left' }, { sel: '#net-class', n: 2, label: 'れい：demo2026', side: 'left' }, { sel: '#net-join', n: 3, label: 'ここを おす', side: 'left' }]);
    await shot(p, 'setup-web-filled');
    const key = await p.locator('#net-key').boundingBox().catch(() => null);
    if (key) { await mark(p, [{ sel: '#net-teacher-details', label: '先生だけ。こどもは からの まま', side: 'left', no: false }]); await shot(p, 'setup-web-teacher'); }
    await p.evaluate(() => { document.querySelectorAll('.setup-mark').forEach((e) => e.remove()); document.querySelector('#net-join').click(); });
    await p.waitForFunction(() => document.querySelector('#net-status')?.classList.contains('online'), null, { timeout: 180000 });
    await sleep(9000);
    await shot(p, 'setup-web-in');
    await p.evaluate(() => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); document.body.dataset.more = '1'; }); await sleep(1500);
    await mark(p, [{ sel: '#logout-button', n: '⏏', label: 'ログアウト（つぎの 子に かわる とき）', side: 'bottom' }]);
    await shot(p, 'setup-web-logout');
    await p.close();
  }

  if (want('roblox')) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.setDefaultTimeout(60000);
    const open = async (url) => { await p.goto(url, { waitUntil: 'domcontentloaded' }); await sleep(7000); };
    await open('https://apps.apple.com/jp/app/roblox/id431946152');
    await mark(p, [{ sel: 'h1', n: 1, label: 'App Store で「Roblox」を さがして 入手', side: 'bottom', pad: 16 }]); await shot(p, 'setup-rb-appstore');
    await open('https://play.google.com/store/apps/details?id=com.roblox.client&hl=ja');
    await mark(p, [{ sel: 'h1', n: 1, label: 'Google Play で「Roblox」を インストール', side: 'bottom', pad: 16 }]); await shot(p, 'setup-rb-play');
    await open('https://www.roblox.com/ja');
    await mark(p, [{ text: 'ログイン', n: 1, label: '「ログイン」を おす', side: 'bottom' }, { text: 'アカウントを作成', label: 'これは おさない（新規登録）', side: 'right', no: true }]); await shot(p, 'setup-rb-home');
    await open('https://www.roblox.com/ja/login');
    const u = '#login-username', pw = '#login-password', btn = '#login-button';
    await mark(p, [{ sel: u, n: 1, label: 'ユーザーネーム', side: 'left' }, { sel: pw, n: 2, label: 'パスワード', side: 'left' }, { sel: btn, n: 3, label: 'ログイン', side: 'left' }, { text: '新規登録', label: 'おさない', side: 'bottom', no: true }]); await shot(p, 'setup-rb-login');
    await p.fill(u, 'uspeak_taro01').catch(() => {}); await p.fill(pw, 'xxxxxxxxxx').catch(() => {}); await sleep(500);
    await mark(p, [{ sel: u, n: 1, label: 'れい：uspeak_taro01', side: 'left' }, { sel: pw, n: 2, label: 'もらった パスワード', side: 'left' }, { sel: btn, n: 3, label: 'ここを おす', side: 'left' }]); await shot(p, 'setup-rb-login-filled');
    await open('https://www.roblox.com/ja/games/139338411931177');
    await mark(p, [{ sel: '[data-testid="play-button"], #game-details-play-button-container button, .btn-common-play-game-lg', n: 1, label: '▶ を おす', side: 'bottom' }, { text: 'U-Speak Roblox', label: 'U-Speak Roblox の ページ', side: 'bottom', exact: true }]); await shot(p, 'setup-rb-game');
    // スマホの はば（アプリの さいしょの 画面に ちかい 形）
    const m = await browser.newContext({ viewport: { width: 430, height: 800 }, locale: 'ja-JP', isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const q = await m.newPage(); await q.goto('https://www.roblox.com/ja/login', { waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(7000);
    await q.screenshot({ path: path.join(OUT, 'setup-rb-login-phone.png') }); console.log('  setup-rb-login-phone.png');
    await m.close(); await ctx.close();
  }
} finally { await browser.close(); srv?.kill(); }
