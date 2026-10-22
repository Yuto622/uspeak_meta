// LINE の 下の メニューの 画像（2500×1686・6 つ）を 作りなおす。形は src/parent-report/menu.js の MENU_TILES（v2）。
//   node scripts/make-line-richmenu-image.mjs   → templates/line-richmenu.png（LINE の 上限 1MB より 小さく）
// U-Speak の 色：ふかい みどり #1B3A2F・オレンジ #E27A2D・クリーム #FFFBF5。上の 2 つは 大きく（毎週 ひらく 理由）、
// 下は 白い カード（宿題・おうちで 1 分・ゲーム）と、目立たない「回数」。
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_TILES, RICH_MENU } from '../src/parent-report/menu.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = path.resolve(here, '../templates/line-richmenu.png');
const { width: W, height: H } = RICH_MENU.size;
const LOOK = {
  report: `<div class="hero"><div class="brand"><span class="mark">u</span><span class="word">U-Speak</span></div>
    <div class="big">今週の がんばり</div><div class="sub">📊 レポートを 見る <b>›</b></div><div class="spark">✨</div></div>`,
  roadmap: `<div class="road"><div class="emo">🗺️</div><div class="mid">英語の</div><div class="lg">ロードマップ</div><div class="hint">いま どこ？ あと どれだけ？</div></div>`,
  homework: `<div class="card"><div class="ico" style="background:#FDE7D6">📚</div><div class="t1">いまの</div><div class="t2">宿題</div></div>`,
  home: `<div class="card"><div class="ico" style="background:#E3F1E9">🏠</div><div class="t1">おうちで</div><div class="t2">1分クイズ</div></div>`,
  game: `<div class="card play"><div class="ico" style="background:#1B3A2F">🎮</div><div class="t1">そのまま</div><div class="t2">あそぶ</div></div>`,
  pref: `<div class="card quiet"><div class="ico small" style="background:#EEF1EF">⚙️</div><div class="t1">とどく</div><div class="t2 small">回数</div></div>`,
};
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;position:relative;background:#FFFBF5;font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;color:#1F2A26;overflow:hidden}
.tile{position:absolute;padding:22px}
.hero{height:100%;border-radius:56px;background:radial-gradient(circle at 85% 20%,#2F6B58 0,#1B3A2F 60%);color:#fff;padding:70px 90px;position:relative;overflow:hidden}
.brand{display:flex;align-items:center;gap:28px}.mark{display:inline-grid;place-items:center;width:120px;height:120px;border-radius:32px;background:#fff;color:#1B3A2F;font-size:96px;font-weight:900;line-height:1}
.word{font-size:84px;font-weight:900;letter-spacing:.01em}
.big{font-size:190px;font-weight:900;margin-top:110px;letter-spacing:.02em;white-space:nowrap}
.sub{display:inline-block;margin-top:46px;font-size:76px;font-weight:700;background:#E27A2D;padding:22px 56px;border-radius:999px}
.sub b{font-weight:900}
.spark{position:absolute;right:70px;bottom:40px;font-size:220px;opacity:.9}
.road{height:100%;border-radius:56px;background:linear-gradient(160deg,#F29A55,#E27A2D);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.road .emo{font-size:240px;line-height:1}.road .mid{font-size:72px;font-weight:700;margin-top:24px;opacity:.95}.road .lg{font-size:118px;font-weight:900;white-space:nowrap}.road .hint{margin-top:26px;font-size:52px;font-weight:700;background:#ffffff33;padding:12px 34px;border-radius:999px}
.card{height:100%;border-radius:48px;background:#fff;border:6px solid #E7E1D6;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.ico{width:250px;height:250px;border-radius:999px;display:grid;place-items:center;font-size:150px;margin-bottom:26px}
.ico.small{width:190px;height:190px;font-size:110px}
.t1{font-size:62px;font-weight:700;color:#5B6B63}.t2{font-size:104px;font-weight:900;color:#1B3A2F;white-space:nowrap}.t2.small{font-size:84px}
.play{background:#FFF3E8;border-color:#E27A2D}.play .t2{color:#E27A2D}
.quiet{background:#F6F4EF;border-color:#ECE7DD}.quiet .t1,.quiet .t2{color:#7A8781}
</style>${MENU_TILES.map((t) => `<div class="tile" style="left:${t.bounds.x}px;top:${t.bounds.y}px;width:${t.bounds.width}px;height:${t.bounds.height}px">${LOOK[t.kind]}</div>`).join('')}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log(OUT);
