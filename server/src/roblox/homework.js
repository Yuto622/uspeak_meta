// Roblox の「宿題プレース」— Web の 宿題（/admin/homework・/teacher/homework で 先生が クラスに くばる もの）を、
// Roblox でも とけるように する口。**宿題の 置き場は Web の 1 つだけ**（homework/store.js）。Web の 宿題島で とちゅうまで
// やって、つづきを Roblox で やっても、同じ すすみぐあい・同じ ごほうび・同じ 保護者レポートに なる。
//
// 画面と 判定は Roblox の メインワールドと 同じ もの（USpeakFormatUI の build* と check）を 使う。なので この口は
// 1 問の もと（答えつき）を Roblox の **サーバーだけ** に わたし、結果（○×）を うけとって のこす。子どもの 端末には
// Roblox の サーバーが 答えの ない 形（FormatUI.public）だけを 送る（鍵 X-USpeak-Key は Roblox の サーバーしか 持たない）。
//
//  * POST /api/roblox/homework/list    { username, userId?, classCode? }
//        → { ok, child: { classCode, name } | null, items: [summary…] }    まだ もらって いない ごほうびも ここで はらう
//  * POST /api/roblox/homework/items   { username, classCode?, aid }
//        → { ok, assignment: { id, title, due, total }, items: [1 問の もと…], answers: { 問題の id: { ok, tries } } }
//  * POST /api/roblox/homework/answer  { username, userId?, classCode?, aid, itemId, ok, attempt, kind, ms, placeId? }
//        → { ok, answered, total, finished, coins, summary }
//
// だれの 宿題か：Roblox の アカウント名 → ① /admin の 紐づけ（クラス・Web の 名前）② Roblox の 座席シート（教室）
// ③ Roblox が 送る classCode ④ 名簿に 同じ 名前 の じゅんで さがす。名前は 紐づけの Web の 名前、なければ アカウント名。
import { sameUser } from '../store/FileStore.js';

