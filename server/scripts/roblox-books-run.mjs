// 絵本と ABC の 絵を ぜんぶ Roblox へ 上げて、審査が おわるまで 見はる（サーバーの 中で 走らせる）。
//
//   fly ssh console -a uspeak-multiplayer -C "node /app/server/scripts/roblox-books-run.mjs"
//   （ふつうは Windows の scripts\roblox-books.ps1 が これを よぶ）
//
// じぶんでは Roblox へ 何も おくらない：いま 動いて いる サーバーの 管理の 口（/admin/api/roblox-books）に
// 「はじめて」と たのむだけ。絵の 一覧（どれを 上げたか）を 書くのは サーバー 1 つだけ（2 つの プログラムが 同じ ファイルを 書かない）。
// 鍵（ADMIN_KEY・ROBLOX_OPEN_CLOUD_KEY）は 画面に 出さない。なんど 走らせても よい（おくった 絵は もう おくらない）。
//
//   --first 5      さいしょに ためす まい数（0 で ためさない）
//   --minutes 180  見はる 時間の 上限（こえても サーバーの 中の 仕事は 止まらない。もう一度 走らせると つづきから）
//   --no-wait      おくり おわったら 審査を 待たずに おわる
//   --base URL     サーバーの 場所（なければ http://127.0.0.1:$PORT）
import fs from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const num = (v, def) => (Number.isFinite(Number(v)) ? Number(v) : def);

const FIRST = Math.max(0, Math.min(50, num(arg('first', 5), 5)));
const LIMIT_MS = Math.max(1, num(arg('minutes', 180), 180)) * 60_000;
const TICK_MS = Math.max(20, num(process.env.ROBLOX_BOOKS_TICK_MS, 3000));       // ようすを 見る 間
const PRINT_MS = Math.max(20, num(process.env.ROBLOX_BOOKS_PRINT_MS, 15_000));   // すすみを 出す 間
const REPOLL_MS = Math.max(20, num(process.env.ROBLOX_BOOKS_REPOLL_MS, 60_000)); // 審査の けっかを 見なおす 間
const BASE = String(arg('base', `http://127.0.0.1:${process.env.PORT || 2567}`)).replace(/\/+$/, '');
const NO_WAIT = flag('no-wait');

let lastSaid = '';
const say = (s) => { if (s && s === lastSaid) return; lastSaid = s; process.stdout.write(`${s}\n`); }; // 同じ 行を つづけて 出さない
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopWith = (code, lines) => { for (const l of lines) say(l); process.exit(code); };

// ADMIN_KEY：ふつうは ssh の 中にも 入って いる。なければ 動いて いる サーバーの 環境から 読む（画面には 出さない）。
function adminKey() {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  try {
    for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      let env = '';
      try { env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { continue; }
      const hit = env.split('\0').find((kv) => kv.startsWith('ADMIN_KEY='));
      if (hit && hit.length > 10) return hit.slice(10);
    }
  } catch { /* /proc が ない（Windows・macOS） */ }
  return '';
}

