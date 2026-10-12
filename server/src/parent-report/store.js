// 保護者レポートの 記録（表 7 つ）。本体の store（Sheets / file）とは 分けて、ボリューム（DATA_DIR）の
// 1 つの JSON に 置く：本体が Google スプレッドシートでも、LINE の ユーザー ID を シートに 書かない ため。
//
//   parent_links     生徒 ↔ 保護者の LINE（status: active / blocked / stopped）
//   link_tokens      QR カードの 中身（推測できない 32 文字以上・1 枚で 4 人まで）
//   report_settings  教室ごとの 配信設定（既定は オフ）
//   teacher_comments 先生が えらんだ ひとこと（その 回だけ）
//   reports          作った レポート（PDF・画像の 置き場所と、見る ための access_token）
//   deliveries       送った 結果（1 通ずつ）
//   report_runs      配信 1 回ぶんの まとめ
//   meta             全体の スイッチ・通知を 出した 日 など
//
// 書くのは まとめて（250ms）、tmp に 書いてから rename（とちゅうで 落ちても 壊れない）。path が 無ければ メモリだけ（テスト）。
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const TABLES = ['parent_links', 'link_tokens', 'report_settings', 'teacher_comments', 'reports', 'deliveries', 'report_runs'];
const MAX_DELIVERIES = 20000;
const MAX_RUNS = 2000;

