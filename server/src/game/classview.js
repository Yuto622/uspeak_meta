// 教室のようす — オーナーが毎月開く1枚。利用継続率・はじめたばかりの子・声かけの結果・英検の準会場。
//
// **これは学習ツールの画面ではなく、経営の画面。** 子ども英語教室の月次継続率は業界平均で
// 93〜97%（97%超が優良、90%割れが不調）と言われるが、個人の教室は自分の数字を知らない。
// 月謝の台帳には「辞めた」は残っても、「いつから来なくなっていたか」は残らないから。
// ここは子どもが実際に答えた記録から、それを毎月出す。
//
// **在籍ではなく「来た」で数える。** 月謝を払っているかはこのサービスには分からない。
// 数えているのは「その月に1問でも答えた子」で、だから名前は**利用継続率**。
// 月謝の継続率より先に動く（来なくなってから退会届が出るまでには間がある）ので、
// 先に気づくための数字としてはこちらのほうが早い。
//
// **人数が少ない教室では1人で大きく動く。** 10人の教室の1人は10ポイント。だから率だけでなく
// 必ず「9 / 10 人」を並べて出す。
import { monthKey } from './months.js';
import { keyMinusMonth, labelOf, dayOfMonth, daysInMonth, monthsSinceStart, noticesFor } from './retention.js';
import { classExamPlan } from './eiken-ready.js';
import { classCallOutcomes, LOOK_BACK_DAYS } from './notes.js';

// 業界の目安（子ども英語教室の月次継続率）。出典は docs/uspeak-moat-2.md。
export const BENCH = { low: 93, high: 97 };
// 何か月ぶん並べるか。記録は13か月（今月＋12か月）なので、「前の月と比べる」ができるのは
// 完了した11か月ぶん。
export const TREND = 11;
// これより少ない人数の月は「1人で大きく動きます」と添える。
export const SMALL = 10;

const busy = (m) => !!m && ((Array.isArray(m.days) && m.days.length > 0) || m.answers > 0);

function monthsOf(record, sanitize) {
  if (record.months && typeof record.months === 'object') return record.months;
  return sanitize ? sanitize(record.months_json) : {};
}

const students = (records) => (records || []).filter((r) => r?.name && r.role !== 'teacher' && !r.moved_to);

// 月ごとの利用継続率。M の率 = 「M-1 に来た子のうち、M にも来た子」の割合。
export function continuation(records, { now = Date.now(), sanitize = null, trend = TREND } = {}) {
  const kids = students(records).map((r) => ({ name: r.name, months: monthsOf(r, sanitize) }));
  const here = monthKey(now);
  const rows = [];
  let key = keyMinusMonth(here);
  for (let i = 0; i < trend; i += 1) {
    const prev = keyMinusMonth(key);
    const base = kids.filter((k) => busy(k.months[prev]));
    const stayed = base.filter((k) => busy(k.months[key]));
    const joined = kids.filter((k) => busy(k.months[key]) && !busy(k.months[prev]));
    rows.push({
      key, label: labelOf(key), base: base.length, stayed: stayed.length, joined: joined.length,
      active: kids.filter((k) => busy(k.months[key])).length,
      rate: base.length ? Math.round((stayed.length / base.length) * 1000) / 10 : null,
    });
    key = prev;
  }
  rows.reverse();   // 古い月が左
  const known = rows.filter((r) => r.rate !== null);
  const latest = known.at(-1) || null;
  const last3 = known.slice(-3);
  const avg3 = last3.length ? Math.round((last3.reduce((s, r) => s + r.stayed, 0) / last3.reduce((s, r) => s + r.base, 0)) * 1000) / 10 : null;

  // 今月（途中）。**月の途中で「辞めた」とは言わない**：先月来ていて今月まだの子は、
  // 「まだ来ていない」として名前で出す（それが声をかける相手）。
  const prevKey = keyMinusMonth(here);
  const lastMonth = kids.filter((k) => busy(k.months[prevKey]));
  const notYet = lastMonth.filter((k) => !busy(k.months[here])).map((k) => k.name).sort();
  const current = {
    key: here, label: labelOf(here),
    through: Math.min(1, dayOfMonth(now) / daysInMonth(here)),
    active: kids.filter((k) => busy(k.months[here])).length,
    lastMonth: lastMonth.length, notYet,
  };
  return { rows, latest, avg3, current, bench: BENCH, small: SMALL };
}

