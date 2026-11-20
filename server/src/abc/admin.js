// /admin/abc — 「ABC と おと」の 教室ごとの 設定（**運営だけ**。先生の 画面には 何も 置かない）。
// 大文字・小文字の どちらから 見せるか／発音（アメリカ式・イギリス式）／おとを 教える 順番。カードの オン・オフは ない（幼児モードで いつも 出る）。
import express from 'express';
import { CASES, ACCENTS, DEFAULT_SETTINGS, data, sanitizeSettings } from '../game/abc.js';
import { MAX_BYTES } from './phonics-voices.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function abcAdminExtension({ abc, voices = null, rosterClasses = async () => [], log = console }) {
  return ({ router, api, authed }) => {
    router.get('/abc', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(PAGE);
    });
    api.get('/abc', async (req, res) => {
      let classes = [];
      try { classes = [...new Set((await rosterClasses()).filter((c) => c && c !== '*').map((c) => String(c).toLowerCase()))].sort(); } catch (err) { log.warn('[abc] roster classes failed:', err.message); }
      res.json({ ok: true, ready: !!data(), defaults: { ...DEFAULT_SETTINGS, order: data()?.order || [] }, rows: abc.listSettings(), classes });
    });
    // フォニックスの おと：一覧・ろくおんを 入れる・もとの 音に もどす（運営だけ）。
    api.get('/abc/phonics', (req, res) => { res.json({ ok: true, ready: !!voices, v: voices?.version() || '', sounds: voices ? voices.list() : [] }); });
    api.put('/abc/phonics/:id', express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return; }
      if (!voices) { res.status(503).json({ ok: false, error: 'not ready' }); return; }
      const r = await voices.save(String(req.params.id || ''), req.body);
      if (!r.ok) { res.status(400).json(r); return; }
      res.json({ ok: true, v: voices.version(), sounds: voices.list() });
    });
    api.delete('/abc/phonics/:id', async (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return; }
      if (!voices) { res.status(503).json({ ok: false, error: 'not ready' }); return; }
      await voices.remove(String(req.params.id || ''));
      res.json({ ok: true, v: voices.version(), sounds: voices.list() });
    });
    api.put('/abc', express.json({ limit: '4kb' }), async (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return; }
      const classCode = String(req.body?.classCode ?? '').trim().slice(0, 40);
      if (!classCode) { res.status(400).json({ ok: false, error: 'クラスの パスワードが いります' }); return; }
      if (req.body?.reset === true) { await abc.clearSettings(classCode); log.info(`[abc] settings of ${classCode} reset`); res.json({ ok: true, rows: abc.listSettings() }); return; }
      const raw = req.body?.settings || {};
      // 順番は「s a t p i n …」の 文字列でも 配列でも。26 もじ ぜんぶ 1 回ずつで なければ ことわる（空なら 初期の 順番）。
      const orderIn = typeof raw.order === 'string' ? raw.order.toLowerCase().replace(/[^a-z]/g, '').split('') : raw.order;
      const wantsOrder = Array.isArray(orderIn) && orderIn.length > 0;
      const clean = sanitizeSettings({ ...raw, order: orderIn });
      if (!CASES.includes(raw.caseFirst) || !ACCENTS.includes(raw.accent) || (wantsOrder && !clean.order)) { res.status(400).json({ ok: false, error: wantsOrder && !clean.order ? '順番は a〜z の 26 もじを 1 回ずつ 入れて ください' : '入力が ちがいます' }); return; }
      const saved = await abc.setSettings(classCode, clean);
      if (!saved) { res.status(400).json({ ok: false, error: '保存できません' }); return; }
      log.info(`[abc] settings of ${classCode}: case=${saved.caseFirst} accent=${saved.accent} order=${saved.order ? 'custom' : 'default'}`);
      res.json({ ok: true, rows: abc.listSettings() });
    });
  };
}

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>ABC と おと — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f;font-size:16px;line-height:1.7}.wrap{max-width:980px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}h2{font-size:18px;margin:0 0 8px}.muted{color:#6e665c;font-size:14px}
.card{background:#fff;border:1px solid #eadfcd;border-radius:14px;padding:14px 16px;margin:12px 0}
label{display:block;font-weight:700;margin:10px 0 4px}input,select,button{min-height:44px;border:1px solid #d9d1c3;border-radius:10px;background:#fff;font:inherit;padding:0 12px}input[type=text]{width:100%}
button{font-weight:700;cursor:pointer}button.main{background:#1b3a2f;color:#fff;border-color:#1b3a2f}button.warn{color:#b5432b;border-color:#e3b3a6}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{border-bottom:1px solid #f0e8da;padding:8px 6px;text-align:left;vertical-align:top}th{background:#1b3a2f;color:#fff}
.phgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}.ph{border:1px solid #eadfcd;border-radius:12px;padding:8px 10px;background:#fffdf8}.ph.rec{border-color:#2f8f5b;background:#f1faf3}.ph b{font-size:20px}.ph small{color:#6e665c}.ph .acts{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}.ph button{min-height:40px;padding:0 10px}.ph button.on{background:#d8323c;color:#fff;border-color:#d8323c}#msg{font-weight:700;min-height:26px}#msg.bad{color:#b5432b}code{background:#f4efe4;border-radius:6px;padding:1px 6px;word-break:break-all}.row{display:flex;gap:10px;flex-wrap:wrap}.row>div{flex:1;min-width:200px}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a> ・ <a href="/admin/kids">🧸 幼児モード</a></p>
<h1>🔤 ABC と おと（教室ごとの 設定）</h1>
<p class="muted">幼児モードの ホームに いつも 出る カードです（オン・オフの スイッチは ありません。先生の 画面にも 設定は ありません）。ここで かえられるのは、<b>大文字・小文字の どちらから 見せるか</b>・<b>発音（アメリカ式／イギリス式）</b>・<b>おとを 教える 順番</b>の 3 つだけです。なにも 入れて いない クラスは 初期値（大文字と 小文字を いっしょに・アメリカ式・<code id="def"></code>）で 動きます。</p>
<p class="muted">※ 発音：アメリカ式は U-Speak の 自然な 声、イギリス式は 端末の イギリス英語の 声を 使います（端末に イギリス英語の 声が ない ときは アメリカ式で 読みます）。</p>
<div id="msg" role="status"></div>
<div class="card"><h2>クラスの 設定を 入れる・かえる</h2>
<div class="row"><div><label for="code">クラスの パスワード</label><input type="text" id="code" list="cls" placeholder="例：iac" maxlength="40" autocomplete="off"><datalist id="cls"></datalist></div>
<div><label for="case">もじの 見せ方</label><select id="case"><option value="both">大文字と 小文字を いっしょに（A a）</option><option value="upper">大文字から（A）</option><option value="lower">小文字から（a）</option></select></div>
<div><label for="accent">発音</label><select id="accent"><option value="us">アメリカ式</option><option value="uk">イギリス式</option></select></div></div>
<label for="order">おとを 教える 順番（a〜z の 26 もじ。空なら 初期の 順番）</label><input type="text" id="order" placeholder="例：s a t p i n m d g o c k e u r h b f l j v w x y z q" autocomplete="off" spellcheck="false">
<p style="margin:12px 0 0"><button class="main" id="save">保存</button></p></div>
<div class="card" id="ph"><h2>🔊 フォニックスの おと（ぜんぶの 教室で 共通）</h2>
<p class="muted">もじの「おと」（/s/ /æ/ /k/ …）です。合成の 声は おと 1 つだけを 正しく 言えないので、U-Speak が 作った 音が 鳴って います。<b>先生や スタッフの 声で ろくおん すると、そちらが 鳴ります</b>（静かな へやで、口を マイクに 近づけて。ろくおんを おして、おとを 1 回 言って、もう 一度 おします。前後の 無音は 自動で けします）。</p>
<p class="muted">言いかたの こつ：「ス」では なく 息だけの「sss」。p・t・k は 息だけ、b・d・g は「ブ」の「ウ」を ごく みじかく。</p>
<div id="phgrid" class="phgrid"></div></div>
<div class="card"><h2>設定の ある クラス</h2><table><thead><tr><th>クラス</th><th>もじ</th><th>発音</th><th>順番</th><th style="width:150px"></th></tr></thead><tbody id="rows"></tbody></table></div>
</div><script>
const $=s=>document.querySelector(s);const H={'x-requested-with':'uspeak-admin','content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say=(t,bad)=>{$('#msg').textContent=t;$('#msg').className=bad?'bad':''};
const CASE={both:'いっしょに',upper:'大文字から',lower:'小文字から'};const ACC={us:'アメリカ式',uk:'イギリス式'};
let rows=[];
function paint(){$('#rows').innerHTML=rows.map((r,i)=>'<tr><td><b>'+esc(r.code)+'</b></td><td>'+CASE[r.caseFirst]+'</td><td>'+ACC[r.accent]+'</td><td>'+(r.order?'<code>'+esc(r.order.join(' '))+'</code>':'初期の 順番')+'</td><td><button data-edit="'+i+'">なおす</button> <button class="warn" data-reset="'+i+'">初期値に</button></td></tr>').join('')||'<tr><td colspan="5" class="muted">まだ ありません（ぜんぶの クラスが 初期値で 動いて います）。</td></tr>'}
async function put(body){const r=await fetch('/admin/api/abc',{method:'PUT',headers:H,body:JSON.stringify(body)}).then(async r=>({status:r.status,...(await r.json().catch(()=>({})))})).catch(()=>({ok:false,error:'つうしんできません'}));if(r.status===401){location.href='/admin';return null}if(!r.ok){say('保存できません：'+(r.error||''),true);return null}rows=r.rows||[];paint();return r}
$('#save').onclick=async()=>{const code=$('#code').value.trim();if(!code){say('クラスの パスワードを 入れて ください',true);return}const r=await put({classCode:code,settings:{caseFirst:$('#case').value,accent:$('#accent').value,order:$('#order').value}});if(r)say('クラス '+code+' の 設定を 保存しました（つぎに ひらいた ときから 使われます）')};
$('#rows').onclick=async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.edit!==undefined){const r=rows[+b.dataset.edit];$('#code').value=r.code;$('#case').value=r.caseFirst;$('#accent').value=r.accent;$('#order').value=r.order?r.order.join(' '):'';scrollTo(0,0);return}
if(b.dataset.reset!==undefined){const r=rows[+b.dataset.reset];if(!confirm('クラス '+r.code+' を 初期値に もどしますか？'))return;if(await put({classCode:r.code,reset:true}))say('クラス '+r.code+' を 初期値に もどしました')}};
// ---- フォニックスの ろくおん ----
let ph={v:'',sounds:[]};let rec=null;
function phPaint(){$('#phgrid').innerHTML=ph.sounds.map(x=>'<div class="ph'+(x.recorded?' rec':'')+'"><b>/'+esc(x.id)+'/</b> <small>'+esc(x.g)+' ・ れい '+esc(x.ex)+'</small><div><small>'+(x.recorded?'🎙 ろくおんした 声':'U-Speak の 音')+'</small></div><div class="acts"><button data-play="'+x.id+'">▶ きく</button><button data-rec="'+x.id+'"'+(rec&&rec.id===x.id?' class="on"':'')+'>'+(rec&&rec.id===x.id?'■ とめる':'● ろくおん')+'</button>'+(x.recorded?'<button class="warn" data-del="'+x.id+'">もとの 音に</button>':'')+'</div></div>').join('')}
async function phLoad(){const r=await fetch('/admin/api/abc/phonics',{headers:H});if(r.status===401){location.href='/admin';return}const d=await r.json();if(!d.ready){$('#ph').hidden=true;return}ph=d;phPaint()}
function wav(samples,rate){const n=samples.length,b=new ArrayBuffer(44+n*2),v=new DataView(b);const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);for(let i=0;i<n;i++){const x=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true)}return new Blob([b],{type:'audio/wav'})}
// 前後の 無音を けし、大きさを そろえ、さいご 1.6 秒まで。
function tidy(buf){const ch=buf.getChannelData(0),rate=buf.sampleRate;let peak=0;for(const x of ch)peak=Math.max(peak,Math.abs(x));if(peak<0.02)return null;const th=peak*0.06,win=Math.floor(rate*0.01);let a=0,z=ch.length-1;const loud=i=>{let m=0;for(let k=i;k<Math.min(ch.length,i+win);k++)m=Math.max(m,Math.abs(ch[k]));return m>th};while(a<ch.length&&!loud(a))a+=win;while(z>a&&!loud(Math.max(0,z-win)))z-=win;a=Math.max(0,a-Math.floor(rate*0.05));z=Math.min(ch.length,z+Math.floor(rate*0.08));z=Math.min(z,a+Math.floor(rate*1.6));const out=new Float32Array(z-a);const g=0.9/peak;const fade=Math.floor(rate*0.012);for(let i=0;i<out.length;i++){let e=1;if(i<fade)e=i/fade;else if(i>out.length-fade)e=(out.length-i)/fade;out[i]=ch[a+i]*g*e}return out}
async function startRec(id){try{const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false}});const mr=new MediaRecorder(stream);const parts=[];mr.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};mr.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());try{const ctx=new (window.AudioContext||window.webkitAudioContext)();const buf=await ctx.decodeAudioData(await new Blob(parts).arrayBuffer());const s=tidy(buf);if(!s){say('おとが 小さすぎて ろくおん できませんでした。マイクに 近づけて もう 一度。',true);rec=null;phPaint();return}const r=await fetch('/admin/api/abc/phonics/'+id,{method:'PUT',headers:{'x-requested-with':'uspeak-admin','content-type':'audio/wav'},body:wav(s,buf.sampleRate)}).then(r=>r.json()).catch(()=>({ok:false}));if(!r.ok){say('保存できません：'+(r.error||''),true)}else{ph={...ph,v:r.v,sounds:r.sounds};say('/'+id+'/ を ろくおん しました');new Audio('/phonics/'+id+'?v='+r.v).play().catch(()=>{})}}catch(e){say('ろくおんを 読めませんでした：'+e.message,true)}rec=null;phPaint()};mr.start();rec={id,mr,t:setTimeout(()=>{if(mr.state==='recording')mr.stop()},4000)};phPaint()}catch(e){say('マイクを つかえません（https で ひらいて、マイクを ゆるして ください）',true)}}
$('#phgrid').onclick=async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.play){new Audio('/phonics/'+b.dataset.play+'?v='+ph.v).play().catch(()=>say('鳴らせません',true));return}
if(b.dataset.rec){if(rec){if(rec.id===b.dataset.rec){clearTimeout(rec.t);rec.mr.stop()}return}startRec(b.dataset.rec);return}
if(b.dataset.del){if(!confirm('/'+b.dataset.del+'/ を U-Speak の 音に もどしますか？'))return;const r=await fetch('/admin/api/abc/phonics/'+b.dataset.del,{method:'DELETE',headers:H}).then(r=>r.json()).catch(()=>({ok:false}));if(r.ok){ph={...ph,v:r.v,sounds:r.sounds};phPaint();say('もとの 音に もどしました')}}};
phLoad();
(async()=>{const r=await fetch('/admin/api/abc',{headers:H});if(r.status===401){location.href='/admin';return}const d=await r.json();rows=d.rows||[];$('#def').textContent=(d.defaults.order||[]).join(' ');$('#cls').innerHTML=(d.classes||[]).map(c=>'<option value="'+esc(c)+'">').join('');if(!d.ready)say('ABC の 中身（abc-data.json）が 読めません。カードを ひらいても はじまりません。',true);paint()})();
</script></body></html>`;
