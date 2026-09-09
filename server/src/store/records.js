// Shared record shapes for every store backend.
export const PLAYER_COLUMNS = [
  'class', 'name', 'coins', 'correct', 'attempts', 'catches', 'space', 'x', 'z',
  'inventory_json', 'owned_json', 'wands_json', 'wand', 'progress_json', 'updated_at', 'last_seen',
];
export const LEARNING_COLUMNS = ['timestamp', 'class', 'name', 'question_id', 'mode', 'choice', 'correct', 'xp', 'session_id'];
export const COIN_COLUMNS = ['timestamp', 'class', 'name', 'op', 'item', 'quantity', 'delta', 'balance', 'session_id'];

// Names and class codes are sanitized so they never contain '|'.
export const playerKey = (classCode, name) => `${classCode}|${name}`;

export function blankPlayerRecord(classCode, name) {
  return {
    class: classCode, name, coins: 0, correct: 0, attempts: 0, catches: 0,
    space: '', x: 0, z: 0, inventory_json: '{}', owned_json: '[]', wands_json: '[]', wand: '',
    progress_json: '', updated_at: '', last_seen: '',
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
  for (const key of ['coins', 'correct', 'attempts', 'catches', 'x', 'z']) {
    const n = Number(record[key]);
    record[key] = Number.isFinite(n) ? n : 0;
  }
  return record;
}
