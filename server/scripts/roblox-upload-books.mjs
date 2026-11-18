// 絵本の 絵を Roblox へ 上げる（ターミナルから）。サーバーの /admin/roblox-books と 同じ 仕事・同じ 記録（DATA_DIR/roblox-book-assets.json）。
//   node scripts/roblox-upload-books.mjs --dry-run            なにを おくるかを 見るだけ（鍵が なくても 動く）
//   node scripts/roblox-upload-books.mjs --limit 50           50 まいまで 上げる
//   node scripts/roblox-upload-books.mjs --book rd-A-hungry-bear
// 鍵は 環境変数（ROBLOX_OPEN_CLOUD_KEY・ROBLOX_CREATOR_USER_ID か ROBLOX_CREATOR_GROUP_ID）。画面や ログには 出さない。
import path from 'node:path';
import { config } from '../src/config.js';
import { BookAssets } from '../src/roblox/book-assets.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, d = '') => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const oc = config.robloxOpenCloud;
const assets = await new BookAssets(path.resolve(config.dataDir, 'roblox-book-assets.json'), { ...oc, log: console }).init();
const book = value('--book'); const limit = Math.max(1, Number(value('--limit', '200')) || 200);
if (flag('--dry-run')) {
  const todo = assets.pending({ book });
  const t = assets.summary().totals;
  console.log(`絵 ぜんぶ ${t.total} まい（本 ${t.books} さつ）・通った ${t.approved}・審査中 ${t.reviewing}・だめ ${t.rejected}・まだ ${t.todo}`);
  console.log(`おくる 絵：${todo.length} まい${todo.length ? `（はじめの ${Math.min(limit, todo.length)} まい：${todo.slice(0, Math.min(limit, 8)).map((p) => p.key).join(' ')}${todo.length > 8 ? ' …' : ''}）` : ''}`);
  if (assets.missing().length) console.log(`足りない 設定：${assets.missing().join('・')}`);
  process.exit(0);
}
if (!assets.enabled) { console.error(`設定が 足りません：${assets.missing().join('・')}`); process.exit(2); }
const tick = setInterval(() => { if (assets.job.note) console.log(assets.job.note); }, 5000);
const r = await assets.run({ limit, book });
clearInterval(tick);
console.log(r.ok ? `おわり：おくった ${r.sent} まい・通った ${r.approved}・審査中 ${r.reviewing}・だめ ${r.rejected}・まだ ${r.todo}` : `止まりました：${r.error}`);
process.exit(r.ok ? 0 : 1);
