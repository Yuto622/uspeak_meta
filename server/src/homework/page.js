// 宿題の 画面（運営の /admin/homework と 教室の /teacher/homework で 同じ）。2026-10 作りなおし。
//
// はじめての 先生にも わかる ように（Google Classroom・Seesaw・Kahoot・Wordwall・Blooket・NN/g の 調べ）：
// - 「✏️ つくる」と「📋 くばった 宿題」を タブで わける。つくるは 3 ステップ（① 入れる → ② たしかめる → ③ くばる）。
// - 1 つの ステップに 大きな ボタンは 1 つ。下書きは 小さな リンク。
// - AI が 読んだ ものは かならず 先生が たしかめる（② の 青い 帯）。読めなかった 行だけ 赤く して、ほかは そのまま 使える。
// - 「🧪 サンプルで ためす」・「👀 せいとの 画面で みる」・しめきりの かんたんボタン・消すは 10 秒 もとに もどせる。
// - 字は 16px 以上・ボタンは 48px 以上。❓ 使い方の 動画（実際の 画面の 録画）。
// 画面の 動きは page-client.js（ふつうの JS を そのまま 入れる）。
import { readFileSync } from 'node:fs';

const CLIENT = readFileSync(new URL('./page-client.js', import.meta.url), 'utf8');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

export const VIDEO = '/assets/guide/teacher-homework.mp4';

