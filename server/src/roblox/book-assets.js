// 絵本の 絵を Roblox へ 上げる（Open Cloud の Assets API）— よみもの島の 本を Roblox 版でも 読める ように する。
//
// ・絵は サーバーが かいた SVG を PNG に して（book-png.js）、1 まいずつ `POST /assets/v1/assets`（multipart：request＋fileContent）で 上げる。
//   返って くるのは「作業」（operations/<id>）。`GET /assets/v1/operations/<id>` を 見て assetId と 審査の ようすを もらう。
//   審査中の 絵は `GET /assets/v1/assets/<id>` で あとから 見なおす。
// ・**同じ 絵は 1 回しか 上げない。** 絵の しるし（artHash：場面＋絵の 版＋大きさ）を DATA_DIR/roblox-book-assets.json に のこす。
//   絵の かき方や 場面が かわった 絵だけ 上げなおす。とちゅうで 落ちても、のこした ところから つづける。
// ・鍵は 環境変数 ROBLOX_OPEN_CLOUD_KEY だけ（コード・ログ・画面・ファイルに 出さない）。鍵が なければ 何も しない。
// ・おくりすぎない：1 分の 上限（ROBLOX_UPLOAD_PER_MIN）・1 回の 上限（limit）・429 は Retry-After か 倍々で 待つ。
import fs from 'node:fs/promises';
import { writeJsonFile } from '../store/write-json.js';
import { allBooks } from '../game/reading.js';
import { artHash, renderPng, pngReady, PNG_WIDTH, PNG_HEIGHT } from './book-png.js';

