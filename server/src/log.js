// Minimal leveled logger. LOG_LEVEL=debug|info|warn|error (default info).
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const stamp = () => new Date().toISOString();

export const log = {
  debug: (...a) => { if (threshold <= LEVELS.debug) console.debug(stamp(), 'DEBUG', ...a); },
  info: (...a) => { if (threshold <= LEVELS.info) console.info(stamp(), 'INFO ', ...a); },
  warn: (...a) => { if (threshold <= LEVELS.warn) console.warn(stamp(), 'WARN ', ...a); },
  error: (...a) => { if (threshold <= LEVELS.error) console.error(stamp(), 'ERROR', ...a); },
};
