// /admin/qbank — 問題データベース（英検形式）を 入れる・さがす・オンオフ・書きかえる 画面。ログインは 名簿の 管理ページと 同じ（roster-admin の extend）。
//   入れかた：CSV / TSV（スプレッドシートから 書き出し）か JSON を アップロード。まるごと 入れかえ か、同じ ID だけ 上書き。
//   「web版に出す」は 英検の島（5級・4級・3級の 4択の 読む・聞く）に まざる。「Robloxに出す」は GET /api/roblox/questions で Roblox が 取る。
import express from 'express';
import { GRADES, SKILLS, rowsFromDelimited, itemsToCsv } from './store.js';

const PAGE_SIZE = 100;

export function qbankAdminExtension({ qbank, log = console }) {
  return ({ router, api, authed }) => {
    api.use('/qbank', express.json({ limit: '40mb' }));
    api.use('/qbank/import-text', express.text({ limit: '40mb', type: '*/*' }));
    router.get('/qbank', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(PAGE);
    });
    const match = (q) => {
      const grade = String(q.grade || ''); const skill = String(q.skill || ''); const fmt = String(q.format || '');
      const src = String(q.source || ''); const state = String(q.state || ''); const text = String(q.q || '').toLowerCase();
      return (it) => (!grade || it.grade === grade) && (!skill || it.skill === skill) && (!fmt || it.format === fmt)
        && (!src || it.source.includes(src))
        && (!state || (state === 'on' ? it.on : state === 'off' ? !it.on : state === 'web' ? it.on && it.web : state === 'roblox' ? it.on && it.roblox : true))
        && (!text || `${it.id} ${it.question} ${it.passage} ${it.answer} ${it.tags}`.toLowerCase().includes(text));
    };
    api.get('/qbank', (req, res) => {
      const list = qbank.items.filter(match(req.query));
      const page = Math.max(0, Number(req.query.page) || 0);
      const formats = [...new Set(qbank.items.map((it) => it.format))].sort();
      res.json({ ok: true, updatedAt: qbank.updatedAt, stats: qbank.stats(), grades: GRADES, skills: SKILLS, formats,
        hits: list.length, page, pageSize: PAGE_SIZE, items: list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) });
    });
    const guard = (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return false; }
      return true;
    };
    // JSON の 行（[{…}] か {items:[…]}）
    api.post('/qbank/import', async (req, res) => {
      if (!guard(req, res)) return;
      try {
        const body = req.body || {};
        const list = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
        res.json(await qbank.import(list, { mode: body.mode === 'merge' ? 'merge' : 'replace' }));
      } catch (err) { log.warn('[qbank] import failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
    });
    // CSV / TSV の 文字（?mode=merge で 上書き）
    api.post('/qbank/import-text', async (req, res) => {
      if (!guard(req, res)) return;
      try {
        const rows = rowsFromDelimited(typeof req.body === 'string' ? req.body : '');
        res.json(await qbank.import(rows, { mode: req.query.mode === 'merge' ? 'merge' : 'replace' }));
      } catch (err) { log.warn('[qbank] import failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
    });
    // オンオフ：ids を 指定するか、filter（いまの しぼりこみ）に あう 問題 ぜんぶ。
    api.post('/qbank/flags', async (req, res) => {
      if (!guard(req, res)) return;
      const b = req.body || {};
      const ids = Array.isArray(b.ids) ? b.ids : b.filter ? qbank.items.filter(match(b.filter)).map((it) => it.id) : [];
      res.json(await qbank.setFlags(ids, b.set || {}));
    });
    api.put('/qbank/item/:id', async (req, res) => {
      if (!guard(req, res)) return;
      const r = await qbank.update(req.params.id, req.body || {});
      res.status(r.ok ? 200 : 400).json(r);
    });
    api.get('/qbank.csv', (req, res) => {
      res.type('text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="uspeak-qbank.csv"').send(itemsToCsv(qbank.items.filter(match(req.query))));
    });
  };
}

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>問題データベース — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f}.wrap{max-width:1400px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}.muted{color:#6e665c;font-size:13px}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
select,input[type=search],button{min-height:38px;border:1px solid #d9d1c3;border-radius:10px;background:#fff;font:inherit;padding:0 10px}
button{font-weight:700;cursor:pointer}button.main{background:#1b3a2f;color:#fff;border-color:#1b3a2f}button.warn{background:#e27a2d;color:#fff;border-color:#e27a2d}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:10px 0}.card{background:#fff;border:1px solid #eadfcd;border-radius:12px;padding:10px}
.card b{display:block;font-size:20px}.card small{color:#6e665c;font-size:12px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:13px}th,td{border-bottom:1px solid #f0e8da;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#1b3a2f;color:#fff;position:sticky;top:0}td.q{max-width:520px}td.q small{display:block;color:#6e665c;white-space:pre-wrap;max-height:4.5em;overflow:hidden}
.flag{min-height:30px;padding:0 8px;border-radius:8px}.flag.on{background:#2f8f5b;color:#fff;border-color:#2f8f5b}
dialog{border:none;border-radius:16px;max-width:760px;width:94vw}dialog label{display:block;font-size:12px;color:#6e665c;margin-top:8px}dialog textarea,dialog input{width:100%;font:inherit;border:1px solid #d9d1c3;border-radius:8px;padding:6px}
#msg{min-height:20px;font-weight:700}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a> ・ <a href="/admin/tasks">タスク</a></p>
<h1>問題データベース（英検形式）</h1>
<p class="muted">「配信」が ○ の 問題だけ 出ます。<b>web版に出す</b> ＝ 英検の島（5級・4級・3級の 4択の 読む・聞く）に まざる。<b>Robloxに出す</b> ＝ Roblox が <code>GET /api/roblox/questions</code> で 取る。かえると すぐに 反映されます（サーバーの 再起動は いりません）。</p>
<div class="cards" id="cards"></div>
<div class="bar"><b>入れる：</b><input type="file" id="file" accept=".csv,.tsv,.txt,.json"><select id="mode"><option value="replace">まるごと 入れかえ</option><option value="merge">同じ ID だけ 上書き・新しい ID は 足す</option></select><button class="main" id="up">アップロード</button>
<a id="csv" href="/admin/api/qbank.csv"><button type="button">いまの しぼりこみを CSV で 書き出す</button></a></div>
<div class="bar"><b>しぼりこみ：</b><select id="grade"><option value="">すべての 級</option></select><select id="skill"><option value="">すべての 技能</option></select>
<select id="format"><option value="">すべての 形式</option></select><select id="state"><option value="">すべて</option><option value="on">配信中</option><option value="off">配信 停止</option><option value="web">web版に 出ている</option><option value="roblox">Roblox に 出ている</option></select>
<input type="search" id="q" placeholder="ID・問題文・タグで さがす"><button id="go">さがす</button></div>
<div class="bar"><b>しぼりこんだ <span id="hits">0</span> 問を まとめて：</b>
<button data-bulk='{"on":true}'>配信する</button><button data-bulk='{"on":false}'>配信を 止める</button>
<button data-bulk='{"web":true}'>web版に 出す</button><button data-bulk='{"web":false}'>web版から 外す</button>
<button data-bulk='{"roblox":true}'>Roblox に 出す</button><button data-bulk='{"roblox":false}'>Roblox から 外す</button></div>
<p id="msg"></p>
<table><thead><tr><th>ID</th><th>級</th><th>技能・形式</th><th>問題</th><th>正解</th><th>配信</th><th>web</th><th>Roblox</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<div class="bar"><button id="prev">← まえ</button><span id="pageinfo" class="muted"></span><button id="next">つぎ →</button></div>
</div>
<dialog id="ed"><h3>問題を 書きかえる <span id="edid" class="muted"></span></h3>
<label>本文・スクリプト<textarea id="e_passage" rows="4"></textarea></label><label>問題<textarea id="e_question" rows="2"></textarea></label>
<label>選択肢1<input id="e_c1"></label><label>選択肢2<input id="e_c2"></label><label>選択肢3<input id="e_c3"></label><label>選択肢4<input id="e_c4"></label>
<label>正解（選択肢と 同じ 文字）<input id="e_answer"></label><label>解説<input id="e_explanation"></label><label>模範解答<textarea id="e_model" rows="3"></textarea></label>
<div class="bar"><button class="main" id="e_save">保存</button><button id="e_close">とじる</button></div></dialog>
<script>
const $=s=>document.querySelector(s);const H={'x-requested-with':'uspeak-admin'};let page=0,data=null;
const SK={reading:'リーディング',listening:'リスニング',writing:'ライティング',speaking:'スピーキング'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const filt=()=>({grade:$('#grade').value,skill:$('#skill').value,format:$('#format').value,state:$('#state').value,q:$('#q').value});
const msg=t=>{$('#msg').textContent=t||''};
async function load(){const p=new URLSearchParams({...filt(),page});const r=await fetch('/admin/api/qbank?'+p);if(r.status===401){location.href='/admin';return}data=await r.json();render();$('#csv').href='/admin/api/qbank.csv?'+new URLSearchParams(filt())}
function fill(sel,list,lab){const cur=sel.value;sel.innerHTML='<option value="">'+lab+'</option>'+list.map(v=>'<option value="'+esc(v)+'">'+esc(SK[v]||v)+'</option>').join('');sel.value=cur}
function render(){const s=data.stats;$('#cards').innerHTML='<div class="card"><small>ぜんぶ</small><b>'+s.total.toLocaleString()+'</b><small>問</small></div>'+Object.entries(s.grades).map(([g,v])=>'<div class="card"><small>'+esc(g)+'</small><b>'+v.on.toLocaleString()+'</b><small>配信中 / '+v.total.toLocaleString()+'問・web '+v.web.toLocaleString()+'・Roblox '+v.roblox.toLocaleString()+'</small></div>').join('');
fill($('#grade'),data.grades,'すべての 級');fill($('#skill'),data.skills,'すべての 技能');fill($('#format'),data.formats,'すべての 形式');
$('#hits').textContent=data.hits.toLocaleString();const pages=Math.max(1,Math.ceil(data.hits/data.pageSize));$('#pageinfo').textContent=(data.page+1)+' / '+pages+' ページ';
$('#rows').innerHTML=data.items.map(it=>'<tr><td>'+esc(it.id)+'</td><td>'+esc(it.grade)+'</td><td>'+esc(SK[it.skill])+'<br><small class="muted">'+esc(it.format)+'</small></td><td class="q">'+esc(it.question)+(it.passage?'<small>'+esc(it.passage)+'</small>':'')+(it.choices.length?'<small>'+it.choices.map(esc).join(' / ')+'</small>':'')+'</td><td>'+esc(it.answer).slice(0,160)+'</td>'+
['on','web','roblox'].map(k=>'<td><button class="flag'+(it[k]?' on':'')+'" data-id="'+esc(it.id)+'" data-k="'+k+'">'+(it[k]?'○':'—')+'</button></td>').join('')+'<td><button data-edit="'+esc(it.id)+'">書きかえ</button></td></tr>').join('')||'<tr><td colspan="9" class="muted">問題が ありません。上の「入れる」から CSV か JSON を アップロードしてください。</td></tr>'}
async function post(url,body,isText){const r=await fetch(url,{method:'POST',headers:{...H,'content-type':isText?'text/plain; charset=utf-8':'application/json'},body:isText?body:JSON.stringify(body)});return r.json()}
$('#go').onclick=()=>{page=0;load()};$('#q').onkeydown=e=>{if(e.key==='Enter'){page=0;load()}};['#grade','#skill','#format','#state'].forEach(s=>$(s).onchange=()=>{page=0;load()});
$('#prev').onclick=()=>{if(page>0){page--;load()}};$('#next').onclick=()=>{page++;load()};
$('#up').onclick=async()=>{const f=$('#file').files[0];if(!f){msg('ファイルを えらんでください');return}msg('読みこみ中…');const text=await f.text();const mode=$('#mode').value;let r;
if(/\\.json$/i.test(f.name)){let j;try{j=JSON.parse(text)}catch{msg('JSON が 読めません');return}r=await post('/admin/api/qbank/import',{mode,items:Array.isArray(j)?j:j.items})}else r=await post('/admin/api/qbank/import-text?mode='+mode,text,true);
msg(r.ok?('入れました：'+r.imported.toLocaleString()+' 問（ぜんぶで '+r.count.toLocaleString()+' 問・読めなかった 行 '+r.skipped+'）'):('入れられません：'+r.error));page=0;load()};
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
if(b.dataset.k){const it=data.items.find(x=>x.id===b.dataset.id);const r=await post('/admin/api/qbank/flags',{ids:[it.id],set:{[b.dataset.k]:!it[b.dataset.k]}});if(r.ok)load();return}
if(b.dataset.bulk){const set=JSON.parse(b.dataset.bulk);if(!confirm('しぼりこんだ '+data.hits.toLocaleString()+' 問を かえますか？'))return;const r=await post('/admin/api/qbank/flags',{filter:filt(),set});msg(r.ok?(r.changed.toLocaleString()+' 問を かえました'):'かえられません');load();return}
if(b.dataset.edit){const it=data.items.find(x=>x.id===b.dataset.edit);$('#edid').textContent=it.id;$('#e_passage').value=it.passage;$('#e_question').value=it.question;[0,1,2,3].forEach(i=>$('#e_c'+(i+1)).value=it.choices[i]||'');$('#e_answer').value=it.answer;$('#e_explanation').value=it.explanation;$('#e_model').value=it.model_answer;$('#ed').showModal()}});
$('#e_close').onclick=()=>$('#ed').close();
$('#e_save').onclick=async()=>{const id=$('#edid').textContent;const body={passage:$('#e_passage').value,question:$('#e_question').value,choice_1:$('#e_c1').value,choice_2:$('#e_c2').value,choice_3:$('#e_c3').value,choice_4:$('#e_c4').value,answer:$('#e_answer').value,explanation:$('#e_explanation').value,model_answer:$('#e_model').value};
const r=await fetch('/admin/api/qbank/item/'+encodeURIComponent(id),{method:'PUT',headers:{...H,'content-type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());if(r.ok){$('#ed').close();msg('保存しました');load()}else msg('保存できません：'+r.error)};
load();
</script></body></html>`;
