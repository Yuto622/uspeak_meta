// 教室の土台（2）— 今日の5分・おうちの日・英検の目安・先生のメモと声かけ・教室のようす・
// 面談メモ・学習の記録証を、本物のサーバーと本物のクライアントで通しで測る。
//
// **ここで守りたいこと**は3つ：
//   1. 先生のメモは先生しか書けず、「保護者に見せる」を付けたものしか保護者に出ない。
//   2. おうちの日は、部屋に先生がいたかをサーバーが見て決める（端末の申告ではない）。
//   3. 教室のようすのリンクは、CSV のリンクとも1人ぶんのリンクとも取り替えられない。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.RECONNECT_GRACE_SEC = '1';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { startServer } = await import('../src/index.js');
const { Client } = await import('colyseus.js');
const { signExport, signReport } = await import('../src/game/report.js');

let server; let url; let http;
const CLASS = 'infra-1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
async function join(name, extra = {}) {
  const room = await new Client(url).joinOrCreate('class', { classCode: CLASS, name, ...extra });
  room.onMessage('login:bonus', () => {});
  const welcome = await nextMessage(room, 'welcome');
  return { room, welcome };
}
const ack = (t, cmd) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ack for ${cmd}`)), 3000);
  const off = t.room.onMessage('teacher:ack', (m) => { if (m.cmd !== cmd) return; clearTimeout(timer); off(); resolve(m); });
});
async function quickSet(kid) {
  kid.room.send('quick:start', {});
  let q = await nextMessage(kid.room, 'quick:question');
  const seen = [];
  for (;;) {
    seen.push(q);
    kid.room.send('quick:answer', { choice: 0 });
    const r = await nextMessage(kid.room, 'quick:result');
    if (r.done) return { seen, last: r };
    q = r.next;
  }
}

before(async () => {
  server = await startServer({ port: 0 });
  const { port } = server.server.address();
  url = `ws://127.0.0.1:${port}`;
  http = `http://127.0.0.1:${port}`;
});
after(async () => { await server.shutdown('test'); });

test('今日の5分：どこからでも答えられ、答えは届かず、先生のいない時間は「おうちの日」になる', async () => {
  const hana = await join('Hana');
  const { seen, last } = await quickSet(hana);
  assert.equal(seen.length, 5);
  assert.deepEqual(seen.map((q) => q.skill), ['reading', 'reading', 'reading', 'listening', 'listening']);
  assert.ok(seen.every((q) => q.answer === undefined), '正解の番号は送らない');
  assert.equal(seen[0].grade, 'g5', 'まだ何もしていない子は5級から');
  assert.equal(typeof last.answer, 'number', '答え合わせは答えたあとにだけ');

  // マイページに英検の目安が出る（読む3・聞く2が数えられている）。
  hana.room.send('dash:get');
  const dash = await nextMessage(hana.room, 'dash:state');
  const g5 = dash.exam.grades.find((g) => g.grade === 'g5');
  assert.equal(g5.skills.find((s) => s.skill === 'reading').n, 3);
  assert.equal(g5.skills.find((s) => s.skill === 'listening').n, 2);
  assert.equal(dash.months[0].home, 1, '先生がいない部屋で答えた日は、おうちの日');

  // 先生がいる部屋でだけ答えた子は、おうちの日が0。
  const t = await join('SenseiI', { teacherKey: 'testkey12345' });
  const kai = await join('Kai');
  await quickSet(kai);
  kai.room.send('dash:get');
  const kd = await nextMessage(kai.room, 'dash:state');
  assert.equal(kd.months[0].days, 1);
  assert.equal(kd.months[0].home, 0, '先生がいる時間は教室の日');

  await Promise.all([hana.room.leave(), t.room.leave(), kai.room.leave()]);
  await sleep(150);
});

