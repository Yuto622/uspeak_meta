// Minimal leveled logger. LOG_LEVEL=debug|info|warn|error (default info).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const stamp = () => new Date().toISOString();

// 子どもの 名前は ログ（Fly の ログ・ホスティングの 保管）に そのまま 書かない。
// 同じ 名前は 同じ 札（6 文字）に なるので、追いかけは できる。LOG_PII=1 の ときだけ 生の 名前。
// 札は 鍵つき（HMAC）：鍵が ないと 名前の 一覧から 逆引き できない。鍵は LOG_SALT か REPORT_SECRET、
// どちらも なければ 起動ごとの 乱数（再起動で 札が かわるが、名前は もれない）。
import { createHmac, randomBytes } from 'node:crypto';
const pii = process.env.LOG_PII === '1';
const salt = process.env.LOG_SALT || process.env.REPORT_SECRET || randomBytes(16).toString('hex');
const tag = (s) => createHmac('sha256', salt).update(String(s)).digest('base64url').slice(0, 6);
export const who = (name) => {
  if (name == null || name === '') return '(no name)';
  if (pii) return `"${name}"`;
  return 'u:' + tag(name);
};
// IP も 個人情報：ログには 札だけ（同じ IP は 同じ 札。しめ出しの 判定は 生の IP で する）。
export const ipTag = (ip) => (ip ? 'ip:' + tag(ip) : 'ip:?');

export const log = {
  debug: (...a) => { if (threshold <= LEVELS.debug) console.debug(stamp(), 'DEBUG', ...a); },
  info: (...a) => { if (threshold <= LEVELS.info) console.info(stamp(), 'INFO ', ...a); },
  warn: (...a) => { if (threshold <= LEVELS.warn) console.warn(stamp(), 'WARN ', ...a); },
  error: (...a) => { if (threshold <= LEVELS.error) console.error(stamp(), 'ERROR', ...a); },
};
