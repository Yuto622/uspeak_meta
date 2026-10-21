// 保護者レポートの .tex を 作る。templates/report/*.tex.j2 に 値を 流しこむ だけ（数字は aggregate.js）。
//
// 差し込みは 2 種類：
//   {{ x }}   … 文字。**かならず tex() で エスケープ**（ニックネーム・単語・先生の ひとこと）。
//   {{{ x }}} … この ファイルで 組んだ TikZ の 部品。部品の 中の 文字も tex() を 通してある。
// 改行は 空白に（ひとこと 1 つで 段落が 割れない）。できあがりは 1 つの .tex（preamble も 中に 入れる）＝
// どこで コンパイルしても 同じ（worker に 送るのも この 1 ファイル）。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tex as texEscape } from '../game/report-tex.js';
import { WEEKDAYS_JA } from './jst.js';
import { parentLines } from '../game/roadmap.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../templates/report');
const read = (name) => readFileSync(path.join(DIR, name), 'utf8');

// 改行と 制御文字も ふさぐ（\par を 作らせない）。
export const tex = (s) => texEscape(String(s ?? '').replace(/[\r\n\t\u0000-\u001f]+/g, ' ').trim());
const fill = (template, values) => template
  .replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_, k) => String(values[k] ?? ''))
  .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => tex(values[k]));
const fmt = (s, args = {}) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => (args[k] ?? ''));

let cache = null;
export function templates() {
  if (cache) return cache;
  const preamble = read('preamble.tex');
  const weekly = read('weekly.tex.j2').replace('\\input{preamble.tex}', preamble);
  const monthly = read('monthly.tex.j2').replace('\\input{preamble.tex}', preamble);
  const texts = JSON.parse(read('texts.json'));
  // どの 版で 作ったか（reports.template_version）：文の 版 ＋ テンプレートの 中身の ハッシュ。
  const hash = createHash('sha256').update(weekly).update(monthly).update(JSON.stringify(texts)).digest('hex').slice(0, 8);
  cache = { weekly, monthly, texts, version: `t${texts.version || 1}-${hash}` };
  return cache;
}
export const templateVersion = () => templates().version;
export const texts = () => templates().texts;
export function reloadTemplates() { cache = null; return templates(); }

// 長い ニックネーム・単語は 字を 小さく（はみ出さない）。
const titleSize = (nick, big, small) => (String(nick).length > 12 ? small : big);
const wordSize = (w) => { const n = String(w).length; return n > 13 ? 9 : n > 9 ? 11 : 14; };

function teacherCard(teacher, label, { weekly }) {
  if (!teacher?.text) return '';     // 先生が えらんだ 回だけ。無ければ 欄ごと 出さない。
  const from = `${tex(label || '先生')}より`;
  return weekly
    ? `\\begin{card}[colframe=accent,boxrule=0.9pt]\n{\\fontsize{9}{11}\\selectfont\\color{accent}\\bfseries ${from}}\\\\[0.4mm]\n{\\fontsize{11.5}{15}\\selectfont\\color{brand}\\bfseries ${tex(teacher.text)}}\n\\end{card}`
    : `\\begin{card}[colframe=accent,boxrule=1pt]\n{\\small\\color{accent}\\bfseries ${from}}\\\\[0.6mm]\n{\\large\\color{brand}\\bfseries ${tex(teacher.text)}}\n\\end{card}`;
}
const badge = (preview, weekly) => (preview
  ? (weekly
    ? '\\node[fill=accent,text=brand,font=\\fontsize{8}{8}\\selectfont\\bfseries,rounded corners=1.2mm,inner xsep=1.6mm,inner ysep=0.8mm,anchor=north east] at ($(current page.north east)+(-4mm,-2.6mm)$) {見本};'
    : '\\node[fill=accent,text=brand,font=\\small\\bfseries,rounded corners=1.2mm,inner xsep=2mm,inner ysep=1mm,anchor=north east] at ($(current page.north east)+(-10mm,-5mm)$) {見本};')
  : '');

// ---- 毎週版 -------------------------------------------------------------------------------
// クラスの 順位（よい ほうから 2 つ。その 子の 順位と 人数だけ）。
function ranksLine(d) {
  const list = (d.ranks || []).slice(0, 2);
  if (!list.length) return '';
  return `{\\fontsize{10}{12}\\selectfont\\color{accent}\\bfseries クラスの 順位}\\quad{\\fontsize{10}{13}\\selectfont\\color{brand} ${list.map((x) => tex(`${x.ja} ${x.rank}位 / ${x.of}人`)).join('　・　')}}\\\\[1.4mm]\n`;
}