test('先生のメモと声かけ：先生だけが書け、部屋にいない子にも書けて、上書きされない', async () => {
  const hana = await join('Hana');
  const t = await join('SenseiI', { teacherKey: 'testkey12345' });

  // 子どもはメモを書けない（入口で捨てられる）。
  hana.room.send('teacher', { cmd: 'note', name: 'Hana', text: 'じぶんで書いた', share: true });
  await sleep(200);

  let a = ack(t, 'note');
  t.room.send('teacher', { cmd: 'note', name: 'Hana', text: 'ご家庭でも音読を続けてください。', share: true });
  assert.equal((await a).ok, true);
  a = ack(t, 'note');
  t.room.send('teacher', { cmd: 'note', name: 'Hana', text: '発音に自信がない様子（先生だけ）' });
  assert.equal((await a).entry.share, false, '既定は保護者に出さない');
  a = ack(t, 'note');
  t.room.send('teacher', { cmd: 'note', name: 'Hana', text: '   ' });
  assert.equal((await a).ok, false, '空のメモは残さない');
  a = ack(t, 'note');
  t.room.send('teacher', { cmd: 'note', name: 'Dareka', text: 'x' });
  assert.equal((await a).error, 'not found', 'いない子には書けない（記録を勝手に作らない）');

  // 声をかけた → 名簿の気づきに「声かけ済み」が付く。
  a = ack(t, 'called');
  t.room.send('teacher', { cmd: 'called', name: 'Hana', why: 'はじめて1か月め（沈黙期）' });
  assert.equal((await a).entry.kind, 'call');
  t.room.send('teacher', { cmd: 'roster' });
  const roster = await nextMessage(t.room, 'roster');
  const n = roster.notices.find((x) => x.name === 'Hana');
  assert.ok(n?.called, JSON.stringify(roster.notices));
  assert.equal(typeof roster.exam.readyTotal, 'number', '英検の準会場の見込みも名簿と一緒に');
  assert.equal(roster.exam.min, 10);

  let got = ack(t, 'notes');
  t.room.send('teacher', { cmd: 'notes', name: 'Hana' });
  let notes = await got;
  assert.equal(notes.notes.filter((x) => x.kind === 'note').length, 2);
  assert.ok(!notes.notes.some((x) => x.text === 'じぶんで書いた'), '子どもの書いたものは入っていない');

  // 部屋を出た子にも書ける。戻ってきても消えない（部屋の古い側で上書きしない）。
  await hana.room.leave();
  await sleep(1500);
  a = ack(t, 'note');
  t.room.send('teacher', { cmd: 'note', name: 'Hana', text: 'お休みの間のメモ' });
  assert.equal((await a).ok, true);
  const back = await join('Hana');
  back.room.send('quick:start', {});
  await nextMessage(back.room, 'quick:question');
  back.room.send('quick:answer', { choice: 0 });   // persist が走る
  await nextMessage(back.room, 'quick:result');
  got = ack(t, 'notes');
  t.room.send('teacher', { cmd: 'notes', name: 'Hana' });
  notes = await got;
  assert.ok(notes.notes.some((x) => x.text === 'お休みの間のメモ'), '戻ってきてもメモは残る');

  // 消せる。
  const id = notes.notes.find((x) => x.text === 'お休みの間のメモ').id;
  a = ack(t, 'unnote');
  t.room.send('teacher', { cmd: 'unnote', name: 'Hana', id });
  assert.equal((await a).removed, id);

  await Promise.all([back.room.leave(), t.room.leave()]);
  await sleep(150);
});

test('保護者のレポート・面談メモ・記録証・教室のようす・CSV', async () => {
  const t = await join('SenseiI', { teacherKey: 'testkey12345' });
  const a = ack(t, 'reports');
  t.room.send('teacher', { cmd: 'reports' });
  const reports = await a;
  const link = reports.links.find((l) => l.name === 'Hana');
  assert.ok(link, JSON.stringify(reports.links));
  assert.ok(reports.classUrl.includes(`/class/${CLASS}?t=`), reports.classUrl);
  const full = (u) => (/^https?:/.test(u) ? u : http + u);

  // 保護者のレポート：見せると決めたメモだけ。
  const page = await (await fetch(full(link.url))).text();
  assert.ok(page.includes('先生から'));
  assert.ok(page.includes('ご家庭でも音読を続けてください。'));
  assert.ok(!page.includes('発音に自信がない様子'), '先生だけのメモは保護者に出ない');
  assert.ok(!page.includes('沈黙期）'), '声かけも保護者には出ない');
  assert.ok(page.includes('英検の目安'));
  assert.ok(page.includes('学習の記録証'));

  // 面談メモ：話すことがいちばん上に。先生だけのメモはここにも出ない。
  const meet = await (await fetch(`${full(link.url)}&view=meet`)).text();
  assert.ok(meet.includes('きょう お話しすること'));
  assert.ok(!meet.includes('発音に自信がない様子'));

  // 記録証。
  const cert = await (await fetch(`${full(link.url)}&format=cert`)).text();
  assert.ok(cert.includes('学習の記録証'));
  assert.ok(cert.includes('Hana'));
  assert.ok(cert.includes('英検の合格を示すものではありません'));

  // 教室のようす。
  const cls = await fetch(full(reports.classUrl));
  assert.equal(cls.status, 200);
  const html = await cls.text();
  assert.ok(html.includes('利用継続率'));
  assert.ok(html.includes('英検の準会場'));
  assert.ok(html.includes('声かけの結果'));
  const json = await (await fetch(`${full(reports.classUrl)}&format=json`)).json();
  assert.equal(json.calls.total, 1, '声かけが1回数えられている');

  // **署名の取り違えは通さない。** CSV のトークンでも、1人ぶんのトークンでも開かない。
  const secret = process.env.REPORT_SECRET;
  assert.equal((await fetch(`${http}/class/${CLASS}?t=${signExport(secret, CLASS)}`)).status, 404);
  assert.equal((await fetch(`${http}/class/${CLASS}?t=${signReport(secret, CLASS, 'Hana')}`)).status, 404);
  assert.equal((await fetch(`${http}/class/${CLASS}?t=nope`)).status, 404);

  // CSV には先生のメモが全部出る（教室が書いたものは教室のもの）。
  const csv = await (await fetch(full(reports.csv))).text();
  assert.ok(csv.includes('発音に自信がない様子'));
  assert.ok(csv.includes('[声かけ]'));

  await t.room.leave();
  await sleep(100);
});
