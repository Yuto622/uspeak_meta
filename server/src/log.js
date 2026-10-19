// Minimal leveled logger. LOG_LEVEL=debug|info|warn|error (default info).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const stamp = () => new Date().toISOString();

// 子どもの 名前は ログ（Fly の ログ・ホスティングの 保管）に そのまま 書かない。
// 同じ 名前は 同じ 札（6 文字）に なるので、追いかけは できる。LOG_PII=1 の ときだけ 生の 名前。
import { createHash } from 'node:crypto';
const pii = process.env.LOG_PII === '1';
export const who = (name) => {
  if (name == null || name === '') return '(no name)';
  if (pii) return `"${name}"`;
  return 'u:' + createHash('sha256').update(String(name)).digest('base64url').slice(0, 6);
};

export const log = {
  debug: (...a) => { if (threshold <= LEVELS.debug) console.debug(stamp(), 'DEBUG', ...a); },
  info: (...a) => { if (threshold <= LEVELS.info) console.info(stamp(), 'INFO ', ...a); },
  warn: (...a) => { if (threshold <= LEVELS.warn) console.warn(stamp(), 'WARN ', ...a); },
  error: (...a) => { if (threshold <= LEVELS.error) console.error(stamp(), 'ERROR', ...a); },
};
