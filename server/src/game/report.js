// 保護者レポート — what one child has done, for the person at home.
//
// Roblox printed a QR that pointed at a Cloudflare Pages file. On the web there is no
// need for either: the report is served by this server, at a link the teacher hands out.
//
// The link carries a signature rather than a login, because a parent will open it once,
// on a phone, from a printout — and because a guessable link would show one family
// another family's child. The signature is an HMAC of the class and the name with a
// secret that never leaves the server, so a link cannot be edited into somebody else's.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { totalXp, xpToNext } from './progression.js';
import { ROOMS } from './town.js';

// Everything a parent sees is derived from the same record the game plays from, so a
// report can never disagree with the game.
export function reportFor(record, { now = Date.now() } = {}) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const level = Math.max(1, Math.floor(num(record.level) || 1));
  const xp = Math.max(0, Math.floor(num(record.xp)));
  const attempts = Math.max(0, Math.floor(num(record.attempts)));
  const correct = Math.min(attempts, Math.max(0, Math.floor(num(record.correct))));
  const parse = (json, fallback) => { try { return JSON.parse(json); } catch { return fallback; } };
  const dex = parse(record.dex_json, []);
  const garage = parse(record.garage_json, []);
  const room = parse(record.room_json, null);
  const pet = parse(record.pet_json, null);
  const missions = parse(record.missions_json, []);
  return {
    name: record.name,
    classCode: record.class,
    level,
    xp,
    need: xpToNext(level),
    totalXp: totalXp({ level, xp }),
    correct,
    attempts,
    // A percentage of nothing is not zero per cent, it is nothing yet.
    accuracy: attempts ? Math.round((correct / attempts) * 100) : null,
    phrases: Math.max(0, Math.floor(num(record.chats))),
    coins: Math.max(0, Math.floor(num(record.coins))),
    errands: Array.isArray(missions) ? missions.length : 0,
    fishKinds: Array.isArray(dex) ? dex.length : 0,
    vehicles: Array.isArray(garage) ? garage.length : 0,
    // Blocks are stacked on the plaza and furniture stands in the room; a save from
    // before the two were separated kept its blocks under `blocks`.
    blocks: Array.isArray(room?.plaza?.blocks) ? room.plaza.blocks.length : Array.isArray(room?.blocks) ? room.blocks.length : 0,
    furniture: Array.isArray(room?.furniture) ? room.furniture.length : 0,
    house: (ROOMS.find((r) => r.tier === Number(room?.tier)) || ROOMS[0]).name,
    pet: pet && pet.name ? { name: pet.name, en: pet.en || '', level: Math.max(1, Math.floor(num(pet.xp) / 25) + 1) } : null,
    lapBest: Math.max(0, Math.floor(num(record.lap_best))),
    streak: Math.max(0, Math.floor(num(record.login_streak))),
    lastSeen: record.last_seen || record.updated_at || '',
    madeAt: new Date(now).toISOString(),
  };
}

export function signReport(secret, classCode, name) {
  return createHmac('sha256', secret).update(`${classCode}|${name}`).digest('base64url').slice(0, 24);
}

