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
import { recentMonths } from './months.js';
import { lastYear, monthsInARow, monthsSinceStart } from './retention.js';
import { sanitizeReady, readinessOf, SCHOOL, LABEL as GRADE_LABEL, GRADES } from './eiken-ready.js';
import { sanitizeNotes, sharedNotes } from './notes.js';
import { sanitizeSkills, weakestOf } from './skills.js';

// 月ごとの記録は保存の中では文字列。壊れていたら空に落とす（months.js の sanitize と
// 同じ約束で、読めない月のせいでレポート全体が出ないほうが保護者にとっては悪い）。
function sanitizeForReport(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); } catch { return {}; }
}

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
  // 月ごとの記録は下で3回読むので、1回だけ読んでおく。
  const months = sanitizeForReport(record.months_json);
  const notes = sanitizeNotes(record.notes_json);
  let skills = null;
  try { skills = sanitizeSkills(JSON.parse(record.skills_json || 'null')); } catch { skills = sanitizeSkills(null); }
  // まだ何も答えていない子に「いちばん少ないのは◯◯」と言っても意味がない（全部0）。
  const weak = Object.values(skills).some((x) => x.a > 0) ? weakestOf(skills) : null;
  const first = Date.parse(record.first_seen || '');
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
    // **今月のまとめと、その前の月。** 累計（上の行）だけでは、3年つづけた子と
    // 3年前に3か月だけやった子が同じ数字に見える。保護者が毎月受け取って意味が
    // あるのはこちらで、累計からは引き算できない。
    months: recentMonths(months, 6, { now }),
    // **13か月ぶん持っているのは、これを出すため。** 4月に「去年の4月」と並べられる。
    // 1年たっていない子には出さない（無い数字は出さない）。
    lastYear: lastYear(months, { now }),
    // 何か月つづけているか。**日の連続ではなく、答えた月の連続**。
    // 週1〜2回の教室の子に毎日の連続を求めるのは設計のまちがいだし、
    // 「連続が切れる」で煽ると、続けること自体が目的になる（`docs/uspeak-retention.md`）。
    inARow: monthsInARow(months, { now }),
    lastSeen: record.last_seen || record.updated_at || '',
    madeAt: new Date(now).toISOString(),
    // **英検の目安。** 島の練習問題の直近の正解率から、級ごとに「練習で目安に届いているか」。
    // 合格の予想ではない（`eiken-ready.js` の頭）。
    exam: readinessOf(sanitizeReady(record.eiken_json)),
    // 先生が「保護者に見せる」を付けた所見だけ。**付けていないものは、ここに来ない。**
    notes: sharedNotes(notes),
    // はじめた日と、そこからの長さ。学習の記録証と面談で使う。
    firstSeen: Number.isFinite(first) ? new Date(first).toISOString() : '',
    since: monthsSinceStart(months, { firstSeen: record.first_seen, now }),
    studyDays: Math.max(0, Math.floor(num(record.study_days))),
    studyMinutes: Math.round(Math.max(0, num(record.study_ms)) / 60000),
    // いちばん練習の少ない技能。面談で「次はここ」と言うため。
    weakest: weak ? { ja: weak.ja, attempts: weak.attempts } : null,
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

// クラスぜんぶを1枚の CSV にする口。**子ども1人ぶんの署名とは別の文字を混ぜる**ので、
// 1人ぶんのリンクをクラス全員ぶんに読み替えることはできない。
export function signExport(secret, classCode) {
  return createHmac('sha256', secret).update(`export|${classCode}`).digest('base64url').slice(0, 24);
}

