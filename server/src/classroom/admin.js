// /admin/classrooms — 教室ごとの パスワードの 表（運営だけ）。列：教室の 名前・クラスコード・パスワード。
// ここで つけた パスワードで 教室の 先生が /teacher/homework に 入る。パスワードは のこさない（classroom/store.js）ので、
// 作った ときに 1 回だけ 見える。わすれたら 作りなおす（前の パスワードと その ログインは 使えなく なる）。
import express from 'express';
import { MIN_PASSWORD } from './store.js';

export function classroomAdminExtension({ classrooms, rosterClasses = async () => [], log = console }) {
  return ({ router, api, authed }) => {
    router.get('/classrooms', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(PAGE);
    });
    api.use('/classrooms', express.json({ limit: '200kb' }));
    api.get('/classrooms', async (req, res) => {
      let roster = [];
      try { roster = (await rosterClasses()).filter((c) => c && c !== '*'); } catch (err) { log.warn('[classrooms] roster classes failed:', err.message); }
      res.json({ ok: true, rooms: classrooms.list(), classes: [...new Set(roster)].sort(), min: MIN_PASSWORD });
    });
    api.put('/classrooms', async (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return; }
      const r = await classrooms.saveAll(req.body?.rows);
      if (r.ok) log.info(`[classrooms] saved ${r.rooms.length} rooms`);
      res.status(r.ok ? 200 : 400).json(r);
    });
  };
}

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>教室の パスワード — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f}.wrap{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}.muted{color:#6e665c;font-size:13px;line-height:1.7}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}
input,button{min-height:38px;border:1px solid #d9d1c3;border-radius:10px;background:#fff;font:inherit;padding:0 10px}button{font-weight:700;cursor:pointer;white-space:nowrap}
button.main{background:#1b3a2f;color:#fff;border-color:#1b3a2f}button.warn{color:#b5432b;border-color:#e3b3a6}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:14px}th,td{border-bottom:1px solid #f0e8da;padding:6px;text-align:left;vertical-align:top}
th{background:#1b3a2f;color:#fff}td input{width:100%}tr.bad td{background:#fff1ec}.why{color:#b5432b;font-size:12px}.pw{display:flex;gap:6px}.pw input{font-family:ui-monospace,Menlo,monospace}
.state{font-size:12px;color:#2f8f5b}.state.no{color:#b5432b}#msg{font-weight:700;min-height:22px}code{background:#f4efe4;border-radius:6px;padding:1px 6px}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a> ・ <a href="/admin/homework">宿題（運営）</a></p>
<h1>🔑 教室の パスワード</h1>
<p class="muted">英会話教室の 先生は <code id="url">/teacher/homework</code> を ひらいて、ここの <b>パスワード</b> だけで 入れます。<b>パスワードで 教室と クラスが きまる</b>ので、先生は クラスコードを 入れません。その 教室の クラスの 宿題だけ 見えて、作れて、くばれます。<br>
パスワードは サーバーに のこさないので、<b>作った ときに 1 回だけ 見えます</b>。「作る」→ コピーして 教室に わたす → 「保存」。わすれたら 作りなおして ください（前の パスワードでは 入れなく なります）。<br>
1 つの 教室に クラスを いくつでも（, で 区切る）。1 つの クラスは 1 つの 教室だけ。パスワードは 教室ごとに ちがう もので、<span id="min">8</span> 文字 以上。</p>
<table><thead><tr><th style="width:24%">教室の 名前</th><th style="width:26%">クラスコード（, で 区切る）</th><th>パスワード（入れると かわる・空なら そのまま）</th><th style="width:70px"></th></tr></thead><tbody id="rows"></tbody></table>
<datalist id="cls-list"></datalist>
<div class="bar"><button id="add">＋ 教室を 足す</button><button class="main" id="save">保存</button><span id="msg"></span></div>
</div>
<script>
const $=s=>document.querySelector(s);const H={'x-requested-with':'uspeak-admin','content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let rows=[];$('#url').textContent=location.origin+'/teacher/homework';
const ABC='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const make=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>ABC[x%ABC.length]).join('');
function paint(){$('#rows').innerHTML=rows.map((r,i)=>'<tr data-row="'+i+'"><td><input data-i="'+i+'" data-f="name" value="'+esc(r.name)+'" placeholder="例：さくら 英会話"></td><td><input data-i="'+i+'" data-f="classes" value="'+esc(r.classes)+'" placeholder="例：sakura1, sakura2" list="cls-list"></td>'+
'<td><div class="pw"><input data-i="'+i+'" data-f="password" value="'+esc(r.password||'')+'" placeholder="'+(r.hasPassword?'（いまの まま）':'パスワード')+'" autocomplete="off" spellcheck="false"><button data-make="'+i+'">作る</button><button data-copy="'+i+'">コピー</button></div>'+
'<div class="state'+(r.hasPassword?'':' no')+'">'+(r.password?'⚠ まだ 保存して いません。コピーして わたしてから「保存」':r.hasPassword?'✓ パスワード あり（'+new Date(r.setAt).toLocaleDateString('ja-JP')+' に つけた）':'パスワード なし')+'</div><div class="why"></div></td>'+
'<td><button class="warn" data-del="'+i+'">消す</button></td></tr>').join('')||'<tr><td colspan="4" class="muted">まだ 教室が ありません。「＋ 教室を 足す」で 作れます。</td></tr>'}
$('#rows').addEventListener('input',e=>{const el=e.target;if(el.dataset.f)rows[+el.dataset.i][el.dataset.f]=el.value});
$('#rows').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
if(b.dataset.make!==undefined){rows[+b.dataset.make].password=make();paint()}
if(b.dataset.copy!==undefined){const v=rows[+b.dataset.copy].password;if(!v){$('#msg').textContent='コピーできるのは 新しい パスワードだけです（いまの パスワードは 見られません）';return}try{await navigator.clipboard.writeText(v);$('#msg').textContent='コピーしました'}catch{$('#msg').textContent='コピーできません。手で えらんで コピーして ください'}}
if(b.dataset.del!==undefined){const r=rows[+b.dataset.del];if((r.name||r.id)&&!confirm('「'+(r.name||'この 教室')+'」を 消しますか？ この 教室の 先生は 入れなく なります（宿題は のこります）'))return;rows.splice(+b.dataset.del,1);paint()}};
$('#add').onclick=()=>{rows.push({name:'',classes:'',password:make(),hasPassword:false});paint()};
$('#save').onclick=async()=>{const r=await fetch('/admin/api/classrooms',{method:'PUT',headers:H,body:JSON.stringify({rows:rows.map(({id,name,classes,password})=>({id,name,classes,password}))})}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}));
if(!r.ok){$('#msg').textContent='保存できません：'+r.error;const bad={};(r.problems||[]).forEach(p=>bad[p.index]=p.reason);document.querySelectorAll('#rows tr').forEach(tr=>{const i=+tr.dataset.row;tr.classList.toggle('bad',!!bad[i]);const w=tr.querySelector('.why');if(w)w.textContent=bad[i]||''});return}
$('#msg').textContent='保存しました（'+r.rooms.length+' 教室）';fill(r.rooms)};
function fill(list){rows=list.map(r=>({...r,classes:r.classes.join(', '),password:''}));paint()}
(async()=>{const r=await fetch('/admin/api/classrooms',{headers:H});if(r.status===401){location.href='/admin';return}const d=await r.json();$('#min').textContent=d.min;$('#cls-list').innerHTML=d.classes.map(c=>'<option value="'+esc(c)+'">').join('');fill(d.rooms)})();
</script></body></html>`;
