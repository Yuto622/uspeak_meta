// LINE の 下の メニューの 画像（2500×843・4 つ）を 作りなおす。形は src/parent-report/menu.js の RICH_MENU。
//   node scripts/make-line-richmenu-image.mjs   → templates/line-richmenu.png（LINE の 上限 1MB より 小さく）
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = path.resolve(here, '../templates/line-richmenu.png');
const tiles = [
  ['📊', 'さいしんの', 'レポート', '#1B3A2F'],
  ['📚', 'いまの', '宿題', '#E27A2D'],
  ['🗺️', '英語の', 'ロードマップ', '#2F6B58'],
  ['⚙️', 'とどく', '回数', '#5B6B63'],
];
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:2500px;height:843px;display:grid;grid-template-columns:repeat(4,1fr);font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;background:#fffbf5}
.t{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;border-right:6px solid #fffbf5;color:#fff}
.t:last-child{border-right:0}.e{font-size:230px;line-height:1}.s{font-size:84px;font-weight:700;opacity:.9;min-height:96px}.b{font-size:118px;font-weight:900;letter-spacing:.02em;white-space:nowrap}.b.long{font-size:96px}
</style>${tiles.map(([e, s, b, c]) => `<div class="t" style="background:${c}"><div class="e">${e}</div><div class="s">${s}</div><div class="b${b.length > 4 ? ' long' : ''}">${b}</div></div>`).join('')}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 2500, height: 843 } });
await page.setContent(html);
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();
console.log(OUT);
