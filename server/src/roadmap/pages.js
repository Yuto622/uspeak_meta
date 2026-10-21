// 先生の /class の「🗺 ロードマップ」の 表：クラス全員の 段階・次までの 残り・今週の 学習日数・英検の 見込み。
// 段階は 1 人ずつ 手で かえられる（POST /class/:classCode/roadmap。署名は /class と 同じ）。
import { STAGE_IDS } from '../game/roadmap.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function roadmapClassHtml(list, { classCode, token, saved = '' }) {
  if (!list.length) return '';
  const action = `/class/${encodeURIComponent(classCode)}/roadmap`;
  const left = (r) => {
    const bits = [];
    if (r.words.left) bits.push(`単語 あと ${r.words.left} こ`);
    if (r.quiz.left) bits.push(`クイズ あと ${r.quiz.left} 問`);
    else if (r.quiz.acc !== null && r.quiz.acc < r.quiz.rate) bits.push(`正解率 ${r.quiz.acc}%（あと ${r.quiz.streakNeed} 問 正解）`);
    return r.ready ? '<b style="color:#2f8f5b">進める（次に ひらいた とき）</b>' : bits.length ? esc(bits.join('・')) : '—';
  };
  const chance = (c) => (!c ? '' : c.chance === null ? `<small>英検${esc(c.ja)} まだ</small>` : `英検${esc(c.ja)} <b>${c.chance}%</b>`);
  const rows = list.map((r) => `<tr>
  <td>${esc(r.name)}${r.username && r.username !== r.name ? `<br><small>${esc(r.username)}</small>` : ''}</td>
  <td style="font-size:18px;font-weight:900;text-align:center">${esc(r.stage.id)}</td><td>${esc(r.stage.ja)}<br><small>${esc(r.stage.gradeJa)}</small></td>
  <td>${left(r)}</td><td style="text-align:center">${r.weekDays} 日</td><td>${chance(r.eiken)}</td>
  <td><form method="post" action="${action}" style="display:flex;gap:4px;margin:0"><input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="name" value="${esc(r.name)}">
  <select name="stage">${STAGE_IDS.map((id) => `<option${id === r.stage.id ? ' selected' : ''}>${id}</option>`).join('')}</select><button>かえる</button></form></td></tr>`).join('');
  return `<section id="roadmap" style="margin:16px 0;padding:14px 16px;border-radius:14px;background:#fff;border:1px solid #eadfcd">
<h2 style="margin:0 0 6px;font-size:18px">🗺 ロードマップ</h2>
<p style="margin:0 0 8px;font-size:13px;color:#6e665c">次の 段階に 進む 条件：その 段階の 単語の 8 割を 覚えた（2 日以上に 分けて 3 回 つづけて 正解）＋ その 段階で その 級の クイズ 20 問 以上・正解率 8 割。Roblox と Web の 答えの 両方から 計算します。
段階の 名前・単語・はじめの 段階は 管理画面（/admin/roadmap）で。${saved ? `<br><b style="color:#2f8f5b">${esc(saved)}</b>` : ''}</p>
<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
<thead><tr style="background:#1b3a2f;color:#fff"><th style="text-align:left;color:#fff;padding:5px">名前</th><th style="color:#fff;padding:5px">段階</th><th style="text-align:left;color:#fff;padding:5px">中身</th><th style="text-align:left;color:#fff;padding:5px">次まで</th><th style="color:#fff;padding:5px">今週の 学習日</th><th style="text-align:left;color:#fff;padding:5px">英検の 見込み</th><th style="text-align:left;color:#fff;padding:5px">段階を かえる</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p style="margin:6px 0 0;font-size:12px;color:#6e665c">英検の 見込みは 島の 練習問題の 正解・不正解と 協会の 公開している 一次試験の 問題数・合格の 目安から 計算した 目安です（作文・面接は ふくみません）。</p></section>`;
}
