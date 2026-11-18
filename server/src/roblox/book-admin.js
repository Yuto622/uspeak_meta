// /admin/roblox-books — 絵本の 絵を Roblox へ 上げる（運営だけ・ADMIN_KEY）。上げるのは サーバーの うしろで 動く（book-assets.js）。
// 画面は 数と ボタンだけ。鍵（ROBLOX_OPEN_CLOUD_KEY）は 出さない：足りない 設定は 名前だけ 見せる。
import express from 'express';

export function robloxBooksAdminExtension({ assets, log = console }) {
  return ({ router, api, authed }) => {
    router.get('/roblox-books', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(PAGE);
    });
    api.get('/roblox-books', (req, res) => res.json({ ok: true, ...assets.status() }));
    api.post('/roblox-books', express.json({ limit: '4kb' }), (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return; }
      const action = String(req.body?.action || '');
      if (action === 'stop') { res.json({ ok: true, stopping: assets.stop() }); return; }
      if (action !== 'start') { res.status(400).json({ ok: false, error: 'action' }); return; }
      if (!assets.enabled) { res.status(400).json({ ok: false, error: `設定が 足りません：${assets.missing().join('・')}` }); return; }
      if (assets.job.running) { res.json({ ok: true, already: true }); return; }
      const limit = Math.max(1, Math.min(2000, Number(req.body?.limit) || 200));
      const book = /^rd-[A-Za-z0-9-]{1,40}$/.test(String(req.body?.book || '')) ? String(req.body.book) : '';
      // うしろで 動かす（へんじは すぐ。すすみは 画面を 読みなおすと 見える）。
      assets.run({ limit, book }).then((r) => log.info?.(`[roblox-books] run ended sent=${r.sent ?? 0} polled=${r.polled ?? 0}${r.error ? ` error=${r.error}` : ''}`)).catch((err) => log.warn?.('[roblox-books] run failed:', err?.message || err));
      log.info?.(`[roblox-books] run started limit=${limit}${book ? ` book=${book}` : ''}`);
      res.json({ ok: true, started: true, limit });
    });
  };
}

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Roblox に 絵本を 上げる — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f;font-size:16px;line-height:1.7}.wrap{max-width:1000px;margin:0 auto;padding:16px 16px 60px}
h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:18px 0 6px}.muted{color:#6e665c;font-size:14px}a{color:#2f6fb0}
.card{background:#fff;border:1px solid #eadfcd;border-radius:14px;padding:14px 16px;margin:12px 0}
.nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.nums div{background:#173f38;color:#fff;border-radius:12px;padding:10px;text-align:center}.nums b{display:block;font-size:24px}.nums span{font-size:13px;opacity:.9}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}button{min-height:48px;padding:0 18px;border-radius:12px;border:2px solid #d9d1c3;background:#fff;font:inherit;font-weight:800;cursor:pointer}
button.main{background:#2f8f5b;border-color:#2f8f5b;color:#fff}button.warn{color:#b5432b;border-color:#e3b3a6}button:disabled{opacity:.45;cursor:not-allowed}
input{min-height:48px;border:2px solid #d9d1c3;border-radius:12px;font:inherit;padding:0 12px;width:110px}
.bad{background:#fff1ec;border-color:#e3b3a6;color:#8a2f1c}.ok{color:#2f8f5b;font-weight:800}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{border-bottom:1px solid #f0e8da;padding:6px 8px;text-align:left}th{background:#1b3a2f;color:#fff;position:sticky;top:0}td.n{text-align:right;font-variant-numeric:tabular-nums}
code{background:#f4efe4;border-radius:6px;padding:1px 6px;font-size:14px}ol{margin:6px 0 0 20px;padding:0}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a></p>
<h1>📚 Roblox に 絵本を 上げる</h1>
<p class="muted">よみもの島の 絵本の 絵（表紙と ページ）を 画像（1024×768 の PNG）に して、Roblox へ 自動で 上げます。<b>同じ 絵は 1 回だけ</b>。絵が かわった 本だけ 上げなおします。Roblox の <b>審査</b>を 通った 絵だけが Roblox 版の 本に 出ます（審査中の ページは「じゅんびちゅう」の 絵）。</p>
<div id="need" class="card bad" hidden></div>
<div class="card"><div class="nums" id="nums"></div>
<p id="job" class="muted" style="margin:10px 0 0"></p></div>
<div class="card bar"><label>1 回に 上げる 数 <input id="limit" type="number" min="1" max="2000" value="200"></label>
<button class="main" id="start">▶ アップロードを はじめる／つづける</button><button class="warn" id="stop">■ 止める</button><button id="reload">↻ 読みなおす</button><span id="msg" class="muted"></span></div>
<div class="card"><h2 style="margin-top:0">はじめに する こと（1 回だけ）</h2>
<ol><li>Roblox の Creator Dashboard で <b>API キー</b>を 作る。権限は <code>assets</code> の <b>Read</b> と <b>Write</b>。IP の 制限は かけない（サーバーの IP が かわる ため）。</li>
<li>キーは <b>チャットや メールに はらず</b>、パソコンの ターミナルで <code>fly secrets set ROBLOX_OPEN_CLOUD_KEY=…</code> と 入れる。</li>
<li>絵の 持ち主を 入れる：グループなら <code>fly secrets set ROBLOX_CREATOR_GROUP_ID=数字</code>、個人なら <code>ROBLOX_CREATOR_USER_ID=数字</code>（<b>ゲームの 持ち主と 同じ</b>に する。ちがうと ゲームで 絵が 出ません）。</li>
<li>この 画面で「アップロードを はじめる」。数が ふえるのを 見て、審査が おわるまで ときどき「つづける」を おす（審査の ようすを 見なおします）。</li></ol></div>
<h2>本ごとの ようす</h2>
<div class="card" style="padding:0;overflow:auto;max-height:70vh"><table><thead><tr><th>レベル</th><th>本</th><th>絵</th><th>通った</th><th>審査中</th><th>だめ</th><th>まだ</th></tr></thead><tbody id="rows"></tbody></table></div>
</div><script>
const $=s=>document.querySelector(s);const H={'x-requested-with':'uspeak-admin','content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let timer=0;
async function load(){const r=await fetch('/admin/api/roblox-books',{headers:H});if(r.status===401){location.href='/admin';return}const d=await r.json();
  const t=d.totals;$('#nums').innerHTML=[['本',t.books],['絵 ぜんぶ',t.total],['通った',t.approved],['審査中',t.reviewing],['だめ',t.rejected],['まだ',t.todo]].map(([n,v])=>'<div><b>'+v+'</b><span>'+n+'</span></div>').join('');
  $('#need').hidden=d.enabled;if(!d.enabled)$('#need').innerHTML='<b>まだ 使えません。</b> つぎの 設定が 足りません（<code>fly secrets set</code> で 入れます）：<br>'+d.missing.map(m=>'<code>'+esc(m)+'</code>').join('　');
  const j=d.job;$('#job').innerHTML=(j.running?'<span class="ok">● 動いて います</span>　':'')+(j.note?esc(j.note)+'　':'')+(j.sent?'おくった '+j.sent+' まい　':'')+(j.lastError?'<span style="color:#b5432b">さいごの エラー：'+esc(j.lastError)+'</span>':'')+'<br>上げ方：'+esc(d.assetType)+'・'+(d.creator==='group'?'グループの 絵':d.creator==='user'?'個人の 絵':'持ち主 なし')+'・1 分 '+d.perMin+' まいまで・'+esc(d.size);
  $('#start').disabled=!d.enabled||j.running;$('#stop').disabled=!j.running;
  $('#rows').innerHTML=d.rows.map(r=>'<tr><td>'+esc(r.stage)+'</td><td>'+esc(r.title)+'</td><td class="n">'+r.total+'</td><td class="n">'+r.approved+'</td><td class="n">'+r.reviewing+'</td><td class="n"'+(r.rejected?' style="color:#b5432b;font-weight:800"':'')+'>'+r.rejected+'</td><td class="n">'+r.todo+'</td></tr>').join('');
  clearTimeout(timer);if(j.running)timer=setTimeout(load,4000)}
async function post(body){const r=await fetch('/admin/api/roblox-books',{method:'POST',headers:H,body:JSON.stringify(body)}).then(r=>r.json()).catch(()=>({ok:false,error:'つうしんできません'}));$('#msg').textContent=r.ok?(body.action==='start'?'はじめました':'止めて います…'):'できません：'+(r.error||'');setTimeout(load,800)}
$('#start').onclick=()=>post({action:'start',limit:+$('#limit').value||200});$('#stop').onclick=()=>post({action:'stop'});$('#reload').onclick=load;load();
</script></body></html>`;
