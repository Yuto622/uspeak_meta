// 「ABC と おと」：はじめの 数問で とばす・8 割で つぎへ・答えは 答える 前に 送らない・いつもの 記録に のる・にがての ふくしゅう・設定は 運営だけ。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.ADMIN_KEY = 'owner-password-123';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const A = await import('../src/game/abc.js');
const { AbcStore } = await import('../src/abc/store.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

// きまった 乱数。
const rngOf = (seed = 7) => { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
// 1 回ぶんを さいごまで：right(item) が true なら 正解を、false なら まちがいを 送る。
function play(progress, settings, { right = () => true, review = false, hi = false, rng = rngOf() } = {}) {
  const round = A.startRound(progress, settings, { review, hi, rng });
  assert.ok(round, 'round starts');
  const seen = [];
  for (let guard = 0; guard < 40; guard += 1) {
    const q = A.question(round); if (!q) break;
    const it = round.items[round.at]; seen.push({ q, it });
    let msg;
    if (it.teach) msg = { seen: true };
    else if (it.kind === 'spell') msg = { order: right(it) ? it.parts.map((p, i) => it.blocks.filter((b) => b.t === p)[it.parts.slice(0, i).filter((x) => x === p).length].id) : [...it.blocks].reverse().map((b) => b.id).slice(0, it.blocks.length - 1) };
    else msg = { choice: right(it) ? it.answer : q.choices.find((c) => c !== it.answer) };
    const r = A.answer(round, msg, { rng });
    if (r.over) break;
  }
  return { round, seen, summary: A.finish(progress, round) };
}

test('中身：26 もじ ぜんぶに ことば・s a t p i n から・ルールが ならぶ', () => {
  assert.ok(A.ready());
  const d = A.data();
  assert.deepEqual(d.order.slice(0, 6), ['s', 'a', 't', 'p', 'i', 'n']);
  assert.equal(Object.keys(d.letters).length, 26);
  const u = A.units();
  assert.deepEqual(u.map((x) => x.type).filter((t, i, a) => a.indexOf(t) === i), ['cvc', 'digraph', 'magic', 'spell'], '① つなげて よむ ② 2 もじ ③ ながい ぼいん ④ つづる');
  assert.ok(A.ruleUnits().length >= 8 && !A.ruleUnits().some((x) => x.type === 'spell'));
});

test('ページに 送る 1 問に 正解は 入らない（答えた あとに とどく）', () => {
  const p = A.blankProgress(); p.placed = true; p.track = 'kinder';
  const { seen } = play(p, {});
  assert.deepEqual(seen.map((x) => x.q.kind), ['show', 'chant', 'name', 'sound', 'picture', 'sound', 'picture'], '① 見て きく ② うた ③ きいて えらぶ ④ 絵を えらぶ');
  for (const { q } of seen) { assert.equal(q.answer, undefined); assert.ok(!('key' in q) && !('blocks' in q && q.blocks.some((b) => 'order' in b))); }
  for (const { q, it } of seen.filter((x) => !x.it.teach)) { assert.equal(q.choices.length, 3); assert.ok(q.choices.includes(it.answer)); }
  // つづる：ブロックは ばらばらの 順で 送る（順番が 答え）。
  const e = A.blankProgress(); e.placed = true; e.track = 'elem'; for (const l of 'abcdefghijklmnopqrstuvwxyz') e.letters[l] = { done: true };
  for (const u of A.ruleUnits()) e.rules[u.id] = { done: true };
  const sp = play(e, {});
  assert.ok(sp.seen.every((x) => x.q.kind === 'spell' && x.q.blocks.length >= 2 && x.q.answer === undefined && x.q.parts === undefined));
  assert.ok(sp.seen.some((x) => x.q.blocks.map((b) => b.t).join('') !== x.it.answer), 'ばらばらに なって いる');
  assert.equal(sp.summary.advanced?.finished, true);
});

test('はじめの 数問：できた ところは とばす・ぜんぶ できたら 小学生の 段階・段階が 高い 子は つなげて よむ 問題から', () => {
  // ぜんぶ 正解：もじ 4 問 → つなげて よむ 3 問 → もじ 26・cvc の ルールを とばして 小学生の 段階。
  const all = A.blankProgress(); const a = play(all, {});
  assert.equal(a.round.log.length, 7);
  assert.equal(all.placed, true); assert.equal(all.track, 'elem'); assert.equal(A.lettersDone(all), 26);
  assert.ok(A.units().filter((u) => u.type === 'cvc').every((u) => all.rules[u.id]?.done));
  assert.equal(A.nextOf(all, {}).kind, 'digraph');
  // 2 つめで まちがえる：はじめの 4 分の 1 だけ とばして、ちいさい 子の 段階。
  const some = A.blankProgress(); let n = 0; const b = play(some, {}, { right: () => (n += 1) !== 2 });
  assert.equal(b.round.log.length, 4, 'もじが ぜんぶ できなければ つなげて よむ 問題は 出さない');
  assert.equal(some.track, 'kinder'); assert.equal(A.lettersDone(some), 6);
  assert.equal(A.nextOf(some, {}).letter, A.data().order[6]);
  // ぜんぶ まちがい：なにも とばさない。
  const none = A.blankProgress(); play(none, {}, { right: () => false });
  assert.equal(A.lettersDone(none), 0); assert.equal(A.nextOf(none, {}).letter, 's');
  // 段階が 高い 子（hi）：つなげて よむ 3 問だけ。できれば もじは とばす。できなければ もじの 問題を 足す。
  const hi = A.blankProgress(); const h = play(hi, {}, { hi: true });
  assert.deepEqual(h.round.log.map((x) => x.phase), ['W', 'W', 'W']); assert.equal(hi.track, 'elem'); assert.equal(A.lettersDone(hi), 26);
  const hiBad = A.blankProgress(); const hb = play(hiBad, {}, { hi: true, right: (it) => it.phase !== 'W' });
  assert.equal(hb.round.log.length, 7); assert.equal(hiBad.track, 'elem'); assert.equal(hiBad.rules['cvc-a'], undefined, 'つなげて よめなかったので cvc から');
});

test('8 割で つぎへ：5 問中 4 問で もじを おぼえる・3 問では もう いちど・26 もじで 小学生の 段階へ', () => {
  const p = A.blankProgress(); p.placed = true; p.track = 'kinder';
  let n = 0; const low = play(p, {}, { right: () => (n += 1) > 2 });
  assert.equal(low.summary.right, 3); assert.equal(low.summary.passed, false); assert.equal(A.lettersDone(p), 0);
  assert.equal(A.nextOf(p, {}).letter, 's', 'おなじ もじを もう いちど');
  n = 0; const ok = play(p, {}, { right: () => (n += 1) !== 1 });
  assert.equal(ok.summary.right, 4); assert.equal(ok.summary.passed, true); assert.deepEqual(ok.summary.advanced, { letter: 's' });
  assert.equal(A.nextOf(p, {}).letter, 'a');
  for (let i = 0; i < 25; i += 1) play(p, {});
  assert.equal(A.lettersDone(p), 26); assert.equal(p.track, 'elem'); assert.equal(A.nextOf(p, {}).type, 'unit');
  const st = A.publicState(p, {});
  assert.equal(st.track, 'elem'); assert.equal(st.lettersDone, 26); assert.equal(st.rulesDone, 0);
  // ルールも 同じ：8 割で 1 つ ふえる。
  const u = play(p, {}); assert.deepEqual(u.summary.advanced, { unit: 'cvc-a' }); assert.equal(A.rulesDone(p), 1);
});

test('にがて：まちがえた もじ・ルールが たまり、まとめて ふくしゅうで できたら へる', () => {
  const p = A.blankProgress(); p.placed = true; p.track = 'kinder';
  assert.equal(A.startRound(p, {}, { review: true }), null, 'にがてが なければ ふくしゅうは ない');
  let n = 0; play(p, {}, { right: () => (n += 1) > 2 });
  assert.equal(p.weak['L:s'], 2); assert.equal(A.publicState(p, {}).weak, 1);
  const r1 = play(p, {}, { review: true }); assert.equal(r1.round.mode, 'review'); assert.equal(p.weak['L:s'], 1);
  play(p, {}, { review: true }); assert.equal(p.weak['L:s'], undefined); assert.equal(A.publicState(p, {}).weak, 0);
  assert.equal(A.lettersDone(p), 0, 'ふくしゅうでは 段階は すすまない');
});

test('設定：もじの 見せ方・発音・順番。おかしな 値は 初期値・順番は 26 もじ 1 回ずつ', async () => {
  assert.deepEqual(A.sanitizeSettings({ caseFirst: 'x', accent: 'fr', order: ['a', 'a'] }), { caseFirst: 'both', accent: 'us', order: null });
  const rev = [...A.data().order].reverse();
  const s = A.sanitizeSettings({ caseFirst: 'lower', accent: 'uk', order: rev });
  assert.equal(s.caseFirst, 'lower'); assert.equal(s.accent, 'uk'); assert.deepEqual(s.order, rev);
  const p = A.blankProgress(); p.placed = true; p.track = 'kinder';
  assert.equal(A.nextOf(p, s).letter, rev[0], '順番を かえると さいしょの もじが かわる');
  assert.equal(A.publicState(p, s).caseFirst, 'lower'); assert.equal(A.publicState(p, s).accent, 'uk');
  const store = await new AbcStore(null).init();
  assert.deepEqual(store.settingsOf('IAC'), { caseFirst: 'both', accent: 'us', order: null });
  await store.setSettings('IAC', { caseFirst: 'upper', accent: 'uk' });
  assert.equal(store.settingsOf('iac').caseFirst, 'upper', 'クラスコードの 大文字・小文字は 区別しない');
  assert.equal(store.settingsOf('other').accent, 'us');
});

let server; let url; let base;
const nextMessage = (room, type, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { server = await startServer({ port: 0 }); const port = server.server.address().port; url = `ws://127.0.0.1:${port}`; base = `http://127.0.0.1:${port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋：ひらく → はじめる → こたえる。答えは へんじで とどき、学習ログと roblox_events に のる。コインは かわらない', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'abc1', name: 'Mio' });
  const welcome = await nextMessage(room, 'welcome');
  const coins0 = welcome.wallet.coins;
  room.send('abc:open', {});
  const st = await nextMessage(room, 'abc:state');
  assert.equal(st.ready, true); assert.equal(st.placed, false); assert.equal(st.next.type, 'place'); assert.equal(st.caseFirst, 'both'); assert.equal(st.accent, 'us'); assert.ok(st.artV >= 1);
  assert.equal(st.letters.length, 26); assert.equal(st.letters[0].l, 's');
  room.send('abc:answer', { choice: 's' });
  assert.equal((await nextMessage(room, 'abc:error')).reason, 'no round', 'はじめて いないのに 答えは 送れない');
  room.send('abc:start', {});
  let q = await nextMessage(room, 'abc:ask');
  assert.equal(q.mode, 'place'); assert.equal(q.answer, undefined); assert.equal(q.choices.length, 3);
  let last = null; let answered = 0;
  for (let i = 0; i < 12 && q; i += 1) {
    room.send('abc:answer', { choice: q.choices[0] });
    const r = await nextMessage(room, 'abc:result');
    assert.equal(typeof r.correct, 'boolean'); assert.ok(q.choices.includes(r.answer), '正解は 答えた あとに とどく');
    answered += 1; last = r; q = r.next;
  }
  assert.equal(last.over, true); assert.equal(last.summary.mode, 'place'); assert.equal(last.state.placed, true);
  assert.ok(['kinder', 'elem'].includes(last.state.track));
  // つぎの 回：ちいさい 子の 段階なら おしえる 画面（答えの ない 画面）から。
  room.send('abc:start', {});
  const q2 = await nextMessage(room, 'abc:ask');
  if (q2.teach) { room.send('abc:answer', { seen: true }); const r2 = await nextMessage(room, 'abc:result'); assert.equal(r2.teach, true); assert.equal(r2.correct, null); assert.ok(r2.next); }
  await new Promise((r) => setTimeout(r, 150));
  const rows = (await server.store.listLearning?.({ classCode: 'abc1' })) || [];
  const mine = rows.filter((x) => String(x.question_id || x[3] || '').startsWith('abc:'));
  if (rows.length) assert.equal(mine.length, answered, '1 問 1 行の 学習ログ（おしえる 画面は 書かない）');
  const events = (await server.store.listRobloxEvents?.({ classCode: 'abc1' })) || [];
  const quiz = events.filter((e) => e.type === 'quiz' && e.world === 'abc'); const snap = events.filter((e) => e.type === 'abc');
  assert.equal(quiz.length, answered, 'roblox_events に 1 問 1 行（二重に ならない）');
  assert.ok(quiz.every((e) => { const d = JSON.parse(e.data_json); return typeof d.correct === 'boolean' && d.level === 'ABC' && d.source === 'web' && !(/^[a-z]$/.test(d.word || '')); }));
  assert.equal(snap.length, 1); assert.equal(JSON.parse(snap[0].data_json).lettersTotal, 26);
  room.send('abc:open', {});
  await nextMessage(room, 'abc:state');
  assert.equal(welcome.wallet.coins, coins0);
  room.send('dash:get', {});
  await room.leave();
});

test('設定は 運営だけ：/admin/api/abc は ログインが いる・先生の 画面には 口が ない・かえると 部屋の 子に とどく', async () => {
  assert.equal((await fetch(`${base}/admin/api/abc`)).status, 401);
  assert.equal((await fetch(`${base}/admin/api/abc`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-requested-with': 'uspeak-admin' }, body: JSON.stringify({ classCode: 'abc2', settings: { caseFirst: 'upper', accent: 'uk' } }) })).status, 401);
  assert.ok([401, 404].includes((await fetch(`${base}/teacher/api/abc`)).status), '先生の 画面に 設定の 口は ない');
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=owner-password-123', redirect: 'manual' });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const H = { 'content-type': 'application/json', 'x-requested-with': 'uspeak-admin', cookie };
  const order = [...A.data().order].reverse();
  const bad = await fetch(`${base}/admin/api/abc`, { method: 'PUT', headers: H, body: JSON.stringify({ classCode: 'abc2', settings: { caseFirst: 'upper', accent: 'uk', order: 'a b c' } }) });
  assert.equal(bad.status, 400, '順番は 26 もじ ぜんぶ');
  const noHeader = await fetch(`${base}/admin/api/abc`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ classCode: 'abc2', settings: { caseFirst: 'upper', accent: 'uk' } }) });
  assert.equal(noHeader.status, 403);
  const ok = await (await fetch(`${base}/admin/api/abc`, { method: 'PUT', headers: H, body: JSON.stringify({ classCode: 'ABC2', settings: { caseFirst: 'upper', accent: 'uk', order: order.join(' ') } }) })).json();
  assert.equal(ok.ok, true); assert.equal(ok.rows.find((r) => r.code === 'abc2').accent, 'uk');
  const page = await (await fetch(`${base}/admin/abc`, { headers: { cookie } })).text();
  assert.ok(page.includes('ABC と おと') && page.includes('イギリス式'));
  const room = await new Client(url).joinOrCreate('class', { classCode: 'abc2', name: 'Ken' });
  await nextMessage(room, 'welcome');
  room.send('abc:open', {});
  const st = await nextMessage(room, 'abc:state');
  assert.equal(st.caseFirst, 'upper'); assert.equal(st.accent, 'uk'); assert.equal(st.letters[0].l, order[0]);
  await room.leave();
  const reset = await (await fetch(`${base}/admin/api/abc`, { method: 'PUT', headers: H, body: JSON.stringify({ classCode: 'abc2', reset: true }) })).json();
  assert.equal(reset.rows.length, 0);
});

test('保護者レポート：ABC の 記録が ある 子だけ「おぼえた もじ ○/26・よめる ルール ○こ」が のる（LINE の 文・画像の 1 行・web）', async () => {
  const { fiveNumbers, weeklyData } = await import('../src/parent-report/aggregate.js');
  const { fiveText } = await import('../src/parent-report/line.js');
  const { weeklyTex } = await import('../src/parent-report/render-tex.js');
  const { fiveHtml } = await import('../src/reading/pages.js');
  const { jstMidnight, weekOf, HOUR } = await import('../src/parent-report/jst.js');
  const week = weekOf(jstMidnight(2026, 10, 6) + 18 * HOUR);
  let seq = 0; const ev = (ts, type, data) => ({ id: `a${seq += 1}`, ts, type, world: 'abc', username: 'taro', place_id: 'web', data_json: JSON.stringify(data) });
  const rows = [ev(week.start + 3600e3, 'abc', { letters: 5, lettersTotal: 26, rules: 0, rulesTotal: 14 }), ev(week.start + 7200e3, 'abc', { letters: 12, lettersTotal: 26, rules: 3, rulesTotal: 14 }), ev(week.end + 5000, 'abc', { letters: 26, lettersTotal: 26, rules: 9, rulesTotal: 14 })];
  const f = fiveNumbers(rows, week);
  assert.deepEqual(f.abc, { letters: 12, lettersTotal: 26, rules: 3, rulesTotal: 14 }, 'その 期間の おわりまでの いちばん 新しい 数');
  assert.equal(fiveNumbers([], week).abc, null);
  const text = fiveText(f, { nick: 'たろう', label: '今週' });
  assert.ok(text.includes('おぼえた もじ 12/26') && text.includes('よめる ルール 3こ'), text);
  assert.ok(!fiveText({ minutes: 5, speak: 0, books: 0, answered: 0, words: 0, accuracy: null, abc: null }).includes('おぼえた もじ'));
  const d = weeklyData(rows, { week, nick: 'たろう' });
  assert.deepEqual(d.five.abc, f.abc);
  const tex = weeklyTex(d);
  assert.ok(tex.includes('おぼえた もじ 12/26') && tex.includes('よめる ルール 3こ'));
  assert.ok(fiveHtml(f).includes('おぼえた もじ 12/26') && !fiveHtml({ ...f, abc: null }).includes('おぼえた もじ'));
});
