// フォニックスの おと（もじ 1 つずつの おと）を くばる 口と、運営が ろくおん した 声の 置き場。
//
//   GET /phonics/<id>?v=<版>   … ろくおん した 声（DATA_DIR/phonics/<id>.wav）が あれば それ、なければ
//                                 同梱の 自作の 音（client/dist/assets/phonics/<id>.mp3・docs/make-phonics.py）。
// 答えは 入って いない（おとの 名前だけ）ので ログイン なしで 出す。id は phonics.js の 一覧だけ。
// ろくおんは /admin/abc（運営だけ）。ブラウザが 短く 切って WAV に して 送る（Safari でも 鳴る 形）。
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PHONEMES, PHONEME_IDS } from '../../../client/dist/phonics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLED = path.resolve(here, '../../../client/dist/assets/phonics');
export const MAX_BYTES = 600 * 1024;   // 32kHz・16bit・モノラルで 9 秒ぶん。おと 1 つには じゅうぶん
const known = new Set(PHONEME_IDS);

// RIFF/WAVE の PCM か（中身の 形だけ 見る）。
export function isWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 64 || buf.length > MAX_BYTES) return false;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return false;
  return buf.indexOf('fmt ', 12, 'ascii') > 0 && buf.indexOf('data', 12, 'ascii') > 0;
}

export class PhonicsVoices {
  constructor(dir, { log = console } = {}) { this.dir = dir; this.log = log; this.mem = new Map(); this.stamp = new Map(); }

  async init() {
    if (!this.dir) return this;
    await fs.mkdir(this.dir, { recursive: true });
    for (const f of await fs.readdir(this.dir).catch(() => [])) {
      const m = /^([a-z]+)\.wav$/.exec(f);
      if (!m || !known.has(m[1])) continue;
      const st = await fs.stat(path.join(this.dir, f)).catch(() => null);
      if (st) this.stamp.set(m[1], `${st.size}:${Math.floor(st.mtimeMs)}`);
    }
    return this;
  }

  has(id) { return this.stamp.has(id); }
  list() { return PHONEME_IDS.map((id) => ({ id, ex: PHONEMES[id].ex, g: PHONEMES[id].g, recorded: this.has(id) })); }
  // ページが ?v= に つける 版（ろくおんが かわると かわる＝古い 音が キャッシュに のこらない）。
  version() {
    if (!this.stamp.size) return 'b1';
    const h = crypto.createHash('sha1');
    for (const [id, s] of [...this.stamp].sort()) h.update(`${id}=${s};`);
    return h.digest('hex').slice(0, 10);
  }

  async read(id) {
    if (!this.has(id)) return null;
    if (!this.dir) return this.mem.get(id) || null;
    return fs.readFile(path.join(this.dir, `${id}.wav`)).catch(() => null);
  }

  async save(id, buf) {
    if (!known.has(id)) return { ok: false, error: 'unknown sound' };
    if (!isWav(buf)) return { ok: false, error: 'not a wav' };
    if (this.dir) {
      const tmp = path.join(this.dir, `.${id}.${process.pid}.tmp`);
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, path.join(this.dir, `${id}.wav`));
    } else this.mem.set(id, Buffer.from(buf));
    this.stamp.set(id, `${buf.length}:${Date.now()}`);
    this.log.info?.(`[phonics] recorded /${id}/ (${buf.length} bytes)`);
    return { ok: true };
  }

  async remove(id) {
    if (!known.has(id)) return false;
    if (this.dir) await fs.rm(path.join(this.dir, `${id}.wav`), { force: true });
    this.mem.delete(id);
    const had = this.stamp.delete(id);
    if (had) this.log.info?.(`[phonics] /${id}/ back to the built-in sound`);
    return had;
  }
}

export function mountPhonics(app, { voices, log = console }) {
  app.get('/phonics/:id', async (req, res) => {
    const id = String(req.params.id || '').replace(/\.(mp3|wav)$/, '');
    if (!known.has(id)) { res.status(404).type('text/plain').send('not found'); return; }
    const fresh = String(req.query.v || '') === voices.version();
    res.set('Cache-Control', fresh ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.set('X-Content-Type-Options', 'nosniff');
    try {
      const rec = await voices.read(id);
      if (rec) { res.type('audio/wav').send(rec); return; }
      res.type('audio/mpeg').sendFile(path.join(BUNDLED, `${id}.mp3`), (err) => { if (err && !res.headersSent) res.status(404).end(); });
    } catch (err) {
      log.warn?.('[phonics] send failed:', err.message);
      if (!res.headersSent) res.status(500).end();
    }
  });
}
