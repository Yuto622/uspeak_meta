// LINE の 下の メニュー（リッチメニュー）を 登録する。ふだんは サーバーの 起動で 自動（src/parent-report/richmenu-setup.js）。
// 画像や ボタンを かえて すぐ 作りなおしたい ときだけ：
//
//   本番：fly ssh console -C "node /app/server/scripts/line-richmenu.mjs"
//   （鍵は サーバーの LINE_CHANNEL_ACCESS_TOKEN を そのまま 使う。チャットや コマンドに 鍵を 書かない）
//   ためし：node scripts/line-richmenu.mjs --dry   … LINE に 送らず、送る 中身だけ 出す
import { readFile } from 'node:fs/promises';
import { RICH_MENU } from '../src/parent-report/menu.js';
import { ensureRichMenu, RICH_MENU_IMAGE } from '../src/parent-report/richmenu-setup.js';

if (process.argv.includes('--dry')) {
  console.log(JSON.stringify(RICH_MENU, null, 2));
  console.log(`image: ${(await readFile(RICH_MENU_IMAGE)).length} bytes`);
  process.exit(0);
}
if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) { console.error('LINE_CHANNEL_ACCESS_TOKEN が ありません（fly secrets set で 入れて ください）。'); process.exit(1); }
try {
  const r = await ensureRichMenu({ force: true });
  console.log('できました：', RICH_MENU.name, r.richMenuId);
} catch (err) { console.error('できませんでした：', err.message); process.exit(1); }
