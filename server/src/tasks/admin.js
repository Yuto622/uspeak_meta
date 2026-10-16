// /admin/tasks — タスクの 表を 行と 列で 入れかえ・書きかえ する 画面。ログインは 名簿の 管理ページと 同じ（roster-admin の extend）。
//   表は 4つ（はじめの100・島ごとの タスク・5年の ロードマップ・まいにち/まいしゅう）。保存は 表 まるごと。
//   Google スプレッドシートから コピーした 行（TSV）を 貼りつけて 置きかえる／うしろに 足す ことも できる。
import express from 'express';
import { TABLES, rowsFromTsv, rowsToTsv, MAX_ROWS } from './store.js';

export function tasksAdminExtension({ tasks, log = console }) {
  return ({ router, api, authed }) => {
    api.use('/tasks', express.json({ limit: '4mb' }));
    router.get('/tasks', (req, res) => {
      if (!authed(req)) { res.redirect(303, '/admin'); return; }
      res.type('text/html; charset=utf-8').send(PAGE);
    });
    api.get('/tasks', (req, res) => {
      res.json({ ok: true, updatedAt: tasks.updatedAt, maxRows: MAX_ROWS, tables: Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, { label: t.label, columns: t.columns, rows: tasks.table(k) }])) });
    });
    api.put('/tasks/:table', async (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin') { res.status(403).json({ ok: false, error: 'header' }); return; }
      try {
        const r = await tasks.save(req.params.table, req.body?.rows);
        res.status(r.ok ? 200 : 400).json(r);
      } catch (err) { log.warn('[tasks] save failed:', err.message); res.status(500).json({ ok: false, error: err.message }); }
    });
    api.post('/tasks/:table/reset', async (req, res) => {
      if (req.get('x-requested-with') !== 'uspeak-admin' || !TABLES[req.params.table]) { res.status(400).json({ ok: false }); return; }
      res.json(await tasks.reset(req.params.table));
    });
    // 貼りつけた TSV を 行に する（保存は しない。画面で 見てから 保存）。
    api.post('/tasks/:table/parse', (req, res) => {
      if (!TABLES[req.params.table]) { res.status(400).json({ ok: false }); return; }
      res.json({ ok: true, rows: rowsFromTsv(req.params.table, req.body?.text) });
    });
    api.get('/tasks/:table.tsv', (req, res) => {
      if (!TABLES[req.params.table]) { res.status(404).end(); return; }
      res.type('text/tab-separated-values; charset=utf-8').send(rowsToTsv(req.params.table, tasks.table(req.params.table)));
    });
  };
}

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>タスク — 管理</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans JP",system-ui,sans-serif;background:#fffbf5;color:#1b3a2f}.wrap{max-width:1400px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}.muted{color:#6e665c;font-size:13px}.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
.tabs button{min-height:38px;padding:0 14px;border:1px solid #d9d1c3;border-radius:10px;background:#fff;font:inherit;font-weight:700;cursor:pointer}.tabs button.on{background:#1b3a2f;color:#fff;border-color:#1b3a2f}
.btn{min-height:38px;padding:0 14px;border:0;border-radius:10px;background:#1b3a2f;color:#fff;font:inherit;font-weight:700;cursor:pointer}.btn.ghost{background:#efe8dc;color:#1b3a2f}.btn.danger{background:#b3372b}.btn:disabled{opacity:.45}
input[type=search]{font:inherit;padding:7px 10px;border:1px solid #d9d1c3;border-radius:10px;min-width:220px}
.grid{overflow:auto;max-height:70vh;border:1px solid #e9e2d6;border-radius:12px;background:#fff}
table{border-collapse:collapse;font-size:13px;min-width:100%}th{position:sticky;top:0;background:#1b3a2f;color:#fff;text-align:left;padding:6px;white-space:nowrap;z-index:1}
td{border-bottom:1px solid #efe8dc;padding:2px 4px;vertical-align:top}tr:nth-child(even) td{background:#f8f6f1}tr.off td{opacity:.5}
td input[type=text],td input[type=number]{width:100%;min-width:70px;font:inherit;font-size:13px;border:1px solid transparent;border-radius:6px;padding:4px 5px;background:transparent}
td input:focus{border-color:#e27a2d;background:#fff;outline:none}td.wide input{min-width:240px}td.mid input{min-width:140px}
td.acts{white-space:nowrap}td.acts button{border:1px solid #d9d1c3;background:#fff;border-radius:6px;padding:2px 6px;cursor:pointer;font-size:12px}
.num{color:#6e665c;text-align:right;padding-right:6px}#dirty{font-weight:700;color:#b3372b}textarea{width:100%;min-height:140px;font:12px ui-monospace,monospace;border:1px solid #d9d1c3;border-radius:10px;padding:8px}
.card{background:#fff;border:1px solid #e9e2d6;border-radius:14px;padding:12px;margin:10px 0}</style></head>
<body><div class="wrap"><p><a href="/admin">← 名簿の管理</a></p><h1>タスクの 表</h1>
<p class="muted">行の ならびが そのまま ゲームの 順番です。「採用」の チェックを はずした 行は ゲームに 出ません。書きかえたら「保存」を 押してください。</p>
<div class="bar tabs" id="tabs"></div>
<div class="bar"><input type="search" id="q" placeholder="さがす（島・文・ID）"><button class="btn ghost" id="add">＋ 行を 足す</button><button class="btn" id="save" disabled>保存</button><span id="dirty"></span><span class="muted" id="count"></span></div>
<div class="grid"><table><thead id="head"></thead><tbody id="body"></tbody></table></div>
<details class="card"><summary><b>Google スプレッドシートから 貼りつける・書き出す</b></summary>
<p class="muted">シートで 見出しの 行から 下を えらんで コピーし、ここに 貼りつけます。見出しの 名前で 列を あわせます（「順番」「段数」の 列は むしします）。</p>
<textarea id="tsv" placeholder="ここに 貼りつけ"></textarea>
<div class="bar"><button class="btn ghost" id="replace">この 表を 置きかえる</button><button class="btn ghost" id="append">うしろに 足す</button><a class="btn ghost" id="export" style="display:inline-flex;align-items:center;text-decoration:none">TSV を ダウンロード</a><button class="btn danger" id="reset">最初の 中身に もどす</button></div></details>
</div>
<script>
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const H = { 'content-type': 'application/json', 'x-requested-with': 'uspeak-admin' };
const $ = (s) => document.querySelector(s);
let data = null, cur = 'onboarding', rows = [], dirty = false;
const WIDE = new Set(['ja', 'en', 'done', 'task', 'tiers', 'memo', 'why']), MID = new Set(['chapter', 'island', 'where', 'learn', 'eiken']);
function setDirty(v) { dirty = v; $('#save').disabled = !v; $('#dirty').textContent = v ? '保存して いない 変更が あります' : ''; }
function cols() { return data.tables[cur].columns; }
function renderTabs() {
  $('#tabs').innerHTML = Object.entries(data.tables).map(([k, t]) => '<button data-tab="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + esc(t.label) + '（' + t.rows.length + '）</button>').join('');
}
function cell(c, r, i) {
  const v = r[c.key];
  if (c.type === 'bool') return '<td><input type="checkbox" data-i="' + i + '" data-k="' + c.key + '"' + (v ? ' checked' : '') + '></td>';
  const t = c.type === 'int' ? 'number' : 'text';
  return '<td class="' + (WIDE.has(c.key) ? 'wide' : MID.has(c.key) ? 'mid' : '') + '"><input type="' + t + '" data-i="' + i + '" data-k="' + c.key + '" value="' + esc(v) + '"></td>';
}
function render() {
  const q = $('#q').value.trim().toLowerCase();
  $('#head').innerHTML = '<tr><th>#</th>' + cols().map((c) => '<th>' + esc(c.label) + '</th>').join('') + '<th>ならび</th></tr>';
  let shown = 0;
  $('#body').innerHTML = rows.map((r, i) => {
    if (q && !Object.values(r).some((v) => String(v).toLowerCase().includes(q))) return '';
    shown += 1;
    return '<tr class="' + (r.on ? '' : 'off') + '"><td class="num">' + (i + 1) + '</td>' + cols().map((c) => cell(c, r, i)).join('') +
      '<td class="acts"><button data-act="up" data-i="' + i + '" title="上へ">↑</button> <button data-act="down" data-i="' + i + '" title="下へ">↓</button> <button data-act="move" data-i="' + i + '" title="番号を 指定して うごかす">→#</button> <button data-act="dup" data-i="' + i + '" title="複製">⧉</button> <button data-act="del" data-i="' + i + '" title="消す">✕</button></td></tr>';
  }).join('');
  $('#count').textContent = (q ? shown + ' / ' : '') + rows.length + ' 行・採用 ' + rows.filter((r) => r.on).length;
  $('#export').href = '/admin/api/tasks/' + cur + '.tsv';
}
async function load() {
  data = await (await fetch('/admin/api/tasks')).json();
  rows = structuredClone(data.tables[cur].rows); setDirty(false); renderTabs(); render();
}
$('#tabs').onclick = (e) => {
  const k = e.target.dataset.tab; if (!k || k === cur) return;
  if (dirty && !confirm('保存して いない 変更を すてて、ほかの 表を ひらきますか？')) return;
  cur = k; rows = structuredClone(data.tables[cur].rows); setDirty(false); renderTabs(); render();
};
$('#q').oninput = render;
$('#body').addEventListener('input', (e) => {
  const el = e.target; const i = Number(el.dataset.i); const k = el.dataset.k; if (!k) return;
  rows[i][k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value || 0) : el.value;
  if (el.type === 'checkbox') el.closest('tr').classList.toggle('off', !el.checked);
  setDirty(true);
});
$('#body').addEventListener('click', (e) => {
  const a = e.target.dataset.act; if (!a) return; const i = Number(e.target.dataset.i);
  if (a === 'up' && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
  else if (a === 'down' && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
  else if (a === 'move') { const to = Number(prompt('何番目に うごかしますか？（1〜' + rows.length + '）', String(i + 1))); if (!to) return; const [r] = rows.splice(i, 1); rows.splice(Math.max(0, Math.min(rows.length, to - 1)), 0, r); }
  else if (a === 'dup') rows.splice(i + 1, 0, { ...rows[i], id: '' });
  else if (a === 'del') { if (!confirm((rows[i].id || '') + ' の 行を 消しますか？')) return; rows.splice(i, 1); }
  else return;
  setDirty(true); render();
});
$('#add').onclick = () => { const r = Object.fromEntries(cols().map((c) => [c.key, c.type === 'bool' ? true : c.type === 'int' ? 0 : ''])); rows.push(r); setDirty(true); render(); $('.grid').scrollTop = 1e9; };
$('#save').onclick = async () => {
  $('#save').disabled = true;
  const r = await (await fetch('/admin/api/tasks/' + cur, { method: 'PUT', headers: H, body: JSON.stringify({ rows }) })).json();
  if (!r.ok) { alert('保存できません：' + (r.error || '')); $('#save').disabled = false; return; }
  data.tables[cur].rows = r.rows; rows = structuredClone(r.rows); setDirty(false); renderTabs(); render();
};
async function parsed() {
  const text = $('#tsv').value; if (!text.trim()) { alert('貼りつけて ください'); return null; }
  const r = await (await fetch('/admin/api/tasks/' + cur + '/parse', { method: 'POST', headers: H, body: JSON.stringify({ text }) })).json();
  return r.rows || [];
}
$('#replace').onclick = async () => { const p = await parsed(); if (!p) return; if (!confirm(p.length + ' 行で この 表を 置きかえます（保存は まだ です）')) return; rows = p; setDirty(true); render(); };
$('#append').onclick = async () => { const p = await parsed(); if (!p) return; rows = rows.concat(p.map((r) => ({ ...r, id: rows.some((x) => x.id === r.id) ? '' : r.id }))); setDirty(true); render(); };
$('#reset').onclick = async () => {
  if (!confirm('この 表を 最初の 中身（設計シートと 同じ）に もどします。よいですか？')) return;
  const r = await (await fetch('/admin/api/tasks/' + cur + '/reset', { method: 'POST', headers: H })).json();
  if (r.ok) { data.tables[cur].rows = r.rows; rows = structuredClone(r.rows); setDirty(false); renderTabs(); render(); }
};
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
load();
</script></body></html>`;