let cookie = '';
async function login() {
  const key = adminKey();
  if (!key) stopWith(2, ['✖ ADMIN_KEY が 見つかりません。サーバーの 中で 走らせて ください（fly ssh console -C "node /app/server/scripts/roblox-books-run.mjs"）。']);
  let res;
  try { res = await fetch(`${BASE}/admin/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${encodeURIComponent(key)}` }); }
  catch (err) { stopWith(2, [`✖ サーバーに つながりません（${BASE}）：${err?.cause?.code || err?.message || err}`, '  サーバーが 起きて いるか：fly status -a uspeak-multiplayer']); }
  const set = (res.headers.getSetCookie?.() || []).find((c) => c.startsWith('uspeak_admin=')) || '';
  cookie = set.split(';')[0];
  if (!cookie || cookie === 'uspeak_admin=') {
    const where = res.headers.get('location') || '';
    stopWith(2, [where.includes('locked') ? '✖ 管理の ログインが 一時 止められて います（まちがいが つづいた ため）。15 分ほど 待って もう一度。' : `✖ 管理の ログインが できません（${res.status}）。ADMIN_KEY が サーバーと ちがう？`]);
  }
}
async function api(method, body) {
  const res = await fetch(`${BASE}/admin/api/roblox-books`, { method, headers: { cookie, 'x-requested-with': 'uspeak-admin', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { await login(); return api(method, body); }
  let json = null; try { json = await res.json(); } catch { /* JSON で ない */ }
  return { status: res.status, json: json || {} };
}
const status = async () => (await api('GET')).json;
const start = (limit) => api('POST', { action: 'start', limit });

const line = (s) => {
  const t = s.totals || {};
  const sent = (t.approved || 0) + (t.reviewing || 0) + (t.rejected || 0);
  const left = Math.max(0, (t.total || 0) - sent);
  return `おくった ${sent} / ${t.total || 0}　｜　通った ${t.approved || 0}　審査中 ${t.reviewing || 0}　通らなかった ${t.rejected || 0}　のこり ${left}${t.failed ? `（うち しっぱい ${t.failed}）` : ''}${s.job?.running && s.job?.note ? `　… ${s.job.note}` : ''}`;
};
const good = (s) => (s.totals?.approved || 0) + (s.totals?.reviewing || 0) + (s.totals?.rejected || 0);
const HINT_KEY = [
  '  たしかめる こと：',
  '   1. 鍵（ROBLOX_OPEN_CLOUD_KEY）の API System に「assets」が 入って いて、Read と Write の 両方に チェックが ある',
  '   2. 鍵の「Accepted IP Addresses」が 0.0.0.0/0（サーバーの IP は かわるので）',
  '   3. ROBLOX_CREATOR_USER_ID が 鍵を 作った アカウントの 番号（グループの ものなら ROBLOX_CREATOR_GROUP_ID）',
  '   4. 鍵の 期限が 切れて いない',
  '  なおしたら、同じ コマンドを もう一度（おくった 絵は もう おくりません）。',
];
const HINT_TYPE = [
  '  Roblox が この 絵の 種類を うけつけない ときは、Decal で 上げなおせます：',
  '   fly secrets set ROBLOX_BOOK_ASSET_TYPE=Decal -a uspeak-multiplayer',
  '  （または .\\scripts\\roblox-books.ps1 -AssetType Decal）',
];

async function waitIdle(deadline, printEvery = true) {
  let last = 0; let s = await status();
  while (s.job?.running) {
    if (Date.now() > deadline) return s;
    if (printEvery && Date.now() - last >= PRINT_MS) { say(`  ${line(s)}`); last = Date.now(); }
    await sleep(TICK_MS);
    s = await status();
  }
  return s;
}

async function main() {
  const deadline = Date.now() + LIMIT_MS;
  await login();
  let s = await status();
  if (!s.ok) stopWith(2, [`✖ サーバーの へんじが おかしい です（${JSON.stringify(s).slice(0, 120)}）`]);
  if (!s.enabled) stopWith(2, [`✖ 設定が 足りません：${(s.missing || []).join('・')}`, '  fly secrets set で 入れて から もう一度（Windows なら .\\scripts\\roblox-books.ps1 が 入れます）。']);
  say(`==> 絵は ぜんぶで ${s.totals.total} まい（${s.size}・${s.assetType}・${s.creator === 'group' ? 'グループ' : 'ユーザー'}の もの・1 分に ${s.perMin} まい）`);
  say(`    ${line(s)}`);
  if (s.job?.running) { say('==> もう 動いて います。つづきを 見ます。'); s = await waitIdle(deadline); }

  // ① さいしょに 少しだけ おくって、鍵と 絵の 種類が 通るかを 見る（まだ 1 まいも 通って いない ときだけ）。
  if (FIRST > 0 && good(s) === 0 && s.totals.todo > 0) {
    say(`==> まず ${FIRST} まいだけ おくって みます`);
    const r = await start(FIRST);
    if (!r.json.ok) stopWith(3, [`✖ はじめられません：${r.json.error || r.status}`]);
    await sleep(TICK_MS);
    s = await waitIdle(deadline, false);
    if (s.job?.lastError) stopWith(3, [`✖ Roblox に ことわられました：${s.job.lastError}`, ...HINT_KEY]);
    if (good(s) === 0) stopWith(3, [`✖ ${FIRST} まい おくりましたが、1 まいも うけとられませんでした。`, `  Roblox の へんじ：${s.job?.lastFail || '（なし）'}`, ...HINT_TYPE, ...HINT_KEY]);
    say(`    OK：${good(s)} まい うけとられました。のこりを おくります。`);
  }

  // ② のこりを ぜんぶ。サーバーの 仕事が おわる たびに、のこりが あれば もう一度 たのむ（審査の けっかも その ときに 見なおされる）。
  let lastPrint = 0; let lastStart = 0; let stuck = 0; let prevGood = good(s);
  for (;;) {
    s = await status();
    const t = s.totals;
    if (Date.now() - lastPrint >= PRINT_MS) { say(`  ${line(s)}`); lastPrint = Date.now(); }
    if (!s.job?.running) {
      if (s.job?.lastError) stopWith(3, [`✖ とちゅうで 止まりました：${s.job.lastError}`, ...HINT_KEY]);
      const settled = t.todo === 0 && t.reviewing === 0;
      if (settled || (NO_WAIT && t.todo === 0)) break;
      const gap = t.todo > 0 ? TICK_MS : REPOLL_MS;
      if (Date.now() - lastStart >= gap) {
        if (t.todo > 0 && lastStart) { // 前の 回で 1 まいも すすまなかった？
          stuck = good(s) > prevGood ? 0 : stuck + 1;
          if (stuck >= 3) stopWith(3, [`✖ のこり ${t.todo} まいが 3 回 つづけて うけとられません。`, `  Roblox の へんじ：${s.job?.lastFail || '（なし）'}`, ...HINT_TYPE, '  少し 待って から 同じ コマンドを もう一度 でも かまいません。']);
        }
        prevGood = good(s);
        const r = await start(2000);
        if (!r.json.ok) stopWith(3, [`✖ はじめられません：${r.json.error || r.status}`]);
        lastStart = Date.now();
      }
    }
    if (Date.now() > deadline) {
      stopWith(0, [`  ${line(s)}`, `==> ${Math.round(LIMIT_MS / 60_000)} 分 たったので 見はりを おわります。${s.job?.running ? 'サーバーの 中では まだ おくって います。' : ''}`, '    同じ コマンドを もう一度 走らせると、つづきから 見られます（おくった 絵は もう おくりません）。']);
    }
    await sleep(TICK_MS);
  }
  say(`  ${line(s)}`);
  const t = s.totals;
  say('');
  say(t.reviewing > 0 ? `==> おくり おわりました（審査中 ${t.reviewing} まい。通った ものから ゲームに 出ます）。` : `==> おわりました：${t.approved} まいが 審査を 通りました${t.rejected ? `・${t.rejected} まいは 通りませんでした（その ページは 色の 板に なります。一覧：/admin/roblox-books）` : ''}。`);
}

main().catch((err) => stopWith(1, [`✖ ${String(err?.message || err).slice(0, 300)}`]));
