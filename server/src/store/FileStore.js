// JSON-file persistence for local development and tests (pass filePath=null for memory only).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { playerKey } from './records.js';

const MAX_LOG_ROWS = 50000;

export class FileStore {
  constructor(filePath, { log = console } = {}) {
    this.filePath = filePath;
    this.log = log;
    this.data = { players: {}, learning: [], coins: [], ...blankRoblox() };
    this.dirty = false;
    this.eventIds = new Set();
    this.name = filePath ? `file:${filePath}` : 'memory';
    // Bumped by saveRoster so a gate holding a cached register knows to read again.
    this.rosterVersion = 0;
  }

  async init() {
    if (!this.filePath) return;
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') this.data = { players: {}, learning: [], coins: [], ...blankRoblox(), ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') this.log.warn('[store:file] could not read store file, starting empty:', err.message);
    }
    for (const e of this.data.roblox_events) this.eventIds.add(e.id);
  }

  async loadPlayer(classCode, name) {
    const record = this.data.players[playerKey(classCode, name)];
    return record ? { ...record } : null;
  }

  // The class register, kept beside the store as its own file so a teacher can edit it
  // with a text editor and nothing else has to be running. Re-read when it changes on
  // disk, so a name added mid-lesson takes effect without a restart.
  //
  // Shape: {"rows": [{class, name, note}]} (what the admin page writes), a flat
  // [{class, name}] list, or {"classes": {"6-1": ["Aki", "Ben"]}}. A class of "*" (or
  // an empty one) is every class.
  get rosterFile() { return this.filePath ? path.join(path.dirname(this.filePath), 'roster.json') : null; }

  // Every row, or null when no register is kept here at all.
  async listAllRoster() {
    if (!this.filePath) return this.memoryRoster ? this.memoryRoster.map((r) => ({ ...r })) : null;
    const file = this.rosterFile;
    let stat;
    try { stat = await fs.stat(file); } catch { return null; }
    if (!this.rosterAt || this.rosterAt !== stat.mtimeMs) {
      try {
        const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
        this.roster = rosterRowsFromJson(parsed);
        this.rosterAt = stat.mtimeMs;
      } catch (err) {
        this.log.warn('[store:file] roster.json could not be read:', err.message);
        return this.roster ? this.roster.map((r) => ({ ...r })) : null;
      }
    }
    return this.roster.map((r) => ({ ...r }));
  }

  async listRoster(classCode) {
    const rows = await this.listAllRoster();
    if (rows === null) return null;
    return rows.filter((r) => r.class === classCode || r.class === '*').map((r) => ({ ...r, class: classCode }));
  }

  // Replace the register (the admin page's save). Written whole and atomically, as its
  // own file, so a teacher can still open it in an editor.
  async saveRoster(rows) {
    const clean = rows.filter((r) => r && r.name).map((r) => ({ class: r.class && r.class !== '*' ? String(r.class) : '*', name: String(r.name), note: String(r.note ?? ''), ...(r.teacher ? { teacher: true } : {}), ...(r.premium ? { premium: true } : {}), ...(r.pin ? { pin: String(r.pin).slice(0, 40) } : {}) }));
    this.rosterVersion += 1;
    if (!this.filePath) { this.memoryRoster = clean; return; }
    const file = this.rosterFile;
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), rows: clean }, null, 2));
    await fs.rename(tmp, file);
    this.roster = clean;
    this.rosterAt = (await fs.stat(file)).mtimeMs;
  }

  // Every record for one class, which is what the weekly board ranks.
  listClass(classCode) {
    return Object.values(this.data.players).filter((r) => r && r.class === classCode).map((r) => ({ ...r }));
  }

  // 記録が ある 教室の コード（/admin/reports の 教室一覧）。
  listClassCodes() {
    return [...new Set(Object.values(this.data.players).map((r) => r?.class).filter(Boolean))];
  }

  savePlayer(record) {
    this.data.players[playerKey(record.class, record.name)] = { ...record };
    this.dirty = true;
  }

  appendLearning(row) {
    this.data.learning.push(row);
    if (this.data.learning.length > MAX_LOG_ROWS) this.data.learning.splice(0, this.data.learning.length - MAX_LOG_ROWS);
    this.dirty = true;
  }

  appendCoin(row) {
    this.data.coins.push(row);
    if (this.data.coins.length > MAX_LOG_ROWS) this.data.coins.splice(0, this.data.coins.length - MAX_LOG_ROWS);
    this.dirty = true;
  }

  // 個人情報の 削除（本人・保護者からの もうしでに こたえる）。記録・学習ログ・コインログ・Roblox との 紐づけを
  // その 子の ぶんだけ 消す。Roblox の できごと（roblox_events）は username で 別に 消す（erasePlayer の username）。
  async erasePlayer(classCode, name, { username = '' } = {}) {
    const key = playerKey(classCode, name);
    const same = (r) => r && String(r.class) === String(classCode) && String(r.name) === String(name);
    const out = { player: 0, learning: 0, coins: 0, roblox_links: 0, roblox_events: 0, wallet: 0 };
    if (this.data.players[key]) { delete this.data.players[key]; out.player = 1; }
    const keep = (list, pred) => { const before = list.length; const kept = list.filter((r) => !pred(r)); return [kept, before - kept.length]; };
    [this.data.learning, out.learning] = keep(this.data.learning, same);
    [this.data.coins, out.coins] = keep(this.data.coins, same);
    const u = String(username || '').toLowerCase();
    [this.data.roblox_links, out.roblox_links] = keep(this.data.roblox_links, (r) => (String(r.class) === String(classCode) && String(r.name) === String(name)) || (u && String(r.username || '').toLowerCase() === u));
    if (u) {
      [this.data.roblox_events, out.roblox_events] = keep(this.data.roblox_events, (r) => String(r.username || '').toLowerCase() === u);
      for (const e of this.data.roblox_events) this.eventIds.add(e.id);
      [this.data.wallet_entries, out.wallet] = keep(this.data.wallet_entries || [], (r) => String(r.username || '').toLowerCase() === u);
      if (this.data.wallet_snapshots && this.data.wallet_snapshots[u]) delete this.data.wallet_snapshots[u];
    }
    this.dirty = true;
    await this.flush();
    return out;
  }

  // 保持期間：学習ログ・コインログ・配った ウォレットの 行は 日付で 消す（月ごとの まとめは 記録の months_json に 残る）。
  async prune({ maxAgeMs, now = Date.now() } = {}) {
    if (!(maxAgeMs > 0)) return { learning: 0, coins: 0, wallet: 0 };
    const cutoff = now - maxAgeMs;
    const old = (r) => { const t = Date.parse(r.timestamp || r.created_at || r.delivered_at || ''); return Number.isFinite(t) && t < cutoff; };
    const n = { learning: 0, coins: 0, wallet: 0 };
    const drop = (list, pred) => { const kept = list.filter((r) => !pred(r)); return [kept, list.length - kept.length]; };
    [this.data.learning, n.learning] = drop(this.data.learning, old);
    [this.data.coins, n.coins] = drop(this.data.coins, old);
    [this.data.wallet_entries, n.wallet] = drop(this.data.wallet_entries || [], (r) => r.delivered_at && old(r));
    if (n.learning || n.coins || n.wallet) { this.dirty = true; await this.flush(); }
    return n;
  }

  async flush() {
    if (!this.dirty || !this.filePath) { this.dirty = false; return; }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.data));
    await fs.rename(tmp, this.filePath);
    this.dirty = false;
  }

  async close() { await this.flush(); }

  // ---- Roblox 連携（records.js の列、docs/ROBLOX_SYNC.md）-----------------------------
  // 学習の記録。`id` で冪等：同じ id が2度来ても1度だけ貯める。**消さない**。
  appendRobloxEvents(rows) {
    let accepted = 0; let duplicates = 0;
    for (const row of rows) {
      if (!row?.id || this.eventIds.has(row.id)) { duplicates += 1; continue; }
      this.eventIds.add(row.id);
      this.data.roblox_events.push({ ...row });
      accepted += 1;
    }
    if (accepted) this.dirty = true;
    return { accepted, duplicates };
  }

  async listRobloxEvents({ username = '', classCode = '', since = 0, until = 0 } = {}) {
    return this.data.roblox_events.filter((e) => eventMatches(e, { username, classCode, since, until })).map((e) => ({ ...e }));
  }

  // Web で動いたコイン（未配達のものを Roblox が取りに来る）。
  addWalletEntry(entry) {
    this.data.wallet_entries.push({ ...entry, delivered_at: entry.delivered_at || '' });
    // 古い行から すてるが、**まだ Roblox に 届いていない 行は すてない**（すてると 2 つの 残高が ずれる）。
    if (this.data.wallet_entries.length > MAX_LOG_ROWS) {
      let extra = this.data.wallet_entries.length - MAX_LOG_ROWS;
      this.data.wallet_entries = this.data.wallet_entries.filter((e) => { if (extra > 0 && e.delivered_at) { extra -= 1; return false; } return true; });
    }
    this.dirty = true;
  }

  async listWalletEntries({ username = '', undelivered = false } = {}) {
    return this.data.wallet_entries.filter((e) => (!username || sameUser(e.username, username)) && (!undelivered || !e.delivered_at)).map((e) => ({ ...e }));
  }

  async ackWalletEntries(ids, deliveredAt) {
    const want = new Set(ids);
    let n = 0;
    for (const e of this.data.wallet_entries) if (want.has(e.id) && !e.delivered_at) { e.delivered_at = deliveredAt; n += 1; }
    if (n) this.dirty = true;
    return n;
  }

  saveWalletSnapshot(snapshot) {
    this.data.wallet_snapshots[String(snapshot.username).toLowerCase()] = { ...snapshot };
    this.dirty = true;
  }

  async getWalletSnapshot(username) {
    const s = this.data.wallet_snapshots[String(username).toLowerCase()];
    return s ? { ...s } : null;
  }

  async listMetrics() { return this.data.metric_definitions.map((m) => ({ ...m })); }

  async saveMetrics(rows) {
    this.data.metric_definitions = rows.map((m) => ({ ...m }));
    this.dirty = true;
  }

  async listRobloxLinks() { return this.data.roblox_links.map((r) => ({ ...r })); }

  async saveRobloxLinks(rows) {
    this.data.roblox_links = rows.map((r) => ({ ...r }));
    this.dirty = true;
  }
}

