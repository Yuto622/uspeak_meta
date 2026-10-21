// 宿題 — 読みとり（どの 形式でも）・7 形式への ふりわけ・先生が くばるまで 出ない・部屋が 判定して 記録し、保護者レポートに のる。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.STORE_BACKEND = 'memory';
process.env.TEACHER_KEY = 'testkey12345';
process.env.REPORT_SECRET = 'test-report-secret-0123456789';
process.env.ANSWER_MIN_INTERVAL_MS = '0';
process.env.LOG_LEVEL = 'error';

const { extractHomework, parseRules } = await import('../src/homework/extract.js');
const { readFile, rowsToItems, parseAiken, parseGift, parseMoodleXml, unzip } = await import('../src/homework/files.js');
const { checkItems, assignKinds, buildItem, KINDS } = await import('../src/homework/items.js');
const { HomeworkStore } = await import('../src/homework/store.js');
const { checkFormat } = await import('../../client/dist/formats-core.js');
const { reportHtml, reportFor } = await import('../src/game/report.js');

const b64 = (s) => Buffer.from(s).toString('base64');

// 小さな zip を 作る（xlsx / docx の 中身を 試すため）
function zip(files) {
  const parts = []; const dir = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = zlib.deflateRawSync(Buffer.from(text)); const n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(text.length, 22); local.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(text.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(off, 42);
    parts.push(local, n, data); dir.push(cen, n); off += 30 + n.length + data.length;
  }
  const d = Buffer.concat(dir); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(dir.length / 2, 8); end.writeUInt16LE(dir.length / 2, 10); end.writeUInt32LE(d.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, d, end]);
}

test('きまりで 読む：ことば = 意味・あなうめ・英文と 訳・番号と 題', () => {
  const r = parseRules('# Unit 1\n1. apple = りんご\n(2) dog\tいぬ\n③ cat ねこ\nI (play) soccer. わたしは サッカーを します。\nI ( ) tennis. [play, run]\nI like music very much. わたしは 音楽が すきです。');
  assert.equal(r.title, 'Unit 1');
  assert.deepEqual(r.items.slice(0, 3).map((x) => [x.en, x.ja]), [['apple', 'りんご'], ['dog', 'いぬ'], ['cat', 'ねこ']]);
  assert.deepEqual([r.items[3].kind, r.items[3].blank, r.items[3].sentence], ['fill', 'play', 'I play soccer.']);
  assert.deepEqual([r.items[4].kind, r.items[4].blank, r.items[4].wrong], ['fill', 'play', ['run']]);
  assert.equal(r.items[5].kind, 'order');
  // 「Unit 5 しゅくだい」のような 行は 題（問題に しない）
  const t = parseRules('Unit 5 しゅくだい\nstar = ほし');
  assert.deepEqual([t.title, t.items.length], ['Unit 5 しゅくだい', 1]);
});

