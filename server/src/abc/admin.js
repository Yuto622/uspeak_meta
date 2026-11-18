// /admin/abc — 「ABC と おと」の 教室ごとの 設定（**運営だけ**。先生の 画面には 何も 置かない）。
// 大文字・小文字の どちらから 見せるか／発音（アメリカ式・イギリス式）／おとを 教える 順番。カードの オン・オフは ない（幼児モードで いつも 出る）。
import express from 'express';
import { CASES, ACCENTS, DEFAULT_SETTINGS, data, sanitizeSettings } from '../game/abc.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function abcAdminExtension({ abc, rosterClasses = async () => [], log = console }) {
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
    api.put('/abc', express.json({ limit: '4kb' }), async (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return; }
      const classCode = String(req.body?.classCode ?? '').trim().slice(0, 40);
      if (!classCode) { res.status(400).json({ ok: false, error: 'クラスコードが いります' }); return; }
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
#msg{font-weight:700;min-height:26px}#msg.bad{color:#b5432b}code{background:#f4efe4;border-radius:6px;padding:1px 6px;word-break:break-all}.row{display:flex;gap:10px;flex-wrap:wrap}.row>div{flex:1;min-width:200px}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a> ・ <a href="/admin/kids">🧸 幼児モード</a></p>
<h1>🔤 ABC と おと（教室ごとの 設定）</h1>
<p class="muted">幼児モードの ホームに いつも 出る カードです（オン・オフの スイッチは ありません。先生の 画面にも 設定は ありません）。ここで かえられるのは、<b>大文字・小文字の どちらから 見せるか</b>・<b>発音（アメリカ式／イギリス式）</b>・<b>おとを 教える 順番</b>の 3 つだけです。なにも 入れて いない クラスは 初期値（大文字と 小文字を いっしょに・アメリカ式・<code id="def"></code>）で 動きます。</p>
<p class="muted">※ 発音：アメリカ式は U-Speak の 自然な 声、イギリス式は 端末の イギリス英語の 声を 使います（端末に イギリス英語の 声が ない ときは アメリカ式で 読みます）。</p>
<div id="msg" role="status"></div>
<div class="card"><h2>クラスの 設定を 入れる・かえる</h2>
<div class="row"><div><label for="code">クラスコード</label><input type="text" id="code" list="cls" placeholder="例：iac" maxlength="40" autocomplete="off"><datalist id="cls"></datalist></div>
<div><label for="case">もじの 見せ方</label><select id="case"><option value="both">大文字と 小文字を いっしょに（A a）</option><option value="upper">大文字から（A）</option><option value="lower">小文字から（a）</option></select></div>
<div><label for="accent">発音</label><select id="accent"><option value="us">アメリカ式</option><option value="uk">イギリス式</option></select></div></div>
<label for="order">おとを 教える 順番（a〜z の 26 もじ。空なら 初期の 順番）</label><input type="text" id="order" placeholder="例：s a t p i n m d g o c k e u r h b f l j v w x y z q" autocomplete="off" spellcheck="false">
<p style="margin:12px 0 0"><button class="main" id="save">保存</button></p></div>
<div class="card"><h2>設定の ある クラス</h2><table><thead><tr><th>クラス</th><th>もじ</th><th>発音</th><th>順番</th><th style="width:150px"></th></tr></thead><tbody id="rows"></tbody></table></div>
</div><script>
const $=s=>document.querySelector(s);const H={'x-requested-with':'uspeak-admin','content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say=(t,bad)=>{$('#msg').textContent=t;$('#msg').className=bad?'bad':''};
const CASE={both:'いっしょに',upper:'大文字から',lower:'小文字から'};const ACC={us:'アメリカ式',uk:'イギリス式'};
let rows=[];
function paint(){$('#rows').innerHTML=rows.map((r,i)=>'<tr><td><b>'+esc(r.code)+'</b></td><td>'+CASE[r.caseFirst]+'</td><td>'+ACC[r.accent]+'</td><td>'+(r.order?'<code>'+esc(r.order.join(' '))+'</code>':'初期の 順番')+'</td><td><button data-edit="'+i+'">なおす</button> <button class="warn" data-reset="'+i+'">初期値に</button></td></tr>').join('')||'<tr><td colspan="5" class="muted">まだ ありません（ぜんぶの クラスが 初期値で 動いて います）。</td></tr>'}
async function put(body){const r=await fetch('/admin/api/abc',{method:'PUT',headers:H,body:JSON.stringify(body)}).then(async r=>({status:r.status,...(await r.json().catch(()=>({})))})).catch(()=>({ok:false,error:'つうしんできません'}));if(r.status===401){location.href='/admin';return null}if(!r.ok){say('保存できません：'+(r.error||''),true);return null}rows=r.rows||[];paint();return r}
$('#save').onclick=async()=>{const code=$('#code').value.trim();if(!code){say('クラスコードを 入れて ください',true);return}const r=await put({classCode:code,settings:{caseFirst:$('#case').value,accent:$('#accent').value,order:$('#order').value}});if(r)say('クラス '+code+' の 設定を 保存しました（つぎに ひらいた ときから 使われます）')};
$('#rows').onclick=async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.edit!==undefined){const r=rows[+b.dataset.edit];$('#code').value=r.code;$('#case').value=r.caseFirst;$('#accent').value=r.accent;$('#order').value=r.order?r.order.join(' '):'';scrollTo(0,0);return}
if(b.dataset.reset!==undefined){const r=rows[+b.dataset.reset];if(!confirm('クラス '+r.code+' を 初期値に もどしますか？'))return;if(await put({classCode:r.code,reset:true}))say('クラス '+r.code+' を 初期値に もどしました')}};
(async()=>{const r=await fetch('/admin/api/abc',{headers:H});if(r.status===401){location.href='/admin';return}const d=await r.json();rows=d.rows||[];$('#def').textContent=(d.defaults.order||[]).join(' ');$('#cls').innerHTML=(d.classes||[]).map(c=>'<option value="'+esc(c)+'">').join('');if(!d.ready)say('ABC の 中身（abc-data.json）が 読めません。カードを ひらいても はじまりません。',true);paint()})();
</script></body></html>`;