export const newToken = (bytes = 24) => randomBytes(bytes).toString('base64url');   // 24 バイト → 32 文字
export const newId = () => `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false, frequency: 'weekly', send_weekday: 1, send_time: '19:00', skip_zero_week: true, monthly_pdf: true,
  sender_name: '', teacher_label: '先生',
});

export class ReportStore {
  constructor(file, { log = console } = {}) {
    this.file = file;
    this.log = log;
    this.data = blank();
    this.timer = null;
    this.writing = Promise.resolve();
  }

  async init() {
    if (!this.file) return this;
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.data = { ...blank(), ...raw };
      for (const t of TABLES) if (!Array.isArray(this.data[t])) this.data[t] = [];
    } catch (err) {
      if (err.code !== 'ENOENT') this.log.warn?.('[parent-report] store unreadable, starting empty:', err.message);
    }
    return this;
  }

  touch() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 250);
    this.timer.unref?.();
  }
  async flush() {
    if (!this.file) return;
    const body = JSON.stringify(this.data);
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, body);
      await fs.rename(tmp, this.file);
    }).catch((err) => this.log.warn?.('[parent-report] store write failed:', err.message));
    return this.writing;
  }
  async close() { clearTimeout(this.timer); this.timer = null; await this.flush(); }

  // ---- meta -----------------------------------------------------------------------------
  get meta() { return this.data.meta; }
  setMeta(patch) { Object.assign(this.data.meta, patch); this.touch(); return this.data.meta; }

  // ---- 教室の 設定 -----------------------------------------------------------------------
  settings(classroomId) {
    const row = this.data.report_settings.find((r) => r.classroom_id === classroomId);
    return { classroom_id: classroomId, ...DEFAULT_SETTINGS, ...(row || {}) };
  }
  allSettings() { return this.data.report_settings.map((r) => ({ ...DEFAULT_SETTINGS, ...r })); }
  saveSettings(classroomId, patch) {
    let row = this.data.report_settings.find((r) => r.classroom_id === classroomId);
    if (!row) { row = { classroom_id: classroomId }; this.data.report_settings.push(row); }
    Object.assign(row, patch, { classroom_id: classroomId, updated_at: new Date().toISOString() });
    this.touch();
    return this.settings(classroomId);
  }

  // ---- QR の トークン --------------------------------------------------------------------
  tokenFor(classroomId, username, nickname, { now = Date.now(), ttlDays = 365 } = {}) {
    let t = this.data.link_tokens.find((x) => x.classroom_id === classroomId && x.student_username === username && !x.revoked_at && Date.parse(x.expires_at) > now);
    if (!t) {
      t = { token: newToken(), student_username: username, nickname, classroom_id: classroomId, expires_at: new Date(now + ttlDays * 86400000).toISOString(), used_count: 0, revoked_at: '', created_at: new Date(now).toISOString() };
      this.data.link_tokens.push(t);
      this.touch();
    } else if (nickname && t.nickname !== nickname) { t.nickname = nickname; this.touch(); }
    return t;
  }
  regenerateToken(classroomId, username, nickname, opts) {
    const at = new Date().toISOString();
    for (const t of this.data.link_tokens) if (t.classroom_id === classroomId && t.student_username === username && !t.revoked_at) t.revoked_at = at;
    this.touch();
    return this.tokenFor(classroomId, username, nickname, opts);
  }
  findToken(token, now = Date.now()) {
    const t = this.data.link_tokens.find((x) => x.token === token);
    if (!t || t.revoked_at || Date.parse(t.expires_at) <= now) return null;
    return t;
  }

  // ---- 保護者の 紐づけ ---------------------------------------------------------------------
  links({ classroomId = '', username = '', lineUserId = '', status = '' } = {}) {
    return this.data.parent_links.filter((l) => (!classroomId || l.classroom_id === classroomId) && (!username || l.student_username === username)
      && (!lineUserId || l.line_user_id === lineUserId) && (!status || l.status === status));
  }
  addLink({ classroomId, username, nickname, lineUserId, consentVersion }) {
    let l = this.data.parent_links.find((x) => x.classroom_id === classroomId && x.student_username === username && x.line_user_id === lineUserId);
    const at = new Date().toISOString();
    if (l) Object.assign(l, { status: 'active', consent_version: consentVersion, consented_at: at, nickname, deleted_after: '' });
    else {
      l = { id: newId(), classroom_id: classroomId, student_username: username, nickname, line_user_id: lineUserId, status: 'active', consent_version: consentVersion, consented_at: at, created_at: at, deleted_after: '' };
      this.data.parent_links.push(l);
    }
    this.touch();
    return l;
  }
  setLinkStatus(filter, status, { purgeAfterDays = 0 } = {}) {
    const rows = this.links(filter);
    const after = purgeAfterDays ? new Date(Date.now() + purgeAfterDays * 86400000).toISOString() : '';
    const at = new Date().toISOString();
    for (const l of rows) { l.status = status; l.updated_at = at; if (status === 'stopped') l.deleted_after = after; if (status === 'active') l.deleted_after = ''; }
    if (rows.length) this.touch();
    return rows.length;
  }
  // 30 日 たった 止めた 紐づけを 消す。
  purge(now = Date.now()) {
    const before = this.data.parent_links.length;
    this.data.parent_links = this.data.parent_links.filter((l) => !(l.status === 'stopped' && l.deleted_after && Date.parse(l.deleted_after) <= now));
    if (this.data.parent_links.length !== before) this.touch();
    return before - this.data.parent_links.length;
  }

  // ---- 先生の ひとこと ---------------------------------------------------------------------
  comment(classroomId, username, periodKey) {
    const list = this.data.teacher_comments.filter((c) => c.classroom_id === classroomId && c.period_key === periodKey);
    return list.find((c) => c.student_username === username) || list.find((c) => !c.student_username) || null;
  }
  chooseComment({ classroomId, username = '', periodKey, text, by = 'teacher' }) {
    this.data.teacher_comments = this.data.teacher_comments.filter((c) => !(c.classroom_id === classroomId && c.period_key === periodKey && (c.student_username || '') === username));
    if (text) this.data.teacher_comments.push({ classroom_id: classroomId, student_username: username, period_key: periodKey, text: String(text).slice(0, 80), chosen_by: by, chosen_at: new Date().toISOString() });
    this.touch();
  }
  commentsFor(classroomId, periodKey) { return this.data.teacher_comments.filter((c) => c.classroom_id === classroomId && c.period_key === periodKey); }

  // ---- レポート・配信・実行 ----------------------------------------------------------------
  addReport(row) { const r = { id: newId(), created_at: new Date().toISOString(), ...row }; this.data.reports.push(r); this.touch(); return r; }
  reportByToken(token) { return this.data.reports.find((r) => r.access_token === token) || null; }
  reportById(id) { return this.data.reports.find((r) => r.id === id) || null; }
  findReport({ username, kind, periodKey }) { return [...this.data.reports].reverse().find((r) => r.student_username === username && r.kind === kind && r.period_key === periodKey && !r.revoked_at) || null; }
  reports(filter = {}) { return this.data.reports.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)); }
  revokeReports(pred) { const at = new Date().toISOString(); let n = 0; for (const r of this.data.reports) if (!r.revoked_at && pred(r)) { r.revoked_at = at; n += 1; } if (n) this.touch(); return n; }
  dropReports(pred) { const gone = this.data.reports.filter(pred); this.data.reports = this.data.reports.filter((r) => !pred(r)); if (gone.length) this.touch(); return gone; }

  addDelivery(row) {
    const d = { id: newId(), sent_at: new Date().toISOString(), ...row };
    this.data.deliveries.push(d);
    if (this.data.deliveries.length > MAX_DELIVERIES) this.data.deliveries.splice(0, this.data.deliveries.length - MAX_DELIVERIES);
    this.touch();
    return d;
  }
  deliveries(filter = {}) { return this.data.deliveries.filter((d) => Object.entries(filter).every(([k, v]) => d[k] === v)); }
  updateDelivery(id, patch) { const d = this.data.deliveries.find((x) => x.id === id); if (d) { Object.assign(d, patch); this.touch(); } return d; }

  addRun(row) {
    const r = { id: newId(), started_at: new Date().toISOString(), finished_at: '', counts_json: '{}', ...row };
    this.data.report_runs.push(r);
    if (this.data.report_runs.length > MAX_RUNS) this.data.report_runs.splice(0, this.data.report_runs.length - MAX_RUNS);
    this.touch();
    return r;
  }
  finishRun(id, counts) { const r = this.data.report_runs.find((x) => x.id === id); if (r) { r.finished_at = new Date().toISOString(); r.counts_json = JSON.stringify(counts); this.touch(); } return r; }
  runs(filter = {}) { return this.data.report_runs.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)); }
}

function blank() {
  return { meta: { enabled: true, notices: {} }, ...Object.fromEntries(TABLES.map((t) => [t, []])) };
}