test('形の きまった ファイルは AI を 通さず その まま：Kahoot・Blooket・Quizlet・列の 名前・Aiken・GIFT・Moodle XML', () => {
  const kahoot = rowsToItems([['Kahoot quiz template'], [], ['Question - max 120 characters', 'Answer 1 - max 75 characters', 'Answer 2 - max 75 characters', 'Answer 3 - max 75 characters', 'Answer 4 - max 75 characters', 'Time limit (sec)', 'Correct answer(s) - choose at least one'], ['Which is red?', 'sky', 'apple', 'grass', '', '20', '2']]);
  assert.equal(kahoot.format, 'kahoot');
  assert.deepEqual(kahoot.items[0], { kind: 'mc', prompt: 'Which is red?', answer: 'apple', wrong: ['sky', 'grass'] });
  const blooket = rowsToItems([['Question #', 'Question Text', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Time Limit (sec)', 'Correct Answer(s)'], ['1', 'Pick "neko"', 'dog', 'cat', '', '', '20', '2']]);
  assert.equal(blooket.format, 'blooket'); assert.equal(blooket.items[0].answer, 'cat');
  const quizlet = rowsToItems([['sun', 'たいよう'], ['たまご', 'egg']]);
  assert.deepEqual(quizlet.items.map((x) => [x.en, x.ja]), [['sun', 'たいよう'], ['egg', 'たまご']]);
  const cols = rowsToItems([['英語', '日本語', '形式'], ['moon', 'つき', 'spell']]);
  assert.deepEqual([cols.items[0].en, cols.items[0].kind], ['moon', 'spell']);
  assert.equal(parseAiken('What is "inu"?\nA. cat\nB. dog\nANSWER: B')[0].answer, 'dog');
  const gift = parseGift('::q1:: I {=am ~is ~are} a student.\n\n::q2:: {=red -> あか =blue -> あお}');
  assert.equal(gift[0].answer, 'am'); assert.deepEqual(gift.slice(1).map((x) => x.en), ['red', 'blue']);
  const xml = parseMoodleXml('<quiz><question type="multichoice"><questiontext><text>Pick the fruit</text></questiontext><answer fraction="100"><text>apple</text></answer><answer fraction="0"><text>desk</text></answer></question></quiz>');
  assert.deepEqual(xml[0], { kind: 'mc', prompt: 'Pick the fruit', answer: 'apple', wrong: ['desk'] });
});

test('Excel・Word を 開いて 読む（zip の 中の XML）・古い .doc は ことわる', async () => {
  const xlsx = zip({
    'xl/sharedStrings.xml': '<sst><si><t>English</t></si><si><t>Japanese</t></si><si><t>star</t></si><si><t>ほし</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row></sheetData></worksheet>',
  });
  const x = await readFile({ name: 'words.xlsx', data: xlsx.toString('base64') });
  assert.deepEqual([x.items[0].en, x.items[0].ja], ['star', 'ほし']);
  const docx = zip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>sky = そら</w:t></w:r></w:p><w:p><w:r><w:t>I (have) a pen.</w:t></w:r></w:p></w:body></w:document>' });
  const d = await readFile({ name: 'hw.docx', data: docx.toString('base64') });
  assert.equal(d.text, 'sky = そら\nI (have) a pen.');
  assert.ok(unzip(docx).has('word/document.xml'));
  assert.match((await readFile({ name: 'old.doc', data: b64('x') })).error, /\.docx/);
  const img = await readFile({ name: 'p.png', type: 'image/png', data: b64('fake') });
  assert.match(img.image, /^data:image\/png;base64,/);
});

test('読みとり：ファイルと 文を まとめて、AI が なくても 下書きに。AI が ある ときは 写真・PDF も わたす', async () => {
  const r = await extractHomework({ text: 'apple = りんご\ndog = いぬ\ncat = ねこ\nbook = ほん\nfish = さかな', files: [{ name: 'k.csv', data: b64('Question Text,Answer 1,Answer 2,Correct Answer(s)\nPick the animal,dog,desk,1\n') }] }, { useAi: false });
  assert.equal(r.via, 'file');
  assert.equal(r.items.length, 6);
  // 形が 書いて いない ことばは まぜて わりあてる（えらぶ だけに しない）
  assert.ok(new Set(r.items.filter((x) => !x.prompt).map((x) => x.kind)).size >= 3);
  // AI（にせもの）：写真と PDF が わたされ、答えた 形が 下書きに なる
  let seen = null;
  const client = { chat: { completions: { create: async (req) => { seen = req; return { choices: [{ message: { content: JSON.stringify({ title: 'ぬりえ', items: [{ kind: 'spell', en: 'tree', ja: 'き', sentence: '', blank: '', prompt: '', answer: '', wrong: [] }, { kind: 'mc', en: '', ja: '', sentence: '', blank: '', prompt: 'Which is blue?', answer: 'sea', wrong: ['fire'] }] }) } }] }; } } } };
  const ai = await extractHomework({ files: [{ name: 'p.jpg', type: 'image/jpeg', data: b64('jpg') }, { name: 'w.pdf', type: 'application/pdf', data: b64('%PDF-1.4') }] }, { client });
  assert.equal(ai.via, 'ai'); assert.equal(ai.title, 'ぬりえ');
  const parts = seen.messages[1].content.map((c) => c.type);
  assert.ok(parts.includes('image_url') && parts.includes('file'));
  assert.deepEqual(ai.items.map((x) => x.kind), ['spell', 'mc']);
});

test('7 形式：出せない 形は 理由つき、作った 問題は formats-core で 判定できる', () => {
  const items = assignKinds([{ en: 'apple', ja: 'りんご' }, { en: 'dog', ja: 'いぬ' }, { en: 'cat', ja: 'ねこ' }, { en: 'book', ja: 'ほん' }, { en: 'egg', ja: 'たまご' },
    { kind: 'order', sentence: 'I like dogs.', ja: 'いぬが すき' }, { kind: 'fill', sentence: 'I play soccer.', blank: 'play' }, { prompt: 'Which is red?', answer: 'apple', wrong: ['sky'] }]);
  const c = checkItems(items);
  assert.equal(c.problems.length, 0, JSON.stringify(c.problems));
  for (const it of c.items) {
    const f = buildItem(it, c.items);
    assert.ok(KINDS.includes(f.kind));
    const right = f.kind === 'match' ? f.left.map((en) => f.answer[en]) : f.kind === 'spell' || f.kind === 'type' || f.kind === 'listen' ? f.word : f.answer;
    assert.equal(checkFormat(f, right), true, `${it.kind} ${it.en || it.sentence || it.prompt}`);
  }
  const bad = checkItems([{ kind: 'spell', en: 'ice cream', ja: 'アイス' }, { kind: 'fill', sentence: 'I run.', blank: 'swim' }]);
  assert.equal(bad.problems.length, 2);
});

test('先生が くばるまで 出ない・出せない 問題が あれば くばれない・クラスで しぼる', async () => {
  const hw = await new HomeworkStore(null).init();
  const { assignment: a } = await hw.create({ title: 'Unit 2', classes: '6-1', items: [{ en: 'red', ja: 'あか' }, { en: 'blue', ja: 'あお' }] });
  assert.equal(hw.forClass('6-1').length, 0, 'a draft is never handed out');
  assert.equal((await hw.publish(a.id, true)).ok, true);
  assert.equal(hw.forClass('6-1').length, 1);
  assert.equal(hw.forClass('6-2').length, 0);
  const { assignment: b } = await hw.create({ title: 'bad', items: [{ kind: 'fill', sentence: 'I run.', blank: 'swim' }] });
  assert.equal((await hw.publish(b.id, true)).ok, false);
});

let server; let url;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
before(async () => { const { startServer } = await import('../src/index.js'); server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

test('部屋：一覧 → 1 問ずつ → まちがえたら もう 1 回 → おわり → コイン 1 回 → まちがえた ところを やりなおす → レポート', async () => {
  const { Client } = await import('colyseus.js');
  const hw = server.homework;
  const items = [{ kind: 'mc', en: 'red', ja: 'あか' }, { kind: 'mc', en: 'blue', ja: 'あお' }, { kind: 'mc', en: 'green', ja: 'みどり' }];
  const { assignment: a } = await hw.create({ title: 'いろ', classes: 'hw1', due: '2099-01-01', items });
  await hw.publish(a.id, true);
  const room = await new Client(url).joinOrCreate('class', { classCode: 'hw1', name: 'Mio' });
  const welcome = await nextMessage(room, 'welcome');
  assert.equal(welcome.homework, 1, 'the welcome says there is homework');
  room.send('hw:list');
  const list = await nextMessage(room, 'hw:list');
  assert.deepEqual([list.items[0].title, list.items[0].total, list.items[0].done], ['いろ', 3, false]);
  assert.ok(!JSON.stringify(list).includes('みどり'), 'the list carries no answers');
  room.send('hw:start', { aid: a.id });
  const right = (ask) => items.find((it) => it.en === ask.format.word).ja;
  // 1 問目：まちがい → もう 1 回 → まちがい（答えを 見せて つぎへ、×）
  let ask = await nextMessage(room, 'hw:ask');
  assert.ok(!('answer' in ask.format));
  room.send('hw:answer', { qid: ask.qid, answer: 'ちがう' });
  let res = await nextMessage(room, 'hw:result');
  assert.equal(res.correct, false); assert.equal(res.escaped, false);
  room.send('hw:answer', { qid: ask.qid, answer: 'ちがう' });
  res = await nextMessage(room, 'hw:result');
  assert.equal(res.escaped, true);
  // のこり 2 問は 1 回で 正解
  for (let i = 0; i < 2; i += 1) {
    room.send('hw:next');
    ask = await nextMessage(room, 'hw:ask');
    room.send('hw:answer', { qid: ask.qid, answer: right(ask) });
    res = await nextMessage(room, 'hw:result');
    assert.equal(res.correct, true);
  }
  assert.ok(res.wallet.coins >= welcome.wallet.coins + 20, 'finishing pays once');
  room.send('hw:next');
  const done = await nextMessage(room, 'hw:done');
  assert.deepEqual([done.done, done.correct, done.total, done.coins], [true, 2, 3, 20]);
  // やりなおし：× だった 1 問だけ。○ に なる。コインは もう 出ない
  room.send('hw:start', { aid: a.id, redo: true });
  ask = await nextMessage(room, 'hw:ask');
  room.send('hw:answer', { qid: ask.qid, answer: right(ask) });
  res = await nextMessage(room, 'hw:result');
  assert.equal(res.correct, true); assert.equal(res.wallet, undefined);
  room.send('hw:next');
  const again = await nextMessage(room, 'hw:done');
  assert.deepEqual([again.correct, again.coins], [3, 0]);
  // 記録：学習ログと Roblox と 同じ 形の できごと
  const events = (await server.store.listRobloxEvents({})).filter((e) => e.world === 'homework');
  assert.equal(events.length, 5);
  // 保護者レポート
  const r = reportFor({ class: 'hw1', name: 'Mio', coins: 0 });
  r.homework = hw.listFor('hw1', 'Mio');
  const html = reportHtml(r, { token: 't' });
  assert.match(html, /宿題（1 \/ 1 おわり）/);
  assert.match(html, /いろ/);
  await room.leave();
  await sleep(50);
});