// 宿題（その 期間に くばられて いた ぶん）。1 ページ目には 1 行、2 ページ目に くわしく（LINE の 画像は 1 ページ目だけ）。
const mdDay = (s) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${Number(m[1])}/${Number(m[2])}` : ''; };
function homeworkLine(d) {
  const h = d.homework;
  if (!h?.total) return '';
  const bits = [`${h.done} / ${h.total} おわり`];
  if (h.overdue) bits.push(`しめきり すぎ ${h.overdue}`);
  if (h.accuracy !== null && h.accuracy !== undefined) bits.push(`正解率 ${h.accuracy}%`);
  return `{\\fontsize{10}{12}\\selectfont\\color{accent}\\bfseries 宿題}\\quad{\\fontsize{10}{13}\\selectfont\\color{brand} ${tex(bits.join('・'))}}\\\\[1.4mm]\n`;
}
// ロードマップ（1 まいめに 1 行）。
function roadmapLine(d) {
  const v = d.roadmap;
  if (!v?.stage) return '';
  const c = (v.eiken || []).find((x) => x.chance !== null);
  const bits = [`${v.stage.id}「${v.stage.ja}」`, v.last ? 'さいごの 段階' : [v.words.left ? `単語 あと ${v.words.left} こ` : '', v.quiz.left ? `クイズ あと ${v.quiz.left} 問` : ''].filter(Boolean).join('・') || 'もうすぐ 次へ'];
  if (c) bits.push(`英検${c.ja} 見込み 約${c.chance}%`);
  return `{\\fontsize{10}{12}\\selectfont\\color{accent}\\bfseries ロードマップ}\\quad{\\fontsize{10}{13}\\selectfont\\color{brand} ${tex(bits.join('・'))}}\\\\[1.4mm]\n`;
}
function roadmapCard(d, small, big) {
  const L = parentLines(d.roadmap);
  if (!L) return '';
  const line = (t, c = 'brand') => `{${small}\\color{${c}} ${tex(t)}}\\\\[0.6mm]`;
  return `\\begin{card}
