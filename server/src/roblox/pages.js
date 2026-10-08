// Roblox の学習記録の画面（docs/ROBLOX_SYNC.md）。
//
//  * `parentHtml`   保護者ページ `/report/<username>`。1枚、スクリプトなし、スマホと印刷。
//  * `classSection` 先生ページ `/class/<クラス>` に足す表（並べ替え・CSV・行を開くと詳細）。
//  * `classCsv`     その表の CSV。
//
// どちらも **指標の定義（metric_definitions）をなぞって描く**：行を足せば、ここを触らずに出る。
// 数の指標は「累計」の札と「今週／先週」の表に、表の指標（級ごと・ワールド別）は表に、
// 単語の一覧は一覧に。
import { PERIOD_LABEL, formatValue } from '../game/roblox-metrics.js';

const JST = { timeZone: 'Asia/Tokyo' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateJa = (ts) => (ts ? new Date(ts).toLocaleDateString('ja-JP', JST) : '—');
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// 「読み上げが終わる前に答えて間違えた割合」。**低いほど良い**指標なので、言葉を添える。
export const GUESS_NOTE = '問題の読み上げが終わる前に答えて間違えた割合。低いほど、きちんと読んで答えています。';
// 先生ページの「気になる印」：あてずっぽう率 30% 以上、または 7 日来ていない。
export const FLAG_GUESS_PCT = 30;
export const FLAG_ABSENT_DAYS = 7;

const isScalar = (m) => !['list', 'table'].includes(m.unit);
const hasWeek = (m) => m.periods.includes('week');

// ▲▼：今週と先週の差。% と秒は差を同じ単位で。
function delta(m) {
  const a = m.values.week; const b = m.values.last;
  if (a === null || a === undefined || b === null || b === undefined) return '';
  const d = num(a) - num(b);
  if (!d) return '<span class="same">—</span>';
  const text = m.unit === 'percent' ? `${Math.abs(Math.round(d * 10) / 10)}pt` : m.unit === 'seconds' ? `${Math.round(Math.abs(d) / 60)}分` : `${Math.abs(d)}`;
  // あてずっぽう率は下がるほど良い。
  const good = m.key === 'guess_rate' ? d < 0 : d > 0;
  return `<span class="${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${esc(text)}</span>`;
}

function tableMetric(m, period) {
  const rows = m.values[period];
  if (!Array.isArray(rows) || !rows.length) return `<p class="fine">${esc(PERIOD_LABEL[period])}は まだ記録がありません。</p>`;
  const isRatio = m.kind === 'group' && m.expr.agg === 'ratio';
  const unit = isRatio ? 'percent' : m.expr.agg === 'sum' ? (m.unit === 'table' ? 'seconds' : m.unit) : 'count';
  return `<table class="nums"><thead><tr><th>${esc(m.key === 'by_world' || m.key === 'by_activity' ? '場所' : m.key === 'by_level' ? '級' : '')}</th><th>${esc(PERIOD_LABEL[period])}</th>${isRatio ? '<th>問題数</th>' : ''}</tr></thead><tbody>${
    rows.map((r) => `<tr><td>${esc(r.label)}</td><td><b>${esc(formatValue(r.value, unit))}</b></td>${isRatio ? `<td>${r.correct} / ${r.count}</td>` : ''}</tr>`).join('')
  }</tbody></table>`;
}

function listMetric(m) {
  const rows = m.values.all ?? m.values.week;
  if (!Array.isArray(rows) || !rows.length) return '<p class="fine">いまのところ、苦手な単語はありません。2回以上出て 半分以上まちがえた単語が ここに出ます。</p>';
  return `<ul class="words">${rows.map((r) => `<li><b translate="no">${esc(r.word)}</b><span>${r.misses}回まちがえ · ${r.seen}回中${r.seen - r.misses}回 正解${r.level ? ` · ${esc(r.level)}級` : ''}</span></li>`).join('')}</ul>`;
}

const STYLE = `
 :root { color-scheme: light; --ink:#1b3a2f; --soft:#5d6d62; --paper:#fffbf5; --bg:#f4f1e3; --rule:#e9e2cf; --green:#1b3a2f; --orange:#e27a2d; --good:#2f6b3f; --bad:#9b3a2e; }
 body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.7 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
 header { background:var(--green); color:var(--paper); padding:22px 18px; }
 header div, main { max-width:640px; margin:0 auto; }
 header small { opacity:.75; letter-spacing:2px; font-size:11px; }
 header h1 { margin:4px 0 0; font-size:24px; }
 header p { margin:2px 0 0; font-size:13px; opacity:.85; }
 main { padding:20px 16px 60px; }
 section { background:var(--paper); border-radius:16px; padding:18px; margin:0 0 14px; border:1px solid var(--rule); }
 h2 { margin:0 0 8px; font-size:16px; }
 h2 small { font-weight:400; color:var(--soft); font-size:12px; margin-left:8px; }
 .cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; }
 .cards div { background:var(--bg); border-radius:12px; padding:10px 12px; }
 .cards span { display:block; font-size:12px; color:var(--soft); }
 .cards b { font-size:22px; }
 table { width:100%; border-collapse:collapse; font-size:14px; }
 th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--rule); vertical-align:top; font-weight:400; }
 th { font-size:12px; color:var(--soft); }
 tr:last-child td { border-bottom:0; }
 .nums td:not(:first-child), .nums th:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
 .up { color:var(--good); font-weight:700; } .down { color:var(--bad); font-weight:700; } .same { color:var(--soft); }
 .guess { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
 .guess b { font-size:40px; color:var(--orange); line-height:1.1; }
 .guess b.low { color:var(--good); }
 .words { list-style:none; margin:0; padding:0; }
 .words li { padding:7px 0; border-bottom:1px solid var(--rule); display:flex; flex-wrap:wrap; gap:4px 12px; }
 .words li:last-child { border-bottom:0; }
 .words li b { font-size:17px; min-width:7em; }
 .words li span { color:var(--soft); font-size:13px; }
 .fine { font-size:12px; color:var(--soft); margin:6px 0 0; }
 .recent td { font-size:13px; padding:6px 8px; white-space:nowrap; } .recent td:nth-child(4) { white-space:normal; }
 .recent .ok { color:var(--good); font-weight:700; } .recent .ng { color:var(--bad); font-weight:700; }
 .tag { display:inline-block; font-size:11px; padding:1px 8px; border-radius:10px; background:#f3e0cf; color:#7a4a1c; vertical-align:middle; margin-left:6px; }
 footer { font-size:12px; color:var(--soft); margin-top:18px; }
 @media (max-width:480px) { .cards b { font-size:19px; } th, td { padding:7px 6px; } }
 @media print { body { background:#fff; } section { break-inside:avoid; border-color:#ccc; } header { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
`;

// 最近の記録：どこで（さかなつり・小屋…）何をしたか。保護者が「きのう何してたの」に答えられる。
const TYPE_JA = { quiz: 'クイズ', session: 'あそんだ時間', 'fast-type': 'はやおし', join: '入室', leave: '退室' };
const timeJa = (ts) => new Date(ts).toLocaleString('ja-JP', { ...JST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function recentSection(recent) {
  if (!Array.isArray(recent) || !recent.length) return '';
  const rows = recent.map((r) => {
    const what = r.type === 'quiz'
      ? `<b translate="no">${esc(r.word || '')}</b>${r.level ? ` <small>${esc(r.level)}級</small>` : ''}${r.retry ? ' <small>やり直し</small>' : ''}`
      : r.type === 'session' ? `${Math.round(num(r.seconds) / 60)}分` : esc(TYPE_JA[r.type] || r.type);
    const mark = r.correct === null ? '' : r.correct ? '<span class="ok">○</span>' : `<span class="ng">×${r.fast ? ' はやい' : ''}</span>`;
    return `<tr><td>${esc(timeJa(r.ts))}</td><td>${esc(r.place)}</td><td>${esc(TYPE_JA[r.type] || r.type)}</td><td>${what}</td><td>${mark}</td></tr>`;
  }).join('');
  return `<section><h2>最近の記録<small>新しい順に ${recent.length} 件</small></h2>
<table class="recent"><thead><tr><th>いつ</th><th>どこで</th><th>なに</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>
<p class="fine">「どこで」は Roblox の中の場所（さかなつり・小屋 など）です。</p></section>`;
}

// ---- 保護者ページ -----------------------------------------------------------------------
export function parentHtml(s, { madeAt = Date.now() } = {}) {
  const M = s.metrics;
  const scalars = M.filter(isScalar);
  const cards = scalars.filter((m) => m.values.all !== undefined && m.key !== 'guess_rate').map((m) => `<div><span>${esc(m.label_ja)}</span><b>${esc(formatValue(m.values.all, m.unit))}</b></div>`).join('');
  const weekRows = scalars.filter(hasWeek).map((m) => `<tr><td>${esc(m.label_ja)}</td><td><b>${esc(formatValue(m.values.week, m.unit))}</b></td><td>${esc(formatValue(m.values.last, m.unit))}</td><td>${delta(m)}</td></tr>`).join('');
  const guess = M.find((m) => m.key === 'guess_rate');
  const g = guess ? guess.values.week ?? guess.values.all : null;
  const tables = M.filter((m) => m.unit === 'table').map((m) => `<section><h2>${esc(m.label_ja)}</h2>${tableMetric(m, 'all')}${hasWeek(m) && Array.isArray(m.values.week) && m.values.week.length ? `<details><summary class="fine">今週だけ見る</summary>${tableMetric(m, 'week')}</details>` : ''}</section>`).join('');
  const lists = M.filter((m) => m.unit === 'list').map((m) => `<section><h2>${esc(m.label_ja)}</h2>${listMetric(m)}</section>`).join('');
  const who = s.child?.name && s.child.name !== s.username ? `${s.child.name} さん <small>（Roblox: <span translate="no">${esc(s.username)}</span>）</small>` : `<span translate="no">${esc(s.username)}</span> さん`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(s.child?.name || s.username)} さんの Roblox 学習レポート · U-Speak</title>
<style>${STYLE}</style></head><body>
<header><div><small>U-SPEAK LAB · ROBLOX</small><h1>${who}</h1>
<p>${esc(new Date(madeAt).toLocaleDateString('ja-JP', JST))} 時点 · 記録 ${s.counts.all.toLocaleString('ja-JP')} 件${s.firstSeen ? ` · はじめて ${esc(dateJa(s.firstSeen))}` : ''} · 最後に来た日 ${esc(dateJa(s.lastSeen))}</p></div></header>
<main>
${s.counts.all ? '' : '<section><p>まだ Roblox での記録がありません。U-Speak の Roblox ワールドで あそんでから、もう一度ひらいてください。</p></section>'}
<section><h2>累計</h2><div class="cards">${cards || '<div><span>記録</span><b>0</b></div>'}</div></section>
<section><h2>今週と先週<small>月曜〜日曜</small></h2>
<table class="nums"><thead><tr><th>指標</th><th>今週</th><th>先週</th><th>くらべて</th></tr></thead><tbody>${weekRows || '<tr><td colspan="4">記録がありません</td></tr>'}</tbody></table></section>
${guess ? `<section><h2>あてずっぽう率</h2><div class="guess"><b class="${g !== null && g !== undefined && g < FLAG_GUESS_PCT ? 'low' : ''}">${esc(formatValue(g, 'percent'))}</b><span>今週（先週 ${esc(formatValue(guess.values.last, 'percent'))} · 累計 ${esc(formatValue(guess.values.all, 'percent'))}）</span></div>
<p class="fine">${GUESS_NOTE}</p></section>` : ''}
${tables}${lists}
${recentSection(s.recent)}
<footer>このページは1人ぶんのリンクです。ほかの人に送らないでください。Roblox 上の学習記録（アカウント名・回答・利用時間）を U-Speak Web に保存し、保護者と教室に表示しています。</footer>
</main></body></html>`;
}

// ---- 先生ページの表 ---------------------------------------------------------------------
const FIXED = ['study_seconds', 'questions', 'accuracy', 'guess_rate'];

export function flagsOf(row, now = Date.now()) {
  const flags = [];
  const g = row.metrics.find((m) => m.key === 'guess_rate');
  if (g && num(g.values.week) >= FLAG_GUESS_PCT && g.values.week !== null) flags.push(`あてずっぽう率 ${g.values.week}%`);
  const days = row.lastSeen ? Math.floor((now - row.lastSeen) / 86400000) : null;
  if (days !== null && days >= FLAG_ABSENT_DAYS) flags.push(`${days}日 来ていません`);
  if (days === null) flags.push('まだ来ていません');
  return flags;
}

// 表の列：決まった列 ＋ 定義にある数の指標で まだ出ていないもの（今週の値）。
export function classColumns(rows) {
  const defs = rows[0]?.metrics || [];
  const extra = defs.filter((m) => isScalar(m) && !FIXED.includes(m.key) && hasWeek(m)).map((m) => ({ key: m.key, label: m.label_ja, unit: m.unit, period: 'week' }));
  return extra;
}

export function classSection(rows, { classCode, token = '', now = Date.now() } = {}) {
  const extra = classColumns(rows);
  const cell = (row, key, period = 'week') => { const m = row.metrics.find((x) => x.key === key); return m ? formatValue(m.values[period], m.unit) : '—'; };
  const raw = (row, key, period = 'week') => { const m = row.metrics.find((x) => x.key === key); const v = m ? m.values[period] : null; return v === null || v === undefined ? -1 : num(v); };
  const streak = (row) => { const m = row.metrics.find((x) => x.key === 'streak_days'); return m ? num(m.values.all) : 0; };
  const head = `<tr><th data-k="name">名前</th><th data-k="study" data-n>今週の学習時間</th><th data-k="q" data-n>問題数</th><th data-k="acc" data-n>正答率</th><th data-k="guess" data-n>あてずっぽう率</th><th data-k="seen" data-n>最後に来た日</th><th data-k="streak" data-n>連続日数</th>${extra.map((c) => `<th data-k="x-${esc(c.key)}" data-n>${esc(c.label)}</th>`).join('')}</tr>`;
  const body = rows.map((row, i) => {
    const flags = flagsOf(row, now);
    const detail = row.metrics.filter(isScalar).map((m) => `<tr><td>${esc(m.label_ja)}</td><td>${esc(formatValue(m.values.week, m.unit))}</td><td>${esc(formatValue(m.values.last, m.unit))}</td><td>${esc(formatValue(m.values.all, m.unit))}</td></tr>`).join('');
    const words = row.metrics.find((m) => m.key === 'weak_words');
    const wordsHtml = words && Array.isArray(words.values.all) && words.values.all.length ? `<p class="fine">間違えやすい単語：${words.values.all.map((w) => `<b translate="no">${esc(w.word)}</b>（${w.misses}回）`).join('、')}</p>` : '';
    return `<tr class="r ${flags.length ? 'flag' : ''}" data-i="${i}" data-name="${esc(row.name || row.username)}" data-study="${raw(row, 'study_seconds')}" data-q="${raw(row, 'questions')}" data-acc="${raw(row, 'accuracy')}" data-guess="${raw(row, 'guess_rate')}" data-seen="${row.lastSeen || 0}" data-streak="${streak(row)}"${extra.map((c) => ` data-x-${esc(c.key)}="${raw(row, c.key, c.period)}"`).join('')}>
<td>${flags.length ? '<span class="mark" title="気になる印">●</span> ' : ''}<b>${esc(row.name || row.username)}</b>${row.name && row.name !== row.username ? `<br><small translate="no">${esc(row.username)}</small>` : ''}${row.registered ? '' : '<span class="tag">未登録</span>'}${flags.length ? `<br><small class="why">${esc(flags.join(' · '))}</small>` : ''}</td>
<td>${esc(cell(row, 'study_seconds'))}</td><td>${esc(cell(row, 'questions'))}</td><td>${esc(cell(row, 'accuracy'))}</td><td>${esc(cell(row, 'guess_rate'))}</td><td>${esc(dateJa(row.lastSeen))}</td><td>${streak(row)}日</td>${extra.map((c) => `<td>${esc(cell(row, c.key, c.period))}</td>`).join('')}</tr>
<tr class="d" hidden><td colspan="${7 + extra.length}"><table class="nums inner"><thead><tr><th>指標</th><th>今週</th><th>先週</th><th>累計</th></tr></thead><tbody>${detail}</tbody></table>${wordsHtml}${row.username ? `<p class="fine"><a href="/report/${encodeURIComponent(row.username)}?t=${esc(row.reportToken || '')}" target="_blank" rel="noopener">保護者ページをひらく</a></p>` : ''}</td></tr>`;
  }).join('');
  return `<section id="roblox"><h2>Roblox の学習<small>今週（月曜〜日曜）· 列の見出しで並べ替え · 行を押すと詳細</small></h2>
<p class="fine">● は気になる印：あてずっぽう率 ${FLAG_GUESS_PCT}% 以上、または ${FLAG_ABSENT_DAYS} 日来ていない子。「未登録」は Roblox から記録は来ているが、名簿にも紐づけにもない名前（管理ページで紐づけられます）。</p>
<div class="rb-wrap"><table class="nums rb"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${7 + extra.length}">まだ Roblox からの記録がありません</td></tr>`}</tbody></table></div>
<p class="fine"><a href="/class/${encodeURIComponent(classCode)}/roblox.csv?t=${esc(token)}">この表を CSV で保存</a></p>
<style>
 .rb-wrap { overflow-x:auto; margin:0 -18px; padding:0 18px; }
 .rb { min-width:${640 + extra.length * 90}px; font-size:13px; }
 .rb th { cursor:pointer; user-select:none; white-space:nowrap; } .rb th:hover { color:var(--ink); }
 .rb td:first-child { white-space:nowrap; }
 .rb tr.r { cursor:pointer; } .rb tr.flag td:first-child { border-left:3px solid #e27a2d; }
 .rb .mark { color:#e27a2d; } .rb .why { color:#9b3a2e; } .rb .tag { display:inline-block; font-size:11px; padding:1px 8px; border-radius:10px; background:#f3e0cf; color:#7a4a1c; margin-left:6px; }
 .rb tr.d td { background:var(--bg); } .rb .inner { font-size:13px; max-width:700px; }
</style>
<script>
(function(){
  var t=document.querySelector('table.rb'); if(!t) return;
  t.querySelectorAll('thead th').forEach(function(th){ th.addEventListener('click', function(){
    var k=th.dataset.k, n='n' in th.dataset, asc=th.dataset.asc!=='1'; th.dataset.asc=asc?'1':'0';
    var tb=t.tBodies[0], rows=[].slice.call(tb.querySelectorAll('tr.r'));
    rows.sort(function(a,b){ var x=a.dataset[k], y=b.dataset[k]; if(n){ x=Number(x); y=Number(y); return asc? y-x : x-y; } return asc? String(x).localeCompare(String(y),'ja') : String(y).localeCompare(String(x),'ja'); });
    rows.forEach(function(r){ tb.appendChild(r); tb.appendChild(r.nextElementSibling); });
  }); });
  t.addEventListener('click', function(e){ var r=e.target.closest('tr.r'); if(!r||e.target.tagName==='A') return; var d=r.nextElementSibling; if(d) d.hidden=!d.hidden; });
})();
</script></section>`;
}

export function classCsv(rows, { now = Date.now() } = {}) {
  const extra = classColumns(rows);
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const val = (row, key, period = 'week') => { const m = row.metrics.find((x) => x.key === key); const v = m ? m.values[period] : null; return v === null || v === undefined ? '' : Array.isArray(v) ? JSON.stringify(v) : v; };
  const head = ['username', 'name', 'registered', 'study_minutes_week', 'questions_week', 'accuracy_week', 'guess_rate_week', 'last_seen', 'streak_days', 'flags', ...extra.map((c) => `${c.key}_week`)];
  const lines = rows.map((row) => [
    row.username, row.name, row.registered ? 1 : 0, Math.round(num(val(row, 'study_seconds')) / 60), val(row, 'questions'), val(row, 'accuracy'), val(row, 'guess_rate'),
    row.lastSeen ? new Date(row.lastSeen).toISOString() : '', val(row, 'streak_days', 'all'), flagsOf(row, now).join(' / '), ...extra.map((c) => val(row, c.key, c.period)),
  ].map(q).join(','));
  return `﻿${head.join(',')}\n${lines.join('\n')}${lines.length ? '\n' : ''}`;
}
