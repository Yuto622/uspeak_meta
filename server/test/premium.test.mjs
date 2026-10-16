// プレミアムの 島（英会話島・みんなで はなす しま）：admin の 名簿の「プレミアム」列が true の 子と 先生だけ。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.LOG_LEVEL = 'error';
process.env.CALLS_NEED_TEACHER = 'off';
process.env.TASKS = 'on';

const { startServer } = await import('../src/index.js');
const { parseRosterRows } = await import('../src/store/roster-sheet.js');
const { rosterFromText, rosterToCsv } = await import('../src/store/roster-text.js');
const { CONV } = await import('../src/game/conv.js');
const { Client } = await import('colyseus.js');

let server; let url;
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const join = async (classCode, name, extra = {}) => {
  const room = await new Client(url).joinOrCreate('class', { classCode, name, ...extra });
  room.onMessage('*', () => {});
  return { room, welcome: await nextMessage(room, 'welcome') };
};
before(async () => {
  server = await startServer({ port: 0 });
  url = `ws://127.0.0.1:${server.server.address().port}`;
  await server.store.saveRoster([{ class: '*', name: 'Pia', premium: true }, { class: '*', name: 'Ken' }]);
});
after(async () => { await server.shutdown('test'); });

test('名簿の「プレミアム」列は シート・CSV・はりつけ の どれでも 読める', () => {
  const rows = parseRosterRows([['name', '先生か', 'プレミアム'], ['Pia', 'false', 'TRUE'], ['Ken', '', '']]);
  assert.deepEqual(rows.map((r) => [r.name, !!r.premium]), [['Pia', true], ['Ken', false]]);
  const back = rosterFromText(rosterToCsv(rows));
  assert.equal(back.find((r) => r.name === 'Pia').premium, true, 'the CSV download reads back with the column');
});

test('プレミアムで ない 子：2 つの 島に 🔒、英会話島の 家では 話せない。プレミアムの 子と 先生は 入れる', async () => {
  const ken = await join('prem1', 'Ken');
  assert.deepEqual(ken.welcome.locked, ['conv', 'talk', 'eiken5', 'eiken4', 'eiken3', 'talkshops']);
  assert.equal(ken.welcome.premium, false);
  const topic = [...CONV.topicById.values()].find((t) => { const h = CONV.spotById.get(t.spot); return !h.home || h.home.id === CONV.id; });
  ken.room.send('conv:start', { topic: topic.id });
  assert.equal((await nextMessage(ken.room, 'conv:error')).reason, 'premium');
  assert.ok(!ken.welcome.tasks.tasks.some((t) => ken.welcome.locked.includes(t.go?.island) || t.go?.shop), 'no task points at a locked island');
  ken.room.send('eiken:start', { island: 'eiken5', hall: 'reading' });
  assert.equal((await nextMessage(ken.room, 'eiken:error')).reason, 'premium', 'the Eiken islands are premium too');
  const shopTopic = [...CONV.topicById.values()].find((t) => CONV.spotById.get(t.spot).home?.id === 'main');
  ken.room.send('conv:start', { topic: shopTopic.id });
  assert.equal((await nextMessage(ken.room, 'conv:error')).reason, 'premium', 'and the talk shops on the main island');

  const pia = await join('prem1', 'Pia');
  assert.deepEqual(pia.welcome.locked, []);
  assert.equal(pia.welcome.premium, true);
  const t = await join('prem1', 'Sensei', { teacherKey: 'testkey12345' });
  assert.deepEqual(t.welcome.locked, [], 'a teacher can always go');
  assert.ok(t.welcome.islands.includes('eiken5'), 'but sees which islands are premium');
  await Promise.all([ken.room.leave(), pia.room.leave(), t.room.leave()]);
});
