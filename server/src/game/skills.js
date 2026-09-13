// 5つの技能 — what a child has actually been practising, and what they have not.
//
// Every answer in this game already writes a learning row with a `mode`: 'listen' from the
// gym, 'reading' from 英検, 'conv' from 英会話島, 'race' from an item box, and so on. That
// list is a list of PLACES. A parent looking at a report, and a child looking at their own
// page, want the same thing sorted a different way: which of the five things they came to
// learn is getting practised.
//
// So this file is one map from place to skill, and one honest way to score each axis. It is
// the server's, like everything that ends up on a report — the page draws the shape it is
// given and cannot argue with it.

export const SKILLS = [
  { id: 'listen', ja: 'きく', en: 'Listening' },
  { id: 'speak', ja: 'はなす', en: 'Speaking' },
  { id: 'read', ja: 'よむ', en: 'Reading' },
  { id: 'write', ja: 'かく', en: 'Writing' },
  { id: 'think', ja: 'りかい', en: 'Comprehension' },
];
export const SKILL_IDS = SKILLS.map((s) => s.id);

// How many answers make an axis "full". Not a cap on practice — a child can keep going —
// but the point past which the shape stops rewarding volume and only accuracy moves it.
// Sixty is roughly a term of one activity at this age.
export const FULL = 60;

// Where an answer came from, and therefore what it exercised. A mode not in this list is
// comprehension: the willow lessons, the fish meanings and the RPG all ask a child to
// understand English and choose, which is what that axis is.
const BY_MODE = {
  listen: 'listen',
  listening: 'listen',      // 英検リスニング
  speak: 'speak',
  speaking: 'speak',        // 英検スピーキング
  conv: 'speak',            // 英会話島: マイクで話す
  interview: 'speak',       // 面接の間
  mission: 'speak',         // おつかい島: お店の人と話す
  reading: 'read',          // 英検リーディング
  quiz: 'read',             // ことばの学校の単語クイズ
  race: 'read',             // 📦 の日本語→英語
  writing: 'write',         // 英検ライティング: 単語をならべる
  chat: 'write',            // じゆうにゅうりょく
};

export function skillOf(mode) {
  return BY_MODE[String(mode || '').toLowerCase()] || 'think';
}

export const blankSkills = () => Object.fromEntries(SKILL_IDS.map((id) => [id, { a: 0, c: 0 }]));

export function sanitizeSkills(raw) {
  const out = blankSkills();
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const id of SKILL_IDS) {
    const v = src[id];
    if (!v || typeof v !== 'object') continue;
    const a = Math.max(0, Math.min(1e7, Math.floor(Number(v.a) || 0)));
    // Never more right than asked: a record that says otherwise is a broken record.
    const c = Math.max(0, Math.min(a, Math.floor(Number(v.c) || 0)));
    out[id] = { a, c };
  }
  return out;
}

export function addAnswer(skills, mode, correct) {
  const id = skillOf(mode);
  const s = skills[id] || (skills[id] = { a: 0, c: 0 });
  s.a += 1;
  if (correct) s.c += 1;
  return id;
}

// One axis of the chart, 0-100.
//
// Both halves have to count. Accuracy alone would give a child who answered two listening
// questions correctly a perfect listening score, which is a lie the chart would then keep
// telling; volume alone would reward guessing. So the axis grows with practice up to FULL,
// and how far it grows is set by how well that practice went — with a floor, because
// having turned up and tried is itself worth some of the shape.
export function scoreOf(entry) {
  const a = Math.max(0, Math.floor(entry?.a || 0));
  if (!a) return 0;
  const c = Math.max(0, Math.min(a, Math.floor(entry?.c || 0)));
  const volume = Math.min(1, a / FULL);
  const accuracy = c / a;
  return Math.round(100 * volume * (0.4 + 0.6 * accuracy));
}

// The whole shape, in the order the chart draws it.
export function radarOf(skills) {
  const safe = sanitizeSkills(skills);
  return SKILLS.map((s) => ({
    id: s.id, ja: s.ja, en: s.en,
    attempts: safe[s.id].a,
    correct: safe[s.id].c,
    score: scoreOf(safe[s.id]),
  }));
}

// The one a child has practised least, so the page can say where to go next. Skills with
// nothing at all come first: an empty axis is the most useful thing to point at.
export function weakestOf(skills) {
  const rows = radarOf(skills);
  return rows.slice().sort((x, y) => x.score - y.score || x.attempts - y.attempts)[0];
}
