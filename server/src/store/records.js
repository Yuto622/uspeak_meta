// Shared record shapes for every store backend.
// Append-only: new fields go on the end so an existing sheet keeps its column meanings.
export const PLAYER_COLUMNS = [
  'class', 'name', 'coins', 'correct', 'attempts', 'catches', 'space', 'x', 'z',
  'inventory_json', 'owned_json', 'wands_json', 'wand', 'progress_json', 'missions_json', 'updated_at', 'last_seen',
  'level', 'xp', 'total_xp', 'chats', 'dex_json', 'move', 'pet_json',
  'login_day', 'login_streak', 'week_key', 'week_xp',
  'cap_day', 'battle_coins', 'ghost_coins',
  'garage_json', 'riding', 'lap_best', 'course_coins',
  'blocks_json', 'room_json', 'role', 'props_json', 'eiken_coins', 'conv_coins',
  'voice_minutes', 'skills_json', 'study_ms', 'study_days', 'study_day',
  'wardrobe_json', 'worn_json',
  // 月ごとの学習記録（保護者レポートの「今月のまとめ」）。**ここに足さないと
  // Sheets 版では黙って落ちる**（recordToRow が列の名前で引くため）。
  'months_json',
  // 年度またぎ。`moved_to` は引っ越し先のクラス（去年のレポートのリンクを生かすため）、
  // `moved_from` は引き継いだ元（先生が「どこから来たか」を追えるように）。
  'moved_to', 'moved_from',
  // はじめてこのクラスで遊んだ日。**沈黙期（最初の3か月）の子を名指しで拾う**ために
  // 要る（`game/retention.js`）。月ごとの記録は13か月で落ちるので、そこからでは
  // 「1年以上まえから居る」ことしか分からない。
  'first_seen',
  // 英検の島の直近の正誤（級×技能で20問ずつ、'1'/'0' の文字列）。「練習で目安に届いたか」と
  // 英検の準会場の見込み（`game/eiken-ready.js`）。
  'eiken_json',
  // 先生のメモと声かけ（`game/notes.js`）。**教室がいちばん手放しにくい記録**なので、
  // CSV には全部出す。
  'notes_json',
  // ぼくじょう島（`game/farm.js`）：畑・動物・持ち物・ハート・つかった ことば。
  // `farm_coins` は きょう しゅっかで もらった コイン（1日の上限）。
  'farm_json', 'farm_coins',
];
export const LEARNING_COLUMNS = ['timestamp', 'class', 'name', 'question_id', 'mode', 'choice', 'correct', 'xp', 'session_id'];
// The class register. A teacher keeps this: one row per child who is allowed in.
export const ROSTER_COLUMNS = ['class', 'name', 'note'];
export const COIN_COLUMNS = ['timestamp', 'class', 'name', 'op', 'item', 'quantity', 'delta', 'balance', 'session_id'];

// Names and class codes are sanitized so they never contain '|'.
export const playerKey = (classCode, name) => `${classCode}|${name}`;

export function blankPlayerRecord(classCode, name) {
  return {
    class: classCode, name, coins: 0, correct: 0, attempts: 0, catches: 0,
    space: '', x: 0, z: 0, inventory_json: '{}', owned_json: '[]', wands_json: '[]', wand: '',
    progress_json: '', missions_json: '[]', updated_at: '', last_seen: '',
    level: 1, xp: 0, total_xp: 0, chats: 0, dex_json: '[]', move: '', pet_json: '',
    login_day: 0, login_streak: 0, week_key: 0, week_xp: 0,
    cap_day: 0, battle_coins: 0, ghost_coins: 0,
    garage_json: '[]', riding: '', lap_best: 0, course_coins: 0,
    blocks_json: '[]', room_json: '', role: 'student', props_json: '[]', eiken_coins: 0, conv_coins: 0,
    voice_minutes: 0, skills_json: '', study_ms: 0, study_days: 0, study_day: 0,
    wardrobe_json: '[]', worn_json: '[]', months_json: '{}', moved_to: '', moved_from: '', first_seen: '',
    eiken_json: '', notes_json: '[]', farm_json: '', farm_coins: 0,
  };
}

export function recordToRow(record, columns) {
  return columns.map((c) => {
    const v = record[c];
    return v === undefined || v === null ? '' : v;
  });
}

export function rowToRecord(row, columns) {
  const record = {};
  columns.forEach((c, i) => { record[c] = row[i] ?? ''; });
  if (record.level === '' || Number(record.level) < 1) record.level = 1;   // rows written before levels existed
  for (const key of ['coins', 'correct', 'attempts', 'catches', 'x', 'z', 'level', 'xp', 'total_xp', 'chats',
    'login_day', 'login_streak', 'week_key', 'week_xp', 'cap_day', 'battle_coins', 'ghost_coins', 'lap_best', 'course_coins', 'eiken_coins', 'conv_coins', 'voice_minutes', 'study_ms', 'study_days', 'study_day', 'farm_coins']) {
    const n = Number(record[key]);
    record[key] = Number.isFinite(n) ? n : 0;
  }
  return record;
}
