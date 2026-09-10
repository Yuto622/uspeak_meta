// Shared record shapes for every store backend.
// Append-only: new fields go on the end so an existing sheet keeps its column meanings.
export const PLAYER_COLUMNS = [
  'class', 'name', 'coins', 'correct', 'attempts', 'catches', 'space', 'x', 'z',
  'inventory_json', 'owned_json', 'wands_json', 'wand', 'progress_json', 'missions_json', 'updated_at', 'last_seen',
  'level', 'xp', 'total_xp', 'chats', 'dex_json', 'move', 'pet_json',
  'login_day', 'login_streak', 'week_key', 'week_xp',
  'cap_day', 'battle_coins', 'ghost_coins',
  'garage_json', 'riding', 'lap_best', 'course_coins',
];
export const LEARNING_COLUMNS = ['timestamp', 'class', 'name', 'question_id', 'mode', 'choice', 'correct', 'xp', 'session_id'];
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
    'login_day', 'login_streak', 'week_key', 'week_xp', 'cap_day', 'battle_coins', 'ghost_coins', 'lap_best', 'course_coins']) {
    const n = Number(record[key]);
    record[key] = Number.isFinite(n) ? n : 0;
  }
  return record;
}
