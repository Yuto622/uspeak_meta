// JSON の ファイルを こわさずに 書く（DATA_DIR の 宿題・ロードマップ・教室・タスク・問題DB）。
//
// 一時ファイルに 書いて から rename するので、とちゅうで 落ちても 前の ファイルが のこる。
// **同じ ファイルへの 書きこみは 1 本ずつ 順番に する。** 前は 2 人が 同時に 答えると 2 つの 書きこみが
// 同じ 一時ファイルに 同時に 書き、まざった 中身が rename されて、再起動の ときに 読めなく なる おそれが あった。
import fs from 'node:fs/promises';
import path from 'node:path';

const queues = new Map(); // file -> いま 書いて いる Promise

export function writeJsonFile(file, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const prev = queues.get(file) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, file);
  });
  queues.set(file, next);
  next.finally(() => { if (queues.get(file) === next) queues.delete(file); }).catch(() => {});
  return next;
}