export const HW_DONE_COINS = 20;     // ぜんぶ おえた ごほうび（Web の 宿題島と 同じ）
export const HW_DAILY_CAP = 60;      // 1 人 1 日の 上限（Web の HW_CAP と 同じ）。上限の 日は はらわず、つぎに ひらいた とき はらう
const KINDS = new Set(['mc', 'match', 'spell', 'type', 'order', 'fill', 'listen']);
const str = (v, max = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const jstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

// 1 問の もと（答えつき）。Roblox の サーバーが USpeakFormatUI の build* で 形に する。
export function itemForRoblox(it) {
  return {
    id: it.id, kind: it.kind, en: it.en || '', ja: it.ja || '', sentence: it.sentence || '', blank: it.blank || '',
    prompt: it.prompt || '', answer: it.answer || '', wrong: Array.isArray(it.wrong) ? it.wrong.slice(0, 6) : [],
  };
}

export function createRobloxHomework({ homework = () => null, childFor = () => null, seats = () => null, roster = () => null,
  store = null, walletAdd = () => false, now = Date.now, log = console } = {}) {
  const paidToday = new Map();   // username（小文字）→ { day, n }

  // Roblox の アカウント名 → { classCode, name }。見つからなければ null。
  async function resolve(username, classCode = '') {
    const link = childFor(username);
    const name = str(link?.name, 40) || str(username, 40);
    if (link?.class && link.class !== '*') return { classCode: link.class, name };
    try {
      const s = await seats()?.seats?.();
      const seat = (s || []).find((r) => sameUser(r.username, username));
      if (seat?.code) return { classCode: seat.code, name };
    } catch (err) { log.warn?.('[roblox:homework] seats failed:', err.message); }
    if (str(classCode, 24)) return { classCode: str(classCode, 24), name };
    try {
      const rows = (await roster()?.listAllRoster?.()) || [];
      const row = rows.find((r) => r?.class && (sameUser(r.name, name) || sameUser(r.name, username)));
      if (row) return { classCode: row.class, name };
    } catch (err) { log.warn?.('[roblox:homework] roster failed:', err.message); }
    return null;
  }

  function capLeft(username, at) {
    const k = String(username).toLowerCase();
    const c = paidToday.get(k);
    const used = c && c.day === jstDay(at) ? c.n : 0;
    return { k, used, left: Math.max(0, HW_DAILY_CAP - used) };
  }

  // ぜんぶ おえて いて まだ もらって いない ごほうびを はらう（Web の payHomework と 同じ きまり）。
  async function pay(hw, child, username, aid) {
    const p = hw.progressOf(child.classCode, child.name, aid);
    if (!p?.doneAt || p.paid) return 0;
    const at = now();
    const cap = capLeft(username, at);
    const give = Math.min(HW_DONE_COINS, cap.left);
    if (give <= 0) return 0;
    if (!await hw.markPaid(child.classCode, child.name, aid)) return 0;
    paidToday.set(cap.k, { day: jstDay(at), n: cap.used + give });
    walletAdd(username, give, `homework:${aid}`);
    return give;
  }
  async function payOwed(hw, child, username) {
    let total = 0;
    for (const a of hw.forClass(child.classCode)) total += await pay(hw, child, username, a.id);
    return total;
  }

  async function list(body) {
    const hw = homework();
    const username = str(body.username, 40);
    if (!hw) return { status: 503, json: { ok: false, error: 'homework is off' } };
    if (!username) return { status: 400, json: { ok: false, error: 'username is required' } };
    const child = await resolve(username, body.classCode);
    if (!child) return { status: 200, json: { ok: true, child: null, items: [] } };
    const coins = await payOwed(hw, child, username);
    return { status: 200, json: { ok: true, child, coins, items: hw.listFor(child.classCode, child.name, now()) } };
  }

  async function items(body) {
    const hw = homework();
    const username = str(body.username, 40);
    if (!hw) return { status: 503, json: { ok: false, error: 'homework is off' } };
    if (!username) return { status: 400, json: { ok: false, error: 'username is required' } };
    const child = await resolve(username, body.classCode);
    if (!child) return { status: 404, json: { ok: false, error: 'no class for this account' } };
    const a = hw.forClass(child.classCode).find((x) => x.id === str(body.aid, 40));
    if (!a) return { status: 404, json: { ok: false, error: 'no such homework' } };
    const p = hw.progressOf(child.classCode, child.name, a.id);
    const answers = {};
    for (const [id, v] of Object.entries(p?.answers || {})) answers[id] = { ok: !!v.ok, tries: v.tries || 0 };
    return { status: 200, json: { ok: true, child,
      assignment: { id: a.id, title: a.title, due: a.due || '', note: a.note || '', total: a.items.length },
      items: a.items.map(itemForRoblox), answers } };
  }

  async function answer(body) {
    const hw = homework();
    const username = str(body.username, 40);
    if (!hw) return { status: 503, json: { ok: false, error: 'homework is off' } };
    if (!username) return { status: 400, json: { ok: false, error: 'username is required' } };
    const child = await resolve(username, body.classCode);
    if (!child) return { status: 404, json: { ok: false, error: 'no class for this account' } };
    const a = hw.forClass(child.classCode).find((x) => x.id === str(body.aid, 40));
    if (!a) return { status: 404, json: { ok: false, error: 'no such homework' } };
    const item = a.items.find((it) => it.id === str(body.itemId, 24));
    if (!item) return { status: 404, json: { ok: false, error: 'no such item' } };
    const at = now();
    const correct = body.ok === true;
    const attempt = Math.max(1, Math.min(3, Number(body.attempt) || 1));
    const kind = KINDS.has(body.kind) ? body.kind : item.kind;
    // 1 回目で 正解 ＝ ○。2 回目の 正解・2 回 まちがい ＝ ×（Web の 宿題島と 同じ。もう 1 回 やれば ○ に なる）
    const rec = await hw.record(child.classCode, child.name, a.id, item.id, correct && attempt === 1);
    const ms = Math.max(0, Math.round(Number(body.ms) || 0));
    const word = item.en || item.blank || '';
    if (store?.appendRobloxEvents) {
      const data = { level: 'Homework', homework: a.id, format: kind, correct, fast: !correct && ms > 0 && ms < 1200, retry: attempt >= 2, ms, source: 'roblox', ...(word ? { word } : {}) };
      store.appendRobloxEvents([{ id: `hw-${username}-${a.id}-${item.id}-${at}`.slice(0, 120), ts: at, type: 'quiz', world: 'homework', place_id: str(body.placeId, 32),
        username, user_id: str(body.userId, 32), class_code: child.classCode, data_json: JSON.stringify(data), received_at: new Date(at).toISOString(), source: 'roblox' }]);
    }
    const coins = rec?.finished ? await pay(hw, child, username, a.id) : 0;
    const p = hw.progressOf(child.classCode, child.name, a.id);
    const answered = a.items.filter((it) => p?.answers?.[it.id]).length;
    return { status: 200, json: { ok: true, answered, total: a.items.length, finished: !!rec?.finished, coins, summary: hw.summaryOf(a, p, at) } };
  }

  // sync.js の 鍵つきの Router に のせる
  function mount(api) {
    const wrap = (fn) => async (req, res) => {
      try { const r = await fn(req.body || {}); res.status(r.status).json(r.json); }
      catch (err) { log.error?.('[roblox:homework]', err); res.status(500).json({ ok: false, error: 'server error' }); }
    };
    api.post('/homework/list', wrap(list));
    api.post('/homework/items', wrap(items));
    api.post('/homework/answer', wrap(answer));
  }

  return { resolve, list, items, answer, mount };
}
