// TOEIC・TOEFL・IELTS の 問題DB：ファイルの 形・量・入りかた（ファイルごとに 1 回）・英検の 出題に まざらない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { examFiles, examBatches, problemOf, EXAMS } from '../src/qbank/seed-exams.js';
import { QBankStore } from '../src/qbank/store.js';
import { setExtraQuestions } from '../src/game/eiken.js';
import { setQbankWords } from '../src/game/roadmap.js';
import { setPierQuestions } from '../src/game/eiken-pier.js';

test('どの 行も 形が ただしく・ID は 1 つずつ', () => {
  const ids = new Set();
  for (const { exam, file } of examFiles()) {
    for (const raw of JSON.parse(readFileSync(file, 'utf8'))) {
      assert.equal(problemOf(exam, raw), null, `${file} ${raw?.id}`);
      assert.ok(!ids.has(raw.id), `dup ${raw.id}`); ids.add(raw.id);
    }
  }
});

test('3 つの 試験とも 4 技能 そろって 大きな 量（1 試験 1,800 問 以上）', () => {
  const rows = examBatches().flatMap((b) => b.rows);
  for (const grade of Object.values(EXAMS)) {
    const mine = rows.filter((r) => r.grade === grade);
    assert.ok(mine.length >= 1800, `${grade}: ${mine.length}`);
    for (const skill of ['reading', 'listening', 'writing', 'speaking']) assert.ok(mine.filter((r) => r.skill === skill).length >= 50, `${grade} ${skill}`);
  }
});

test('admin だけ・CEFR の タグつき', () => {
  for (const r of examBatches().flatMap((b) => b.rows)) {
    assert.ok(/CEFR:(A1|A2|B1|B2|C1|C2)/.test(r.tags), r.id);
    assert.ok(r.on && !r.web && !r.roblox, r.id);
  }
});

test('ファイルごとに 1 回だけ 入る（問題を 足した ファイルは 足した 分だけ 入る）', async () => {
  const q = await new QBankStore(null).init();
  const batches = examBatches();
  let added = 0;
  added = (await q.seedMany(batches)).added;
  assert.equal(added, batches.reduce((n, b) => n + b.rows.length, 0));
  for (const b of batches) assert.equal((await q.seed(b.tag, b.rows)).added, 0);
  // ファイルに 1 問 足すと 印が かわり、その 1 問だけ 入る
  if (batches.length) {
    const b = batches[0]; const extra = { ...b.rows[0], id: `${b.rows[0].id}-X`, question: `${b.rows[0].question} (extra)` };
    const ids = [...b.rows.map((r) => r.id), extra.id].join(',');
    assert.equal((await q.seed(`${b.tag.split('#')[0]}#${ids.length}`, [...b.rows, extra])).added, 1);
  }
  // 同じ 問い方・同じ 答えでも 本文が ちがえば べつの 問題（Part 2 の「Choose the best response.」など）
});

test('英検の島・つり場・ロードマップの 単語には まざらない', () => {
  const rows = examBatches().flatMap((b) => b.rows).map((r) => ({ ...r, choices: [r.choice_1, r.choice_2, r.choice_3, r.choice_4].filter(Boolean), on: true, web: true }));
  const extra = setExtraQuestions(rows);
  assert.ok(Object.values(extra).every((n) => n === 0), JSON.stringify(extra));
  assert.deepEqual(setQbankWords(rows), { gp2: 0, g2: 0, gp1: 0 });
  assert.ok(Object.values(setPierQuestions(rows)).every((n) => n === 0));
  setExtraQuestions([]); setPierQuestions([]); setQbankWords([]);
});
