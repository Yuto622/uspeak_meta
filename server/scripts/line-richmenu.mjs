// LINE の 下の メニュー（リッチメニュー）を 登録する。1 回 やれば いい（画像や ボタンを かえた ときだけ もう一度）。
//
//   本番：fly ssh console -C "node /app/server/scripts/line-richmenu.mjs"
//   （鍵は サーバーの LINE_CHANNEL_ACCESS_TOKEN を そのまま 使う。チャットや コマンドに 鍵を 書かない）
//   ためし：node scripts/line-richmenu.mjs --dry   … LINE に 送らず、送る 中身だけ 出す
//
// やる こと：前の「uspeak-parent-v*」を 消す → 新しく 作る → 画像（templates/line-richmenu.png）を のせる → 友だち 全員の 既定に する。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RICH_MENU } from '../src/parent-report/menu.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dry = process.argv.includes('--dry');
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const image = await readFile(path.resolve(here, '../templates/line-richmenu.png'));
if (dry) { console.log(JSON.stringify(RICH_MENU, null, 2)); console.log(`image: ${image.length} bytes`); process.exit(0); }
if (!token) { console.error('LINE_CHANNEL_ACCESS_TOKEN が ありません（fly secrets set で 入れて ください）。'); process.exit(1); }
const H = { authorization: `Bearer ${token}` };
async function call(method, url, body, type = 'application/json') {
  const res = await fetch(url, { method, headers: { ...H, ...(body ? { 'content-type': type } : {}) }, body: body && type === 'application/json' ? JSON.stringify(body) : body });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '')} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
const old = (await call('GET', 'https://api.line.me/v2/bot/richmenu/list')).richmenus || [];
for (const m of old.filter((x) => /^uspeak-parent-v/.test(x.name))) { await call('DELETE', `https://api.line.me/v2/bot/richmenu/${m.richMenuId}`); console.log('消した', m.name); }
const { richMenuId } = await call('POST', 'https://api.line.me/v2/bot/richmenu', RICH_MENU);
await call('POST', `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, image, 'image/png');
await call('POST', `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`);
console.log('できました：', RICH_MENU.name, richMenuId);