export function page({ aiReady, room = null }) {
  const cfg = {
    api: room ? '/teacher/api' : '/admin/api',
    header: room ? 'uspeak-teacher' : 'uspeak-admin',
    home: room ? '/teacher/homework' : '/admin',
    clsKey: room ? 'uspeak-teacher-hw-class' : 'uspeak-admin-hw-class',
    room: room ? { name: room.name, classes: room.classes } : null,
    ai: !!aiReady,
    video: VIDEO,
  };
  const oneClass = room && room.classes.length === 1;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>宿題 — ${room ? esc(room.name) : '管理'}</title>
<link rel="stylesheet" href="/fishworld.css">
<style>
:root{--ink:#1b3a2f;--sub:#5f574d;--line:#e3d9c7;--bg:#fffbf5;--card:#fff;--go:#2f8f5b;--accent:#e27a2d;--bad:#b5432b;--blue:#2f6fb0}
*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:var(--bg);color:var(--ink);font-size:16px;line-height:1.6}
.wrap{max-width:1100px;margin:0 auto;padding:14px 16px 80px}
a{color:var(--blue)}h1{font-size:24px;margin:6px 0}h2{font-size:20px;margin:0 0 6px}.muted{color:var(--sub);font-size:15px}
button,select,input,textarea{font:inherit}button{cursor:pointer}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px;padding:8px 18px;border-radius:12px;border:2px solid var(--line);background:#fff;color:var(--ink);font-weight:800;text-decoration:none}
.btn.big{min-height:58px;padding:10px 26px;font-size:18px;border:0;background:var(--go);color:#fff;box-shadow:0 4px 0 #1e6a42}
.btn.big:disabled{opacity:.45;box-shadow:none;cursor:not-allowed}
.btn.orange{background:var(--accent);border-color:var(--accent);color:#fff}.btn.warn{color:var(--bad);border-color:#ecc0b4}.btn.ghost{border-color:transparent;background:transparent;color:var(--blue);text-decoration:underline;min-height:44px}
.top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:6px}.top .who{font-size:15px;color:var(--sub)}.top .acts{display:flex;flex-wrap:wrap;gap:8px}
.tabs{display:flex;gap:6px;margin:12px 0 0;border-bottom:3px solid var(--line)}
.tabs button{min-height:54px;padding:8px 20px;border:0;border-radius:14px 14px 0 0;background:transparent;font-size:18px;font-weight:800;color:var(--sub)}
.tabs button[aria-selected=true]{background:var(--ink);color:#fff}
.tabs .count{display:inline-block;min-width:26px;padding:0 6px;margin-left:6px;border-radius:99px;background:var(--accent);color:#fff;font-size:14px}
.panel{background:var(--card);border:1px solid var(--line);border-top:0;border-radius:0 0 18px 18px;padding:18px}
.steps{display:flex;gap:8px;list-style:none;margin:0 0 16px;padding:0;counter-reset:s}
.steps li{flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:14px;background:#f4efe4;color:var(--sub);font-weight:800;font-size:16px}
.steps li b{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#fff;color:var(--sub);flex:none}
.steps li.on{background:var(--ink);color:#fff}.steps li.on b{background:var(--accent);color:#fff}.steps li.done{background:#e3f3e8;color:var(--go)}.steps li.done b{background:var(--go);color:#fff}
.step[hidden]{display:none}
.first{display:flex;gap:14px;align-items:center;padding:12px 14px;margin-bottom:14px;border-radius:16px;background:#eef5ff;border:2px solid #c6dbf5}
.first .thumb{flex:none;width:128px;aspect-ratio:16/10;border-radius:10px;background:#1b3a2f url('/assets/guide/teacher-homework.jpg') center/cover no-repeat;display:grid;place-items:center;color:#fff;font-size:34px;border:0}
.first p{margin:0}
.drop{border:3px dashed #c9bda8;border-radius:20px;background:#fffdf8;padding:26px 16px;text-align:center}
.drop.on{border-color:var(--go);background:#f1faf3}
.drop .big-ic{font-size:44px;line-height:1}.drop h3{font-size:20px;margin:6px 0}
.drop .pick{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:12px}
.files{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.files span{display:inline-flex;align-items:center;gap:6px;background:#eef6f0;border-radius:10px;padding:6px 10px;font-size:15px}
.files button{border:0;background:#0000000f;border-radius:8px;min-width:32px;min-height:32px}
details{margin:12px 0;border:1px solid var(--line);border-radius:14px;background:#fff}
details summary{cursor:pointer;padding:12px 14px;font-weight:800;font-size:16px;min-height:48px}
details .in{padding:0 14px 14px}
textarea{width:100%;min-height:140px;padding:10px;border:2px solid var(--line);border-radius:12px;font-size:16px}
.fmts{display:flex;flex-wrap:wrap;gap:6px}.fmts span{font-size:14px;background:#f4efe4;border-radius:99px;padding:3px 10px}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.row.end{justify-content:flex-end}.spacer{flex:1}
#msg{min-height:26px;font-weight:800;font-size:16px}#msg.bad{color:var(--bad)}
.banner{padding:12px 14px;border-radius:14px;background:#e9f2fd;border:2px solid #b9d3f2;font-weight:700;margin-bottom:12px}
.banner.bad{background:#fff1ec;border-color:#f0c2b5;color:var(--bad)}
.qs{display:flex;flex-direction:column;gap:10px}
.q{display:grid;grid-template-columns:40px 170px 1fr 1fr auto;gap:8px;align-items:start;padding:10px;border:1px solid var(--line);border-radius:14px;background:#fff}
.q.bad{border:2px solid #e8a693;background:#fff6f2}
.q .n{font-weight:800;color:var(--sub);padding-top:10px;text-align:center}
.q label{display:block;font-size:13px;color:var(--sub);font-weight:700}
.q input,.q select{width:100%;min-height:44px;padding:6px 10px;border:2px solid var(--line);border-radius:10px;font-size:16px;background:#fff}
.q .why{grid-column:2/-1;color:var(--bad);font-size:14px;font-weight:700}
.q .more{grid-column:2/-1;display:flex;gap:8px;flex-wrap:wrap}.q .more>div{flex:1;min-width:160px}
.kinds{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin:8px 0 14px}
.kinds button{min-height:64px;border:2px solid var(--line);border-radius:14px;background:#fff;font-weight:800;font-size:15px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.kinds button span{font-size:22px}
.form{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form label{display:block;font-weight:800}.form input,.form select{width:100%;min-height:50px;padding:8px 12px;border:2px solid var(--line);border-radius:12px;font-size:17px;margin-top:4px}
.quick{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.quick button{min-height:44px;padding:4px 14px;border:2px solid var(--line);border-radius:99px;background:#fff;font-weight:700}
.quick button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.summary{padding:12px 14px;border-radius:14px;background:#f4efe4;margin:14px 0;font-size:16px}
.list .grp{margin:18px 0 8px;font-size:18px;border-bottom:2px solid var(--line);padding-bottom:4px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:10px 0}
.card h3{margin:0 0 4px;font-size:18px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.chip{display:inline-block;font-size:14px;border-radius:99px;padding:2px 12px;font-weight:800}
.chip.draft{background:#f0ebe0;color:var(--sub)}.chip.pub{background:var(--go);color:#fff}.chip.late{background:#fde3dc;color:var(--bad)}.chip.none{background:#fde3dc;color:var(--bad)}
.meter{height:12px;border-radius:99px;background:#eee6d6;overflow:hidden;margin:8px 0}.meter i{display:block;height:100%;background:var(--go)}
.card .row{margin-top:8px}
.menu{position:relative}.menu>div{position:absolute;right:0;top:52px;z-index:5;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px #0002;padding:6px;min-width:180px}
.menu>div[hidden]{display:none}.menu>div button{display:block;width:100%;text-align:left;min-height:46px;border:0;background:transparent;border-radius:8px;padding:6px 12px;font-weight:700}.menu>div button:hover{background:#f4efe4}
table.prog{width:100%;border-collapse:collapse;margin-top:8px;font-size:15px}table.prog th,table.prog td{border-bottom:1px solid var(--line);padding:6px;text-align:left}table.prog th{background:#f4efe4}
.empty{text-align:center;padding:30px 10px;color:var(--sub)}.empty b{display:block;font-size:44px}
.snack{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:20;display:flex;gap:14px;align-items:center;background:#1b3a2f;color:#fff;padding:12px 16px;border-radius:14px;box-shadow:0 10px 30px #0004;font-weight:700}
.snack[hidden]{display:none}.snack button{min-height:44px;border:0;border-radius:10px;background:#ffd36b;color:#1b3a2f;font-weight:800;padding:0 16px}
dialog{border:0;border-radius:20px;padding:0;max-width:min(860px,96vw);width:860px}dialog::backdrop{background:#0b1c16cc}
dialog .dh{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;background:var(--ink);color:#fff}
dialog .dh b{font-size:18px}dialog .dh button{min-height:44px;min-width:44px;border:0;border-radius:10px;background:#ffffff22;color:#fff;font-size:18px}
dialog .db{padding:14px 16px;max-height:80vh;overflow:auto}
dialog video{width:100%;border-radius:12px;background:#000}
.chapters{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.chapters button{min-height:44px;border:2px solid var(--line);border-radius:99px;background:#fff;font-weight:700;padding:0 14px}
#pv-host{min-height:360px;border-radius:16px;overflow:hidden;background:#fffaf0}
.pv-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
@media (max-width:760px){.q{grid-template-columns:32px 1fr}.q .n{padding-top:0}.q>div{grid-column:2}.q .del{grid-column:2}.form{grid-template-columns:1fr}.steps li span{display:none}.first{flex-direction:column;align-items:flex-start}}
</style></head><body><div class="wrap">
<div class="top">
  <div class="who">${room ? `<b>${esc(room.name)}</b> ・ クラス ${room.classes.map(esc).join('・')}` : '<a href="/admin">← 管理トップ</a> ・ <a href="/admin/qbank">問題データベース</a> ・ <a href="/admin/classrooms">教室の パスワード</a>'}</div>
  <div class="acts"><button type="button" class="btn" id="help">❓ 使い方の 動画</button>${room ? '<a class="btn orange" href="/teacher/reports">📨 保護者レポート・QR</a><form method="post" action="/teacher/logout" style="margin:0"><button type="submit" class="btn">ログアウト</button></form>' : ''}</div>
</div>
<h1>📝 宿題</h1>
<div class="tabs" role="tablist"><button type="button" role="tab" id="tab-make" aria-selected="true">✏️ 宿題を つくる</button><button type="button" role="tab" id="tab-list" aria-selected="false">📋 くばった 宿題<span class="count" id="list-count">0</span></button></div>

<section class="panel" id="make">
  <ol class="steps"><li id="st1" class="on"><b>1</b><span>もんだいを 入れる</span></li><li id="st2"><b>2</b><span>たしかめて なおす</span></li><li id="st3"><b>3</b><span>しめきりを きめて くばる</span></li></ol>

  <div class="step" id="step1">
    <div class="first" id="first"><button type="button" class="thumb" id="first-play" aria-label="使い方の 動画を みる">▶</button>
      <div><p><b>はじめての かたへ：1 分で わかる 使い方の 動画</b></p><p class="muted">プリントの 写真を 入れる → たしかめる → くばる。実際の 画面で せつめいします。</p></div>
      <span class="spacer"></span><button type="button" class="btn ghost" id="first-x">とじる</button></div>
    <div class="drop" id="drop">
      <div class="big-ic">📄</div>
      <h3>プリントの 写真・PDF・Word・Excel を ここに おく</h3>
      <p class="muted">ファイルを この わくに ドラッグ するか、下の ボタンを おして ください（なんまいでも・1 つ 25MB まで）</p>
      <div class="pick"><label class="btn"><input type="file" id="file" multiple hidden accept="image/*,.heic,.heif,.pdf,.docx,.pptx,.odt,.odp,.xlsx,.xlsm,.ods,.csv,.tsv,.txt,.md,.html,.htm,.json,.xml,.gift">📁 ファイルを えらぶ</label><label class="btn"><input type="file" id="cam" accept="image/*" capture="environment" hidden>📷 写真を とる</label></div>
    </div>
    <div class="files" id="files"></div>
    <details id="paste-box"><summary>✍️ 文を はりつけて 入れる（1 行に 1 もん）</summary><div class="in">
      <textarea id="text" placeholder="apple = りんご&#10;I (play) soccer. わたしは サッカーを します。&#10;I like music. わたしは 音楽が すきです。"></textarea>
      <p class="muted">「えいご = 日本語」・「(  ) に あなを あける 文」・「英文 と 訳」の 形が 読めます。</p></div></details>
    <details><summary>📦 ほかの アプリから 入れる（Kahoot・Quizlet・Blooket・Moodle・CSV）</summary><div class="in">
      <div class="fmts"><span>Kahoot の テンプレート（.xlsx）</span><span>Blooket の CSV</span><span>Quizlet（ことば ⇥ 意味）</span><span>Moodle（GIFT・Aiken・XML）</span><span>CSV・Excel（列：英語・日本語）</span><span>PowerPoint</span></div>
      <p><button type="button" class="btn" id="tmpl">⬇️ Excel で つくる ための ひな形（CSV）</button></p></div></details>
    ${aiReady ? '' : `<p class="banner bad">${room ? 'いまは 写真と 文字の ない PDF は 読めません。表の ファイル・はりつけた 文は 読めます。' : 'いまは AI が つかえません（OPENAI_API_KEY が ありません）。写真と 文字の ない PDF は 読めません。'}</p>`}
    <div class="row"><button type="button" class="btn big" id="read">🔍 読みとる →</button><button type="button" class="btn ghost" id="sample">🧪 サンプルで ためしてみる</button><span id="msg" role="status"></span></div>
  </div>

  <div class="step" id="step2" hidden>
    <p class="banner" id="check-banner">🤖 読みとりました。<b>まちがいが ないか たしかめて ください。</b>子どもには まだ 出ません。</p>
    <p class="banner bad" id="bad-banner" hidden></p>
    <p class="muted"><b>ゲームの 形</b>（おすと ぜんぶの 問題を その 形に できます。できない 問題は そのまま）</p>
    <div class="kinds" id="kinds"></div>
    <div class="qs" id="rows"></div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn" id="add">＋ 問題を 足す</button><button type="button" class="btn" id="preview">👀 せいとの 画面で みる</button><span class="spacer"></span></div>
    <div class="row end" style="margin-top:16px"><button type="button" class="btn ghost" id="back1">← 入れなおす</button><button type="button" class="btn big" id="next3">つぎへ（しめきりを きめる）→</button></div>
  </div>

  <div class="step" id="step3" hidden>
    <div class="form">
      <div><label for="title">宿題の 名前</label><input id="title" placeholder="れい：Unit 3 の ことば"></div>
      ${oneClass ? `<input type="hidden" id="classes" value="${esc(room.classes[0])}"><div><label>くばる クラス</label><p style="margin:12px 0 0;font-size:18px"><b>${esc(room.classes[0])}</b></p></div>`
        : `<div><label for="classes">くばる クラス（かならず${room ? '' : '・いくつでも , で 区切る'}）</label>${room ? `<select id="classes">${room.classes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>` : '<input id="classes" placeholder="6-1, 6-2" list="cls-list"><datalist id="cls-list"></datalist>'}</div>`}
      <div><label for="due">しめきり</label><input type="date" id="due"><div class="quick" id="quick"><button type="button" data-d="1">あした</button><button type="button" data-d="3">3 日ご</button><button type="button" data-d="7">1 しゅうかんご</button><button type="button" data-d="14">2 しゅうかんご</button><button type="button" data-d="0">しめきり なし</button></div></div>
    </div>
    <div class="summary" id="summary"></div>
    <div class="row end"><button type="button" class="btn ghost" id="back2">← もんだいに もどる</button><button type="button" class="btn ghost" id="save">下書きに 保存</button><button type="button" class="btn big" id="savepub">📤 くばる</button></div>
  </div>
</section>

<section class="panel" id="list-panel" hidden>
  <div class="row"${oneClass ? ' style="display:none"' : ''}><label>クラス <select id="cls" style="min-height:48px;border:2px solid var(--line);border-radius:10px;padding:0 10px"><option value="">ぜんぶの クラス</option></select></label></div>
  <div class="list" id="list"></div>
</section>
</div>

<div class="snack" id="snack" hidden><span id="snack-text"></span><button type="button" id="snack-undo">もとに もどす</button></div>
<dialog id="video-dlg"><div class="dh"><b>❓ 宿題の 使い方（1 分）</b><button type="button" data-close aria-label="とじる">✕</button></div><div class="db">
  <video id="video" controls playsinline preload="none" poster="/assets/guide/teacher-homework.jpg"><source src="${VIDEO}" type="video/mp4"></video>
  <div class="chapters" id="chapters"><button type="button" data-t="0">① 入れる</button><button type="button" data-t="14">② たしかめる</button><button type="button" data-t="36">③ くばる</button><button type="button" data-t="45">④ すすみぐあい</button></div></div></dialog>
<dialog id="pv-dlg"><div class="dh"><b>👀 せいとの 画面（ためし・記録は のこりません）</b><button type="button" data-close aria-label="とじる">✕</button></div><div class="db">
  <div class="pv-bar"><button type="button" class="btn" id="pv-prev">← まえ</button><b id="pv-n"></b><button type="button" class="btn" id="pv-next">つぎ →</button></div><div id="pv-host"></div></div></dialog>
<script type="module">
const CFG = ${json(cfg)};
${CLIENT}
</script></body></html>`;
}