\\cardtitle{${tex('ロードマップ')}}\\\\[1mm]
{${big}\\color{brand}\\bfseries ${tex(L.stageLine)}}\\\\[0.6mm]
${line(L.nextLine)}
${L.eiken.map((t) => line(t, 'good')).join('\n')}
${L.places.length ? line(`おすすめの 場所：${L.places.join('・')}`) : ''}
{\\fontsize{7.5}{9.5}\\selectfont\\color{gray} ${tex(L.note)}}
\\end{card}
`;
}
function homeworkStatus(r) {
  if (r.status === 'done') return { text: `${r.correct}/${r.total}問 正解（${r.score}%）${r.doneDay ? `・${mdDay(r.doneDay)} 提出` : ''}${r.late ? '・おくれて 提出' : ''}`, color: r.late ? 'accent' : 'good' };
  if (r.overdue) return { text: `しめきり すぎ（${r.answered}/${r.total}問）`, color: 'accent' };
  if (r.status === 'doing') return { text: `とちゅう（${r.answered}/${r.total}問）`, color: 'brand' };
  return { text: 'まだ', color: 'gray' };
}
export function homeworkPage(d, { weekly = true } = {}) {
  const h = d.homework;
  const big = weekly ? '\\fontsize{11}{14}\\selectfont' : '\\normalsize';
  const small = weekly ? '\\fontsize{9}{12}\\selectfont' : '\\small';
  // 2 まいめ：ロードマップ（あれば）と 宿題（あれば）。どちらも なければ 1 まいだけ。
  const rm = roadmapCard(d, small, big);
  const head = (title) => `\\newpage
{${weekly ? '\\fontsize{15}{19}\\selectfont' : '\\Large'}\\color{brand}\\bfseries ${tex(title)}}\\;{${small}\\color{gray} ${tex(d.range)}}\\\\[1mm]
`;
  if (!h?.total) return rm ? head(`${d.nick}さんの ロードマップ`) + rm : '';
  const stat = (label, value) => `{${small}\\color{gray} ${tex(label)}}\\;{${big}\\color{brand}\\bfseries ${tex(value)}}`;
  const stats = [
    stat('提出', `${h.done} / ${h.total}`), stat('しめきりまでに', `${h.onTime}`),
    ...(h.late ? [stat('おくれて', `${h.late}`)] : []), ...(h.overdue ? [stat('しめきり すぎ', `${h.overdue}`)] : []),
  ].join('\\quad ');
  const work = h.answered ? [
    stat('答えた 問題', `${h.answered}問`), stat('正解率', `${h.accuracy}%`), stat('1回で 正解', `${h.firstTry}問`), stat('やり直し', `${h.retries}回`),
  ].join('\\quad ') : `{${small}\\color{gray} ${tex('この 期間は まだ 答えて いません')}}`;
  const time = [h.minutes ? stat('取り組んだ 時間', `約${h.minutes}分`) : '', h.days ? stat('やった 日', `${h.days}日`) : '', h.avgScore !== null && h.avgScore !== undefined ? stat('提出した 宿題の 平均', `${h.avgScore}%`) : ''].filter(Boolean).join('\\quad ');
  const rows = h.rows.slice(0, 12).map((r) => {
    const st = homeworkStatus(r);
    const due = r.due ? `しめきり ${mdDay(r.due)}` : 'しめきり なし';
    return `{${big}\\color{brand}\\bfseries ${tex(r.title)}}\\hfill{${small}\\color{gray} ${tex(due)}}\\\\[0.3mm]{${small}\\color{${st.color}}\\bfseries ${tex(st.text)}}\\\\[1.6mm]`;
  }).join('\n') + (h.rows.length > 12 ? `\n{${small}\\color{gray} ${tex(`ほか ${h.rows.length - 12} 件`)}}` : '');
  const kinds = h.byKind.map((k) => {
    const rate = k.n ? k.ok / k.n : 0;
    return `\\begin{tikzpicture}\\fill[soft] (0,0) rectangle (3,0.28);\\fill[good] (0,0) rectangle (${Math.max(0.05, 3 * rate).toFixed(2)},0.28);\\end{tikzpicture}\\;{${small}\\color{brand} ${tex(`${k.ja} ${k.ok}/${k.n}（${Math.round(rate * 100)}%）`)}}`;
  }).join('\\\\[0.8mm]\n');
  const missed = h.missed.length
    ? `{${big}\\color{brand}\\bfseries ${tex(h.missed.join(', '))}}\\\\[0.6mm]{${small}\\color{gray} ${tex('おうちで 声に 出して 1 回ずつ 読んで みて ください')}}`
    : `{${small}\\color{good}\\bfseries ${tex('まちがえた ことばは ありません')}}`;
  return `${head(`${d.nick}さんの宿題`)}${rm}\\begin{card}
