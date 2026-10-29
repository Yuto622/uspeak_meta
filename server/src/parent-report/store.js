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
//   teacher_links    先生の LINE（クラス 全員の まとめが とどく。status: active / blocked / stopped）
//   teacher_tokens   先生の QR の 中身（クラスに 1 つ。作りなおすと 前の QR は 使えない）
//   meta             全体の スイッチ・通知を 出した 日 など
//
// 書くのは まとめて（250ms）、tmp に 書いてから rename（とちゅうで 落ちても 壊れない）。path が 無ければ メモリだけ（テスト）。
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const TABLES = ['parent_links', 'link_tokens', 'report_settings', 'teacher_comments', 'reports', 'deliveries', 'report_runs', 'claps', 'teacher_links', 'teacher_tokens'];
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

  // ---- 先生の LINE（クラス 全員の まとめ）-----------------------------------------------------
  // 保護者の 紐づけとは 表を 分ける（保護者の メニュー・きょうだいの まとめに まざらない）。
  teacherToken(classroomId) {
    let t = this.data.teacher_tokens.find((x) => x.classroom_id === classroomId && !x.revoked_at);
    if (!t) { t = { token: newToken(), classroom_id: classroomId, revoked_at: '', created_at: new Date().toISOString() }; this.data.teacher_tokens.push(t); this.touch(); }
    return t;
  }
  findTeacherToken(token) {
    return this.data.teacher_tokens.find((x) => x.token === token && !x.revoked_at) || null;
  }
  teacherLinks({ classroomId = '', lineUserId = '', status = '' } = {}) {
    return this.data.teacher_links.filter((l) => (!classroomId || l.classroom_id === classroomId) && (!lineUserId || l.line_user_id === lineUserId) && (!status || l.status === status));
  }
  addTeacherLink({ classroomId, lineUserId, consentVersion }) {
    const at = new Date().toISOString();
    let l = this.data.teacher_links.find((x) => x.classroom_id === classroomId && x.line_user_id === lineUserId);
    if (l) Object.assign(l, { status: 'active', consent_version: consentVersion, consented_at: at, updated_at: at });
    else { l = { id: newId(), classroom_id: classroomId, line_user_id: lineUserId, status: 'active', consent_version: consentVersion, consented_at: at, created_at: at }; this.data.teacher_links.push(l); }
    this.touch();
    return l;
  }
  setTeacherLinkStatus(filter, status) {
    const rows = this.teacherLinks(filter); const at = new Date().toISOString();
    for (const l of rows) { l.status = status; l.updated_at = at; }
    if (rows.length) this.touch();
    return rows.length;
  }
  // 先生の LINE を ぜんぶ 止めて、QR も 作りなおす（QR が もれた ときの ため）。止めた 紐づけは 消す。
  resetTeacherLine(classroomId) {
    const at = new Date().toISOString();
    for (const t of this.data.teacher_tokens) if (t.classroom_id === classroomId && !t.revoked_at) t.revoked_at = at;
    const before = this.data.teacher_links.length;
    this.data.teacher_links = this.data.teacher_links.filter((l) => l.classroom_id !== classroomId);
    this.touch();
    return before - this.data.teacher_links.length;
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
  // push が とどいた（メニューの「月に 1 回だけ」が 次を いつ 送るか きめる）。
  noteSent(lineUserId, at) {
    const rows = this.links({ lineUserId, status: 'active' });
    for (const l of rows) l.last_sent_at = at;
    if (rows.length) this.touch();
  }
  setLinkStatus(filter, status, { purgeAfterDays = 0 } = {}) {
    const rows = this.links(filter);
    const after = purgeAfterDays ? new Date(Date.now() + purgeAfterDays * 86400000).toISOString() : '';
    const at = new Date().toISOString();
    for (const l of rows) { l.status = status; l.updated_at = at; if (status === 'stopped') l.deleted_after = after; if (status === 'active') l.deleted_after = ''; }
    if (rows.length) this.touch();
    return rows.length;
  }
  // 保持期間：30 日 たった 止めた 紐づけ・ブロック（友だち解除）から 30 日 たった 紐づけ・切れて 30 日 たった QR の 中身・
  // 400 日 より 前の 送信の 記録（LINE の ID が 入っている）を 消す。
  purge(now = Date.now(), { keepDeliveriesMs = 400 * 86400000, graceMs = 30 * 86400000 } = {}) {
    const before = this.data.parent_links.length;
    const gone = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) && t + graceMs <= now; };
    this.data.parent_links = this.data.parent_links.filter((l) => !(l.status === 'stopped' && l.deleted_after && Date.parse(l.deleted_after) <= now) && !(l.status === 'blocked' && gone(l.updated_at || l.created_at)));
    this.data.teacher_links = this.data.teacher_links.filter((l) => !(l.status === 'blocked' && gone(l.updated_at || l.created_at)));
    this.data.teacher_tokens = this.data.teacher_tokens.filter((t) => !gone(t.revoked_at));
    const tokensBefore = this.data.link_tokens.length;
    this.data.link_tokens = this.data.link_tokens.filter((t) => !gone(t.revoked_at) && !gone(t.expires_at));
    const delBefore = this.data.deliveries.length;
    this.data.deliveries = this.data.deliveries.filter((d) => { const t = Date.parse(d.sent_at || ''); return !(Number.isFinite(t) && t + keepDeliveriesMs <= now); });
    const removed = (before - this.data.parent_links.length) + (tokensBefore - this.data.link_tokens.length) + (delBefore - this.data.deliveries.length);
    if (removed) this.touch();
    return before - this.data.parent_links.length;
  }

  // 個人情報の 削除：その 子の 紐づけ・QR・先生の ひとこと・レポート・送信の 記録・👏 を ぜんぶ 消し、消した レポートの token を 返す（ファイルは 呼ぶ側が 消す）。
  eraseStudent(classroomId, username) {
    const mine = (r) => r.classroom_id === classroomId && r.student_username === username;
    const out = {};
    const tokens = this.data.reports.filter(mine).map((r) => r.access_token);
    const reportIds = new Set(this.data.reports.filter(mine).map((r) => r.id));
    const lineIds = new Set(this.data.parent_links.filter(mine).map((l) => l.line_user_id));
    for (const t of ['parent_links', 'link_tokens', 'teacher_comments', 'reports', 'claps']) {
      const before = this.data[t].length;
      this.data[t] = this.data[t].filter((r) => !mine(r));
      out[t] = before - this.data[t].length;
    }
    // 送信の 記録は 子の 名前を 持たない：その 子の レポート宛て、または その 保護者の LINE 宛て の 行を 消す。
    const delBefore = this.data.deliveries.length;
    this.data.deliveries = this.data.deliveries.filter((d) => !(reportIds.has(d.report_id) || lineIds.has(d.line_user_id)));
    out.deliveries = delBefore - this.data.deliveries.length;
    this.touch();
    return { ...out, tokens };
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

  // ---- 👏（保護者 → ゲームの 中の 子ども）--------------------------------------------------------
  addClap(row) {
    const c = { id: newToken().slice(0, 12), web_shown: false, ...row };
    this.data.claps.push(c);
    if (this.data.claps.length > 5000) this.data.claps.splice(0, this.data.claps.length - 5000);
    this.touch();
    return c;
  }
  claps(filter = {}) { return this.data.claps.filter((c) => Object.entries(filter).every(([k, v]) => c[k] === v)); }
  updateClap(id, patch) { const c = this.data.claps.find((x) => x.id === id); if (c) { Object.assign(c, patch); this.touch(); } return c; }

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
