// 英検の目安 — 練習の記録から「どの級なら受けられそうか」と、教室として準会場を開けるかを出す。
//
// **英検の準会場は、教室の運営の真ん中にある。** 2〜5級の志願者が合わせて10人以上いれば
// 教室が自分で会場になれて、検定料は本会場より安くなる（日本英語検定協会の団体申込）。
// そのかわり「誰にどの級を勧めるか」「10人集まるか」を先生が数えなければならない。
// ここはその数え上げを、子どもが実際に答えた記録から出す。
//
// **合格の予想ではない。** 英検の合否は CSE スコアで決まり、ここにあるのは島の練習問題の
// 正解率だけ。だから画面の言葉は「合格できます」ではなく「**練習で目安に届いています**」。
// 先生が勧めるかどうかを決めるための材料で、決めるのは先生。
//
// **一次試験の中身に合わせて見る技能を変える。** 5級・4級の一次はリーディングと
// リスニングだけで、ライティングは3級から（スピーキングは5・4級では別のテスト、
// 3級では二次の面接）。関係ない技能が弱いせいで「まだ」と出たら、先生は数字を信じなくなる。
//
// **やさしい判定の○は数えない。** やさしいは4たくを2たくにし、言いかえを通す練習用の
// 判定なので、そこでの正解率を「受けられそう」の根拠にはできない。

export const GRADES = ['g5', 'g4', 'g3'];
export const SKILLS = ['reading', 'listening', 'writing', 'speaking'];
export const LABEL = { g5: '5級', g4: '4級', g3: '3級' };
export const SKILL_LABEL = { reading: 'よむ', listening: 'きく', writing: 'かく', speaking: 'はなす' };

// 日本英語検定協会の「各級の目安」。5級＝中学初級程度、4級＝中学中級程度、3級＝中学卒業程度。
// 保護者の「これは何につながるの？」（高学年で出てくる問い）に、学校の言葉で答えるため。
export const SCHOOL = { g5: '中学1年生くらい', g4: '中学2年生くらい', g3: '中学卒業くらい' };

// 一次で見る技能。二次（3級の面接）は別に出す。
export const REQUIRED = { g5: ['reading', 'listening'], g4: ['reading', 'listening'], g3: ['reading', 'listening', 'writing'] };
export const SECOND = { g5: [], g4: [], g3: ['speaking'] };

// 見るのは直近の20問。**昔の失敗をいつまでも引きずらない**（半年前の3問が今の判断を
// 下げるのはおかしい）ためと、保存を小さく保つため（1技能20文字）。
export const WINDOW = 20;
// 8問答えるまでは判断しない（2問中2問で「100%」と出すのは、数字の嘘）。
export const MIN_N = 8;
// 練習で7割なら「目安に届いた」、6割なら「あと一歩」。
export const READY_ACC = 70;
export const CLOSE_ACC = 60;
// 準会場の条件：2〜5級の志願者が合わせて10人以上（二次を準会場でやるには、2〜3級で60人以上）。
export const JUNKAIJO_MIN = 10;

const blankGrade = () => Object.fromEntries(SKILLS.map((s) => [s, '']));
export const blankReady = () => Object.fromEntries(GRADES.map((g) => [g, blankGrade()]));

// 保存から読む。**'0' と '1' 以外は捨てる**（手で触った保存・別バージョン）。
export function sanitizeReady(raw) {
  let src = raw;
  if (typeof src === 'string') { try { src = JSON.parse(src); } catch { src = null; } }
  const out = blankReady();
  if (!src || typeof src !== 'object') return out;
  for (const g of GRADES) {
    for (const s of SKILLS) {
      const v = src?.[g]?.[s];
      if (typeof v === 'string') out[g][s] = v.replace(/[^01]/g, '').slice(-WINDOW);
    }
  }
  return out;
}

// 1問ぶん足す。やさしい判定は数えない（上の注）。数えたら true。
export function recordEiken(ready, grade, skill, correct, level = 'normal') {
  if (level === 'easy' || !GRADES.includes(grade) || !SKILLS.includes(skill)) return false;
  ready[grade][skill] = (ready[grade][skill] + (correct ? '1' : '0')).slice(-WINDOW);
  return true;
}

