// 保護者レポート、紙のほう — the same numbers as the web report, set in LaTeX.
//
// A web page is for glancing at on a phone in a corridor. This is the other thing a
// family does with a report: print it, put it on the fridge, keep it in a folder with
// the school ones. So it is not the web page with a print stylesheet — it is a designed
// document: a full-bleed cover in the game's own colours, the child's name as the
// headline, three rings for the three numbers that matter, a bar chart of everything
// they did, and a seal.
//
// Every number comes from reportFor() — the same object the HTML page renders — so the
// paper and the screen can never disagree.
//
// The whole document is one .tex file with no external images and no shell-escape, which
// is what makes it safe to compile on the server and easy to hand to a teacher who wants
// to change the wording themselves.

// LaTeX has ten characters that mean something else. A child's name is not allowed to be
// one of them, and neither is a pet's.
const TEX_ESCAPES = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
};
export const tex = (s) => String(s ?? '').replace(/[\\{}$&#^_%~]/g, (c) => TEX_ESCAPES[c]);

const jaDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

// A ring is drawn as an arc, so a proportion has to be a number of degrees. Nothing is
// ever drawn as a full circle unless it really is finished.
const arc = (fraction) => Math.max(0, Math.min(1, fraction)) * 360;

// The bars: only the things this child actually did. A row of zeroes is a report about
// what a child has not done, which is not what this is for.
export function reportBars(r) {
  const all = [
    { label: '英語の問題', value: r.attempts, unit: '問', colour: 'uspeakGold' },
    { label: '英語で話した', value: r.phrases, unit: '回', colour: 'uspeakMint' },
    { label: 'おつかい', value: r.errands, unit: '件', colour: 'uspeakSky' },
    { label: 'つかまえた魚', value: r.fishKinds, unit: '種', colour: 'uspeakCoral' },
    { label: 'のりもの', value: r.vehicles, unit: '台', colour: 'uspeakGold' },
    { label: 'つくった かぐ', value: r.furniture, unit: 'こ', colour: 'uspeakMint' },
    { label: 'ひろばの ブロック', value: r.blocks, unit: 'こ', colour: 'uspeakSky' },
    { label: 'れんぞくログイン', value: r.streak, unit: '日', colour: 'uspeakCoral' },
  ].filter((b) => b.value > 0);
  const top = Math.max(1, ...all.map((b) => b.value));
  return all.map((b) => ({ ...b, width: Math.max(0.06, b.value / top) }));
}

// The document. One file, no images, no shell-escape, no network: everything on the page
// is drawn by TikZ from the numbers above.
export function reportTex(r, { font = 'Noto Sans CJK JP' } = {}) {
  const bars = reportBars(r);
  const seen = r.lastSeen ? jaDate(r.lastSeen) : '';
  const made = jaDate(r.madeAt) || '';
  const rings = [
    { label: 'レベル', big: String(r.level), sub: `つぎまで ${Math.max(0, r.need - r.xp)} XP`, deg: arc(r.need ? r.xp / r.need : 0), colour: 'uspeakGold' },
    { label: 'ためた XP', big: r.totalXp.toLocaleString('en-US'), sub: 'ぜんぶで', deg: 360, colour: 'uspeakMint' },
    r.accuracy === null
      ? { label: '英語の問題', big: '—', sub: 'これから', deg: 0, colour: 'uspeakSky' }
      : { label: '英語の正解率', big: `${r.accuracy}\\%`, sub: `${r.correct} / ${r.attempts} 問`, deg: arc(r.accuracy / 100), colour: 'uspeakSky' },
  ];

  const rows = [
    ['英語の問題', r.attempts ? `${r.correct} / ${r.attempts} 問` : ''],
    ['英語で話した回数', r.phrases ? `${r.phrases} 回` : ''],
    ['おつかい', r.errands ? `${r.errands} 件 たっせい` : ''],
    ['つかまえた魚の種類', r.fishKinds ? `${r.fishKinds} 種` : ''],
    ['のりもの', r.vehicles ? `${r.vehicles} 台` : ''],
    ['コースの自己ベスト', r.lapBest ? `${(r.lapBest / 1000).toFixed(1)} 秒` : ''],
    ['おうち', r.house || ''],
    ['つくった かぐ・ブロック', r.furniture || r.blocks ? `かぐ ${r.furniture} こ・ブロック ${r.blocks} こ` : ''],
    ['ペット', r.pet ? `${r.pet.name}（Lv.${r.pet.level}）` : ''],
    ['れんぞくログイン', r.streak ? `${r.streak} 日` : ''],
    ['もっているコイン', `${r.coins.toLocaleString('en-US')} コイン`],
    ['さいごに あそんだ日', seen],
  ].filter(([, v]) => v !== '' && v !== null && v !== undefined);

  // つぎの目標. A report that only looks backwards is a school report; a child reads this
  // one too, and wants to know what is next.
  const goals = [
    [`レベル ${r.level + 1} まで`, `あと ${Math.max(0, r.need - r.xp)} XP`],
    r.accuracy === null ? null : [r.accuracy >= 80 ? '正解率 90% まで' : '正解率 80% まで',
      r.accuracy >= 90 ? 'たっせい！' : `いまは ${r.accuracy}%`],
    r.fishKinds < 100 ? ['魚の図鑑', `あと ${100 - r.fishKinds} 種`] : ['魚の図鑑', 'ぜんぶ そろいました'],
    r.vehicles < 4 ? ['のりもの', `あと ${4 - r.vehicles} 台`] : ['のりもの', 'ぜんぶ そろいました'],
  ].filter(Boolean);

  return `% U-Speak Lab 学習レポート — ${tex(r.name)}（${tex(r.classCode)}）
% 作られた日: ${made}
%
% コンパイル: xelatex ${'%'}このファイル   （日本語フォントを使うので XeLaTeX か LuaLaTeX で）
% 画像も外部ファイルも使っていません。この1枚だけで組めます。
\\documentclass[a4paper,11pt]{article}
\\usepackage{fontspec}
\\usepackage{xeCJK}
\\usepackage{tikz}
\\usepackage[margin=0pt]{geometry}
\\usetikzlibrary{calc,fadings,decorations.pathmorphing}
\\setCJKmainfont{${font}}
\\setmainfont{${font}}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}

% 島の色。ゲームの中と同じものを使っています。
\\definecolor{uspeakDeep}{HTML}{0C2A24}
\\definecolor{uspeakGreen}{HTML}{173F38}
\\definecolor{uspeakCream}{HTML}{F4F1E3}
\\definecolor{uspeakGold}{HTML}{E8C368}
\\definecolor{uspeakMint}{HTML}{74C39A}
\\definecolor{uspeakSky}{HTML}{6FB6D6}
\\definecolor{uspeakCoral}{HTML}{E8927C}
\\definecolor{uspeakInk}{HTML}{22372F}
\\definecolor{uspeakPaper}{HTML}{FBF8EC}

% 進みぐあいのリング。度数で描くので、満たないものは満たないまま出ます。
\\newcommand{\\uspeakring}[5]{%
  % #1 x  #2 y  #3 度  #4 色  #5 中の文字
  \\draw[line width=7pt, uspeakCream, opacity=.13] (#1,#2) circle (1.42);
  \\draw[line width=7pt, #4, line cap=round] (#1,#2) ++(90:1.42) arc (90:{90-#3}:1.42);
  \\node[align=center, text=uspeakCream] at (#1,#2) {#5};
}

\\begin{document}
% ---- 1ページ目：表紙 ----------------------------------------------------------------
\\begin{tikzpicture}[remember picture, overlay]
  \\fill[uspeakDeep] (current page.south west) rectangle (current page.north east);
  % 空。島の上のオーロラのつもりで、透けた帯をなめらかに3本かさねています。
  \\begin{scope}
    \\clip (current page.south west) rectangle (current page.north east);
    \\foreach \\i/\\o/\\c in {3.2/.14/uspeakMint, 5.8/.11/uspeakSky, 8.6/.09/uspeakGold} {
      \\fill[\\c, opacity=\\o]
        ($(current page.north west)+(-1,-\\i)$)
          .. controls +(7,-2.4) and +(-7,1.4) .. ($(current page.north east)+(1,-\\i-2.2)$)
        -- ($(current page.north east)+(1,-\\i-5.4)$)
          .. controls +(-7,1.4) and +(7,-2.4) .. ($(current page.north west)+(-1,-\\i-3.2)$)
        -- cycle;
    }
    % ボクセルの点。うすく、まばらに。
    \\foreach \\x in {0,0.9,...,21} \\foreach \\y in {0,0.9,...,30} {
      \\fill[uspeakCream, opacity=.045] ($(current page.south west)+(\\x,\\y)$) circle (.045);
    }
    % 下のふちに、海面のような やわらかい明かりを一枚。ここで紙が終わる、という合図です。
    \\foreach \\g in {0,1,...,9} {
      \\fill[uspeakMint, opacity=.012]
        ($(current page.south west)+(-1,0)$) rectangle ($(current page.south east)+(1,{0.42*\\g})$);
    }
  \\end{scope}

  \\node[anchor=north west, text=uspeakGold, font=\\fontsize{10}{12}\\selectfont]
    at ($(current page.north west)+(2.2,-2.6)$) {U-SPEAK\\hspace{.6em}LAB};
  \\node[anchor=north west, text=uspeakCream, opacity=.55, font=\\fontsize{9}{11}\\selectfont]
    at ($(current page.north west)+(2.2,-3.15)$) {LEARNING REPORT\\hspace{.6em}${tex(made)}};

  \\node[anchor=north west, text=uspeakCream, font=\\fontsize{44}{50}\\selectfont]
    at ($(current page.north west)+(2.1,-4.6)$) {${tex(r.name)}};
  \\node[anchor=north west, text=uspeakCream, opacity=.7, font=\\fontsize{13}{17}\\selectfont]
    at ($(current page.north west)+(2.25,-6.9)$) {さんの まなびの きろく\\hspace{.8em}\\textbar\\hspace{.8em}クラス ${tex(r.classCode)}};

  % 三つのリング
  \\begin{scope}[shift={($(current page.north west)+(4.4,-11.5)$)}]
${rings.map((g, i) => `    \\uspeakring{${i * 4.6}}{0}{${g.deg.toFixed(1)}}{${g.colour}}{{\\fontsize{26}{28}\\selectfont ${g.big}}\\\\[2pt]{\\fontsize{8}{10}\\selectfont ${tex(g.sub)}}}
    \\node[text=${g.colour}, font=\\fontsize{10}{12}\\selectfont] at (${i * 4.6},-2.15) {${tex(g.label)}};`).join('\n')}
  \\end{scope}

  % ぼうグラフ。したことだけ、多い順ではなく島の順に。
  \\begin{scope}[shift={($(current page.north west)+(2.2,-16.4)$)}]
    \\node[anchor=north west, text=uspeakCream, opacity=.55, font=\\fontsize{9}{11}\\selectfont] at (0,0) {WHAT ${tex(r.name.toUpperCase())} DID};
${bars.map((b, i) => {
    const y = -1.0 - i * 0.92;
    return `    \\node[anchor=east, text=uspeakCream, opacity=.85, font=\\fontsize{9.5}{11}\\selectfont] at (4.2,${y.toFixed(2)}) {${tex(b.label)}};
    \\fill[uspeakCream, opacity=.08, rounded corners=3pt] (4.5,${(y - 0.19).toFixed(2)}) rectangle (16.3,${(y + 0.19).toFixed(2)});
    \\fill[${b.colour}, rounded corners=3pt] (4.5,${(y - 0.19).toFixed(2)}) rectangle (${(4.5 + 11.8 * b.width).toFixed(2)},${(y + 0.19).toFixed(2)});
    \\node[anchor=west, text=${b.colour}, font=\\fontsize{10}{12}\\selectfont] at (${(4.5 + 11.8 * b.width + 0.25).toFixed(2)},${y.toFixed(2)}) {${b.value}${tex(b.unit)}};`;
  }).join('\n')}
  \\end{scope}

  % 印。証書のまね事ですが、子どもはこれを見ます。
  \\begin{scope}[shift={($(current page.south west)+(17.0,3.3)$)}]
    \\foreach \\a in {0,15,...,345} { \\fill[uspeakGold, opacity=.5] (\\a:1.28) -- ({\\a+7.5}:1.05) -- ({\\a+15}:1.28) -- cycle; }
    \\fill[uspeakGold] (0,0) circle (1.05);
    \\node[text=uspeakDeep, align=center, font=\\fontsize{9}{11}\\selectfont] at (0,0) {LEVEL\\\\[1pt]{\\fontsize{20}{22}\\selectfont ${r.level}}};
  \\end{scope}
  \\node[anchor=south west, text=uspeakCream, opacity=.45, font=\\fontsize{8.5}{11}\\selectfont, align=left]
    at ($(current page.south west)+(2.2,2.0)$)
    {この紙の数字は すべて、お子さんが じっさいに 答えた記録から サーバーが 計算したものです。\\\\
     ${tex(made)} 時点 \\textbar\\hspace{.4em} U-Speak Lab};
\\end{tikzpicture}
\\clearpage

% ---- 2ページ目：ぜんぶの記録 --------------------------------------------------------
\\begin{tikzpicture}[remember picture, overlay]
  \\fill[uspeakPaper] (current page.south west) rectangle (current page.north east);
  \\fill[uspeakGreen] (current page.north west) rectangle ($(current page.north east)+(0,-3.4)$);
  \\node[anchor=north west, text=uspeakGold, font=\\fontsize{9}{11}\\selectfont]
    at ($(current page.north west)+(2.2,-1.25)$) {RECORD};
  \\node[anchor=north west, text=uspeakCream, font=\\fontsize{19}{23}\\selectfont]
    at ($(current page.north west)+(2.15,-1.75)$) {${tex(r.name)} さんの きろく};

  \\begin{scope}[shift={($(current page.north west)+(2.2,-4.6)$)}]
${rows.map(([k, v], i) => {
    const y = -i * 0.86;
    return `    ${i % 2 === 0 ? `\\fill[uspeakGreen, opacity=.05, rounded corners=4pt] (-0.3,${(y - 0.33).toFixed(2)}) rectangle (16.9,${(y + 0.36).toFixed(2)});` : ''}
    \\node[anchor=north west, text=uspeakInk, opacity=.6, font=\\fontsize{10}{12}\\selectfont] at (0,${y.toFixed(2)}) {${tex(k)}};
    \\node[anchor=north east, text=uspeakInk, font=\\fontsize{12}{14}\\selectfont] at (16.6,${(y + 0.04).toFixed(2)}) {${tex(v)}};`;
  }).join('\n')}
  \\end{scope}

  % つぎの目標。うしろ向きの紙にしないための欄です。
  \\begin{scope}[shift={($(current page.south west)+(2.2,${Math.max(9.4, 29.7 - 5.8 - rows.length * 0.86).toFixed(2)})$)}]
    \\node[anchor=north west, text=uspeakGreen, opacity=.55, font=\\fontsize{9}{11}\\selectfont] at (0,0.2) {NEXT};
    \\node[anchor=north west, text=uspeakInk, font=\\fontsize{14}{17}\\selectfont] at (-0.05,-0.25) {つぎの もくひょう};
${goals.map(([k, v], i) => {
    const x = (i % 2) * 8.4;
    const y = -1.35 - Math.floor(i / 2) * 1.5;
    return `    \\fill[uspeakGreen, opacity=.06, rounded corners=8pt] (${(x - 0.25).toFixed(2)},${(y - 0.85).toFixed(2)}) rectangle (${(x + 7.85).toFixed(2)},${(y + 0.4).toFixed(2)});
    \\node[anchor=north west, text=uspeakInk, opacity=.6, font=\\fontsize{9.5}{11}\\selectfont] at (${x.toFixed(2)},${y.toFixed(2)}) {${tex(k)}};
    \\node[anchor=north west, text=uspeakGreen, font=\\fontsize{13}{15}\\selectfont] at (${x.toFixed(2)},${(y - 0.36).toFixed(2)}) {${tex(v)}};`;
  }).join('\n')}
  \\end{scope}

  % 保護者の方へ。数字がどこから来たのかを、この紙の上で言い切っておきます。
  \\begin{scope}[shift={($(current page.south west)+(2.2,3.5)$)}]
    \\fill[uspeakGreen, opacity=.05, rounded corners=10pt] (-0.4,-1.35) rectangle (17.0,1.3);
    \\node[anchor=north west, text=uspeakGreen, opacity=.55, font=\\fontsize{9}{11}\\selectfont] at (0,1.05) {ABOUT THIS REPORT};
    \\node[anchor=north west, text=uspeakInk, opacity=.75, font=\\fontsize{9.5}{14}\\selectfont, align=left, text width=16.4cm] at (0,0.55)
      {ここにある数字は すべて、お子さんが じっさいに 答えた記録から サーバーが 計算したものです。
       アプリの中で 自己申告した点数は 一つも ありません。\\\\
       ${tex(r.name)} さんが 書いたメッセージや 話した内容は、この紙には ふくまれません
       （学校の先生だけが 確認できます）。};
  \\end{scope}
  \\node[anchor=south east, text=uspeakInk, opacity=.4, font=\\fontsize{8.5}{11}\\selectfont]
    at ($(current page.south east)+(-2.2,1.45)$) {U-Speak Lab \\textbar\\hspace{.4em} ${tex(made)}};
\\end{tikzpicture}
\\end{document}
`;
}
