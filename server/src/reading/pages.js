// よみもの島の 数字を 出す 小さな HTML：保護者レポートの いちばん 上（数字 5 つ・進み具合の バー・よんだ 本）と、/class の 表。
// 数字は ぜんぶ 呼ぶ 側が わたす（ここは ならべるだけ）。色は 保護者レポートの ブランド（深緑・オレンジ・クリーム）。
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TOP_CSS = `
.five{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0 8px}
.five div{background:#173f38;color:#f4f1e3;border-radius:14px;padding:10px 6px;text-align:center}
.five span{display:block;font-size:11px;opacity:.82;line-height:1.3}.five b{display:block;font-size:22px;line-height:1.25}.five small{font-size:11px;color:#cfe3d8}
.pbar{background:#fffaf0;border:1px solid #ece7d4;border-radius:14px;padding:12px 14px;margin:8px 0}
.pbar .ends{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13px;color:#5d6d62}.pbar .ends b{font-size:17px;color:#173f38}
.pbar .track{height:14px;border-radius:7px;background:#e8eeea;overflow:hidden;margin:6px 0}.pbar .track i{display:block;height:100%;border-radius:7px;background:linear-gradient(90deg,#2f8f5b,#e27a2d)}
.pbar p{margin:0;font-size:13px;color:#22372f}
.books{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;margin:8px 0}
.books figure{margin:0;background:#fffaf0;border:1px solid #ece7d4;border-radius:12px;padding:6px;text-align:center}
.books img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#f3ead6;display:block}
.books figcaption{font-size:12px;line-height:1.35;margin-top:4px;color:#22372f}.books figcaption small{display:block;font-size:11px;color:#7b8a7f}
@media (max-width:480px){.five{grid-template-columns:repeat(3,1fr)}}
`;

// five = { minutes, speak, books, accuracy(null＝まだ), words, wordsNew? }。label は「今週」「今月」「はじめてから」。
export function fiveHtml(five, { label = '' } = {}) {
  if (!five) return '';
  const cell = (name, value, unit) => `<div><span>${esc(name)}</span><b>${esc(value)}</b><small>${esc(unit)}</small></div>`;
  return `<div class="five" aria-label="${esc(label)}の 数字">
${cell('学習時間', five.minutes ?? 0, '分')}${cell('話した 回数', five.speak ?? 0, '回')}${cell('読んだ 本', five.books ?? 0, 'さつ')}${cell('クイズの 正答率', five.accuracy === null || five.accuracy === undefined ? '—' : five.accuracy, five.accuracy === null || five.accuracy === undefined ? 'これから' : '%')}${cell('覚えた 単語', five.words ?? 0, five.wordsNew ? `こ（+${five.wordsNew}）` : 'こ')}</div>`;
}
export function barHtml(bar) {
  if (!bar) return '';
  return `<div class="pbar"><div class="ends"><span>いま <b>段階 ${esc(bar.from)}</b>「${esc(bar.fromJa)}」</span>${bar.last ? '<span>🏁 ゴール</span>' : `<span>つぎ <b>段階 ${esc(bar.to)}</b></span>`}</div>
<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(bar.pct) || 0}"><i style="width:${Math.max(2, Number(bar.pct) || 0)}%"></i></div><p>${bar.last ? '' : 'あと：'}${esc(bar.left)}</p></div>`;
}
// list = [{ id, title, titleJa?, cover? }]
export function booksHtml(list, { title = '📚 よんだ 本' } = {}) {
  if (!Array.isArray(list) || !list.length) return '';
  const safe = (id) => (/^rd-[A-Za-z0-9-]{1,40}$/.test(String(id)) ? `/reading-art/${id}/0.svg?still=1` : '');
  return `<h3 class="sub" style="margin:14px 0 4px;font-size:14px;color:#5d6d62">${esc(title)}</h3><div class="books">${list.slice(0, 8).map((b) => `<figure>${(b.cover || safe(b.id)) ? `<img src="${esc(b.cover || safe(b.id))}" alt="" loading="lazy">` : ''}<figcaption>${esc(b.title)}${b.titleJa ? `<small>${esc(b.titleJa)}</small>` : ''}</figcaption></figure>`).join('')}</div>`;
}

// /class の 表：よみもの島（✓ の 冊数・読んだ 語数・さいごに 読んだ 本）。rows = [{ name, books, words, last }]
export function readingClassHtml(rows) {
  const list = (rows || []).filter((r) => r && (r.books || r.last));
  if (!list.length) return '';
  const day = (ms) => (ms ? new Date(ms + 9 * 3600e3).toISOString().slice(5, 10).replace('-', '/') : '');
  return `<section id="reading" style="margin:22px 0"><h2 style="font-size:18px;margin:0 0 8px">📚 よみもの島（えほん）</h2>
<table style="width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:14px"><thead><tr style="background:#173f38;color:#fff;text-align:left"><th style="padding:8px 10px">名前</th><th style="padding:8px 10px">よんだ 本（✓）</th><th style="padding:8px 10px">よんだ 語数</th><th style="padding:8px 10px">さいごに 読んだ 本</th></tr></thead><tbody>
${list.sort((a, b) => b.books - a.books || String(a.name).localeCompare(String(b.name), 'ja')).map((r) => `<tr style="border-bottom:1px solid #ece7d4"><td style="padding:8px 10px">${esc(r.name)}</td><td style="padding:8px 10px"><b>${r.books}</b> さつ</td><td style="padding:8px 10px">${Number(r.words || 0).toLocaleString()} 語</td><td style="padding:8px 10px">${r.last ? `${esc(r.last.title)}${r.last.done ? ' ✓' : '（とちゅう）'} <small style="color:#7b8a7f">${esc(day(r.last.at))}</small>` : '—'}</td></tr>`).join('')}
</tbody></table><p style="font-size:12px;color:#7b8a7f;margin:6px 2px 0">✓ は「きく・よむ・クイズ 8 わり」。語数は ✓ に なった 本の 合計です。</p></section>`;
}