export function statOf(bits) {
  const s = String(bits || '');
  const n = s.length;
  const c = [...s].filter((b) => b === '1').length;
  const acc = n ? Math.round((c / n) * 100) : null;
  return { n, correct: c, acc, ok: n >= MIN_N && acc >= READY_ACC, near: n >= MIN_N && acc >= CLOSE_ACC };
}

// 1つの級の見立て。
//   ready    … 一次の技能がぜんぶ目安に届いた
//   close    … あと一歩（ぜんぶ6割以上、または1つだけ届いていない）
//   practice … 練習中
//   none     … まだその級を練習していない
export function gradeStatus(ready, grade) {
  const skills = Object.fromEntries(SKILLS.map((s) => [s, statOf(ready?.[grade]?.[s])]));
  const need = REQUIRED[grade];
  const tried = need.some((s) => skills[s].n > 0);
  const ok = need.filter((s) => skills[s].ok);
  const missing = need.filter((s) => !skills[s].ok);
  let status = 'none';
  if (tried) status = 'practice';
  if (tried && (need.every((s) => skills[s].near) || missing.length === 1) && need.every((s) => skills[s].n >= MIN_N)) status = 'close';
  if (ok.length === need.length) status = 'ready';
  const second = SECOND[grade].map((s) => ({ skill: s, label: SKILL_LABEL[s], ...skills[s] }));
  return {
    grade, label: LABEL[grade], school: SCHOOL[grade], status,
    skills: need.map((s) => ({ skill: s, label: SKILL_LABEL[s], ...skills[s] })),
    missing: missing.map((s) => SKILL_LABEL[s]),
    second,
  };
}

// その子の見立て。`best` は目安に届いたいちばん上の級、`aim` はその次にめざす級。
export function readinessOf(ready) {
  const grades = GRADES.map((g) => gradeStatus(ready, g));
  let best = null;
  for (const g of grades) if (g.status === 'ready') best = g;
  const above = best ? grades.slice(grades.indexOf(best) + 1) : grades;
  const aim = above.find((g) => g.status !== 'none') || above[0] || null;
  const practised = grades.some((g) => g.status !== 'none');
  return { grades, best: best ? best.grade : null, aim: aim ? aim.grade : null, practised };
}

// 教室ぶん。**1人は1つの級にだけ数える**（届いたいちばん上の級）。
// 「あと一歩」は、届いた級の1つ上がそうなっている子（または、まだどの級にも届いていない子の
// いちばん下の あと一歩の級）。
export function classExamPlan(records, { sanitize = sanitizeReady } = {}) {
  const byGrade = Object.fromEntries(GRADES.map((g) => [g, { label: LABEL[g], school: SCHOOL[g], ready: [], close: [] }]));
  for (const record of records || []) {
    if (!record?.name || record.role === 'teacher' || record.moved_to) continue;
    const ready = record.ready && typeof record.ready === 'object' ? record.ready : sanitize(record.eiken_json);
    const r = readinessOf(ready);
    if (r.best) byGrade[r.best].ready.push(record.name);
    const next = r.grades.find((g, i) => (r.best ? i > GRADES.indexOf(r.best) : true) && g.status === 'close');
    if (next) byGrade[next.grade].close.push(record.name);
  }
  for (const g of GRADES) { byGrade[g].ready.sort(); byGrade[g].close.sort(); }
  // あと一歩の子は、届いた級で受けることもできるので、合計には「届いた子」だけを数える。
  // あと一歩の子を足した数は「見込み」として別に出す（二重に数えないように名前でまとめる）。
  const readyNames = new Set(GRADES.flatMap((g) => byGrade[g].ready));
  const closeOnly = new Set(GRADES.flatMap((g) => byGrade[g].close).filter((n) => !readyNames.has(n)));
  const readyTotal = readyNames.size;
  const outlook = readyTotal + closeOnly.size;
  return {
    byGrade, readyTotal, closeTotal: closeOnly.size, outlook,
    min: JUNKAIJO_MIN,
    open: readyTotal >= JUNKAIJO_MIN,
    likely: readyTotal < JUNKAIJO_MIN && outlook >= JUNKAIJO_MIN,
    short: Math.max(0, JUNKAIJO_MIN - readyTotal),
  };
}