export function verifyExport(secret, classCode, token) {
  const want = Buffer.from(signExport(secret, classCode));
  const got = Buffer.from(String(token || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

// 教室のようす（オーナー向け）。**CSV とも1人ぶんとも別の文字を混ぜる**ので、
// どちらのリンクもこのページには読み替えられない。
export function signClass(secret, classCode) {
  return createHmac('sha256', secret).update(`class|${classCode}`).digest('base64url').slice(0, 24);
}

export function verifyClass(secret, classCode, token) {
  const want = Buffer.from(signClass(secret, classCode));
  const got = Buffer.from(String(token || ''));
  return want.length === got.length && timingSafeEqual(want, got);
}

export const classPath = (secret, classCode) =>
  `/class/${encodeURIComponent(classCode)}?t=${signClass(secret, classCode)}`;

export const exportPath = (secret, classCode) =>
  `/export/${encodeURIComponent(classCode)}.csv?t=${signExport(secret, classCode)}`;

// 教室が自分の記録を持ち出すための CSV。**出せるほうが導入されやすく、実際には誰も
// 出ていかない。** 「うちの記録なのに取り出せない」と思わせないことのほうが大事。
//
// Excel の日本語版は UTF-8 の CSV を Shift_JIS だと思って開く（名前が化ける）ので、
// **先頭に BOM を付ける**。付けるだけで Excel・Numbers・Google スプレッドシートの
// どれでも読める。
export function classCsv(records, { now = Date.now() } = {}) {
  const head = ['なまえ', 'レベル', '累計XP', '正解', '挑戦', '正答率', 'コイン',
    '学習時間(分)', '学習日数', 'さいごにあそんだ日',
    '今月きた日', '今月の問題', '今月の正解', '今月の時間(分)',
    // ここから後ろは足した列（前の列の意味は変えない）。
    'はじめた日', '今月おうちの日', '英検の目安（届いた級）', '次にめざす級', '先生のメモ'];
  const cell = (v) => {
    let t = String(v ?? '');
    // **数式として読まれないように。** 先生のメモや名前が `=` `+` `-` `@` で始まると、
    // Excel はそれを式として実行する（CSV インジェクション）。先頭に ' を付けて文字にする。
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /["\r\n,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = records
    // **引っ越した記録は出さない**（`moved_to` のある行は新しいクラスに同じ子がいる）。
    .filter((r) => r && r.name && r.role !== 'teacher' && !r.moved_to)
    .map((record) => ({ record, r: reportFor(record, { now }) }))
    .sort((a, b) => (a.r.name < b.r.name ? -1 : 1))
    .map(({ record, r }) => {
      const m = (r.months || []).find((x) => x.current) || null;
      const minutes = Math.round((Number(record.study_ms) || 0) / 60000);
      return [r.name, r.level, r.totalXp, r.correct, r.attempts,
        r.accuracy === null ? '' : `${r.accuracy}%`, r.coins,
        minutes, Math.max(0, Math.floor(Number(record.study_days) || 0)),
        r.lastSeen ? new Date(r.lastSeen).toISOString().slice(0, 10) : '',
        m ? m.days : 0, m ? m.answers : 0, m ? m.correct : 0, m ? m.minutes : 0,
        r.firstSeen ? r.firstSeen.slice(0, 10) : '', m ? m.home : 0,
        r.exam.best ? GRADE_LABEL[r.exam.best] : '', r.exam.aim ? GRADE_LABEL[r.exam.aim] : '',
        // **メモは全部出す**（保護者に見せないものも）。教室が書いたものは教室のもの。
        sanitizeNotes(record.notes_json).map((n) => `${n.at.slice(0, 10)} ${n.kind === 'call' ? '[声かけ] ' : ''}${n.text}`).join(' / ')];
    });
  // BOM + CRLF。Excel はこの2つが揃っていると素直に開く。
  return '\ufeff' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const reportPath = (secret, classCode, name) =>
  `/report/${encodeURIComponent(classCode)}/${encodeURIComponent(name)}?t=${signReport(secret, classCode, name)}`;

// **日付は日本時間で出す。** サーバーは UTC で動くので、何も言わないと 朝8時までの
// レポートは「前の日」の日付になる（教室も保護者も日本にいる）。
const JST = { timeZone: 'Asia/Tokyo' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One page, no scripts, no fonts, no third parties: it opens on any phone in a corridor
// with one bar of signal, and it carries nothing that could track the family.
// 今月の箱と、その前の月の並び。**まだ何もしていない子には出さない**（0が並んだ
// 枠は、保護者に「今月は何もしていません」と言うのと同じで、言うなら文で言うべき）。
function monthBlock(r) {
  const months = Array.isArray(r.months) ? r.months : [];
  const now = months.find((m) => m.current);
  const past = months.filter((m) => !m.current).slice(0, 5);
  if (!now && !past.length) return '';
  const cell = (label, value) => `<li><span>${esc(label)}</span><b>${esc(value)}</b></li>`;
  const head = now
    ? `<div class="month"><h2>${esc(now.label)}のまとめ</h2>
       <p>この1か月にやったこと</p><ul>
       ${cell('きた日', `${now.days} 日`)}
       ${cell('といた問題', `${now.answers} 問`)}
       ${now.accuracy === null ? '' : cell('正解率', `${now.accuracy}%`)}
       ${cell('学習した時間', `${now.minutes} 分`)}
       </ul>${homeLine(now)}</div>`
    : '<div class="month"><h2>今月はまだこれからです</h2><p>先月までの記録はこちら。</p></div>';
  if (!past.length) return head;
  // **ぜんぶ 0 の列は出さない。** 学習時間を数えはじめる前の月はどうやっても 0 分で、
  // 並べると「先月は1分もやっていない」と読めてしまう。無い数字は出さないほうが正しい。
  const showMinutes = past.some((m) => m.minutes > 0);
  const rows = past.map((m) => `<tr><td>${esc(m.label)}</td><td>${m.days} 日</td><td>${m.answers} 問</td>`
    + `<td>${m.accuracy === null ? '—' : `${m.accuracy}%`}</td>`
    + (showMinutes ? `<td>${m.minutes} 分</td>` : '') + '</tr>').join('');
  return `${head}${lastYearLine(r)}<table class="past"><thead><tr><th>それまでの月</th><th>きた日</th><th>問題</th><th>正解率</th>`
    + (showMinutes ? '<th>時間</th>' : '') + `</tr></thead><tbody>${rows}</tbody></table>`;
}

// **去年の同じ月とくらべる。** 月ごとの記録を13か月ぶん持っているのは、
// 4月に「去年の4月」を出せるようにするため。1年たった子にしか出ない行で、
// **1年つづけた教室にしか出せない画面**でもある。
//
// 数字だけ並べても読めないので、**1文にして**から出す。「7問ふえました」のような
// 差だけだと、減っていたときに責める文になるので、増えた／同じくらい／
// 「去年もがんばっていました」の3通りに言い分ける。
function lastYearLine(r) {
  const y = r.lastYear;
  const now = (Array.isArray(r.months) ? r.months : []).find((m) => m.current);
  if (!y || !now) return '';
  const dd = now.days - y.days;
  const words = [];
  if (dd >= 2) words.push(`きた日が ${dd}日 ふえました`);
  else if (dd <= -2) words.push('きた日は 去年のほうが 多い月でした');
  else words.push('きた日は 去年と 同じくらいです');
  if (y.accuracy !== null && now.accuracy !== null) {
    const da = now.accuracy - y.accuracy;
    if (da >= 5) words.push(`正解率は ${da}ポイント 上がりました`);
    else if (da <= -5) words.push('正解率は 去年のほうが 高い月でした');
    else words.push('正解率は 去年と 同じくらいです');
  }
  return `<p class="ago"><b>${esc(y.label)}とくらべて</b> ${esc(words.join('。'))}。
    <small>（${esc(y.label)}：${y.days}日・${y.answers}問${y.accuracy === null ? '' : `・正解率${y.accuracy}%`}）</small></p>`;
}

// おうちの日。**教室の時間のほかに、自分でひらいた日**（サーバーが部屋に先生がいたかで決める）。
// 塾が始まって教室に来にくくなっても、ここが残っていれば続けられている。
function homeLine(m) {
  const n = Math.max(0, Math.floor(Number(m?.home) || 0));
  if (!n) return '';
  return `<p class="home">そのうち <b>${n}日</b> は、教室の時間のほかに 自分でひらいた日です。</p>`;
}

// 学校の英語につなげる1文。**英検協会の各級の目安**（5級＝中学初級程度…）を使う。
// 高学年の保護者から出てくる「これは何につながるの？」への、学校の言葉での答え。
function schoolLine(r) {
  const now = (Array.isArray(r.months) ? r.months : []).find((m) => m.current);
  if (!now?.eg) return '';
  const parts = GRADES.filter((g) => now.eg[g] > 0).reverse()
    .map((g) => `${SCHOOL[g]}の英語（英検${GRADE_LABEL[g]}）の問題に ${now.eg[g]}問`);
  if (!parts.length) return '';
  return `<p class="school">📘 ${esc(now.label)}は、${esc(parts.join('、'))} 正解しました。</p>`;
}

// 英検の目安。練習した級だけ、上の級から。
const EXAM_SAID = { ready: '練習で 目安に届いています', close: 'あと一歩', practice: '練習中' };
function examBlock(r) {
  const grades = (r.exam?.grades || []).filter((g) => g.status !== 'none').reverse();
  if (!grades.length) return '';
  const row = (g) => {
    const why = g.status === 'close' && g.missing.length ? `（${g.missing.join('・')}）` : '';
    const detail = g.skills.map((s) => `${s.label} ${s.n ? `${s.acc}%` : '—'}`).join(' · ');
    return `<tr><th>英検${esc(g.label)}<small>${esc(g.school)}</small></th><td><b class="ex-${esc(g.status)}">${esc(EXAM_SAID[g.status])}${esc(why)}</b><small>${esc(detail)}</small></td></tr>`;
  };
  return `<h3 class="sub">英検の目安</h3><table class="exam">${grades.map(row).join('')}</table>
  <p class="fine">島の練習問題の直近20問の正解率です（やさしい判定の答えは数えていません）。合格の予想ではなく、受ける級を先生と相談するときの目安です。</p>`;
}

function notesBlock(r) {
  if (!r.notes?.length) return '';
  return `<div class="notes"><h3 class="sub">先生から</h3>${r.notes.map((n) => `<p><small>${esc(new Date(n.at).toLocaleDateString('ja-JP', JST))}</small>${esc(n.text).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
}

// 面談で先生が話すこと。**数字を並べるのではなく、言える文にしてから出す。**
// 並べる順は「続けていること → 今月 → 去年 → おうち → 英検 → 次にやること」。
// 良い話から始めて、最後に「次」で終える（責める面談にしない）。
export function talkingPoints(r) {
  const out = [];
  const months = Array.isArray(r.months) ? r.months : [];
  const now = months.find((m) => m.current);
  const prev = months.find((m) => !m.current);
  if (r.inARow >= 2) out.push(`${r.inARow >= 14 ? '1年以上' : `${r.inARow}か月`}、毎月つづけて来ています。`);
  else if (r.since >= 1) out.push(`はじめて ${r.since}か月です。${r.since < 3 ? '最初の3か月は、話さず点も動かない「沈黙期」で、ここを越えると伸びが見えはじめます。' : ''}`);
  if (now && prev) {
    const dd = now.days - prev.days;
    out.push(`${now.label}は ${now.days}日・${now.answers}問（${prev.label}は ${prev.days}日・${prev.answers}問）。${dd > 0 ? '先月より来た日が増えています。' : ''}`);
  } else if (now) out.push(`${now.label}は ${now.days}日・${now.answers}問やっています。`);
  if (r.lastYear && now) out.push(`去年の${Number(r.lastYear.key.slice(5))}月は ${r.lastYear.days}日・${r.lastYear.answers}問${r.lastYear.accuracy === null ? '' : `・正解率${r.lastYear.accuracy}%`}でした。`);
  if (now?.home) out.push(`教室の時間のほかに、自分で ${now.home}日 ひらいています。塾が始まっても、5分ずつ続けられる形です。`);
  const best = r.exam?.best ? r.exam.grades.find((g) => g.grade === r.exam.best) : null;
  const aim = r.exam?.aim ? r.exam.grades.find((g) => g.grade === r.exam.aim) : null;
  if (best) out.push(`英検${best.label}（${best.school}の英語）は、練習で目安に届いています。`);
  if (aim && aim.status !== 'none') out.push(`次は英検${aim.label}。${aim.missing.length ? `${aim.missing.join('・')}が まだ目安に届いていません。` : 'もう少しで届きます。'}`);
  if (r.weakest) out.push(`いちばん練習が少ないのは「${r.weakest.ja}」です。次はここから。`);
  return out;
}

// **何か月つづけているか。** 日の連続ではなく「答えた月」の連続。
// 途切れを煽らない（`docs/uspeak-retention.md` の3）ので、切れたときは何も出さない。
function inARowLine(r) {
  const n = Math.max(0, Math.floor(Number(r.inARow) || 0));
  if (n < 2) return '';
  const label = n >= 14 ? '1年以上' : `${n}か月`;
  return `<p class="inarow">✦ <b>${esc(label)}つづけています。</b></p>`;
}

export function reportHtml(r, { token = '', view = '' } = {}) {
  const meet = view === 'meet';
  const row = (label, value, note = '') => value === null || value === undefined || value === '' ? ''
    : `<tr><th>${esc(label)}</th><td><b>${esc(value)}</b>${note ? ` <small>${esc(note)}</small>` : ''}</td></tr>`;
  const seen = r.lastSeen ? new Date(r.lastSeen).toLocaleDateString('ja-JP', JST) : '';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(r.name)} さんの${meet ? '面談メモ' : '学習レポート'} · U-Speak</title>
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
 /* 今月のまとめ。**累計より先に、いちばん上に置く。** 保護者が知りたいのは
    「今月どうだったか」で、累計は3年つづけた子と3か月でやめた子を同じに見せる。 */
 .month { background: #173f38; color: #f4f1e3; border-radius: 16px; padding: 16px 18px; margin: 18px 0 8px; }
 .month h2 { margin: 0 0 2px; font-size: 15px; letter-spacing: 1px; font-weight: 700; }
 .month p { margin: 0 0 12px; font-size: 12px; opacity: .78; }
 .month ul { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
   gap: 10px; margin: 0; padding: 0; }
 .month li span { display: block; font-size: 11px; opacity: .72; }
 .month li b { font-size: 22px; }
 /* 去年の同じ月とのくらべ。**今月の箱のすぐ下**に置く——同じ話の続きなので、
    累計の向こうまで離すと、別の話に見える。 */
 .ago { margin: 10px 0 0; padding: 11px 14px; background: #fffaf0; border-radius: 12px;
   font-size: 13px; line-height: 1.7; border: 1px solid #ece7d4; }
 .ago b { color: #173f38; }
 .ago small { display: block; font-size: 11px; margin-top: 2px; }
 /* 「◯か月つづけています」。**煽らない**ので、細く、静かに置く。 */
 .inarow { margin: 10px 0 0; font-size: 13px; color: #4a6b52; }
 .inarow b { color: #173f38; }
 /* 先月までの並び。数字が3つあれば線は要らない（6行しか出ない）。 */
 .past { width: 100%; border-collapse: collapse; margin: 14px 0 0; font-size: 14px; background: #fffaf0;
   border-radius: 16px; overflow: hidden; }
 /* **見出しを縦に折らない。** スマホ幅では「問題」が「問／題」に割れて読めなくなる
    （390px で実測）。折り返しを止め、狭いところでは余白と字を詰めて収める。 */
 .past th, .past td { padding: 9px 14px; border-bottom: 1px solid #ece7d4; text-align: right;
   font-weight: 400; white-space: nowrap; }
 @media (max-width: 430px) { .past { font-size: 13px; } .past th, .past td { padding: 8px 8px; } }
 .past th:first-child, .past td:first-child { text-align: left; }
 .past thead th { font-size: 12px; color: #5d6d62; }
 .past tr:last-child td { border-bottom: 0; }
 footer { margin-top: 22px; font-size: 12px; color: #7b8a7f; }
 /* 紙にするボタン。冷蔵庫に貼る用の一枚は、画面とは別に組んである（LaTeX）。 */
 .save { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 4px; }
 .save a { flex: 1 1 200px; display: block; text-align: center; text-decoration: none;
   padding: 14px 16px; border-radius: 14px; font-weight: 700; }
 .save a.pdf { background: #173f38; color: #f4f1e3; }
 .save a.tex { background: #fffaf0; color: #22372f; border: 1px solid #e0dcc6; font-weight: 600; }
 .save + p { margin: 8px 2px 0; font-size: 12px; color: #7b8a7f; }
 .home, .school { margin: 10px 0 0; font-size: 13px; }
 .month .home { opacity: .9; }
 .school { color: #2f4f44; }
 h3.sub { margin: 26px 0 8px; font-size: 14px; color: #5d6d62; letter-spacing: 1px; }
 table.exam th small, table.exam td small { display: block; font-size: 11px; color: #7b8a7f; }
 .ex-ready { color: #2f6b3f; } .ex-close { color: #8a5a12; } .ex-practice { color: #5d6d62; }
 p.fine { font-size: 12px; color: #7b8a7f; margin: 6px 2px 0; }
 .notes { background: #fffaf0; border-radius: 16px; padding: 4px 16px 10px; margin-top: 8px; }
 .notes p { margin: 8px 0; } .notes p small { display: block; }
 /* 面談メモ。机の向こうの保護者にも読めるよう、字を大きく。 */
 .points { background: #fffaf0; border: 2px solid #173f38; border-radius: 16px; padding: 12px 18px; margin: 18px 0; }
 .points h2 { margin: 6px 0; font-size: 17px; }
 .points ol { margin: 0; padding-left: 1.3em; font-size: 18px; line-height: 1.8; }
 .save a.cert { background: #fffaf0; color: #22372f; border: 1px solid #e0dcc6; font-weight: 600; }
 /* 印刷するときは、ボタンそのものは要らない。 */
 @media print {
   body { background: #fff; }
   header { background: #173f38 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
   .save, .save + p { display: none; }
 }
</style></head><body>
<header><div><small>U-SPEAK LAB${meet ? ' · 面談' : ''}</small><h1>${esc(r.name)} さんの${meet ? '面談メモ' : '学習レポート'}</h1>
<p>クラス ${esc(r.classCode)}${seen ? ` · さいごに あそんだ日 ${esc(seen)}` : ''}</p></div></header>
<main>
${meet ? `<div class="points"><h2>きょう お話しすること</h2><ol>${talkingPoints(r).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}
${monthBlock(r)}
${inARowLine(r)}
${schoolLine(r)}
${examBlock(r)}
${notesBlock(r)}
 <h3 style="margin:26px 0 0;font-size:14px;color:#5d6d62;letter-spacing:1px;">はじめてからの ぜんぶ</h3>
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
  <a class="cert" href="?t=${esc(token)}&amp;format=cert">📜 学習の記録証</a>
 </div>
 <p>PDF は A4・2ページ（表紙と、ぜんぶの記録）。印刷して持ち帰れます。</p>
 <footer>この数字はすべて、お子さんが実際に答えた記録からサーバーが計算したものです。<br>
 ${esc(new Date(r.madeAt).toLocaleString('ja-JP', JST))} 時点。</footer>
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

// 学習の記録証 — 1枚、印刷して渡せる形。**辞める理由を「卒業」に変える**ための紙。
// 中学に上がる・引っ越す、という節目に「◯か月、ここで英語を続けた」が形に残る。
//
// **公的な資格ではない。** 書くのは起きたこと（期間・来た日・答えた問題）だけで、
// 英検は「練習で目安に届いた級」としか書かない（合格とは書かない）。
export function certHtml(r) {
  // 年月日は日本時間で（UTC のまま getMonth すると、月初の朝が前の月になる）。
  const ymd = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600 * 1000); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
  const start = r.firstSeen ? ymd(r.firstSeen) : null;
  const from = start ? `${start[0]}年${start[1]}月から` : '';
  const span = r.since >= 12 ? `${Math.floor(r.since / 12)}年${r.since % 12 ? `${r.since % 12}か月` : ''}` : `${Math.max(1, r.since)}か月`;
  const best = r.exam?.best ? r.exam.grades.find((g) => g.grade === r.exam.best) : null;
  const made = ymd(r.madeAt);
  const line = (label, value) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(r.name)} さんの学習の記録証 · U-Speak</title>
<style>
 @page { size: A4 landscape; margin: 12mm; }
 :root { color-scheme: light; }
 body { margin: 0; background: #f4f1e3; color: #22372f; font: 16px/1.7 system-ui, sans-serif; }
 .sheet { max-width: 900px; margin: 24px auto; background: #fffdf6; border: 10px double #173f38; border-radius: 6px;
   padding: 40px 48px; text-align: center; box-sizing: border-box; }
 small.eyebrow { letter-spacing: 6px; font-size: 12px; color: #5d6d62; }
 h1 { font-size: 34px; margin: 6px 0 22px; letter-spacing: 6px; color: #173f38; }
 .name { font-size: 30px; border-bottom: 2px solid #173f38; display: inline-block; padding: 0 28px 4px; margin-bottom: 18px; }
 .lead { font-size: 19px; margin: 0 0 24px; }
 .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 12px; margin: 0 0 22px; }
 .facts div { background: #f4f1e3; border-radius: 10px; padding: 10px; }
 .facts span { display: block; font-size: 12px; color: #5d6d62; }
 .facts b { font-size: 22px; }
 .foot { display: flex; justify-content: space-between; align-items: flex-end; font-size: 13px; color: #5d6d62; margin-top: 18px; text-align: left; }
 .note { font-size: 11px; color: #7b8a7f; margin-top: 14px; }
 .how { max-width: 900px; margin: 0 auto 30px; font-size: 13px; color: #5d6d62; text-align: center; }
 @media print { body { background: #fff; } .sheet { margin: 0; max-width: none; } .how { display: none; }
   .sheet, .facts div { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="sheet">
 <small class="eyebrow">U-SPEAK LAB</small>
 <h1>学習の記録証</h1>
 <div class="name">${esc(r.name)} さん</div>
 <p class="lead">${esc(from)} ${esc(span)}、U-Speak で英語を学びました。</p>
 <div class="facts">
  ${line('英語を学んだ日', `${r.studyDays} 日`)}
  ${line('答えた問題', `${r.attempts.toLocaleString()} 問`)}
  ${line('正解した問題', `${r.correct.toLocaleString()} 問`)}
  ${r.studyMinutes ? line('学習した時間', r.studyMinutes >= 120 ? `${Math.round(r.studyMinutes / 60)} 時間` : `${r.studyMinutes} 分`) : ''}
  ${best ? line('英検の目安（練習で到達）', best.label) : ''}
 </div>
 <div class="foot"><div>クラス ${esc(r.classCode)}</div><div>${made[0]}年${made[1]}月${made[2]}日</div></div>
 <p class="note">この記録証の数字は、すべて実際に答えた記録からサーバーが計算したものです。英検の目安は島の練習問題の正解率によるもので、英検の合格を示すものではありません。</p>
</div>
<p class="how">ブラウザーの「印刷」から、A4 よこ で紙にできます。</p>
</body></html>`;
}
