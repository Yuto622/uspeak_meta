// 幼児モードの 画面と API — 教室の 先生の /teacher/kids と、運営の /admin/kids（同じ 画面）。
// クラスごとの スイッチと、子どもごとの 上書き（クラスと おなじ・オン・オフ）。どの クラスを さわれるかは
// サーバーが きめる（先生は ログインした 教室の クラスだけ・運営は 名簿の ぜんぶ）。置き場は kids-store.js。
import express from 'express';
import { KIDS_MODES } from './kids-store.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const fold = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase();

// `scope(req)`：さわれる クラスの 一覧（null なら 名簿に ある クラス ぜんぶ＝運営）。`rosterRows()`：名簿の 行。
export function mountKidsApi(api, { kids, scope, rosterRows = async () => [], header, log = console }) {
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
        return { code, on: c.on, students: names.map((name) => ({ name, mode: kids.modeOf(code, name) })) };
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
    else if (typeof req.body?.on === 'boolean') ok = await kids.setClass(classCode, req.body.on);
    if (!ok) { res.status(400).json({ ok: false, error: '入力が ちがいます' }); return; }
    log.info(`[kids] ${classCode} ${name ? `student override ${req.body.mode}` : `class ${req.body.on ? 'on' : 'off'}`}`);
    res.json({ ok: true, on: kids.classOf(classCode).on, mode: name ? kids.modeOf(classCode, name) : undefined });
  });
}

// 運営の /admin/kids。
export function kidsAdminExtension({ kids, rosterRows, log = console }) {
  return ({ router, api, authed }) => {
    router.get('/kids', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(kidsPage({ room: null }));
    });
    mountKidsApi(api, { kids, scope: () => null, rosterRows, header: 'uspeak-admin', log });
  };
}

export function kidsPage({ room = null }) {
  const cfg = { api: room ? '/teacher/api/kids' : '/admin/api/kids', header: room ? 'uspeak-teacher' : 'uspeak-admin', login: room ? '/teacher/homework' : '/admin' };
  const back = room
    ? `<a href="/teacher/homework">← 宿題</a> ・ <a href="/teacher/reports">保護者レポート</a> ・ <b>${esc(room.name)}</b>`
    : '<a href="/admin">← 管理トップ</a>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>幼児モード — ${room ? esc(room.name) : '管理'}</title>
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
</style></head><body><div class="wrap">
<div class="bar"><p class="muted" style="margin:0">${back}</p>${room ? '<form method="post" action="/teacher/logout" style="margin:0"><button type="submit" class="plain">ログアウト</button></form>' : ''}</div>
<h1>🧸 幼児モード</h1>
<p class="muted">幼稚園・年長〜小 1・はじめての 子の ための <b>かんたんな 画面</b>に きりかえます。クラスごとに オン／オフを きめて、子どもごとに 上書きも できます。かえると、<b>入ったままの 子の 画面も 1 分 いないに かわります</b>。</p>
<div class="what"><b>オンに すると</b>
<ul><li>はじめに「こどもの ホーム」が 出ます。大きな ボタンは 5 つ（きょうの がくしゅう・ほんだな・しまの ちず・きせかえ・あそぶ）。ぜんぶ 🔊 で 読み上げます。</li>
<li>冒険ノート・ランキング・交流ラウンジ・文字を 打つ チャット・ビデオ通話・こまかい 設定ボタンは 出ません。</li>
<li>行ける 島は メインの島・よみもの島・つり島・きせかえ島・じぶんの 島 だけです。</li>
<li>正解の 判定・コイン・学習の 記録は <b>ふつうの モードと 同じ</b>です（レポートの 数字は そのまま くらべられます）。先生の 画面は かわりません。</li></ul></div>
<div id="msg" role="status"></div>
<div id="classes"><p class="muted">読みこみ中…</p></div>
</div>
<script>
const CFG=${json(cfg)};
const $=s=>document.querySelector(s);const H={'x-requested-with':CFG.header,'content-type':'application/json'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=[];
const say=(t,bad)=>{$('#msg').textContent=t;$('#msg').className=bad?'bad':''};
const eff=(c,s)=>s.mode==='on'||(s.mode!=='off'&&c.on);
function paint(){
  $('#classes').innerHTML=data.map((c,i)=>'<section class="card"><div class="head"><h2>クラス '+esc(c.code)+'</h2>'+
  '<button type="button" class="sw" role="switch" aria-checked="'+c.on+'" data-class="'+i+'"><i></i><span>幼児モード '+(c.on?'オン':'オフ')+'</span></button></div>'+
  (c.students.length?'<ul class="list">'+c.students.map((s,j)=>'<li><span class="nm">'+esc(s.name)+'<span class="now">いま：'+(eff(c,s)?'🧸 幼児モード':'ふつう')+'</span></span><span class="seg" role="group" aria-label="'+esc(s.name)+'">'+
  [['inherit','クラスと おなじ'],['on','オン'],['off','オフ']].map(([m,l])=>'<button type="button" aria-pressed="'+(s.mode===m)+'" data-c="'+i+'" data-s="'+j+'" data-m="'+m+'">'+l+'</button>').join('')+'</span></li>').join('')+'</ul>'
  :'<p class="muted" style="margin:10px 0 0">名簿に この クラスの 子が まだ いません（クラスの スイッチは 使えます）。</p>')+'</section>').join('')
  ||'<p class="muted">クラスが まだ ありません。</p>';
}
async function put(body){const r=await fetch(CFG.api,{method:'PUT',headers:H,body:JSON.stringify(body)}).then(async r=>({status:r.status,...(await r.json().catch(()=>({})))})).catch(()=>({ok:false,error:'つうしんできません'}));
  if(r.status===401){location.href=CFG.login;return null}if(!r.ok){say('かえられませんでした：'+(r.error||''),true);return null}return r}
$('#classes').onclick=async e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.class!==undefined){const c=data[+b.dataset.class];const r=await put({classCode:c.code,on:!c.on});if(r){c.on=r.on;paint();say('クラス '+c.code+' の 幼児モードを '+(c.on?'オン':'オフ')+'に しました（1 分 いないに とどきます）')}}
  else if(b.dataset.m){const c=data[+b.dataset.c];const s=c.students[+b.dataset.s];const r=await put({classCode:c.code,name:s.name,mode:b.dataset.m});if(r){s.mode=r.mode;paint();say(s.name+' を「'+({inherit:'クラスと おなじ',on:'オン',off:'オフ'}[s.mode])+'」に しました')}}};
(async()=>{const r=await fetch(CFG.api,{headers:H});if(r.status===401){location.href=CFG.login;return}const d=await r.json();data=d.classes||[];paint()})();
</script></body></html>`;
}
