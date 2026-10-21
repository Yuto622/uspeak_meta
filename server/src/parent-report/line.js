// LINE（Messaging API と LINE ログイン）。依存は fetch と crypto だけ（SDK は 入れない）。
//
//  - push(to, messages, { retryKey })：X-Line-Retry-Key で 再送しても 二重に 届かない。429・5xx は 指数バックオフ。
//    400 系（ブロック・存在しない 相手）は やりなおさない（{ ok:false, permanent:true }）。
//  - verifySignature(rawBody, header)：Webhook の 署名（HMAC-SHA256・base64）。
//  - verifyIdToken(idToken)：LIFF から 来た ID トークンを LINE に 確かめて、ユーザー ID（sub）を 返す。
//    **ページから 来た ユーザー ID を そのまま 信じない**ため。
//  - dry-run（LINE_DRY_RUN=1、または トークンが 無い）：送らずに ログだけ。
// LINE の ユーザー ID・トークンは ログに 出さない（mask）。
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const API = 'https://api.line.me';
export const mask = (id) => (id ? `${String(id).slice(0, 3)}…${String(id).slice(-2)}` : '-');

// 同じ 中身なら 同じ UUID（X-Line-Retry-Key は UUID の 形が 要る）。
export function retryUuid(...parts) {
  const h = createHash('sha256').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function createLine({
  token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  secret = process.env.LINE_CHANNEL_SECRET || '',
  loginChannelId = process.env.LINE_LOGIN_CHANNEL_ID || '',
  dryRun = process.env.LINE_DRY_RUN === '1' || !process.env.LINE_CHANNEL_ACCESS_TOKEN,
  log = console, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), retries = 4,
} = {}) {
  const sent = [];      // dry-run の 記録（テスト・/admin の 確認用）

  async function call(method, pathname, body, headers = {}) {
    return fetchImpl(`${API}${pathname}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  }

  async function push(to, messages, { retryKey = '' } = {}) {
    if (!to || !messages?.length) return { ok: false, permanent: true, error: 'nothing to send' };
    if (dryRun) {
      sent.push({ to, messages, retryKey, at: Date.now() });
      log.info?.(`[line] dry-run push to ${mask(to)}: ${messages.length} message(s)`);
      return { ok: true, dryRun: true };
    }
    let wait = 1000;
    for (let i = 0; ; i += 1) {
      let res;
      try {
        res = await call('POST', '/v2/bot/message/push', { to, messages }, retryKey ? { 'X-Line-Retry-Key': retryKey } : {});
      } catch (err) {
        if (i >= retries) return { ok: false, error: `network: ${err.message}` };
        await sleep(wait); wait *= 2; continue;
      }
      if (res.ok) return { ok: true };
      // 409 ＝ 同じ retry key で もう 受け付け済み（前回 届いている）＝成功あつかい。
      if (res.status === 409) return { ok: true, duplicate: true };
      const text = (await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 429 || res.status >= 500) {
        if (i >= retries) return { ok: false, error: `${res.status} ${text}` };
        await sleep(wait); wait *= 2; continue;
      }
      return { ok: false, permanent: true, status: res.status, error: `${res.status} ${text}` };
    }
  }

  function verifySignature(rawBody, header) {
    if (!secret || !header) return false;
    const want = createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(want); const b = Buffer.from(String(header));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async function verifyIdToken(idToken) {
    if (!idToken || !loginChannelId) return null;
    const res = await fetchImpl(`${API}/oauth2/v2.1/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: String(idToken), client_id: loginChannelId }).toString(),
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    const body = await res.json().catch(() => null);
    return body?.sub ? { userId: body.sub } : null;
  }

  // 今月の 送信数と 上限（プランの 無料メッセージ数）。
  async function quota() {
    if (dryRun) return { used: sent.length, limit: null, dryRun: true };
    try {
      const [q, c] = await Promise.all([call('GET', '/v2/bot/message/quota'), call('GET', '/v2/bot/message/quota/consumption')]);
      const qb = q.ok ? await q.json() : {}; const cb = c.ok ? await c.json() : {};
      return { used: Number(cb.totalUsage) || 0, limit: qb.type === 'limited' ? Number(qb.value) || null : null };
    } catch (err) { return { used: null, limit: null, error: err.message }; }
  }

  return { push, verifySignature, verifyIdToken, quota, get dryRun() { return dryRun; }, sent };
}

