// 幼児モードの 画面と API — 教室の 先生の /teacher/kids と、運営の /admin/kids（同じ 画面）。
// クラスごとの スイッチと、子どもごとの 上書き（クラスと おなじ・オン・オフ）。どの クラスを さわれるかは
// サーバーが きめる（先生は ログインした 教室の クラスだけ・運営は 名簿の ぜんぶ）。置き場は kids-store.js。
import express from 'express';
import { config } from '../config.js';
import QRCode from 'qrcode';
import { KIDS_MODES } from './kids-store.js';
import { joinPath, namesFor } from './join.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase();

// `scope(req)`：さわれる クラスの 一覧（null なら 名簿に ある クラス ぜんぶ＝運営）。`rosterRows()`：名簿の 行。
export function mountKidsApi(api, { kids, scope, rosterRows = async () => [], header, secret = '', log = console }) {
  const classesFor = async (req) => {
    let rows = [];
    try { rows = (await rosterRows()) || []; } catch (err) { log.warn('[kids] roster failed:', err.message); }
    const allowed = scope(req);
    const codes = allowed ? [...allowed] : [...new Set([...rows.map((r) => r.class).filter((c) => c && c !== '*'), ...Object.keys(kids.classes)])].sort();
    return { rows, codes };
  };
  // 運営（scope が null）は どの クラスも。先生は ログインした 教室の クラスだけ。
  const may = (req, classCode) => { const allowed = scope(req); return !allowed || allowed.some((c) => fold(c) === fold(classCode)); };

  api.get('/kids', async (req, res) => {
    const { rows, codes } = await classesFor(req);
    res.json({
      ok: true,
      classes: codes.map((code) => {
        const c = kids.classOf(code);
        // 先生の 行は 出さない（先生は いつも ふつうの 画面）。クラスの ない 行（どの クラスでも）は どの クラスにも 出す。
        const names = [...new Set(rows.filter((r) => !r.teacher && r.name && (!r.class || r.class === '*' || fold(r.class) === fold(code))).map((r) => String(r.name)))];
        // なまえを えらんで 入る：オンの クラスだけ、入り口の リンク（署名つき）と、一覧に 出る なまえの 数を 返す。
        const pick = kids.pickOf(code);
        return { code, on: c.on, students: names.map((name) => ({ name, mode: kids.modeOf(code, name) })), pick, pickReady: !!secret, join: pick && secret ? joinPath(secret, code) : '', pickCount: namesFor(rows, code).length };
      }),
    });
  });
  api.put('/kids', express.json({ limit: '4kb' }), async (req, res) => {
    if (req.get('x-requested-with') !== header) { res.status(403).json({ ok: false, error: 'header' }); return; }
    const classCode = String(req.body?.classCode ?? '').trim().slice(0, 40);
    if (!classCode || !may(req, classCode)) { res.status(403).json({ ok: false, error: 'この クラスは かえられません' }); return; }
    const name = String(req.body?.name ?? '').trim().slice(0, 40);
    let ok = false;
    if (name) ok = KIDS_MODES.includes(req.body?.mode) && await kids.setStudent(classCode, name, req.body.mode);
    else if (typeof req.body?.pick === 'boolean') ok = (!req.body.pick || !!secret) && await kids.setPick(classCode, req.body.pick);
    else if (typeof req.body?.on === 'boolean') ok = await kids.setClass(classCode, req.body.on);
    if (!ok) { res.status(400).json({ ok: false, error: '入力が ちがいます' }); return; }
    const pickSet = !name && typeof req.body?.pick === 'boolean';
    log.info(`[kids] ${classCode} ${name ? `student override ${req.body.mode}` : pickSet ? `name pick ${req.body.pick ? 'on' : 'off'}` : `class ${req.body.on ? 'on' : 'off'}`}`);
    const pick = kids.pickOf(classCode);
    res.json({ ok: true, on: kids.classOf(classCode).on, mode: name ? kids.modeOf(classCode, name) : undefined, pick, join: pick && secret ? joinPath(secret, classCode) : '' });
  });
  // 入り口の QR（SVG）。リンクは サーバーが 作る（クラスは さわれる ものだけ・オンの ときだけ）。外の サービスは 使わない。
  api.get('/kids/qr', async (req, res) => {
    const classCode = String(req.query.classCode ?? '').trim().slice(0, 40);
    let origin = '';
    try { const u = new URL(String(req.query.origin ?? '').slice(0, 200)); if (u.protocol === 'https:' || u.protocol === 'http:') origin = u.origin; } catch { /* だめな origin */ }
    if (!classCode || !origin || !secret || !may(req, classCode) || !kids.pickOf(classCode)) { res.status(404).type('text/plain').send('not found'); return; }
    try {
      const svg = await QRCode.toString(origin + joinPath(secret, classCode), { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
      res.set('Cache-Control', 'no-store'); res.type('image/svg+xml; charset=utf-8').send(svg);
    } catch (err) { log.warn('[kids] qr failed:', err.message); res.status(500).type('text/plain').send('error'); }
  });
}

// 運営の /admin/kids。
export function kidsAdminExtension({ kids, rosterRows, secret = '', log = console }) {
  return ({ router, api, authed }) => {
    router.get('/kids', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(kidsPage({ room: null }));
    });
    mountKidsApi(api, { kids, scope: () => null, rosterRows, header: 'uspeak-admin', secret, log });
  };
}

export function kidsPage({ room = null }) {
  const cfg = { api: room ? '/teacher/api/kids' : '/admin/api/kids', header: room ? 'uspeak-teacher' : 'uspeak-admin', login: room ? '/teacher/homework' : '/admin', admin: !room, kidsMode: !!config.kidsMode };
  const back = room
    ? `<a href="/teacher/homework">← 宿題</a> ・ <a href="/teacher/reports">保護者レポート</a> ・ <b>${esc(room.name)}</b>`
    : '<a href="/admin">← 管理トップ</a>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${config.kidsMode ? '幼児モード' : 'なまえを えらんで 入る'} — ${room ? esc(room.name) : '管理'}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f;font-size:16px;line-height:1.7}
.wrap{max-width:900px;margin:0 auto;padding:16px 16px 80px}h1{font-size:24px;margin:8px 0}h2{font-size:20px;margin:0}
.muted{color:#5f574d;font-size:16px}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.what{background:#eef5ff;border:2px solid #c6dbf5;border-radius:16px;padding:12px 16px;margin:12px 0}.what ul{margin:6px 0 0;padding-left:22px}
.card{background:#fff;border:1px solid #e3d9c7;border-radius:18px;padding:16px;margin:14px 0}
.head{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
button{font:inherit;cursor:pointer}
.sw{display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:6px 18px 6px 8px;border-radius:999px;border:2px solid #d9d1c3;background:#f4efe4;font-weight:800;font-size:18px;color:#5f574d}
.sw i{display:block;width:64px;height:38px;border-radius:999px;background:#c9c0b0;position:relative;transition:background .15s}
.sw i::after{content:"";position:absolute;top:4px;left:4px;width:30px;height:30px;border-radius:50%;background:#fff;transition:left .15s}
.sw[aria-checked=true]{background:#e3f3e8;border-color:#2f8f5b;color:#1e6a42}.sw[aria-checked=true] i{background:#2f8f5b}.sw[aria-checked=true] i::after{left:30px}
.list{margin:14px 0 0;padding:0;list-style:none}.list li{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:8px 0;border-top:1px solid #f0e8da}
.list .nm{font-weight:700;font-size:17px}.list .now{font-size:14px;color:#5f574d;font-weight:400;margin-left:8px}
.seg{display:inline-flex;border:2px solid #d9d1c3;border-radius:12px;overflow:hidden}
.seg button{min-height:48px;padding:0 14px;border:0;background:#fff;font-weight:700;font-size:16px;color:#1b3a2f}.seg button+button{border-left:2px solid #d9d1c3}
.seg button[aria-pressed=true]{background:#1b3a2f;color:#fff}
.plain{min-height:48px;padding:0 16px;border:2px solid #d9d1c3;border-radius:12px;background:#fff;font-weight:700}
#msg{min-height:26px;font-weight:700;color:#2f8f5b}#msg.bad{color:#b5432b}
h3{font-size:18px;margin:0}.pick{margin-top:16px;padding-top:14px;border-top:2px dashed #e3d9c7}.sw:disabled{opacity:.5;cursor:not-allowed}
.warn{margin:10px 0 0;padding:8px 12px;border-radius:12px;background:#fff1ec;color:#8a3a22;font-size:15px}
.join{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;margin-top:12px}.qr{width:180px;height:180px;border:2px solid #e3d9c7;border-radius:12px;background:#fff}
.jr{flex:1 1 280px;min-width:0}.url{width:100%;min-height:44px;margin:8px 0;padding:0 10px;border:2px solid #d9d1c3;border-radius:10px;font:14px ui-monospace,Menlo,monospace;background:#faf7f0}.acts{display:flex;flex-wrap:wrap;gap:8px}
@media print{body{background:#fff}.bar,h1,.what,#msg,.wrap>.muted,.card.noprint,.list,.card>.head,.pick .sw,.acts,.url,.warn{display:none!important}.card{border:0;padding:0}.pick{border:0;margin:0;padding:0}.qr{width:90mm;height:90mm}
.card:not(.noprint)::before{content:"クラス " attr(data-code) " の 入り口";display:block;font-size:28px;font-weight:800;margin-bottom:8px}}
</style></head><body><div class="wrap">
<div class="bar"><p class="muted" style="margin:0">${back}</p>${room ? '<form method="post" action="/teacher/logout" style="margin:0"><button type="submit" class="plain">ログアウト</button></form>' : ''}</div>
<style>body.nokids .kidsonly{display:none!important}</style>
<h1>${config.kidsMode ? '🧸 幼児モード' : '📱 なまえを えらんで 入る（クラスの QR）'}</h1>
${config.kidsMode ? '' : '<p class="muted">クラスの QR を ひらくと、名簿の なまえを おすだけで 入れます。クラスごとに オン／オフを きめます。（幼児モードは 使わない 設定です。入った 人は だれでも はじめに「せかいを えらぼう」が 出ます。）</p>'}
<p class="muted kidsonly">幼稚園・年長〜小 1・はじめての 子の ための <b>かんたんな 画面</b>に きりかえます。クラスごとに オン／オフを きめて、子どもごとに 上書きも できます。かえると、<b>入ったままの 子の 画面も 1 分 いないに かわります</b>。</p>
<div class="what kidsonly"><b>オンに すると</b>
<ul><li>はじめに「こどもの ホーム」が 出ます。大きな ボタンは 5 つ（きょうの がくしゅう・ほんだな・しまの ちず・きせかえ・あそぶ）。ぜんぶ 🔊 で 読み上げます。</li>
<li>冒険ノート・ランキング・交流ラウンジ・文字を 打つ チャット・ビデオ通話・こまかい 設定ボタンは 出ません。</li>
<li>行ける 島は メインの島・よみもの島・つり島・きせかえ島・じぶんの 島 だけです。</li>
<li>正解の 判定・コイン・学習の 記録は <b>ふつうの モードと 同じ</b>です（レポートの 数字は そのまま くらべられます）。</li><li><b>先生の アカウントは かわりません。</b>先生（や 見本を 見せる 人）は、あそぶ 画面の 上の <b>🧸 かんたん</b> ボタンで、じぶんの 画面だけ すぐ きりかえられます。</li></ul></div>
<div id="msg" role="status"></div>
<div id="classes"><p class="muted">読みこみ中…</p></div>
${room ? '' : `<div class="card kidsonly" id="addbox"><h2 style="margin:0 0 6px;font-size:18px">＋ クラスコードを 入れて 足す</h2><p class="muted" style="margin:0 0 10px;font-size:14px">上に 出て いない クラス（名簿に クラスコードを 書いて いない クラス・名簿を 使わない クラス）は、子どもが ロビーで 入れる <b>クラスコード</b>を ここに 入れると 幼児モードを オンに できます。</p><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="addcode" placeholder="例：demo" maxlength="40" autocomplete="off" style="flex:1;min-width:180px;min-height:48px;font:inherit;font-size:16px;padding:0 12px;border:2px solid #d9d1c3;border-radius:12px"><button type="button" id="addgo" style="min-height:48px;padding:0 18px;border-radius:12px;border:0;background:#2f8f5b;color:#fff;font:inherit;font-weight:800;cursor:pointer">この クラスを オンに する</button></div></div>`}
</div>
<script>
const CFG=${json(cfg)};
const $=s=>document.querySelector(s);const H={'x-requested-with':CFG.header,'content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=[];
const say=(t,bad)=>{$('#msg').textContent=t;$('#msg').className=bad?'bad':''};
const eff=(c,s)=>s.mode==='on'||(s.mode!=='off'&&c.on);
function paint(){
  $('#classes').innerHTML=data.map((c,i)=>'<section class="card" data-code="'+esc(c.code)+'"><div class="head"><h2>クラス '+esc(c.code)+'</h2>'+
  (CFG.kidsMode?'<button type="button" class="sw" role="switch" aria-checked="'+c.on+'" data-class="'+i+'"><i></i><span>幼児モード '+(c.on?'オン':'オフ')+'</span></button>':'')+'</div>'+
  (!CFG.kidsMode?'':c.students.length?'<ul class="list">'+c.students.map((s,j)=>'<li><span class="nm">'+esc(s.name)+'<span class="now">いま：'+(eff(c,s)?'🧸 幼児モード':'ふつう')+'</span></span><span class="seg" role="group" aria-label="'+esc(s.name)+'">'+
  [['inherit','クラスと おなじ'],['on','オン'],['off','オフ']].map(([m,l])=>'<button type="button" aria-pressed="'+(s.mode===m)+'" data-c="'+i+'" data-s="'+j+'" data-m="'+m+'">'+l+'</button>').join('')+'</span></li>').join('')+'</ul>'
  :'<p class="muted" style="margin:10px 0 0">名簿に この クラスの 子が まだ いません（クラスの スイッチは 使えます）。</p>')+pickHtml(c,i)+'</section>').join('')
  ||'<p class="muted">クラスが まだ ありません。</p>';
}
// なまえを えらんで 入る（クラスの QR）。オンの ときだけ リンクと QR を 出す。
function pickHtml(c,i){
  const url=c.join?location.origin+c.join:'';
  return '<div class="pick"><div class="head"><div><h3>📱 なまえを えらんで 入る</h3><p class="muted" style="margin:2px 0 0;font-size:15px">クラスの QR を ひらくと、<b>名簿の なまえを おすだけ</b>で 入れます（クラスコードを 打ちません）。</p></div>'+
  '<button type="button" class="sw" role="switch" aria-checked="'+!!c.pick+'" data-pick="'+i+'"'+(c.pickReady?'':' disabled')+'><i></i><span>'+(c.pick?'オン':'オフ')+'</span></button></div>'+
  (!c.pickReady?'<p class="warn">この サーバーでは まだ 使えません（運営の 設定が いります）。</p>':'')+
  (c.pick?(c.pickCount?'':'<p class="warn">この クラスの 子が 名簿に いません。名簿の「クラスコード」の 列に この クラスを 書いた 子だけ 一覧に 出ます。</p>')+
  '<div class="join"><img class="qr" alt="クラスの QR" src="'+CFG.api+'/qr?classCode='+encodeURIComponent(c.code)+'&origin='+encodeURIComponent(location.origin)+'"><div class="jr"><p style="margin:0"><b>いま 一覧に 出る 子：'+c.pickCount+' 人</b>（先生・停止の 行は 出ません）</p>'+
  '<input class="url" readonly value="'+esc(url)+'" aria-label="入り口の URL"><div class="acts"><button type="button" class="plain" data-copy="'+i+'">URL を コピー</button><button type="button" class="plain" data-print="'+i+'">🖨 QR を 印刷</button></div>'+
  '<p class="muted" style="margin:6px 0 0;font-size:14px">⚠ この QR を 持って いる 人は <b>クラスの 子の なまえ</b>を 見られます。教室の 中だけで 使い、SNS などに のせないで ください。オフに すると すぐ 見えなく なります。</p></div></div>':'')+'</div>';
}
async function put(body){const r=await fetch(CFG.api,{method:'PUT',headers:H,body:JSON.stringify(body)}).then(async r=>({status:r.status,...(await r.json().catch(()=>({})))})).catch(()=>({ok:false,error:'つうしんできません'}));
  if(r.status===401){location.href=CFG.login;return null}if(!r.ok){say('かえられませんでした：'+(r.error||''),true);return null}return r}
$('#classes').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.pick!==undefined){const c=data[+b.dataset.pick];if(!c.pick&&!confirm('クラス '+c.code+' の QR を ひらいた 人に、この クラスの 子の なまえの 一覧を 見せます。よろしいですか？'))return;const r=await put({classCode:c.code,pick:!c.pick});if(r){c.pick=r.pick;c.join=r.join;paint();say('クラス '+c.code+' の「なまえを えらんで 入る」を '+(c.pick?'オン':'オフ')+'に しました')}return}
  if(b.dataset.copy!==undefined){const c=data[+b.dataset.copy];try{await navigator.clipboard.writeText(location.origin+c.join);say('URL を コピーしました')}catch{say('コピーできません。手で えらんで コピーして ください',true)}return}
  if(b.dataset.print!==undefined){const c=data[+b.dataset.print];const card=b.closest('.card');document.querySelectorAll('.card').forEach(x=>x.classList.toggle('noprint',x!==card));document.body.dataset.printing=c.code;window.print();return}
  if(b.dataset.class!==undefined){const c=data[+b.dataset.class];const r=await put({classCode:c.code,on:!c.on});if(r){c.on=r.on;paint();say('クラス '+c.code+' の 幼児モードを '+(c.on?'オン':'オフ')+'に しました（1 分 いないに とどきます）')}}
  else if(b.dataset.m){const c=data[+b.dataset.c];const s=c.students[+b.dataset.s];const r=await put({classCode:c.code,name:s.name,mode:b.dataset.m});if(r){s.mode=r.mode;paint();say(s.name+' を「'+({inherit:'クラスと おなじ',on:'オン',off:'オフ'}[s.mode])+'」に しました')}}};
if(!CFG.kidsMode)document.body.classList.add('nokids');
async function load(){const r=await fetch(CFG.api,{headers:H});if(r.status===401){location.href=CFG.login;return}const d=await r.json();data=d.classes||[];paint()}
if($('#addgo'))$('#addgo').onclick=async()=>{const code=$('#addcode').value.trim();if(!code){say('クラスコードを 入れて ください',true);return}const r=await put({classCode:code,on:true});if(r){$('#addcode').value='';await load();say('クラス '+code+' の 幼児モードを オンに しました。この クラスコードで 入った 子（先生の アカウントを のぞく）は かんたんな 画面に なります')}};
load();
</script></body></html>`;
}