export const STATES = ['sending', 'working', 'reviewing', 'approved', 'rejected', 'failed'];
const keyOf = (bookId, n) => `${bookId}/${n}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 審査の ことば（MODERATION_STATE_APPROVED・Approved など）→ じぶんの ことば。
export function moderationOf(asset) {
  const s = String(asset?.moderationResult?.moderationState || '').toUpperCase();
  if (s.includes('APPROVED')) return 'approved';
  if (s.includes('REJECTED')) return 'rejected';
  return 'reviewing';
}
// エラーの 文から 鍵らしい ものを 消す（ログ・画面に 出す 前に かならず 通す）。
const scrub = (text, secret) => { let t = String(text ?? '').slice(0, 300); if (secret) t = t.split(secret).join('***'); return t.replace(/[A-Za-z0-9+/=_-]{40,}/g, '***'); };

export class BookAssets {
  constructor(file, { apiKey = '', userId = '', groupId = '', assetType = 'Image', baseUrl = 'https://apis.roblox.com', perMin = 30, fetchImpl = globalThis.fetch,
    books = allBooks, render = renderPng, hash = artHash, log = console, now = Date.now, wait = sleep } = {}) {
    Object.assign(this, { file, apiKey, userId: String(userId || ''), groupId: String(groupId || ''), assetType, baseUrl: baseUrl.replace(/\/$/, ''), perMin: Math.max(1, perMin), fetchImpl, books, render, hash, log, now, wait });
    this.pictures = {};
    this.job = { running: false, stop: false, startedAt: 0, endedAt: 0, sent: 0, polled: 0, lastError: '', note: '' };
  }

  async init() {
    if (this.file) {
      try {
        const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
        for (const [k, v] of Object.entries(raw.pictures || {})) if (v && typeof v === 'object' && typeof v.hash === 'string') this.pictures[k] = { hash: v.hash, state: STATES.includes(v.state) ? v.state : 'failed', op: String(v.op || ''), assetId: String(v.assetId || ''), type: String(v.type || 'Image'), error: String(v.error || ''), at: Number(v.at) || 0 };
      } catch (err) { if (err.code !== 'ENOENT') this.log.warn?.('[roblox-books] could not read the asset list:', err.message); }
    }
    return this;
  }
  save() { return this.file ? writeJsonFile(this.file, JSON.stringify({ version: 1, updatedAt: this.now(), pictures: this.pictures })) : Promise.resolve(); }

  // 足りない 設定（名前だけ）。空なら 使える。
  missing() {
    const m = [];
    if (!this.apiKey) m.push('ROBLOX_OPEN_CLOUD_KEY');
    if (!this.userId && !this.groupId) m.push('ROBLOX_CREATOR_USER_ID または ROBLOX_CREATOR_GROUP_ID');
    return m;
  }
  get enabled() { return this.missing().length === 0; }

  // ぜんぶの 絵（本ごとに 表紙＋ページ）と いまの ようす。state: 'new'（まだ）・'changed'（絵が かわった）も 入る。
  plan({ book = '' } = {}) {
    const list = [];
    for (const b of this.books().values()) {
      if (book && b.id !== book) continue;
      for (let n = 0; n <= b.pages.length; n += 1) {
        const hash = this.hash(b, n); const e = this.pictures[keyOf(b.id, n)];
        const state = !e ? 'new' : e.hash !== hash ? 'changed' : e.state;
        // group：管理ページで 1 行に まとめる もの（「ABC と おと」の 絵カードは 1 ことば 1 冊なので、まとめないと 百 行を こえる）。
        list.push({ key: keyOf(b.id, n), book: b.id, n, title: b.title, stage: b.stage, group: b.group || '', groupTitle: b.groupTitle || '', hash, state, assetId: e && e.hash === hash ? e.assetId : '' });
      }
    }
    return list;
  }
  // 上げる 必要が ある 絵（まだ・かわった・とちゅうで 落ちた・前に しっぱいした）。rejected は 上げなおさない（同じ 絵は また 落ちる）。
  // 順番：表紙を 先に（本だなが 早く そろう）→ やさしい 段階の 本から。
  pending(opts) {
    const order = ['A', 'B', 'C', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    // 表紙 → ABC の 絵カード → ページ。
    const rank = (p) => (p.group ? 50 : (p.n === 0 ? 0 : 1) * 100 + Math.max(0, order.indexOf(p.stage)));
    return this.plan(opts).filter((p) => p.state === 'new' || p.state === 'changed' || p.state === 'sending' || p.state === 'failed').sort((a, b) => rank(a) - rank(b));
  }

  // 本ごとの 数（管理画面）。
  summary() {
    const by = new Map();
    for (const p of this.plan()) {
      const gk = p.group ? `group:${p.group}` : p.book;
      const row = by.get(gk) || { book: p.group ? '' : p.book, group: p.group, title: p.group ? p.groupTitle : p.title, stage: p.group ? '—' : p.stage, total: 0, approved: 0, reviewing: 0, rejected: 0, failed: 0, todo: 0 };
      row.total += 1;
      if (p.state === 'approved') row.approved += 1; else if (p.state === 'reviewing' || p.state === 'working') row.reviewing += 1;
      else if (p.state === 'rejected') row.rejected += 1; else if (p.state === 'failed') { row.failed += 1; row.todo += 1; } else row.todo += 1;
      by.set(gk, row);
    }
    const rows = [...by.values()];
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    return { rows, totals: { books: rows.filter((r) => !r.group).length, total: sum('total'), approved: sum('approved'), reviewing: sum('reviewing'), rejected: sum('rejected'), failed: sum('failed'), todo: sum('todo') } };
  }
  // Roblox の ゲームに わたす 絵（審査を 通った ものだけ）。なければ ''。
  imageFor(bookId, n) {
    const b = this.books().get(bookId); const e = this.pictures[keyOf(bookId, n)];
    if (!b || !e || e.state !== 'approved' || !e.assetId || e.hash !== this.hash(b, n)) return '';
    // Decal で 上げた ときは 画像の 番号では ないので、サムネイルの 口を 使う（小さめに なる）。
    return e.type === 'Decal' ? `rbxthumb://type=Asset&id=${e.assetId}&w=420&h=420` : `rbxassetid://${e.assetId}`;
  }

  status() {
    return { enabled: this.enabled, missing: this.missing(), assetType: this.assetType, creator: this.groupId ? 'group' : this.userId ? 'user' : '', perMin: this.perMin, size: `${PNG_WIDTH}×${PNG_HEIGHT}`,
      job: { ...this.job }, ...this.summary() };
  }

  async call(method, path, body) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, { method, headers: { 'x-api-key': this.apiKey }, body });
    let json = null; let text = '';
    try { text = await res.text(); json = text ? JSON.parse(text) : null; } catch { /* JSON で ない へんじ */ }
    return { status: res.status, json, text, retryAfter: Number(res.headers?.get?.('retry-after')) || 0 };
  }
  // 429・5xx は 待って もう一度（Retry-After か 2→4→8…秒、60 秒まで）。
  async callWithBackoff(method, path, makeBody, tries = 5) {
    let delay = 2000; let last = null;
    for (let i = 0; i < tries; i += 1) {
      if (this.job.stop) return last || { status: 0, json: null, text: 'stopped' };
      last = await this.call(method, path, makeBody ? makeBody() : undefined);
      if (last.status !== 429 && last.status < 500) return last;
      const ms = Math.min(60_000, last.retryAfter ? last.retryAfter * 1000 : delay);
      this.job.note = last.status === 429 ? `おくりすぎ（429）：${Math.round(ms / 1000)} 秒 まちます` : `Roblox の エラー（${last.status}）：${Math.round(ms / 1000)} 秒 まちます`;
      await this.wait(ms); delay *= 2;
    }
    return last;
  }

  // 作業（operation）の けっかを 絵の 記録に うつす。
  applyOperation(entry, op) {
    if (!op?.done) { entry.state = 'working'; return false; }
    if (op.error) { entry.state = 'failed'; entry.error = scrub(op.error.message || JSON.stringify(op.error), this.apiKey); return true; }
    const asset = op.response || {};
    entry.assetId = String(asset.assetId || String(asset.path || '').replace(/^assets\//, '') || '');
    entry.state = entry.assetId ? moderationOf(asset) : 'failed';
    if (!entry.assetId) entry.error = 'no asset id in the result';
    return true;
  }
  async pollOne(key) {
    const e = this.pictures[key]; if (!e) return;
    if (e.state === 'working' && e.op) {
      const r = await this.callWithBackoff('GET', `/assets/v1/operations/${encodeURIComponent(e.op)}`);
      if (r.status === 200 && r.json) this.applyOperation(e, r.json);
      else if (r.status === 401 || r.status === 403) throw new Error(`Roblox が 鍵を うけつけません（${r.status}）`);
    } else if (e.state === 'reviewing' && e.assetId) {
      const r = await this.callWithBackoff('GET', `/assets/v1/assets/${encodeURIComponent(e.assetId)}`);
      if (r.status === 200 && r.json) e.state = moderationOf(r.json);
      else if (r.status === 401 || r.status === 403) throw new Error(`Roblox が 鍵を うけつけません（${r.status}）`);
    }
    e.at = this.now(); this.job.polled += 1;
  }

  async uploadOne(p) {
    const book = this.books().get(p.book);
    const png = book ? await this.render(book, p.n) : null;
    if (!png) { this.pictures[p.key] = { hash: p.hash, state: 'failed', op: '', assetId: '', type: this.assetType, error: 'PNG に できませんでした（@resvg/resvg-js が 入って いない？）', at: this.now() }; return; }
    const request = JSON.stringify({
      assetType: this.assetType, displayName: `USpeak ${book.title}`.slice(0, 40) + (book.abc ? '' : ` p${p.n}`), description: book.abc ? 'U-Speak ABC and Sounds picture card (original art).' : 'U-Speak Book Island picture book (original art).',
      creationContext: { creator: this.groupId ? { groupId: this.groupId } : { userId: this.userId } },
    });
    // おくる 前に「おくって いる」と のこす（ここで 落ちたら つぎに もう一度 おくる。その 1 まいだけ 2 回に なる ことが ある）。
    this.pictures[p.key] = { hash: p.hash, state: 'sending', op: '', assetId: '', type: this.assetType, error: '', at: this.now() };
    await this.save();
    const r = await this.callWithBackoff('POST', '/assets/v1/assets', () => {
      const form = new FormData();
      form.append('request', request);
      form.append('fileContent', new Blob([png], { type: 'image/png' }), `${p.book}-${p.n}.png`);
      return form;
    });
    const e = this.pictures[p.key];
    if (r.status === 401 || r.status === 403) { e.state = 'failed'; e.error = `鍵が うけつけられません（${r.status}）`; throw new Error(`Roblox が 鍵を うけつけません（${r.status}）。鍵の 権限（assets の Read・Write）と 作り手の ID を 見て ください`); }
    if (r.status !== 200 || !r.json) { e.state = 'failed'; e.error = scrub(`${r.status} ${r.json?.message || r.text || ''}`, this.apiKey); return; }
    e.op = String(r.json.operationId || String(r.json.path || '').replace(/^operations\//, '') || '');
    if (r.json.done) this.applyOperation(e, r.json); else e.state = e.op ? 'working' : 'failed';
    if (!e.op && e.state === 'failed') e.error = 'no operation id';
    this.job.sent += 1;
  }

  // 1 回ぶん まわす：① 前に 上げた 絵の ようすを 見る ② 足りない 絵を limit まで 上げる ③ いま 上げた 絵の けっかを 見る。
  async run({ limit = 200, book = '', dryRun = false } = {}) {
    if (!this.enabled) return { ok: false, error: `設定が 足りません：${this.missing().join('・')}` };
    if (!(await pngReady())) return { ok: false, error: 'PNG を 作る 部品（@resvg/resvg-js）が 入って いません' };
    if (this.job.running) return { ok: false, error: 'いま 動いて います' };
    const todo = this.pending({ book }).slice(0, Math.max(0, limit));
    if (dryRun) return { ok: true, dryRun: true, wouldSend: todo.map((p) => p.key), waiting: Object.values(this.pictures).filter((e) => e.state === 'working' || e.state === 'reviewing').length };
    this.job = { running: true, stop: false, startedAt: this.now(), endedAt: 0, sent: 0, polled: 0, lastError: '', note: '' };
    const gap = Math.ceil(60_000 / this.perMin);
    try {
      for (const [k, e] of Object.entries(this.pictures)) {
        if (this.job.stop) break;
        if ((e.state === 'working' || e.state === 'reviewing') && (!book || k.startsWith(`${book}/`))) { await this.pollOne(k); await this.wait(Math.min(gap, 250)); }
      }
      await this.save();
      for (const p of todo) {
        if (this.job.stop) break;
        const t0 = this.now();
        await this.uploadOne(p);
        await this.save();
        this.job.note = `${this.job.sent} / ${todo.length} まい おくりました`;
        const spent = this.now() - t0;
        if (spent < gap) await this.wait(gap - spent);
      }
      // いま おくった 絵の 作業を 2 回まで 見る（のこりは つぎに「つづける」を おした とき）。
      for (let round = 0; round < 2 && !this.job.stop; round += 1) {
        const working = Object.entries(this.pictures).filter(([, e]) => e.state === 'working');
        if (!working.length) break;
        await this.wait(round ? 4000 : 1500);
        for (const [k] of working) { if (this.job.stop) break; await this.pollOne(k); }
        await this.save();
      }
    } catch (err) {
      this.job.lastError = scrub(err?.message || err, this.apiKey);
      this.log.warn?.('[roblox-books] upload stopped:', this.job.lastError);
    } finally {
      await this.save().catch(() => {});
      this.job.running = false; this.job.endedAt = this.now();
      if (this.job.stop) this.job.note = '止めました';
    }
    return { ok: !this.job.lastError, sent: this.job.sent, polled: this.job.polled, error: this.job.lastError || undefined, ...this.summary().totals };
  }
  stop() { if (this.job.running) this.job.stop = true; return this.job.running; }
}
