// LINE（Messaging API と LINE ログイン）。依存は fetch と crypto だけ（SDK は 入れない）。
//
//  - push(to, messages, { retryKey })：X-Line-Retry-Key で 再送しても 二重に 届かない。429・5xx は 指数バックオフ。
//    400 系（ブロック・存在しない 相手）は やりなおさない（{ ok:false, permanent:true }）。
//  - verifySignature(rawBody, header)：Webhook の 署名（HMAC-SHA256・base64）。
//  - verifyIdToken(idToken)：LIFF から 来た ID トークンを LINE に 確かめて、ユーザー ID（sub）を 返す。
//    **ページから 来た ユーザー ID を そのまま 信じない**ため。
//  - reply(replyToken, messages)：Webhook への 返事（下の メニュー）。**通数に かぞえられない＝無料**（push は かぞえる）。
//  - dry-run（LINE_DRY_RUN=1、または トークンが 無い）：送らずに ログだけ。
// LINE の ユーザー ID・トークンは ログに 出さない（mask）。
import { parentLines, STAGE_IDS } from '../game/roadmap.js';
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

  // 返事（Reply API）。1 回だけ・30 秒 いないに 使える トークン なので やりなおさない。
  async function reply(replyToken, messages) {
    if (!replyToken || !messages?.length) return { ok: false, error: 'nothing to send' };
    const msgs = messages.slice(0, 5);
    if (dryRun) {
      sent.push({ reply: true, replyToken, messages: msgs, at: Date.now() });
      log.info?.(`[line] dry-run reply: ${msgs.length} message(s)`);
      return { ok: true, dryRun: true };
    }
    try {
      const res = await call('POST', '/v2/bot/message/reply', { replyToken, messages: msgs });
      if (res.ok) return { ok: true };
      return { ok: false, status: res.status, error: `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` };
    } catch (err) { return { ok: false, error: `network: ${err.message}` }; }
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

  return { push, reply, verifySignature, verifyIdToken, quota, get dryRun() { return dryRun; }, sent };
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

// ロードマップ（いまの 段階・次まで・英検の 見込み・おすすめの 場所）を 1 つの 吹き出しに。
export function roadmapText(v) {
  const L = parentLines(v);
  if (!L) return '';
  return [`🗺 ${L.stageLine}`, ...(L.cando ? [L.cando] : []), L.nextLine, ...L.eiken, ...(L.places.length ? [`おすすめ：${L.places.join('・')}`] : []), `※${L.note}`].join('\n').slice(0, 2000);
}

// ロードマップの カード（LINE の Flex Message）。文だけの 吹き出しは 長くて 読まれない ので、
// 「いま どこ」→「次まで あと どれだけ（バー）」→「英検の 見こみ」→「おすすめ」の 順に 1 まいに する。
const GREEN = '#1B3A2F'; const ORANGE = '#E27A2D'; const MUTED = '#6B7A74'; const TRACK = '#E8EEEA';
const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
const tx = (text, o = {}) => ({ type: 'text', text: String(text).slice(0, 300), wrap: true, size: 'sm', color: '#1F2A26', ...o });
function bar(p, color) {
  const inner = { type: 'box', layout: 'vertical', contents: [{ type: 'filler' }], width: `${Math.max(p, 2)}%`, height: '8px', backgroundColor: color, cornerRadius: '4px' };
  return { type: 'box', layout: 'vertical', contents: [inner], height: '8px', backgroundColor: TRACK, cornerRadius: '4px', margin: 'sm' };
}
function meter(label, right, p, color = GREEN) {
  return { type: 'box', layout: 'vertical', margin: 'md', contents: [
    { type: 'box', layout: 'horizontal', contents: [tx(label, { flex: 3, weight: 'bold' }), tx(right, { flex: 4, align: 'end', color: MUTED, size: 'xs' })] },
    bar(p, color),
  ] };
}
const section = (title) => tx(title, { size: 'xs', color: MUTED, weight: 'bold', margin: 'xl' });

export function roadmapFlex(nick, v, { page = '', game = '' } = {}) {
  const L = parentLines(v);
  if (!L) return null;
  const s = v.stage;
  const of = STAGE_IDS.length;
  const header = { type: 'box', layout: 'vertical', backgroundColor: GREEN, paddingAll: '16px', contents: [
    tx(`🗺 ${nick}さんの ロードマップ`, { color: '#CFE3D8', size: 'xs' }),
    { type: 'box', layout: 'baseline', margin: 'sm', contents: [
      tx(s.id, { size: 'xxl', weight: 'bold', color: '#FFFFFF', flex: 0 }),
      tx(s.ja, { size: 'lg', weight: 'bold', color: '#FFFFFF', margin: 'md' }),
    ] },
    tx(`${s.gradeJa}${s.jr ? ` ${s.jr}` : ''} くらい ・ ${v.index + 1} / ${of} だんかい`, { color: '#CFE3D8', size: 'xs', margin: 'sm' }),
    { type: 'box', layout: 'horizontal', spacing: 'xs', margin: 'md', contents: STAGE_IDS.map((_, i) => ({ type: 'box', layout: 'vertical', contents: [{ type: 'filler' }], height: '6px', cornerRadius: '3px', backgroundColor: i < v.index ? '#7FC4A0' : i === v.index ? ORANGE : '#3C5A4E' })) },
  ] };
  const body = [];
  if (s.cando?.ja) body.push(section('🎯 この だんかいで めざす こと'), tx(s.cando.ja, { weight: 'bold', margin: 'sm' }));
  body.push(section(v.last ? '🏁 さいごの だんかい' : '🚩 つぎの だんかいまで'));
  if (!v.last) {
    if (v.words.need) body.push(meter('📘 たんご', v.words.left ? `${v.words.known} / ${v.words.need} こ（あと ${v.words.left}）` : '✓ クリア', pct(v.words.known, v.words.need)));
    if (v.quiz.left) body.push(meter('✏️ クイズ', `${v.quiz.n} / ${v.quiz.min} もん（あと ${v.quiz.left}）`, pct(v.quiz.n, v.quiz.min), ORANGE));
    else if (v.quiz.acc !== null && v.quiz.acc < v.quiz.rate) body.push(meter('✏️ クイズの せいかい', `${v.quiz.acc}% → ${v.quiz.rate}%`, pct(v.quiz.acc, v.quiz.rate), ORANGE));
    else body.push(meter('✏️ クイズ', '✓ クリア', 100, ORANGE));
    if (!v.words.left && !v.quiz.left && !(v.quiz.acc !== null && v.quiz.acc < v.quiz.rate)) body.push(tx('🎉 つぎに ゲームを ひらくと 次の だんかいへ！', { color: ORANGE, weight: 'bold', margin: 'md' }));
  }
  if (v.eiken?.length) {
    body.push(section('📝 英検（一次）の 見こみ'));
    for (const c of v.eiken.slice(0, 3)) {
      const right = c.chance === null
        ? `あと ${c.lacking.reduce((n, l) => n + l.more, 0)} もんで わかる`
        : `やく ${c.chance}%`;
      body.push(meter(`英検${c.ja}`, right, c.chance ?? 0, c.chance === null ? '#B9C4BF' : c.chance >= 80 ? '#2E9B63' : c.chance >= 50 ? ORANGE : '#D9534F'));
    }
  }
  const places = (v.places?.list || []).slice(0, 3);
  if (places.length) {
    body.push(section('👉 おすすめの れんしゅう'));
    for (const p of places) body.push({ type: 'box', layout: 'horizontal', margin: 'sm', paddingAll: '8px', backgroundColor: '#F4F7F5', cornerRadius: '8px', contents: [
      tx(p.emoji || '•', { flex: 0 }), tx(p.ja, { margin: 'md', size: 'sm' }),
    ] });
  }
  body.push(tx('※ 見こみは 島の 練習問題の 正解率から 出した めやすです（作文・面接は ふくまず、合格の 約束では ありません）。', { size: 'xxs', color: MUTED, margin: 'xl' }));
  const bubble = { type: 'bubble', size: 'mega', header, body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: body } };
  // いちばん 下は「つづきを あそぶ」（ゲームへ）。ひらいた その 場で 次の 1 問に つなげる ことが 続けて もらう いちばんの 近道。
  const buttons = [];
  if (game) buttons.push({ type: 'button', style: 'primary', color: ORANGE, height: 'sm', action: { type: 'uri', label: '🎮 つづきを あそぶ', uri: game } });
  if (page) buttons.push({ type: 'button', style: 'link', color: GREEN, height: 'sm', action: { type: 'uri', label: 'くわしい レポートを 見る', uri: page } });
  if (buttons.length) bubble.footer = { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: buttons };
  const alt = `🗺 ${nick}さん：${s.id}「${s.ja}」${v.index + 1}/${of}。${L.nextLine}`;
  return { type: 'flex', altText: alt.slice(0, 400), contents: bubble };
}

// おうちで できる こと 1 つ（週の レポート）。研究では「のばせる ところ」を 具体的に 1 つ つたえる 文が いちばん 効いた
// （Kraft & Rogers 2015・READY4K）。ことばは 復習の 箱で 時期の きた もの → 宿題で まちがえた もの。
export function homeTip(d) {
  const words = [...new Set([d?.next?.en, ...(d?.homework?.missed || [])].filter((w) => w && /^[A-Za-z][A-Za-z' -]{0,30}$/.test(w)))].slice(0, 3);
  if (words.length) return `🏠 おうちで できる こと：${words.map((w) => `「${w}」`).join('')}を、おうちの方が 日本語で 言い、お子さんが 英語で こたえる クイズを 1 分。`;
  if (d?.zero) return '🏠 おうちで できる こと：「U-Speak で どんな ことばを おぼえた？」と 1 回 きいて みて ください。';
  return '🏠 おうちで できる こと：今週 おぼえた ことばを 1 つ、お子さんに 英語で おしえて もらって ください。';
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