\\cardtitle{${tex('すすみぐあい')}}\\\\[1mm]
${stats}\\\\[1mm]
${work}${time ? `\\\\[1mm]\n${time}` : ''}
\\end{card}
\\begin{card}
\\cardtitle{${tex('宿題ごと')}}\\\\[1.2mm]
${rows}
\\end{card}
${kinds ? `\\begin{card}\n\\cardtitle{${tex('問題の 形ごとの 正解')}}\\\\[1.2mm]\n${kinds}\n\\end{card}\n` : ''}\\begin{card}[colback=accent!10,colframe=accent!45,boxrule=0.8pt]
\\cardtitle{${tex('もう一度 練習したい ことば')}}\\\\[1mm]
${missed}
\\end{card}
`;
}

export function weeklyTex(d, { preview = false } = {}) {
  const { weekly, texts: T } = templates();
  const W = T.weekly;
  const order = ['月', '火', '水', '木', '金', '土', '日'];
  const dayCircles = d.days.map((on, i) => {
    const x = (i * 0.78 + 0.3).toFixed(2);
    return on
      ? `\\fill[good] (${x},-0.95) circle (0.29); \\node[text=white,font=\\fontsize{9}{9}\\selectfont\\bfseries] at (${x},-0.95) {${order[i]}};`
      : `\\draw[lgray,line width=0.8pt] (${x},-0.95) circle (0.29); \\node[text=lgray,font=\\fontsize{9}{9}\\selectfont] at (${x},-0.95) {${order[i]}};`;
  }).join('\n');
  let line = '';
  if (d.streak >= 3) line = fmt(W.streak, { n: d.streak });
  else if (d.situation) line = fmt(W.situations[d.situation], d.situationArgs);
  const streakLine = line ? `\\node[anchor=north west,inner sep=0,text=good,font=\\fontsize{9}{11}\\selectfont\\bfseries,text width=4.15cm,align=left] at (1.55,-1.62) {${tex(line)}};` : '';
  // 増えた ときだけ ↑。減った ときは 数字を 並べるだけ（赤・↓ は 使わない）。
  const diffText = d.diff > 0 ? `　{\\color{good}\\bfseries ↑ ${d.diff}問ふえた}` : '';

  let wordCards;
  if (d.learned.length) {
    wordCards = `\\begin{tikzpicture}\n${d.learned.map((w, i) => {
      const x = (i * 3.83).toFixed(2);
      const ja = w.ja ? `\\node[font=\\fontsize{9.5}{10}\\selectfont,text=gray] at ($(${x},0)+(1.775,0.33)$) {${tex(w.ja)}};` : '';
      const y = w.ja ? 0.86 : 0.66;
      return `\\draw[fill=good!8,draw=good!45,rounded corners=2mm] (${x},0) rectangle ++(3.55,1.32);\n\\node[font=\\fontsize{${wordSize(w.en)}}{${wordSize(w.en)}}\\selectfont\\bfseries,text=brand] at ($(${x},0)+(1.775,${y})$) {${tex(w.en)}};\n${ja}`;
    }).join('\n')}\n\\end{tikzpicture}`;
  } else {
    wordCards = `{\\fontsize{9.5}{12}\\selectfont\\color{gray} ${tex(W.noLearned)}}`;
  }

  // 先生の ひとこと・宿題・順位が ぜんぶ ある 週は 1 まいに 入らないので、ことわりの 1 行を 省く。
  const crowded = !!d.teacher?.text && !!(d.homework?.total || d.ranks?.length || d.roadmap);
  let nextBlock;
  if (d.next) {
    const ja = d.next.ja ? `\\;{\\fontsize{10}{12}\\selectfont\\color{gray}（${tex(d.next.ja)}）}` : (d.next.fromMiss ? `\\;{\\fontsize{9}{12}\\selectfont\\color{gray}${tex(W.nextFromMiss)}}` : '');
    const ask = d.next.ja ? fmt(W.homeWithJa, { ja: d.next.ja }) : fmt(W.homeNoJa, { en: d.next.en });
    nextBlock = `{\\fontsize{10}{12}\\selectfont\\color{brand}\\bfseries 次に覚える単語}\\quad{\\fontsize{${Math.min(14, wordSize(d.next.en))}}{14}\\selectfont\\color{brand}\\bfseries ${tex(d.next.en)}}${ja}\\\\[1.6mm]
{\\fontsize{10}{12}\\selectfont\\color{brand}\\bfseries おうちで1分}\\\\[0.6mm]
{\\fontsize{12}{16}\\selectfont\\color{brand}${tex(ask)}}${crowded ? '' : `\\\\[0.4mm]
{\\fontsize{9.5}{12}\\selectfont\\color{gray} ${tex(W.homeSub)}}`}`;
  } else {
    nextBlock = `{\\fontsize{10}{12}\\selectfont\\color{brand}\\bfseries 次に覚える単語}\\\\[1mm]{\\fontsize{9.5}{12}\\selectfont\\color{gray} ${tex(W.noNext)}}`;
  }

  const goal = goalText(d, W);
  if (goal) nextBlock = `{\\fontsize{10}{12}\\selectfont\\color{accent}\\bfseries ${tex(W.goalTitle)}}\\\\[0.5mm]{\\fontsize{11.5}{15}\\selectfont\\color{brand}\\bfseries ${tex(goal)}}\\\\[2mm]\n${nextBlock}`;
  nextBlock = roadmapLine(d) + homeworkLine(d) + ranksLine(d) + nextBlock;
  return fill(weekly, {
    badge: badge(preview, true),
    sender: d.sender || '教室', nick: d.nick, range: d.range, titleSize: titleSize(d.nick, 17, 14),
    teacherCard: teacherCard(d.teacher, d.teacherLabel, { weekly: true }),
    dayCircles, dayCount: d.dayCount, streakLine, answers: d.answers, prevAnswers: d.prevAnswers, diffText,
    wordCards, nextBlock, homeworkPage: homeworkPage(d, { weekly: true }),
    footer1: W.footer1, footer2: fmt(W.footer2, { sender: d.sender || '教室' }),
  });
}

// 来週の めあて（aggregate の goal → texts.json の 文）。ページと LINE の 文でも 使う。
export function goalText(d, W = templates().texts.weekly) {
  if (!d?.goal || !W.goals?.[d.goal.key]) return '';
  return fmt(W.goals[d.goal.key], d.goal.args || {});
}

// ---- 月次版 -------------------------------------------------------------------------------
const SKILL_ROWS = [
  { id: 'listen', name: '聞く', sub: '聞いて単語を選ぶ・ことばのジム', unit: '問', ja: '聞く' },
  { id: 'speak', name: '話す', sub: 'ジムで声で答える・AIの仲間と英語で話す', unit: '回', ja: '話す' },
  { id: 'read', name: '読む（意味）', sub: '4択・線つなぎ・穴埋め・並べ替え', unit: '問', ja: '読む' },
  { id: 'write', name: '書く（つづり）', sub: 'タイピング・つづり', unit: '問', ja: '書く' },
];

export function monthlyTex(d, { preview = false } = {}) {
  const { monthly, texts: T } = templates();
  const M = T.monthly;

  // 始めた頃と今：長い ほうの 棒を 5.1cm に。
  const L = d.learned;
  let learnedBars;
  if (L.sameMonth) {
    learnedBars = `\\begin{tikzpicture}\n\\fill[good] (0,0) rectangle (${L.now ? 5.1 : 0.15},0.5); \\node[anchor=west,font=\\normalsize\\bfseries,text=brand] at (${L.now ? 5.2 : 0.3},0.25) {${tex(L.nowLabel)}　${L.now}語};\n\\end{tikzpicture}\\\\[1mm]\n{\\small\\color{good}\\bfseries ${tex(fmt(M.grewSame, { n: L.now }))}}`;
  } else {
    const top = Math.max(1, L.now, L.then);
    const w = (n) => Math.max(0.15, (5.1 * n) / top).toFixed(2);
    const grew = L.now - L.then;
    learnedBars = `\\begin{tikzpicture}\n\\fill[lgray!60] (0,1.1) rectangle (${w(L.then)},1.6); \\node[anchor=west,font=\\normalsize,text=gray] at (${(Number(w(L.then)) + 0.1).toFixed(2)},1.35) {${tex(L.firstLabel)}　${L.then}語};\n\\fill[good] (0,0) rectangle (${w(L.now)},0.5); \\node[anchor=west,font=\\normalsize\\bfseries,text=brand] at (${(Number(w(L.now)) + 0.1).toFixed(2)},0.25) {${tex(L.nowLabel)}　${L.now}語};\n\\end{tikzpicture}${grew > 0 ? `\\\\[1mm]\n{\\small\\color{good}\\bfseries ${tex(fmt(M.grewMonths, { months: L.months, n: grew }))}}` : ''}`;
  }

  // カレンダー（日曜はじまり）。
  const cells = d.calendar.map((on, i) => {
    const day = i + 1;
    const pos = i + d.firstWeekday;
    const col = pos % 7; const row = Math.floor(pos / 7);
    return on
      ? `\\fill[good] (${col},-${row}) circle (0.25); \\node[font=\\scriptsize\\bfseries,text=white] at (${col},-${row}) {${day}};`
      : `\\draw[lgray] (${col},-${row}) circle (0.25); \\node[font=\\scriptsize,text=lgray] at (${col},-${row}) {${day}};`;
  }).join('\n');
  const calendar = `\\begin{tikzpicture}[x=0.78cm,y=0.62cm]\n${WEEKDAYS_JA.map((w, i) => `\\node[font=\\scriptsize,text=gray] at (${i},0.7) {${w}};`).join(' ')}\n${cells}\n\\end{tikzpicture}`;

  const skillRows = SKILL_ROWS.map((r, i) => {
    const y = (-1.15 * i).toFixed(2);
    const s = d.skills[r.id];
    let right; let bar = -1;
    if (r.id === 'speak') right = `\\color{gray}${tex(M.speakNote)}`;
    else if (!s.enough) right = `\\color{gray}${tex(M.soon)}`;
    else { right = `${s.den}問中 \\textbf{${s.correct}問} 正解`; bar = (s.correct / s.den).toFixed(2); }
    return `\\skillrow{${y}}{${tex(r.name)}}{${tex(r.sub)}}{${s.n}${r.unit}}{${right}}{${bar}}`;
  }).join('\n');

  const best = SKILL_ROWS.find((r) => r.id === d.best);
  const canDo = best
    ? `{\\small\\color{brand} ${tex(M.cando[best.id]?.[d.grade] || M.cando[best.id]?.['5級'] || '')}}\\\\[1mm]\n{\\scriptsize\\note{${tex(fmt(M.canNote, { level: d.grade, skill: best.ja }))}}}`
    : `{\\small\\color{gray} ${tex(M.nextStep.keep)}}`;

  let game;
  if (d.game?.kind === 'fish') game = `{\\small\\color{brand} ${tex(fmt(M.gameFish, d.game))}}\\\\[1mm]\n{\\scriptsize\\note{${tex(M.gameFishTalk)}}}`;
  else if (d.game?.kind === 'place') game = `{\\small\\color{brand} ${tex(fmt(M.gamePlace, d.game))}}\\\\[1mm]\n{\\scriptsize\\note{${tex(M.gamePlaceTalk)}}}`;
  else game = `{\\small\\color{gray} ${tex(M.gameNone)}}`;

  { const rl = roadmapLine(d) + homeworkLine(d) + ranksLine(d); if (rl) game = `${rl}${game}`; }
  const step = d.nextStep || { key: 'keep' };
  return fill(monthly, {
    badge: badge(preview, false),
    sender: d.sender || '教室', nick: d.nick, monthLabel: `${d.month}月`, range: d.range, titleSize: titleSize(d.nick, 24, 19),
    teacherCard: teacherCard(d.teacher, d.teacherLabel, { weekly: false }),
    learnedBars, calendar, dayCount: d.dayCount, skillRows, canDo, game,
    nextStep: fmt(M.nextStep[step.key] || M.nextStep.keep, step),
    home1: M.home[0], home2: M.home[1],
    // 数字の見方は 固定文（texts.json に 書いた TeX を そのまま。人の 名前は 入らない）。
    legend: M.legend.join('\\\\\n'),
    footer: fmt(M.footer, { sender: d.sender || '教室' }),
    homeworkPage: homeworkPage(d, { weekly: false }),
  });
}

// ---- 保護者用 QR カード（A4 に 8 人）---------------------------------------------------------
export function qrCardsTex({ classroom, cards }) {
  const preamble = templates().weekly.split('\\begin{document}')[0].replace(/\\documentclass[^\n]*\n/, '').replace(/\\usepackage\[paperwidth[^\n]*\n/, '');
  const pages = [];
  for (let i = 0; i < cards.length; i += 8) {
    const boxes = cards.slice(i, i + 8).map((c) => `\\begin{tcolorbox}[enhanced,colback=white,colframe=soft,boxrule=0.6pt,arc=3mm,width=0.485\\textwidth,height=60mm,left=3mm,right=3mm,top=2.5mm,bottom=2mm,nobeforeafter,valign=top]
{\\color{accent}\\bfseries\\small ${tex(classroom)}}\\\\[0.4mm]
{\\color{brand}\\bfseries\\Large ${tex(c.nick)} さん}\\\\[1.5mm]
\\begin{minipage}[t]{30mm}\\vspace{0pt}\\qrcode[height=28mm]{${c.url.replace(/[#%\\{}~^]/g, (ch) => `\\${ch}`)}}\\end{minipage}\\hfill
\\begin{minipage}[t]{\\dimexpr\\linewidth-33mm}\\vspace{1mm}{\\footnotesize\\color{brand} 保護者の方へ：スマホのカメラで読みとると、お子さまの学習レポートがいつでも見られます。LINEで毎週受け取ることもできます。}\\\\[1.5mm]
{\\scriptsize\\color{gray} お子さまの本名・ご連絡先はお預かりしません。教室のご判断でいつでも停止できます。}\\end{minipage}
\\end{tcolorbox}`);
    const rows = [];
    for (let k = 0; k < boxes.length; k += 2) rows.push(boxes.slice(k, k + 2).join('\\hfill\n'));
    pages.push(rows.join('\\par\\vspace{3mm}\n'));
  }
  const body = [pages.join('\n\\newpage\n')];
  return `\\documentclass[10pt]{article}
\\usepackage[a4paper,margin=10mm]{geometry}
${preamble.replace('\\pagecolor{cream}', '')}
\\usepackage{qrcode}
\\begin{document}
{\\color{brand}\\bfseries ${tex(classroom)}　保護者用 QRカード}\\hfill{\\scriptsize\\color{gray} 切りはなして お渡しください}\\\\[3mm]
${body.join('') || '（生徒が いません）'}
\\end{document}
`;
}