function blankRoblox() {
  return { roblox_events: [], wallet_entries: [], wallet_snapshots: {}, metric_definitions: [], roblox_links: [] };
}

// Roblox のアカウント名は大文字小文字を区別しない（Roblox 自体がそう）。Web で "hana" と
// 打った子と Roblox の "Hana" は同じ子。
export const sameUser = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

export function eventMatches(e, { username = '', classCode = '', since = 0, until = 0 }) {
  if (username && !sameUser(e.username, username)) return false;
  if (classCode && e.class_code !== classCode) return false;
  if (since || until) {
    const t = Number(e.ts) || 0;
    if (since && t < since) return false;
    if (until && t >= until) return false;
  }
  return true;
}

function rosterRowsFromJson(parsed) {
  const rows = [];
  const push = (cls, name, note, teacher = false, premium = false, pin = '') => { if (name) rows.push({ class: cls && cls !== '*' ? String(cls) : '*', name: String(name), note: String(note ?? ''), ...(teacher === true || teacher === 'true' ? { teacher: true } : {}), ...(premium === true || premium === 'true' ? { premium: true } : {}) }); };
  if (Array.isArray(parsed)) {
    for (const r of parsed) push(r?.class, r?.name, r?.note, r?.teacher, r?.premium, r?.pin);
  } else if (parsed && Array.isArray(parsed.rows)) {
    for (const r of parsed.rows) push(r?.class, r?.name, r?.note, r?.teacher, r?.premium, r?.pin);
  } else if (parsed && typeof parsed.classes === 'object') {
    for (const [cls, names] of Object.entries(parsed.classes)) for (const name of Array.isArray(names) ? names : []) push(cls, name, '');
  }
  return rows;
}
