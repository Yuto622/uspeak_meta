// ゆぴちゃんの おはなしルーム（メインの島・ほんやの 西）：目あての ない じゆうな 会話。
//
// 見る こと：場面の ファイルが 目あて なしで 読める・プロンプトに 安全の きまりが ある・キーが ない ときの 台本が
// いろいろな へんじを する・あぶない 話には「しんじられる 大人に いますぐ」・コインは 出ない・回数の 上限と プレミアムは ほかの お店と 同じ。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';
process.env.CALLS_NEED_TEACHER = 'off';
process.env.AI_MIN_INTERVAL_MS = '0';
delete process.env.OPENAI_API_KEY;

const { CONV, loadConv, asMission, topicPayload, starters, CONV_PATH, MAIN_PATH } = await import('../src/game/conv.js');
const { buildSystemPrompt, sanitizeTurn, scriptedFreeTurn, distressOf, guardFreeTalk, SAFE_REPLY, YUPI } = await import('../src/ai/tutor.js');
const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); } throw new Error('timeout'); };
const nextMessage = (room, type, ms = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = async (name) => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'yupi-1', name });
  room.onMessage('*', () => {});
  return { room, welcome: await nextMessage(room, 'welcome') };
};
before(async () => {
  server = await startServer({ port: 0 });
  url = `ws://127.0.0.1:${server.server.address().port}`;
  await server.store.saveRoster([{ class: '*', name: 'Pia', premium: true }, { class: '*', name: 'Ken' }]);
});
after(async () => { await server.shutdown('test'); });

test('ゆぴちゃん: お店は メインの島の 通りに あって、場面は 目あての ない free', () => {
  const shop = CONV.spotById.get('yupi');
  assert.ok(shop, 'the shop is read with the other talk shops');
  assert.equal(shop.kind, 'talk_shop');
  assert.equal(shop.home.id, 'main');
  assert.equal(shop.persona, 'yupi');
  assert.equal(shop.character, 'Yupi', 'talk names are English');
  const main = JSON.parse(readFileSync(MAIN_PATH, 'utf8')).island;
  for (const o of main.spots) if (o.id !== 'yupi') assert.ok(Math.hypot(o.x - shop.x, o.z - shop.z) >= 10, `${o.id} is 10 away`);
  const road = main.roads.find((r) => r.z === shop.path.z);
  assert.ok(road && road.x0 <= shop.x - 2, 'the street reaches the door');
  const topics = [...CONV.topicById.values()].filter((t) => t.spot === 'yupi');
  assert.equal(topics.length, 2);
  for (const t of topics) {
    assert.equal(t.free, true);
    assert.deepEqual(t.goals, []);
    assert.ok(/[?!]$/.test(t.opening));
    assert.ok(t.hints.length >= 2, 'the 💡 examples come from the hints');
    const payload = topicPayload(t);
    assert.equal(payload.free, true);
    assert.equal(payload.persona, 'yupi');
    assert.deepEqual(payload.aims, []);
    assert.deepEqual(starters(t), t.hints.slice(0, 3));
    assert.ok(!JSON.stringify(payload).includes('You are'), 'no scene text on the wire');
  }
});