// ---- 吹き出しを 作る ------------------------------------------------------------------------
// 1 人ぶん：画像（毎週版）＋ ボタン［PDFで見る］（月の まとめが あれば もう 1 つ）。
// 本文は「{ニックネーム}さんの英語きろく（期間）」だけ。宣伝・告知は 一切 入れない。
// 宿題の すすみぐあい（その 期間）を 1 つの 吹き出しに。数字は homework/store.js の periodSummary。
const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '');
export function homeworkText(hw, { nick = '', range = '' } = {}) {
  if (!hw || !hw.total) return '';
  const lines = [`📚 ${nick}さんの宿題（${range}）`];
  lines.push(`提出 ${hw.done} / ${hw.total}${hw.done ? `（しめきりまでに ${hw.onTime}）` : ''}${hw.overdue ? `・しめきり すぎ ${hw.overdue}` : ''}`);
  for (const r of hw.rows.slice(0, 8)) {
    const st = r.status === 'done' ? `✅ ${r.correct}/${r.total}問 正解（${r.score}%）${r.doneDay ? ` ${md(r.doneDay)}提出` : ''}${r.late ? '・おくれて提出' : ''}`
      : r.overdue ? `⏰ しめきり すぎ ${r.answered}/${r.total}問` : r.status === 'doing' ? `とちゅう ${r.answered}/${r.total}問` : 'まだ';
    lines.push(`・${r.title}：${st}${r.due && r.status !== 'done' ? `　しめきり ${md(r.due)}` : ''}`);
  }
  if (hw.rows.length > 8) lines.push(`ほか ${hw.rows.length - 8} 件`);
  if (hw.answered) lines.push(`この期間に答えた問題 ${hw.answered}問・正解率 ${hw.accuracy}%${hw.minutes ? `・取り組んだ時間 約${hw.minutes}分` : ''}${hw.days ? `（${hw.days}日）` : ''}`);
  if (hw.answered) lines.push(`1回で正解 ${hw.firstTry}問・やり直し ${hw.retries}回${hw.avgScore !== null ? `・提出した宿題の平均 ${hw.avgScore}%` : ''}`);
  const kinds = hw.byKind.filter((k) => k.n >= 2).map((k) => `${k.ja} ${Math.round((k.ok / k.n) * 100)}%`);
  if (kinds.length) lines.push(`形ごとの正解率：${kinds.join('・')}`);
  if (hw.missed.length) lines.push(`もう一度練習したいことば：${hw.missed.slice(0, 8).join(', ')}`);
  return lines.join('\n').slice(0, 4800);
}

export function childMessages({ nick, range, sender, png, thumb, pdf, monthlyPdf = '', altText, homework = '' }) {
  const out = [];
  if (png) out.push({ type: 'image', originalContentUrl: png, previewImageUrl: thumb || png });
  if (homework) out.push({ type: 'text', text: homework });
  const actions = [];
  if (pdf) actions.push({ type: 'uri', label: 'PDFで見る', uri: pdf });
  if (monthlyPdf) actions.push({ type: 'uri', label: '月のまとめ(PDF)', uri: monthlyPdf });
  if (actions.length) {
    const title = `U-Speak（${sender}）`.slice(0, 40);
    out.push({
      type: 'template',
      altText: String(altText || `${nick}さんの英語きろく`).slice(0, 400),
      template: { type: 'buttons', title, text: `${nick}さんの英語きろく（${range}）`.slice(0, 60), actions },
    });
  }
  // altText（通知と トーク一覧の プレビュー）は「今週は4日英語をして86問に答えました」のような 事実 1 行。
  return out;
}
// 保護者 1 人ぶんを、1 回 5 つまでの push に 分ける（きょうだいは まとめて 通数を 節約）。
export function bundle(childGroups, max = 5) {
  const pushes = []; let cur = [];
  for (const group of childGroups) {
    if (cur.length && cur.length + group.length > max) { pushes.push(cur); cur = []; }
    cur.push(...group);
  }
  if (cur.length) pushes.push(cur);
  return pushes;
}
