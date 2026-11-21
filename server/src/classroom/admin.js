// /admin/classrooms — 教室ごとの パスワードの 表（運営だけ）。列：教室の 名前・クラスコード・パスワード。
// ここで つけた パスワードで 教室の 先生が /teacher/homework に 入る。パスワードは のこさない（classroom/store.js）ので、
// 作った ときに 1 回だけ 見える。わすれたら 作りなおす（前の パスワードと その ログインは 使えなく なる）。
import express from 'express';
import { MIN_PASSWORD } from './store.js';

const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase();

// `rosterRows()`：名簿の 行。`store.loadPlayer(class, name)`：その クラスに 記録（コイン・レベル）が あるか を 見る ため。
export function classroomAdminExtension({ classrooms, rosterClasses = async () => [], rosterRows = async () => [], store = null, log = console }) {
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
    // 教室の アカウント（2026-11）：その 教室の クラスの 名簿の 行と、クラスが きまって いない 行。
    // **記録は「クラスコード＋なまえ」で のこる**ので、行ごとに いまの クラスに 記録が あるか（hasRecord）と、
    // クラスの ない 行は 教室の どの クラスに 記録が あるか（recordIn）を 返す（うつすと 記録が ついて こない ことを 画面で 知らせる）。
    // 書きかえは 画面が いつもの 名簿の 口（/admin/api/roster）で する（名簿の きまり・入ったままの 子への とどけ方は そのまま）。
    api.get('/classrooms/accounts', async (req, res) => {
      const room = classrooms.get(String(req.query.room ?? ''));
      if (!room) { res.status(404).json({ ok: false, error: '教室が ありません' }); return; }
      let rows = [];
      try { rows = (await rosterRows()) || []; } catch (err) { log.warn('[classrooms] roster failed:', err.message); }
      const mine = new Set(room.classes.map(fold));
      const has = async (cls, name) => { try { return !!(await store?.loadPlayer?.(cls, name)); } catch { return false; } };
      const accounts = []; let loose = 0;
      for (const r of rows) {
        if (!r?.name) continue;
        const cls = r.class && r.class !== '*' ? String(r.class) : '';
        if (cls && !mine.has(fold(cls))) continue;
        if (!cls && ++loose > 300) continue;
        const a = { name: String(r.name), class: cls, teacher: !!r.teacher, stopped: !!r.stopped };
        if (cls) a.hasRecord = await has(cls, a.name);
        else { a.recordIn = []; for (const c of room.classes) if (await has(c, a.name)) a.recordIn.push(c); }
        accounts.push(a);
      }
      res.json({ ok: true, room: { id: room.id, name: room.name, classes: room.classes }, accounts });
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
.state{font-size:12px;color:#2f8f5b}.state.no{color:#b5432b}#msg{font-weight:700;min-height:22px}.share{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;background:#fff;border:2px solid #e27a2d;border-radius:14px;padding:12px 16px;margin:12px 0}.share b{display:block;font-size:13px;color:#6e665c;margin-bottom:2px}.share a{font-size:18px;font-weight:700;color:#1b3a2f;word-break:break-all}code{background:#f4efe4;border-radius:6px;padding:1px 6px}#acct{background:#fff;border:2px solid #2f8f5b;border-radius:14px;padding:14px 16px;margin:16px 0}#acct h2{font-size:19px;margin:0}#acct h3{font-size:16px;margin:14px 0 6px}#acct .head{display:flex;justify-content:space-between;gap:8px;align-items:center}#acct .note{background:#fff1ec;color:#8a3a22;border-radius:10px;padding:8px 12px;font-size:13px;line-height:1.7;margin:8px 0}#acct td,#acct th{font-size:14px}#acct select{min-height:38px;border:1px solid #d9d1c3;border-radius:10px;font:inherit;padding:0 8px;background:#fff}.tag{display:inline-block;font-size:12px;border-radius:999px;padding:0 8px;margin-left:6px;background:#eef3ef}.rec{color:#2f8f5b}.norec{color:#8a8175}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a> ・ <a href="/admin/homework">宿題（運営）</a></p>
<h1>🔑 教室の パスワード</h1>
<div class="share"><div><b>教室に わたす 管理画面の URL</b><a id="share-url" href="/teacher/homework" target="_blank" rel="noopener">/teacher/homework</a></div><button id="copy-url">URL を コピー</button></div>
<p class="muted">英会話教室の 先生は <code id="url">/teacher/homework</code> を ひらいて、ここの <b>先生の パスワード</b> だけで 入れます。<b>パスワードで 教室と クラスが きまる</b>ので、先生は クラスの パスワードを 入れません。その 教室の クラスの 宿題だけ 見えて、作れて、くばれます。<br>
パスワードは サーバーに のこさないので、<b>作った ときに 1 回だけ 見えます</b>。「作る」→ コピーして 教室に わたす → 「保存」。わすれたら 作りなおして ください（前の パスワードでは 入れなく なります）。<br>
1 つの 教室に クラスを いくつでも（, で 区切る）。1 つの クラスは 1 つの 教室だけ。パスワードは 教室ごとに ちがう もので、<span id="min">8</span> 文字 以上。</p>
<table><thead><tr><th style="width:24%">教室の 名前</th><th style="width:26%">クラスの パスワード（, で 区切る）</th><th>先生の パスワード（入れると かわる・空なら そのまま）</th><th style="width:70px"></th></tr></thead><tbody id="rows"></tbody></table>
<datalist id="cls-list"></datalist>
<div class="bar"><button id="add">＋ 教室を 足す</button><button class="main" id="save">保存</button><span id="msg"></span></div>
<section id="acct" hidden></section>
</div>
<script>
const $=s=>document.querySelector(s);const H={'x-requested-with':'uspeak-admin','content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let rows=[];const TURL=location.origin+'/teacher/homework';$('#url').textContent=TURL;$('#share-url').textContent=TURL;$('#share-url').href=TURL;
const copy=async(v,ok)=>{try{await navigator.clipboard.writeText(v);$('#msg').textContent=ok}catch{$('#msg').textContent='コピーできません。手で えらんで コピーして ください'}};
$('#copy-url').onclick=()=>copy(TURL,'URL を コピーしました');
const ABC='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const make=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>ABC[x%ABC.length]).join('');
function paint(){$('#rows').innerHTML=rows.map((r,i)=>'<tr data-row="'+i+'"><td><input data-i="'+i+'" data-f="name" value="'+esc(r.name)+'" placeholder="例：さくら 英会話"></td><td><input data-i="'+i+'" data-f="classes" value="'+esc(r.classes)+'" placeholder="例：sakura1, sakura2" list="cls-list"></td>'+
'<td><div class="pw"><input data-i="'+i+'" data-f="password" value="'+esc(r.password||'')+'" placeholder="'+(r.hasPassword?'（いまの まま）':'パスワード')+'" autocomplete="off" spellcheck="false"><button data-make="'+i+'">作る</button><button data-copy="'+i+'" title="URL と パスワードを いっしょに コピー">わたす 文を コピー</button></div>'+
'<div class="state'+(r.hasPassword?'':' no')+'">'+(r.password?'⚠ まだ 保存して いません。コピーして わたしてから「保存」':r.hasPassword?'✓ パスワード あり（'+new Date(r.setAt).toLocaleDateString('ja-JP')+' に つけた）':'パスワード なし')+'</div><div class="why"></div></td>'+
'<td>'+(r.id?'<button data-acct="'+i+'" title="この 教室の クラスに アカウントを むすぶ">👥 アカウント</button> ':'')+'<button class="warn" data-del="'+i+'">消す</button></td></tr>').join('')||'<tr><td colspan="4" class="muted">まだ 教室が ありません。「＋ 教室を 足す」で 作れます。</td></tr>'}
$('#rows').addEventListener('input',e=>{const el=e.target;if(el.dataset.f)rows[+el.dataset.i][el.dataset.f]=el.value});
$('#rows').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
if(b.dataset.make!==undefined){rows[+b.dataset.make].password=make();paint()}
if(b.dataset.acct!==undefined){openAcct(rows[+b.dataset.acct].id)}
if(b.dataset.copy!==undefined){const r=rows[+b.dataset.copy];if(!r.password){$('#msg').textContent='コピーできるのは 新しい パスワードだけです（いまの パスワードは 見られません）';return}copy('U-Speak 宿題の 管理画面（'+(r.name||'教室')+'）\\n'+TURL+'\\nパスワード：'+r.password,'URL と パスワードを コピーしました（そのまま 教室に わたせます）')}
if(b.dataset.del!==undefined){const r=rows[+b.dataset.del];if((r.name||r.id)&&!confirm('「'+(r.name||'この 教室')+'」を 消しますか？ この 教室の 先生は 入れなく なります（宿題は のこります）'))return;rows.splice(+b.dataset.del,1);paint()}};
$('#add').onclick=()=>{rows.push({name:'',classes:'',password:make(),hasPassword:false});paint()};
$('#save').onclick=async()=>{const r=await fetch('/admin/api/classrooms',{method:'PUT',headers:H,body:JSON.stringify({rows:rows.map(({id,name,classes,password})=>({id,name,classes,password}))})}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}));
if(!r.ok){$('#msg').textContent='保存できません：'+r.error;const bad={};(r.problems||[]).forEach(p=>bad[p.index]=p.reason);document.querySelectorAll('#rows tr').forEach(tr=>{const i=+tr.dataset.row;tr.classList.toggle('bad',!!bad[i]);const w=tr.querySelector('.why');if(w)w.textContent=bad[i]||''});return}
$('#msg').textContent='保存しました（'+r.rooms.length+' 教室）';fill(r.rooms)};
// 👥 アカウント：教室の クラスごとに 名簿の アカウントを ならべ、クラスを えらびなおす（名簿の「クラスコード」列を 書きかえる だけ・子どもの 画面は かわらない）。
let acct=null;const fold=s=>String(s??'').normalize('NFKC').trim().toLowerCase();
async function openAcct(id){const r=await fetch('/admin/api/classrooms/accounts?room='+encodeURIComponent(id),{headers:H}).then(r=>r.json()).catch(()=>({ok:false}));
  if(!r.ok){$('#msg').textContent='アカウントを 読めません：'+(r.error||'');return}acct=r;paintAcct();$('#acct').scrollIntoView({behavior:'smooth',block:'start'})}
function sel(a,i){const cs=acct.room.classes;return '<select data-move="'+i+'">'+(a.class?'':'<option value="">えらぶ…</option>')+cs.map(c=>'<option value="'+esc(c)+'"'+(fold(c)===fold(a.class)?' selected':'')+'>'+esc(c)+'</option>').join('')+(a.class?'<option value="">（クラスを はずす）</option>':'')+'</select>'}
function who(a){return esc(a.name)+(a.teacher?'<span class="tag">🎓 先生</span>':'')+(a.stopped?'<span class="tag">⏸ 停止</span>':'')}
function paintAcct(){const box=$('#acct');box.hidden=false;const cs=acct.room.classes;const list=acct.accounts;
  const table=(items)=>'<table><thead><tr><th>なまえ</th><th style="width:30%">記録（コイン・レベル）</th><th style="width:26%">クラス</th></tr></thead><tbody>'+items.map(([a,i])=>'<tr><td>'+who(a)+'</td><td>'+(a.class?(a.hasRecord?'<span class="rec">✓ この クラスに あり</span>':'<span class="norec">まだ なし</span>'):(a.recordIn.length?'<span class="rec">'+a.recordIn.map(esc).join('・')+' に あり</span>':'<span class="norec">この 教室には なし</span>'))+'</td><td>'+sel(a,i)+'</td></tr>').join('')+'</tbody></table>';
  const idx=list.map((a,i)=>[a,i]);
  box.innerHTML='<div class="head"><h2>👥 '+esc(acct.room.name)+' の アカウント</h2><button id="acct-close">とじる</button></div>'+
  '<p class="muted" style="margin:6px 0 0">クラスを えらぶと、<b>名簿の「クラスコード」</b>が かわります（子どもの 画面は かわりません）。その 子は つぎから その クラスコードで 入ります。</p>'+
  '<div class="note">⚠ コイン・レベル・もちものは <b>クラスコード＋なまえ</b> で 保存されて います。<b>記録の ある 子を ちがう クラスへ うつすと、新しい クラスでは はじめから</b> に なります（前の 記録は 前の クラスに のこり、もどせば また 見えます）。はじめての 子・まだ あそんで いない 子を むすぶ のに つかって ください。</div>'+
  cs.map(c=>{const items=idx.filter(([a])=>fold(a.class)===fold(c));return '<h3>クラス '+esc(c)+'（'+items.length+' 人）</h3>'+(items.length?table(items):'<p class="muted">まだ だれも いません。</p>')}).join('')+
  (()=>{const items=idx.filter(([a])=>!a.class);return '<h3>クラスが きまって いない アカウント（'+items.length+' 人）</h3><p class="muted" style="margin:0 0 6px">名簿で クラスが 空の 子です。いまは どの クラスコードでも 入れます。「記録」に ある クラスを えらぶと、その まま つづきから あそべます。</p>'+(items.length?table(items):'<p class="muted">いません。</p>')})();
  $('#acct-close').onclick=()=>{box.hidden=true};
  box.querySelectorAll('select[data-move]').forEach(s=>s.onchange=()=>move(+s.dataset.move,s.value));}
async function move(i,to){const a=acct.accounts[i];const from=a.class;if(fold(to)===fold(from)){paintAcct();return}
  if(!to&&!from){paintAcct();return}
  let q=to?a.name+' を クラス '+to+' に むすびます。つぎから クラスコード '+to+' で 入ります。':a.name+' の クラスを はずします（どの クラスコードでも 入れる ように なります）。';
  if(to&&from&&a.hasRecord)q+='\\n\\n⚠ いまの クラス '+from+' に 記録（コイン・レベル）が あります。'+to+' では はじめから に なります。';
  if(to&&!from&&a.recordIn.length&&!a.recordIn.some(c=>fold(c)===fold(to)))q+='\\n\\n⚠ 記録は '+a.recordIn.join('・')+' に あります。'+to+' では はじめから に なります。';
  if(!confirm(q)){paintAcct();return}
  const g=await fetch('/admin/api/roster',{headers:H}).then(r=>r.json()).catch(()=>({ok:false}));
  if(!g.ok){$('#msg').textContent='名簿を 読めません';paintAcct();return}
  if(!g.editable){alert('名簿が スプレッドシートなど ここで 書けない 場所に あります。そちらの「クラスコード」列を 書きかえて ください。');paintAcct();return}
  const k=g.rows.findIndex(x=>fold(x.name)===fold(a.name)&&fold(x.class)===fold(from));
  if(k<0){$('#msg').textContent='名簿に その 行が 見つかりません（名簿が かわった かも しれません）';await openAcct(acct.room.id);return}
  g.rows[k].class=to;
  const p=await fetch('/admin/api/roster',{method:'PUT',headers:H,body:JSON.stringify({rows:g.rows})}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}));
  $('#msg').textContent=p.ok?(to?a.name+' を クラス '+to+' に むすびました':a.name+' の クラスを はずしました'):'保存できません：'+(p.error||'');
  await openAcct(acct.room.id);}
function fill(list){rows=list.map(r=>({...r,classes:r.classes.join(', '),password:''}));paint()}
(async()=>{const r=await fetch('/admin/api/classrooms',{headers:H});if(r.status===401){location.href='/admin';return}const d=await r.json();$('#min').textContent=d.min;$('#cls-list').innerHTML=d.classes.map(c=>'<option value="'+esc(c)+'">').join('');fill(d.rooms)})();
</script></body></html>`;