test('ゆぴちゃん: free の 場面に 目あてを 書いたら 読みこみで ことわる', () => {
  const raw = JSON.parse(readFileSync(MAIN_PATH, 'utf8'));
  raw.island.spots.find((s) => s.id === 'yupi').topics[0].goals = [{ id: 'a', ja: 'x', en: 'y' }, { id: 'b', ja: 'x', en: 'y' }];
  const file = new URL(`../.tmp-main-${Math.random().toString(36).slice(2)}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(raw));
  try { assert.throws(() => loadConv(CONV_PATH, file), /free topic "yupi-free" has aims/); } finally { rmSync(file, { force: true }); }
});

test('ゆぴちゃん: プロンプトは ゆぴちゃんで、安全の きまりが ある（しんだん しない・個人情報・ひみつ・大人へ）', () => {
  const mission = asMission(CONV.topicById.get('yupi-free'));
  assert.equal(mission.free, true);
  assert.equal(mission.persona, 'yupi');
  const prompt = buildSystemPrompt(mission);
  assert.ok(prompt.startsWith('IMPORTANT CHARACTER RULES'));
  assert.match(prompt, /You are Yupi \(ゆぴちゃん\)/);
  assert.match(prompt, /My name is Yupi!/);
  assert.ok(!/Upee/.test(prompt), 'Yupi, not the owl');
  assert.ok(!/Mission goals/.test(prompt), 'no aims to judge');
  assert.match(prompt, /not a doctor, therapist or counsellor/);
  assert.match(prompt, /Never diagnose/);
  assert.match(prompt, /medical, medicine, legal/);
  assert.match(prompt, /no full name, address, school name, phone number/);
  assert.match(prompt, /Never ask the child to keep a secret/);
  assert.match(prompt, /grown-up they trust, like their family or teacher, right now/);
  assert.match(prompt, /Never mention ChatGPT/);
  // free は おわらない（目あてが 0 こ でも complete に ならない）。
  const out = sanitizeTurn({ reply: 'Hi!', goalsMet: ['x'], complete: true, hint: '', suggestions: ['I am fine.'], better: '', replyJa: 'やあ' }, mission, []);
  assert.equal(out.complete, false);
  assert.deepEqual(out.goalsMet, []);
  assert.equal(sanitizeTurn({ reply: 'I am a language model.' }, mission).reply, `My name is ${YUPI.en}! Let's talk in English.`);
});

test('ゆぴちゃん: キーが ない ときの 台本は いろいろ・あぶない 話は 大人へ', () => {
  const said = (utterance, n = 0) => scriptedFreeTurn({ history: Array(n).fill({ child: '', reply: '' }), utterance });
  const replies = new Set(['Hello!', 'I like cats.', 'I went to school.', 'My friend is fun.', 'I ate curry.', 'Yes.', 'qwerty'].map((u) => said(u).reply));
  assert.ok(replies.size >= 6, 'different things get different replies');
  assert.notEqual(said('I see.', 0).reply, said('I see.', 1).reply, 'and the same thing twice does not get the same line');
  for (const u of ['Hello!', 'I like cats.', 'blah']) {
    const r = said(u);
    assert.ok(/\?$/.test(r.reply), `${u}: ends with a question`);
    assert.ok(r.replyJa && /[ぁ-ん]/.test(r.replyJa), 'and comes with easy Japanese (🇯🇵 いみ)');
    assert.ok(r.suggestions.length >= 2 && r.suggestions.every((x) => !/[ぁ-んァ-ン]/.test(x)), '💡 examples are English');
    assert.equal(r.complete, false); assert.deepEqual(r.goalsMet, []);
  }
  for (const u of ['Some boys bully me at school.', 'My brother hits me.', 'I want to die.', 'I am not safe at home.', 'いじめられてる']) {
    assert.equal(distressOf(u), 'urgent', u);
    const r = said(u);
    assert.equal(r.reply, SAFE_REPLY.reply, u);
    assert.match(r.reply, /tell a grown-up you trust/);
    assert.match(r.replyJa, /大人/);
  }
  const sad = said('I am sad and lonely.');
  assert.equal(distressOf('I am sad and lonely.'), 'sad');
  assert.match(sad.reply, /family or teacher|grown-up/);
  assert.equal(distressOf('I like pizza.'), '');
  // 名前を 言っても くりかえさない。
  assert.ok(!said('My name is Hanako Suzuki.').reply.includes('Hanako'));
  // AI が あぶない 話に 大人の 話を しなかったら、決まった へんじに かえる。言って いれば そのまま。
  const ai = { reply: 'Oh no! Do you like ice cream?', goalsMet: [], complete: false, hint: '', suggestions: ['Yes.'], better: '', replyJa: 'えっ' };
  assert.equal(guardFreeTalk('Someone hit me.', ai).reply, SAFE_REPLY.reply);
  const good = { ...ai, reply: 'Thank you for telling me. Please tell your teacher or family now.' };
  assert.equal(guardFreeTalk('Someone hit me.', good).reply, good.reply);
  assert.equal(guardFreeTalk('I like ice cream.', ai), ai);
});

test('ゆぴちゃん: お店で はなせる・目あて なし・コインなし・XP なし・回数で おわる・プレミアムは ほかの お店と 同じ', async () => {
  const ken = await join('Ken');
  ken.room.send('conv:start', { topic: 'yupi-free' });
  assert.equal((await nextMessage(ken.room, 'conv:error')).reason, 'premium', 'the talkshops premium key covers this shop too');

  const pia = await join('Pia');
  assert.deepEqual(pia.welcome.locked, []);
  pia.room.send('conv:start', { topic: 'yupi-free' });
  assert.equal((await nextMessage(pia.room, 'conv:error')).reason, 'too far');
  // 中に いる（island-interior の 部屋＝in:main:yupi）。
  pia.room.send('move', { s: 'in:main:yupi', x: 0, z: 0, r: 0, a: 'idle', t: 1 });
  await waitFor(() => pia.room.state.players.get(pia.room.sessionId)?.space === 'in:main:yupi');
  pia.room.send('conv:start', { topic: 'yupi-free' });
  const opened = await nextMessage(pia.room, 'conv:opened');
  assert.equal(opened.free, true);
  assert.equal(opened.persona, 'yupi');
  assert.deepEqual(opened.aims, []);
  assert.equal(opened.opening, "Hi! I'm Yupi. How are you feeling today?");
  assert.ok(opened.suggestions.length >= 2);
  const coins0 = pia.welcome.wallet?.coins ?? 0;

  pia.room.send('conv:say', { text: "I'm happy today!" });
  const first = await nextMessage(pia.room, 'conv:reply', 8000);
  assert.ok(first.reply.length > 0);
  assert.equal(first.free, true);
  assert.equal(first.xp, 0);
  assert.equal(first.done, false);
  assert.equal(first.coins, undefined, 'free talk never pays');
  assert.deepEqual(first.aimsMet, []);
  assert.ok(first.replyJa, 'the scripted Yupi has 🇯🇵 いみ too');
  assert.ok(first.suggestions.length >= 2);

  pia.room.send('conv:say', { text: 'A boy at school bullies me every day.' });
  const sos = await nextMessage(pia.room, 'conv:reply', 8000);
  assert.equal(sos.reply, SAFE_REPLY.reply, 'a worry gets the trusted-adult reply');

  // 14 回で おわり：ふりかえりが つく。そのあとは ことわる。コインは ずっと かわらない。
  let last = sos;
  for (let i = 2; i < CONV.turnLimit; i += 1) {
    pia.room.send('conv:say', { text: i % 2 ? 'I like cats.' : 'I play soccer.' });
    last = await nextMessage(pia.room, 'conv:reply', 8000);
    assert.equal(last.coins, undefined);
    assert.equal(last.xp, 0);
  }
  assert.equal(last.turn, CONV.turnLimit);
  assert.ok(last.recap && last.recap.said.length > 0, 'the recap closes the talk');
  assert.equal(last.done, false, 'free talk is never "all aims done"');
  assert.equal(last.wallet.coins, coins0, 'no coins at all');
  pia.room.send('conv:say', { text: 'One more!' });
  assert.equal((await nextMessage(pia.room, 'conv:error')).reason, 'turn limit');
  // 「もう一度 はなす」は さいしょから。
  pia.room.send('conv:start', { topic: 'yupi-free', again: true });
  assert.equal((await nextMessage(pia.room, 'conv:opened')).turn, 0);
  pia.room.send('conv:end', {});
  assert.equal((await nextMessage(pia.room, 'conv:closed')).reason, 'quit');
  await Promise.all([ken.room.leave(), pia.room.leave()]);
});