export const benchWord = (rate) => (rate === null || rate === undefined ? null
  : rate > BENCH.high ? 'above' : rate >= BENCH.low ? 'within' : 'below');

// 在籍の長さ（最近2か月に来た子だけ）。**はじめて3か月以内がいちばん辞めやすい**
// （沈黙期。`retention.js` の頭）ので、そこを別に数える。
export function tenure(records, { now = Date.now(), sanitize = null } = {}) {
  const here = monthKey(now);
  const prev = keyMinusMonth(here);
  const out = { lt3: [], lt6: [], lt12: [], more: [] };
  for (const r of students(records)) {
    const months = monthsOf(r, sanitize);
    if (!busy(months[here]) && !busy(months[prev])) continue;
    const since = monthsSinceStart(months, { firstSeen: r.first_seen, now });
    const box = since < 3 ? 'lt3' : since < 6 ? 'lt6' : since < 12 ? 'lt12' : 'more';
    out[box].push(r.name);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

// ページに渡す形ぜんぶ。
export function classView(records, { classCode = '', now = Date.now(), sanitizeMonths = null, sanitizeReady = undefined } = {}) {
  return {
    classCode,
    madeAt: new Date(now).toISOString(),
    continuation: continuation(records, { now, sanitize: sanitizeMonths }),
    tenure: tenure(records, { now, sanitize: sanitizeMonths }),
    notices: noticesFor(students(records), { now, sanitize: sanitizeMonths, limit: 20 }),
    calls: classCallOutcomes(records, { now, sanitizeMonths: sanitizeMonths || ((x) => x || {}) }),
    exam: classExamPlan(records, sanitizeReady ? { sanitize: sanitizeReady } : {}),
    total: students(records).length,
  };
}

// ---- ページ ---------------------------------------------------------------------------

// **日付は日本時間で出す。** サーバーは UTC で動くので、何も言わないと 朝8時までの
// レポートは「前の日」の日付になる（教室も保護者も日本にいる）。
const JST = { timeZone: 'Asia/Tokyo' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const names = (list, max = 12) => (list.length ? esc(list.slice(0, max).join('、')) + (list.length > max ? ` ほか${list.length - max}人` : '') : '—');

// 折れ線（1系列）。**棒にしないのは、縦軸を0から始めないため**：継続率は80〜100%に
// 集まるので、0からの棒では差が見えない。棒の縦軸を切るのは嘘になるが、線なら正しい。
// 業界の目安は帯で置き、ホバーで各月の人数が読める（`<title>`、スクリプトなし）。
function trendSvg(rows) {
  const known = rows.filter((r) => r.rate !== null);
  if (known.length < 2) return '<p class="fine">折れ線は、2か月ぶん数えられるようになってから出ます。</p>';
  const W = 640; const H = 220; const L = 40; const R = 56; const T = 14; const B = 30;
  const lo = Math.max(0, Math.min(80, Math.floor(Math.min(...known.map((r) => r.rate)) / 5) * 5 - 5));
  const hi = 100;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, rows.length - 1);
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const ticks = [];
  for (let v = lo; v <= hi; v += (hi - lo) > 20 ? 10 : 5) ticks.push(v);
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}%</text>`).join('');
  const band = `<rect x="${L}" width="${W - L - R}" y="${y(BENCH.high)}" height="${y(BENCH.low) - y(BENCH.high)}" class="band"/>`
    + `<text x="${W - R + 6}" y="${(y(BENCH.high) + y(BENCH.low)) / 2 + 4}" class="bandlabel">業界平均</text>`;
  const pts = rows.map((r, i) => (r.rate === null ? null : [x(i), y(r.rate), r]));
  let d = '';
  for (const p of pts) { if (!p) continue; d += `${d ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`; }
  const dots = pts.filter(Boolean).map(([px, py, r]) => `<g class="pt"><circle cx="${px}" cy="${py}" r="11" class="hit"/><circle cx="${px}" cy="${py}" r="4.5" class="dot"/>`
    + `<title>${esc(r.label)}：${r.rate}%（先月来た ${r.base}人のうち ${r.stayed}人）</title></g>`).join('');
  const labels = rows.map((r, i) => (i % 2 === rows.length % 2 || i === rows.length - 1
    ? `<text x="${x(i)}" y="${H - 8}" class="tick" text-anchor="middle">${Number(r.key.slice(5))}月</text>` : '')).join('');
  const last = pts.filter(Boolean).at(-1);
  const end = last ? `<text x="${last[0] + 9}" y="${last[1] + 4}" class="endlabel">${last[2].rate}%</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="月ごとの利用継続率の折れ線。下の表に同じ数字があります。">${band}${grid}<path d="${d}" class="line"/>${dots}${end}${labels}</svg>`;
}

const STATUS = {
  above: { icon: '▲', word: '業界平均より上' },
  within: { icon: '●', word: '業界平均の範囲' },
  below: { icon: '▼', word: '業界平均より下' },
};

export function classHtml(v) {
  const c = v.continuation;
  const latest = c.latest;
  const status = latest ? STATUS[benchWord(latest.rate)] : null;
  const hero = latest
    ? `<div class="hero"><span>${esc(latest.label)}の利用継続率</span><b>${latest.rate}<small>%</small></b>
       <p>先月来た <b>${latest.base}人</b> のうち <b>${latest.stayed}人</b> が、この月も来ました。</p>
       <p class="status status-${benchWord(latest.rate)}">${status.icon} ${esc(status.word)}（${BENCH.low}〜${BENCH.high}%）${c.avg3 !== null ? ` · 直近3か月 ${c.avg3}%` : ''}</p>
       ${latest.base < SMALL ? '<p class="fine">人数が少ない月は、1人で大きく動きます。率より人数を見てください。</p>' : ''}</div>`
    : '<div class="hero"><span>利用継続率</span><b>—</b><p>2か月ぶんの記録がたまると出ます。</p></div>';
  const table = `<table class="nums"><thead><tr><th>月</th><th>先月来た</th><th>続けて来た</th><th>率</th><th>はじめて来た</th></tr></thead><tbody>${
    c.rows.filter((r) => r.base || r.joined).map((r) => `<tr><td>${esc(r.label)}</td><td>${r.base}人</td><td>${r.stayed}人</td><td>${r.rate === null ? '—' : `${r.rate}%`}</td><td>${r.joined}人</td></tr>`).join('')
    || '<tr><td colspan="5">まだ数えられる月がありません</td></tr>'}</tbody></table>`;
  const cur = c.current;
  const t = v.tenure;
  const N = v.notices;
  const said = { call: '● 声をかけましょう', watch: '○ 気にしておく', cheer: '✦ いいこと' };
  const notices = N.length ? `<ul class="list">${N.map((n) => `<li class="n-${esc(n.level)}"><b>${esc(said[n.level] || '')} ${esc(n.name)}</b><span>${esc(n.why)}</span></li>`).join('')}</ul>`
    : '<p class="fine">いま、とくに気になる子はいません。</p>';
  const k = v.calls;
  const calls = k.total
    ? `<p>この${Math.round(LOOK_BACK_DAYS / 30)}か月に声をかけた <b>${k.total}回</b> のうち、<b>${k.back}回</b> は ${k.days}日以内に その子が戻ってきました。${k.waiting ? `（${k.waiting}回は まだ${k.days}日たっていません）` : ''}</p>
       <p class="fine">声をかけたから戻った、とまでは言えません（比べる相手がいないため）。起きたことだけを数えています。</p>
       <ul class="list">${k.rows.slice(0, 10).map((r) => `<li class="c-${esc(r.result)}"><b>${esc(r.name)}</b><span>${esc(new Date(r.at).toLocaleDateString('ja-JP', JST))} · ${esc(r.why || '声かけ')} → ${r.result === 'back' ? `${r.after}日後に来ました` : r.result === 'waiting' ? 'まだ様子見' : `${k.days}日 来ていません`}</span></li>`).join('')}</ul>`
    : '<p class="fine">先生コンソールの「きょうの気づき」で「声をかけた」を押すと、ここに結果が出ます。</p>';
  const e = v.exam;
  const examRows = Object.entries(e.byGrade).reverse().map(([, g]) => `<tr><td><b>${esc(g.label)}</b><br><small>${esc(g.school)}</small></td><td>${g.ready.length}人<br><small>${names(g.ready)}</small></td><td>${g.close.length}人<br><small>${names(g.close)}</small></td></tr>`).join('');
  const examHead = e.open
    ? `<p class="status status-above">▲ <b>準会場を開ける人数です。</b> 練習で目安に届いた子が ${e.readyTotal}人（条件は ${e.min}人以上）。</p>`
    : e.likely
      ? `<p class="status status-within">● <b>あと一歩の子を合わせると ${e.outlook}人。</b> 準会場の条件（${e.min}人以上）に届く見込みです。いま目安に届いているのは ${e.readyTotal}人。</p>`
      : `<p class="status status-below">▼ いま目安に届いているのは ${e.readyTotal}人、あと一歩が ${e.closeTotal}人。準会場（${e.min}人以上）まで あと ${e.short}人です。</p>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>教室のようす · ${esc(v.classCode)} · U-Speak</title>
<style>
 :root { color-scheme: light; --ink:#22372f; --soft:#5d6d62; --paper:#fffaf0; --bg:#f4f1e3; --rule:#e5e0cc; --green:#173f38; --good:#2f6b3f; --warn:#8a5a12; --bad:#9b3a2e; }
 body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.7 system-ui, sans-serif; }
 header { background:var(--green); color:#f4f1e3; padding:22px 18px; }
 header div, main { max-width:760px; margin:0 auto; }
 header small { opacity:.75; letter-spacing:2px; font-size:11px; }
 header h1 { margin:4px 0 0; font-size:24px; }
 header p { margin:2px 0 0; font-size:13px; opacity:.85; }
 main { padding:20px 16px 60px; }
 section { background:var(--paper); border-radius:16px; padding:18px; margin:0 0 14px; border:1px solid var(--rule); }
 h2 { margin:0 0 8px; font-size:16px; }
 .hero span { font-size:13px; color:var(--soft); }
 .hero > b { display:block; font-size:56px; line-height:1.1; color:var(--green); }
 .hero > b small { font-size:24px; }
 .hero p { margin:4px 0 0; }
 .status { font-weight:600; }
 .status-above { color:var(--good); } .status-within { color:var(--ink); } .status-below { color:var(--bad); }
 .fine { font-size:12px; color:var(--soft); margin:6px 0 0; }
 svg { width:100%; height:auto; display:block; margin:10px 0 4px; }
 svg .grid { stroke:#e9e4d2; stroke-width:1; }
 svg .tick { font-size:11px; fill:var(--soft); font-variant-numeric:tabular-nums; }
 svg .band { fill:#dfe9dc; }
 svg .bandlabel { font-size:11px; fill:var(--soft); }
 svg .line { fill:none; stroke:var(--green); stroke-width:2; stroke-linejoin:round; stroke-linecap:round; }
 svg .dot { fill:var(--green); stroke:var(--paper); stroke-width:2; }
 svg .hit { fill:transparent; }
 svg .pt:hover .dot { r:6; }
 svg .endlabel { font-size:13px; font-weight:700; fill:var(--ink); }
 table { width:100%; border-collapse:collapse; font-size:14px; }
 th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--rule); vertical-align:top; font-weight:400; }
 th { font-size:12px; color:var(--soft); }
 .nums td:not(:first-child), .nums th:not(:first-child) { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
 details summary { cursor:pointer; font-size:13px; color:var(--soft); margin-top:8px; }
 .grid4 { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
 .grid4 div { background:var(--bg); border-radius:12px; padding:10px 12px; }
 .grid4 span { display:block; font-size:12px; color:var(--soft); }
 .grid4 b { font-size:22px; }
 .grid4 .warn { outline:2px solid #e8c98f; }
 .grid4 small { display:block; font-size:12px; color:var(--soft); }
 .list { list-style:none; margin:8px 0 0; padding:0; }
 .list li { padding:7px 0; border-bottom:1px solid var(--rule); display:flex; flex-wrap:wrap; gap:4px 10px; font-size:14px; }
 .list li span { color:var(--soft); }
 .n-call b, .c-away b { color:var(--bad); } .n-cheer b, .c-back b { color:var(--good); }
 footer { font-size:12px; color:var(--soft); margin-top:18px; }
 @media print { body { background:#fff; } section { break-inside:avoid; } header { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head><body>
<header><div><small>U-SPEAK LAB · 教室のようす</small><h1>クラス ${esc(v.classCode)}</h1>
<p>${esc(new Date(v.madeAt).toLocaleString('ja-JP', JST))} 時点 · 記録のある子 ${v.total}人</p></div></header>
<main>
<section>${hero}${trendSvg(c.rows)}
<details><summary>表で見る</summary>${table}</details>
<p class="fine">利用継続率＝前の月に1問でも答えた子のうち、その月にも答えた子の割合。月謝の在籍ではなく「来たかどうか」で数えています。</p></section>

<section><h2>${esc(cur.label)}（${Math.round(cur.through * 100)}%すぎたところ）</h2>
<p>今月来た子 <b>${cur.active}人</b>（先月は ${cur.lastMonth}人）。</p>
<p>先月来ていて、今月まだの子 <b>${cur.notYet.length}人</b>：${names(cur.notYet, 20)}</p>
<p class="fine">月の途中なので「辞めた」ではありません。声をかける相手の一覧です。</p></section>

<section><h2>はじめてからの長さ</h2>
<div class="grid4">
 <div class="warn"><span>3か月未満（沈黙期）</span><b>${t.lt3.length}人</b><small>${names(t.lt3, 6)}</small></div>
 <div><span>3〜6か月</span><b>${t.lt6.length}人</b></div>
 <div><span>6〜12か月</span><b>${t.lt12.length}人</b></div>
 <div><span>1年以上</span><b>${t.more.length}人</b></div>
</div>
<p class="fine">最初の3か月は、話さず・点も動かず、いちばん辞めやすい時期です。この時期の子は「きた日」と「といた問題」で見てください。最近2か月に来た子だけを数えています。</p></section>

<section><h2>きょうの気づき</h2>${notices}
<p class="fine">どれも「その子の先月」とくらべています。教室の中で子どもを順位づけはしていません。</p></section>

<section><h2>声かけの結果</h2>${calls}</section>

<section><h2>英検の準会場</h2>${examHead}
<table><thead><tr><th>級</th><th>練習で目安に届いた</th><th>あと一歩</th></tr></thead><tbody>${examRows}</tbody></table>
<p class="fine">島の練習問題（ふつう・きびしい判定）の直近20問で、5級・4級は「よむ・きく」、3級は「よむ・きく・かく」が7割以上なら「目安に届いた」。合格の予想ではなく、勧めるかどうかを決める材料です。1人は届いたいちばん上の級にだけ数えています。準会場は2〜5級の志願者が合わせて10人以上で開けます（日本英語検定協会）。</p></section>

<footer>この画面の数字は、すべて子どもが実際に答えた記録からサーバーが計算したものです。業界平均（月次継続率 ${BENCH.low}〜${BENCH.high}%）は子ども英語教室の一般的な目安です。<br>このリンクは教室の方だけにお使いください。子どもの名前が載っています。</footer>
</main></body></html>`;
}
