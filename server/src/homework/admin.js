// /admin/homework — 宿題を 入れる（どの 形式でも）→ 読みとった 下書きを 先生が たしかめて なおす → くばる → すすみぐあいを 見る。
// ログインは 名簿の 管理ページと 同じ（roster-admin の extend）。**くばるまで 子どもには 出ない。**
import express from 'express';
import { extractHomework } from './extract.js';
import { KINDS, KIND_JA, checkItems } from './items.js';

// store.js の クラスの 書きかたに そろえる（名簿の「6-1」と 宿題の「6-1」が 同じ クラスに なるように）。
const classKeyOf = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);

export function homeworkAdminExtension({ homework, aiReady = false, rosterClasses = async () => [], log = console }) {
  return ({ router, api, authed }) => {
    api.use('/homework', express.json({ limit: '60mb' }));
    router.get('/homework', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(page({ aiReady }));
    });
    const guard = (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return false; }
      return true;
    };
    const view = (a) => {
      const rows = homework.classProgress(a.id);
      return { ...a, problems: checkItems(a.items).problems, started: rows.length, finished: rows.filter((r) => r.done).length };
    };
    // クラスごとに 分けて 見る：名簿の クラスと、宿題に 書いて ある クラス。
    api.get('/homework', async (req, res) => {
      let roster = [];
      try { roster = await rosterClasses(); } catch (err) { log.warn('[homework] roster classes failed:', err.message); }
      const classes = [...new Set([...roster.map(classKeyOf), ...homework.assignments.flatMap((a) => a.classes)].filter((c) => c && c !== '*'))].sort();
      res.json({ ok: true, kinds: KINDS, kindJa: KIND_JA, ai: aiReady, classes, items: homework.assignments.map(view) });
    });
    // 読みとるだけ（保存しない）。文・ファイル（写真・PDF・Word・Excel・CSV…）を まとめて。
    api.post('/homework/extract', async (req, res) => {
      if (!guard(req, res)) return;
      try { res.json(await extractHomework({ text: String(req.body?.text || ''), files: req.body?.files || [] }, { log })); }
      catch (err) { log.warn('[homework] extract failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
    });
    api.post('/homework', async (req, res) => { if (guard(req, res)) res.json(await homework.create(req.body || {})); });
    api.put('/homework/:id', async (req, res) => { if (!guard(req, res)) return; const r = await homework.update(req.params.id, req.body || {}); res.status(r.ok ? 200 : 400).json(r); });
    api.post('/homework/:id/publish', async (req, res) => { if (!guard(req, res)) return; const r = await homework.publish(req.params.id, !!req.body?.on); res.status(r.ok ? 200 : 400).json(r); });
    api.delete('/homework/:id', async (req, res) => { if (guard(req, res)) res.json(await homework.remove(req.params.id)); });
    api.get('/homework/:id/progress', (req, res) => res.json({ ok: true, rows: homework.classProgress(req.params.id) }));
  };
}

