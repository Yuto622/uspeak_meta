// /admin/roadmap — ロードマップの 12 段階（名前・中身・単語）と はじめの 段階を 教室ごとに かえる。
// ログインは 名簿の 管理ページと 同じ（roster-admin の extend）。クラスを「*」に すると 教室ぜんぶの 既定。
import express from 'express';
import { stagesFor, DEFAULT_STAGES, STAGE_IDS, EIKEN, defaultWords, WORD_RATE, QUIZ_MIN, QUIZ_RATE } from '../game/roadmap.js';
import { classKey } from './store.js';

export function roadmapAdminExtension({ roadmap, log = console }) {
  return ({ router, api, authed }) => {
    api.use('/roadmap', express.json({ limit: '2mb' }));
    router.get('/roadmap', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(page());
    });
    const guard = (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return false; }
      return true;
    };
    api.get('/roadmap', (req, res) => {
      const key = classKey(req.query.class || '*');
      const own = roadmap.classes[key] || null;
      res.json({
        ok: true, classCode: key, own: !!own, start: roadmap.startFor(key), classes: Object.keys(roadmap.classes),
        stages: stagesFor(roadmap.settingsFor(key)).map((s) => ({ ...s, gradeJa: EIKEN[s.grade].ja, defaults: { en: DEFAULT_STAGES.find((d) => d.id === s.id).en, ja: DEFAULT_STAGES.find((d) => d.id === s.id).ja, note: DEFAULT_STAGES.find((d) => d.id === s.id).note, words: defaultWords(s.id) } })),
        rule: { words: Math.round(WORD_RATE * 100), quizMin: QUIZ_MIN, quizRate: Math.round(QUIZ_RATE * 100) },
      });
    });
    api.put('/roadmap/:classCode', async (req, res) => {
      if (!guard(req, res)) return;
      const r = await roadmap.saveSettings(req.params.classCode, req.body || {});
      log.info?.(`[roadmap] settings saved for ${r.classCode}`);
      res.json(r);
    });
    api.delete('/roadmap/:classCode', async (req, res) => { if (guard(req, res)) res.json(await roadmap.removeSettings(req.params.classCode)); });
  };
}

const page = () => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>ロードマップ — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f}.wrap{max-width:1200px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}.muted{color:#6e665c;font-size:13px}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
select,input,button,textarea{min-height:36px;border:1px solid #d9d1c3;border-radius:10px;background:#fff;font:inherit;padding:0 10px}textarea{width:100%;padding:6px;min-height:64px;font-size:12px}
button{font-weight:700;cursor:pointer}button.main{background:#1b3a2f;color:#fff;border-color:#1b3a2f}button.warn{color:#b5432b;border-color:#e3b3a6}
table{width:100%;border-collapse:collapse;background:#fff;font-size:13px}th,td{border-bottom:1px solid #f0e8da;padding:6px;text-align:left;vertical-align:top}th{background:#1b3a2f;color:#fff}
td input{width:100%}.id{font-size:20px;font-weight:900;text-align:center}.pill{display:inline-block;font-size:12px;border-radius:999px;padding:1px 9px;background:#f4efe4}.pill.c{background:#e27a2d;color:#fff}
#msg{min-height:20px;font-weight:700}.rule{background:#fff;border:1px solid #eadfcd;border-radius:14px;padding:10px 14px}</style></head><body><div class="wrap">
<p class="muted"><a href="/admin">← 管理トップ</a> ・ <a href="/admin/homework">宿題</a> ・ <a href="/admin/qbank">問題データベース</a></p>
<h1>🗺 ロードマップ</h1>
<div class="rule" id="rule"></div>
<div class="bar"><label>クラス <input id="cls" value="*" style="width:140px"></label><button id="load">ひらく</button><span class="muted">「*」は クラスの 設定が ない 教室ぜんぶの 既定です。</span></div>
<div class="bar"><label>はじめの 段階 <select id="start"></select></label><span class="muted">はじめて ロードマップを ひらいた 子は ここから。いまの 子の 段階は かわりません（かえるのは 先生の /class）。</span></div>
<table><thead><tr><th>段階</th><th>級</th><th>名前（英語）</th><th>名前（日本語）</th><th>中身（メモ）</th><th>単語（1 行に 1 つ・空なら 既定）</th></tr></thead><tbody id="rows"></tbody></table>
<div class="bar"><button class="main" id="save">保存</button><button class="warn" id="reset">この クラスの 設定を けす（既定に もどす）</button><span id="msg"></span></div>
<script>
const $=(s)=>document.querySelector(s);const H={'Content-Type':'application/json','X-Requested-With':'uspeak-admin'};let cur=null;
const esc=(s)=>String(s??'').replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function load(){const r=await fetch('/admin/api/roadmap?class='+encodeURIComponent($('#cls').value||'*'));cur=await r.json();
 $('#rule').innerHTML='<b>次の 段階に 進む 条件</b>：その 段階の 単語の <b>'+cur.rule.words+'%</b> を「覚えた」（2 日以上に 分けて 3 回 つづけて 正解）＋ その 段階に 入ってから その 級の クイズを <b>'+cur.rule.quizMin+' 問 以上</b>・正解率 <b>'+cur.rule.quizRate+'%</b>。記録は Roblox と Web の 両方から。<br><span class="muted">単語は ゲームで 実際に 出る ことばに して ください（出ない 単語は 覚えられず、進めなく なります）。いまの 設定： '+(cur.own?'この クラスだけの 設定':'既定')+'</span>';
 $('#start').innerHTML=cur.stages.map((s)=>'<option'+(s.id===cur.start?' selected':'')+'>'+s.id+'</option>').join('');
 $('#rows').innerHTML=cur.stages.map((s)=>'<tr data-id="'+s.id+'"><td class="id">'+s.id+'</td><td><span class="pill">'+esc(s.gradeJa)+'</span></td><td><input data-k="en" value="'+esc(s.en)+'"></td><td><input data-k="ja" value="'+esc(s.ja)+'"></td><td><input data-k="note" value="'+esc(s.note)+'"></td><td><textarea data-k="words">'+esc(s.words.join('\\n'))+'</textarea><span class="muted">'+s.words.length+' 語'+(s.custom?' <span class="pill c">この 教室の 単語</span>':'（既定）')+'</span></td></tr>').join('');}
$('#load').onclick=load;
$('#save').onclick=async()=>{const stages={};for(const tr of document.querySelectorAll('#rows tr')){const id=tr.dataset.id;const d=cur.stages.find((s)=>s.id===id).defaults;const v=(k)=>tr.querySelector('[data-k='+k+']').value.trim();
 const words=v('words').split(/[\\n,、]+/).map((w)=>w.trim().toLowerCase()).filter(Boolean);const same=words.join('|')===d.words.join('|');
 stages[id]={en:v('en'),ja:v('ja'),note:v('note'),words:same?[]:words};}
 const r=await fetch('/admin/api/roadmap/'+encodeURIComponent($('#cls').value||'*'),{method:'PUT',headers:H,body:JSON.stringify({start:$('#start').value,stages})});const j=await r.json();$('#msg').textContent=j.ok?'保存しました（'+j.classCode+'）':'保存できませんでした';load();};
$('#reset').onclick=async()=>{if(!confirm('この クラスの ロードマップの 設定を けして 既定に もどしますか？'))return;await fetch('/admin/api/roadmap/'+encodeURIComponent($('#cls').value||'*'),{method:'DELETE',headers:H});$('#msg').textContent='既定に もどしました';load();};
load();
</script></div></body></html>`;