export function verifyReport(secret, classCode, name, token) {
  const want = Buffer.from(signReport(secret, classCode, name));
  const got = Buffer.from(String(token || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

export const reportPath = (secret, classCode, name) =>
  `/report/${encodeURIComponent(classCode)}/${encodeURIComponent(name)}?t=${signReport(secret, classCode, name)}`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One page, no scripts, no fonts, no third parties: it opens on any phone in a corridor
// with one bar of signal, and it carries nothing that could track the family.
export function reportHtml(r, { token = '' } = {}) {
  const row = (label, value, note = '') => value === null || value === undefined || value === '' ? ''
    : `<tr><th>${esc(label)}</th><td><b>${esc(value)}</b>${note ? ` <small>${esc(note)}</small>` : ''}</td></tr>`;
  const seen = r.lastSeen ? new Date(r.lastSeen).toLocaleDateString('ja-JP') : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(r.name)} さんの学習レポート · U-Speak</title>
<style>
 :root { color-scheme: light; }
 body { margin: 0; background: #f4f1e3; color: #22372f; font: 16px/1.7 system-ui, sans-serif; }
 main { max-width: 620px; margin: 0 auto; padding: 24px 18px 60px; }
 header { background: #173f38; color: #f4f1e3; padding: 22px 18px; }
 header div { max-width: 620px; margin: 0 auto; }
 header small { opacity: .75; letter-spacing: 2px; font-size: 11px; }
 header h1 { margin: 4px 0 0; font-size: 24px; }
 header p { margin: 2px 0 0; font-size: 13px; opacity: .85; }
 .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 18px 0; }
 .card { background: #fffaf0; border-radius: 16px; padding: 14px 16px; }
 .card span { display: block; font-size: 12px; color: #5d6d62; }
 .card b { font-size: 26px; }
 table { width: 100%; border-collapse: collapse; background: #fffaf0; border-radius: 16px; overflow: hidden; }
 th, td { text-align: left; padding: 11px 16px; border-bottom: 1px solid #ece7d4; font-weight: 400; }
 th { color: #5d6d62; font-size: 14px; width: 45%; }
 tr:last-child th, tr:last-child td { border-bottom: 0; }
 small { color: #7b8a7f; }
 footer { margin-top: 22px; font-size: 12px; color: #7b8a7f; }
 /* 紙にするボタン。冷蔵庫に貼る用の一枚は、画面とは別に組んである（LaTeX）。 */
 .save { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 4px; }
 .save a { flex: 1 1 200px; display: block; text-align: center; text-decoration: none;
   padding: 14px 16px; border-radius: 14px; font-weight: 700; }
 .save a.pdf { background: #173f38; color: #f4f1e3; }
 .save a.tex { background: #fffaf0; color: #22372f; border: 1px solid #e0dcc6; font-weight: 600; }
 .save + p { margin: 8px 2px 0; font-size: 12px; color: #7b8a7f; }
 /* 印刷するときは、ボタンそのものは要らない。 */
 @media print {
   body { background: #fff; }
   header { background: #173f38 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
   .save, .save + p { display: none; }
 }
</style></head><body>
<header><div><small>U-SPEAK LAB</small><h1>${esc(r.name)} さんの学習レポート</h1>
<p>クラス ${esc(r.classCode)}${seen ? ` · さいごに あそんだ日 ${esc(seen)}` : ''}</p></div></header>
<main>
 <div class="cards">
  <div class="card"><span>レベル</span><b>${r.level}</b></div>
  <div class="card"><span>ためた XP</span><b>${r.totalXp.toLocaleString()}</b></div>
  ${r.accuracy === null ? '' : `<div class="card"><span>英語の正解率</span><b>${r.accuracy}%</b></div>`}
 </div>
 <table>
  ${row('英語の問題', `${r.correct} / ${r.attempts} 問`, '正解 / 挑戦')}
  ${row('英語で話した回数', `${r.phrases} 回`)}
  ${row('おつかい', r.errands ? `${r.errands} 件 たっせい` : '')}
  ${row('つかまえた魚の種類', r.fishKinds ? `${r.fishKinds} 種` : '')}
  ${row('のりもの', r.vehicles ? `${r.vehicles} 台` : '')}
  ${row('コースの自己ベスト', r.lapBest ? `${(r.lapBest / 1000).toFixed(1)} 秒` : '')}
  ${row('つくった部屋', r.blocks || r.furniture ? `${r.house}・かぐ ${r.furniture} こ・ひろばの ブロック ${r.blocks} こ` : '')}
  ${row('ペット', r.pet ? `${r.pet.name}（Lv.${r.pet.level}）` : '')}
  ${row('れんぞくログイン', r.streak ? `${r.streak} 日` : '')}
  ${row('もっているコイン', `◈ ${r.coins.toLocaleString()}`)}
 </table>
 <div class="save">
  <a class="pdf" href="?t=${esc(token)}&amp;format=pdf">📄 デザインされた PDF をひらく</a>
  <a class="tex" href="?t=${esc(token)}&amp;format=tex" download>LaTeX のファイル (.tex)</a>
 </div>
 <p>PDF は A4・2ページ（表紙と、ぜんぶの記録）。印刷して持ち帰れます。</p>
 <footer>この数字はすべて、お子さんが実際に答えた記録からサーバーが計算したものです。<br>
 ${esc(new Date(r.madeAt).toLocaleString('ja-JP'))} 時点。</footer>
</main></body></html>`;
}

// A server without a TeX engine still has to answer the button. This says what happened,
// hands over the .tex, and gives the one command that fixes it — rather than a 500.
export function reportNoLatexHtml(r, { token = '', backUrl = '', failed = false } = {}) {
  const back = esc(String(backUrl || '').replace(/([?&])format=pdf&?/, '$1').replace(/[?&]$/, ''));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>PDF を作れませんでした · U-Speak</title>
<style>
 body { margin: 0; background: #f4f1e3; color: #22372f; font: 16px/1.8 system-ui, sans-serif; }
 main { max-width: 620px; margin: 0 auto; padding: 28px 18px 60px; }
 h1 { font-size: 21px; margin: 0 0 6px; }
 a.button { display: block; text-align: center; text-decoration: none; padding: 14px 16px;
   border-radius: 14px; background: #173f38; color: #f4f1e3; font-weight: 700; margin: 14px 0; }
 a.plain { color: #2f6b7f; }
 pre { background: #fffaf0; border-radius: 12px; padding: 12px 14px; overflow-x: auto; font-size: 13px; }
 p.fine { font-size: 13px; color: #5d6d62; }
</style></head><body><main>
<h1>${failed ? 'PDF を作るのに失敗しました' : 'このサーバーには LaTeX が入っていません'}</h1>
<p class="fine">${failed
    ? 'レポートの中身に問題はありません。組版だけが うまくいきませんでした。'
    : 'PDF は LaTeX（XeLaTeX）で組んでいます。サーバーに入っていないと、ここで作れません。'}</p>
<a class="button" href="?t=${esc(token)}&amp;format=tex" download>LaTeX のファイル (.tex) をダウンロード</a>
<p class="fine">このファイルだけで組めます（画像も外部ファイルもありません）。手もとで:</p>
<pre>xelatex ${esc(r.name)}.tex</pre>
<p class="fine">サーバーに入れる場合（Ubuntu / Debian）:</p>
<pre>apt-get install -y --no-install-recommends \\
  texlive-xetex texlive-lang-japanese texlive-lang-chinese fonts-noto-cjk</pre>
<p class="fine">いますぐ紙にするなら、レポートの画面から ブラウザーの「印刷」→「PDF に保存」でも きれいに出ます。</p>
<p><a class="plain" href="${back}">← レポートに もどる</a></p>
</main></body></html>`;
}