const page = ({ aiReady }) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>宿題 — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f}.wrap{max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:20px 0 8px}.muted{color:#6e665c;font-size:13px}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
select,input,button,textarea{min-height:38px;border:1px solid #d9d1c3;border-radius:10px;background:#fff;font:inherit;padding:0 10px}textarea{width:100%;padding:8px;min-height:120px}
button{font-weight:700;cursor:pointer}button.main{background:#1b3a2f;color:#fff;border-color:#1b3a2f}button.go{background:#2f8f5b;color:#fff;border-color:#2f8f5b}button.warn{background:#fff;color:#b5432b;border-color:#e3b3a6}
.drop{border:2px dashed #c9bda8;border-radius:16px;background:#fff;padding:18px;text-align:center}.drop.on{border-color:#2f8f5b;background:#f1faf3}
.drop b{display:block;font-size:16px;margin-bottom:4px}.fmts{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:8px}.fmts span{font-size:12px;background:#f4efe4;border-radius:999px;padding:2px 9px}
.files{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.files span{background:#eef6f0;border-radius:8px;padding:3px 8px;font-size:13px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:13px}th,td{border-bottom:1px solid #f0e8da;padding:5px 6px;text-align:left;vertical-align:top}
th{background:#1b3a2f;color:#fff}td input{width:100%;min-height:32px}td select{min-height:32px}tr.bad td{background:#fff1ec}tr.bad .why{color:#b5432b;font-size:12px}
.card{background:#fff;border:1px solid #eadfcd;border-radius:14px;padding:12px 14px;margin:8px 0}.card h3{margin:0 0 4px;font-size:16px}.pill{display:inline-block;font-size:12px;border-radius:999px;padding:1px 9px;margin-left:6px}
.pill.draft{background:#f4efe4}.pill.pub{background:#2f8f5b;color:#fff}#msg{min-height:20px;font-weight:700}h3.grp{margin:18px 0 6px;font-size:16px;border-bottom:2px solid #eadfcd;padding-bottom:4px}.warns{color:#8a5a12;font-size:13px}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a> ・ <a href="/admin/qbank">問題データベース</a></p>
<h1>宿題</h1>
<p class="muted">プリントの 写真・PDF・Word・Excel・CSV・テキストを 入れると、問題と 答えを 読みとって ゲームの 7 つの 形（えらぶ・せんつなぎ・つづり・タイピング・ならべかえ・あなうめ・きいて えらぶ）に ふりわけます。
<b>読みとった 問題は「くばる」を 押すまで 子どもには 出ません。</b>答えを たしかめてから くばって ください。${aiReady ? '' : '<br><b>いまは AI が つかえません</b>（OPENAI_API_KEY が ありません）。表の ファイル・問題の 書式・「ことば = 意味」の 文は 読めますが、写真と 文字の ない PDF は 読めません。'}</p>

<h2>1. 入れる</h2>
<div class="drop" id="drop"><b>ここに ファイルを おとす ／ <label style="text-decoration:underline;cursor:pointer">えらぶ<input type="file" id="file" multiple hidden accept="image/*,.heic,.heif,.pdf,.docx,.pptx,.odt,.odp,.xlsx,.xlsm,.ods,.csv,.tsv,.txt,.md,.html,.htm,.json,.xml,.gift"></label> ／ <label style="text-decoration:underline;cursor:pointer">写真を とる<input type="file" id="cam" accept="image/*" capture="environment" hidden></label></b>
<span class="muted">なんまいでも まとめて 入れられます（1 つ 25MB まで）</span>
<div class="fmts"><span>📷 写真（JPEG・PNG・HEIC）</span><span>📄 PDF</span><span>📝 Word</span><span>📊 Excel・CSV</span><span>🖥 PowerPoint</span><span>Kahoot</span><span>Blooket</span><span>Quizlet</span><span>Moodle（GIFT・Aiken・XML）</span><span>テキスト</span></div></div>
<div class="files" id="files"></div>
<textarea id="text" placeholder="または ここに はりつけ（1 行に 1 問）&#10;apple = りんご&#10;I (play) soccer. わたしは サッカーを します。&#10;I like music. わたしは 音楽が すきです。"></textarea>
<div class="bar"><button class="main" id="read">読みとる</button><span id="msg"></span></div>
<div class="warns" id="warns"></div>

<div id="editor" hidden>
<h2>2. たしかめて なおす</h2>
<div class="bar"><label>だい <input id="title" size="28"></label><label>クラス（からなら ぜんぶ） <input id="classes" size="20" placeholder="6-1, 6-2"></label><label>しめきり <input type="date" id="due"></label></div>
<table><thead><tr><th>#</th><th>形</th><th>英語（ことば・文・問題文）</th><th>日本語・正解</th><th>あな</th><th>まちがいの 候補（, で 区切る）</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<div class="bar"><button id="add">＋ 問題を 足す</button><button id="auto">形を おまかせで ふりなおす</button></div>
<div class="bar"><button class="main" id="save">下書きを 保存</button><button class="go" id="savepub">保存して くばる</button><button id="cancel">やめる</button></div>
</div>

<h2>3. 宿題の 一覧</h2>
<div class="bar"><label>クラス <select id="cls"><option value="">ぜんぶの クラス</option></select></label><span class="muted">えらんだ クラスの 宿題だけ 出ます。新しく 読みとった 宿題も この クラスに なります。</span></div>
<div id="list"></div>
</div>
<script>
const $=s=>document.querySelector(s);const H={'x-requested-with':'uspeak-admin','content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let picked=[],meta={kinds:[],kindJa:{}},editing=null,items=[];
const CLS_KEY='uspeak-admin-hw-class';let cls='';try{cls=localStorage.getItem(CLS_KEY)||''}catch{}
const msg=t=>{$('#msg').textContent=t||''};
// 写真は ブラウザで JPEG に して 小さく（iPhone の HEIC も ここで JPEG に なる）
function shrink(file){return new Promise((ok)=>{const url=URL.createObjectURL(file);const img=new Image();img.onload=()=>{const k=Math.min(1,2200/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);ok({name:file.name.replace(/\\.(heic|heif|png|webp)$/i,'.jpg'),type:'image/jpeg',data:c.toDataURL('image/jpeg',.85)})};img.onerror=()=>{URL.revokeObjectURL(url);ok(null)};img.src=url})}
function asData(file){return new Promise((ok)=>{const r=new FileReader();r.onload=()=>ok({name:file.name,type:file.type,data:r.result});r.readAsDataURL(file)})}
async function add(list){for(const f of list){const isImg=/^image\\//.test(f.type)||/\\.(heic|heif)$/i.test(f.name);const got=isImg?(await shrink(f))||(await asData(f)):await asData(f);if(got)picked.push(got)}paintFiles()}
function paintFiles(){$('#files').innerHTML=picked.map((f,i)=>'<span>'+esc(f.name)+' <a href="#" data-x="'+i+'">✕</a></span>').join('')}
$('#files').onclick=e=>{const x=e.target.dataset.x;if(x!==undefined){e.preventDefault();picked.splice(+x,1);paintFiles()}};
$('#file').onchange=e=>add([...e.target.files]);$('#cam').onchange=e=>add([...e.target.files]);
const drop=$('#drop');['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('on')}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('on')}));
drop.addEventListener('drop',e=>add([...e.dataTransfer.files]));
document.addEventListener('paste',e=>{const fs=[...(e.clipboardData?.files||[])];if(fs.length&&document.activeElement!==$('#text')){add(fs)}});
$('#read').onclick=async()=>{if(!picked.length&&!$('#text').value.trim()){msg('ファイルか 文を 入れて ください');return}msg('読みとり中…（写真・PDF は 1 分ほど かかる ことが あります）');$('#warns').textContent='';
const r=await fetch('/admin/api/homework/extract',{method:'POST',headers:H,body:JSON.stringify({text:$('#text').value,files:picked})}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}));
if(!r.ok){msg('読めません：'+r.error);return}msg(r.items.length+' 問 読みとりました（'+({ai:'AI',rules:'きまり',file:'ファイルの 形','file+ai':'ファイル＋AI'}[r.via]||r.via)+'）');$('#warns').innerHTML=(r.warnings||[]).map(esc).join('<br>');
editing=null;items=r.items;$('#title').value=r.title||'';$('#classes').value=cls;$('#due').value='';openEditor()};
function openEditor(){$('#editor').hidden=false;paint();$('#editor').scrollIntoView({behavior:'smooth'})}
function paint(){$('#rows').innerHTML=items.map((it,i)=>{const kind='<select data-i="'+i+'" data-f="kind">'+meta.kinds.map(k=>'<option value="'+k+'"'+(k===it.kind?' selected':'')+'>'+esc(meta.kindJa[k]||k)+'</option>').join('')+'</select>';
const main=it.prompt?it.prompt:(['order','fill'].includes(it.kind)?it.sentence:it.en);const second=it.prompt?it.answer:it.ja;
return '<tr data-row="'+i+'"><td>'+(i+1)+'</td><td>'+kind+'</td><td><input data-i="'+i+'" data-f="main" value="'+esc(main)+'"></td><td><input data-i="'+i+'" data-f="second" value="'+esc(second)+'"></td><td><input data-i="'+i+'" data-f="blank" value="'+esc(it.blank)+'" size="6"></td><td><input data-i="'+i+'" data-f="wrong" value="'+esc((it.wrong||[]).join(', '))+'"></td><td><button class="warn" data-del="'+i+'">消す</button><div class="why"></div></td></tr>'}).join('');check()}
function read(){document.querySelectorAll('#rows [data-f]').forEach(el=>{const it=items[+el.dataset.i];const v=el.value.trim();const f=el.dataset.f;
if(f==='kind')it.kind=v;else if(f==='blank')it.blank=v;else if(f==='wrong')it.wrong=v?v.split(/\\s*[,、]\\s*/):[];
else if(f==='main'){if(it.prompt)it.prompt=v;else if(['order','fill'].includes(it.kind)){it.sentence=v;it.en=''}else{it.en=v;it.sentence=''}}
else if(f==='second'){if(it.prompt)it.answer=v;else it.ja=v}})}
// 書いて いる 間の かんたんな たしかめ（くわしい たしかめは 保存の ときに サーバーが する）
let timer=0;function check(){clearTimeout(timer);timer=setTimeout(()=>{read();mark(local())},150)}
function local(){const bad={};items.forEach((it,i)=>{const m=it.prompt?it.prompt:(['order','fill'].includes(it.kind)?it.sentence:it.en);if(!m)bad[i]='中身が ありません';else if(it.kind==='fill'&&!it.blank)bad[i]='あなに する ことばを 入れて ください';else if(!it.prompt&&['mc','match','listen'].includes(it.kind)&&!it.ja)bad[i]='日本語の 意味を 入れて ください';else if(it.prompt&&!it.answer)bad[i]='正解を 入れて ください'});return bad}
function mark(bad){document.querySelectorAll('#rows tr').forEach(tr=>{const i=+tr.dataset.row;tr.classList.toggle('bad',!!bad[i]);tr.querySelector('.why').textContent=bad[i]||''})}
$('#rows').addEventListener('input',check);$('#rows').addEventListener('change',e=>{if(e.target.dataset.f==='kind'){read();paint()}else check()});
$('#rows').onclick=e=>{const d=e.target.dataset.del;if(d!==undefined){read();items.splice(+d,1);paint()}};
$('#add').onclick=()=>{read();items.push({kind:'mc',en:'',ja:'',sentence:'',blank:'',wrong:[],prompt:'',answer:''});paint()};
$('#auto').onclick=async()=>{read();const r=await fetch('/admin/api/homework/extract',{method:'POST',headers:H,body:JSON.stringify({text:'',files:[{name:'x.json',type:'application/json',data:btoa(unescape(encodeURIComponent(JSON.stringify(items.map(({kind,...x})=>x)))))}]})}).then(r=>r.json());if(r.ok){items=r.items;paint()}};
$('#cancel').onclick=()=>{$('#editor').hidden=true;editing=null};
async function save(pub){read();if(pub&&!$('#classes').value.trim()&&!confirm('クラスが からです。すべての クラスに くばりますか？'))return;const body={title:$('#title').value,classes:$('#classes').value,due:$('#due').value,items,via:'admin'};
let r=editing?await fetch('/admin/api/homework/'+editing,{method:'PUT',headers:H,body:JSON.stringify(body)}).then(r=>r.json()):await fetch('/admin/api/homework',{method:'POST',headers:H,body:JSON.stringify(body)}).then(r=>r.json());
if(!r.ok){msg('保存できません：'+r.error);showProblems(r.problems);return}const id=r.assignment.id;
if(r.problems&&r.problems.length){showProblems(r.problems);msg('下書きを 保存しました。赤い 行を なおすと くばれます');editing=id;load();return}
if(pub){const p=await fetch('/admin/api/homework/'+id+'/publish',{method:'POST',headers:H,body:JSON.stringify({on:true})}).then(r=>r.json());if(!p.ok){msg('くばれません：'+p.error);showProblems(p.problems);editing=id;load();return}msg('くばりました');}else msg('下書きを 保存しました');
$('#editor').hidden=true;editing=null;picked=[];paintFiles();$('#text').value='';load()}
function showProblems(ps){if(!ps)return;const bad={};ps.forEach(p=>bad[p.index]=p.reason);mark(bad)}
$('#save').onclick=()=>save(false);$('#savepub').onclick=()=>save(true);
async function load(){const r=await fetch('/admin/api/homework',{headers:H});if(r.status===401){location.href='/admin';return}const d=await r.json();meta=d;
const sel=$('#cls');sel.innerHTML='<option value="">ぜんぶの クラス</option>'+(d.classes||[]).map(c=>'<option'+(c===cls?' selected':'')+'>'+esc(c)+'</option>').join('');if(cls&&!(d.classes||[]).includes(cls)){cls='';sel.value=''}
const card=a=>'<div class="card"><h3>'+esc(a.title)+'<span class="pill '+(a.status==='published'?'pub':'draft')+'">'+(a.status==='published'?'くばっています':'下書き')+'</span></h3><div class="muted">'+a.items.length+' 問 ・ クラス '+esc(a.classes.join(', ')||'ぜんぶ')+(a.due?' ・ しめきり '+esc(a.due):'')+' ・ はじめた '+a.started+' 人 ・ おわった '+a.finished+' 人'+(a.problems.length?' ・ <b style="color:#b5432b">出せない 問題 '+a.problems.length+'</b>':'')+'</div>'+
'<div class="bar"><button data-edit="'+a.id+'">なおす</button>'+(a.status==='published'?'<button data-pub="'+a.id+'" data-on="0">くばるのを やめる</button>':'<button class="go" data-pub="'+a.id+'" data-on="1">くばる</button>')+'<button data-prog="'+a.id+'">すすみぐあい</button><button class="warn" data-rm="'+a.id+'">消す</button></div><div id="p-'+a.id+'"></div></div>';
const groups=cls?[[cls,d.items.filter(a=>a.classes.includes(cls))],['すべての クラス',d.items.filter(a=>!a.classes.length)]]:[...(d.classes||[]).map(c=>[c,d.items.filter(a=>a.classes.includes(c))]),['すべての クラス（クラスを きめて いない）',d.items.filter(a=>!a.classes.length)]];
$('#list').innerHTML=groups.filter(g=>g[1].length).map(g=>'<h3 class="grp">'+esc(g[0])+' <span class="muted">'+g[1].length+' こ</span></h3>'+g[1].map(card).join('')).join('')||'<p class="muted">まだ ありません。</p>'}
$('#cls').onchange=()=>{cls=$('#cls').value;try{localStorage.setItem(CLS_KEY,cls)}catch{};load()};
$('#list').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
if(b.dataset.edit){const a=meta.items.find(x=>x.id===b.dataset.edit);editing=a.id;items=JSON.parse(JSON.stringify(a.items));$('#title').value=a.title;$('#classes').value=a.classes.join(', ');$('#due').value=a.due||'';openEditor();showProblems(a.problems)}
if(b.dataset.pub){const r=await fetch('/admin/api/homework/'+b.dataset.pub+'/publish',{method:'POST',headers:H,body:JSON.stringify({on:b.dataset.on==='1'})}).then(r=>r.json());msg(r.ok?(b.dataset.on==='1'?'くばりました':'くばるのを やめました'):'できません：'+r.error);load()}
if(b.dataset.rm){if(!confirm('この 宿題と 子どもの 記録を 消しますか？'))return;await fetch('/admin/api/homework/'+b.dataset.rm,{method:'DELETE',headers:H});load()}
if(b.dataset.prog){const r=await fetch('/admin/api/homework/'+b.dataset.prog+'/progress',{headers:H}).then(r=>r.json());$('#p-'+b.dataset.prog).innerHTML=r.rows.length?'<table><tr><th>クラス</th><th>名前</th><th>すすみ</th><th>せいかい</th><th></th></tr>'+r.rows.map(x=>'<tr><td>'+esc(x.classCode)+'</td><td>'+esc(x.name)+'</td><td>'+x.answered+' / '+x.total+'</td><td>'+x.correct+'（'+x.score+'%）</td><td>'+(x.done?'✅ おわり':x.overdue?'⏰ しめきり すぎ':'とちゅう')+'</td></tr>').join('')+'</table>':'<p class="muted">まだ だれも はじめて いません。</p>'}};
load();
</script></body></html>`;
