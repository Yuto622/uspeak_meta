// つり島 — 共通の問題部品と、くじ・図鑑・売る。**答えの判定はこの関数だけ**なので名指しで測る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATS, FORMAT_META, makeRng, pickFormat, buildMc, buildMatch, buildSpell, buildType, buildOrder, buildFill, buildListen,
  publicFormat, checkFormat, revealFormat, diffFormat, canSpell, canType,
} from '../../client/dist/formats-core.js';
import { FW, prepare, answer, askPayload, lottery, catchFish, sellFrom, sanitizeFw, blankFw, statePayload, dexTotal, fishPayload, FishworldError } from '../src/game/fishworld.js';

const Q = { q: 'Water', a: 'みず', o: ['みず', 'ひ', 'つち'] };
const POOL = FW.quiz['1'];

test('データ：3ゾーン・問題・魚・確率がそろっている', () => {
  assert.equal(FW.quiz['1'].length, 156); assert.equal(FW.quiz['2'].length, 98); assert.equal(FW.quiz['3'].length, 52);
  assert.equal(FW.fish.length, 70);
  for (const z of ['1', '2', '3']) assert.ok(Math.abs(Object.values(FW.catchRates[z]).reduce((a, b) => a + b, 0) - 1) < 0.01, `zone ${z} rates sum to 1`);
  assert.deepEqual(FW.formats, { 1: ['mc', 'mc', 'match'], 2: ['mc', 'match', 'spell'], 3: ['type', 'spell', 'mc'] });
  assert.ok(dexTotal(1) >= 10 && dexTotal(3) >= 20);
  assert.equal(FW.fish.filter((f) => f.kind === 'trash').map((f) => f.en).sort().join(','), 'Boot,Empty Can,Tire');
  for (const k of FORMATS) assert.match(FORMAT_META[k].color, /^#[0-9A-F]{6}$/i);
});

test('形式の抽選：重み どおり、変換できない問題は mc に', () => {
  const rng = makeRng(7);
  const counts = { mc: 0, match: 0, spell: 0 };
  for (let i = 0; i < 3000; i += 1) counts[pickFormat(['mc', 'mc', 'match'], Q, rng)] += 1;
  assert.ok(counts.mc > counts.match * 1.5 && counts.match > 600, JSON.stringify(counts));
  assert.equal(pickFormat(['spell'], { q: 'Environmentally' }, rng), 'mc', '11 文字は spell にならない');
  assert.equal(pickFormat(['type'], { q: 'Mahi-mahi' }, rng), 'mc', '記号入りは type にならない');
  assert.equal(pickFormat(['type'], { q: 'Environment' }, rng), 'type');
  assert.ok(canSpell('added') && !canSpell('ab') && canType('Comfortable') && !canType('Environmentally'));
});

test('mc：選択肢は3つ、答えは見せる形に無い', () => {
  const f = buildMc(Q, makeRng(1));
  const p = publicFormat(f);
  assert.deepEqual([...p.choices].sort(), ['つち', 'ひ', 'みず']);
  assert.equal(p.answer, undefined);
  assert.ok(checkFormat(f, 'みず') && !checkFormat(f, 'ひ'));
  assert.deepEqual(revealFormat(f), { answer: 'みず' });
});

test('match：4組、左右の並びで正解の線が全部平行にならない、4組すべて正しいときだけ正解', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const f = buildMatch(Q, POOL, makeRng(seed));
    assert.equal(f.pairs.length, 4);
    assert.equal(new Set(f.pairs.map((p) => p.en)).size, 4);
    const parallel = f.left.filter((en, i) => f.answer[en] === f.right[i]).length;
    assert.ok(parallel <= 2, `seed ${seed}: ${parallel} parallel lines`);
    const p = publicFormat(f);
    assert.equal(p.pairs, undefined); assert.equal(p.answer, undefined);
    assert.ok(checkFormat(f, f.left.map((en) => f.answer[en])), 'all four right');
    const wrong = f.left.map((en) => f.answer[en]); [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
    assert.ok(!checkFormat(f, wrong), 'one swap is wrong');
    assert.ok(checkFormat(f, f.answer), 'object form works too');
    assert.deepEqual(diffFormat(f, wrong).slice(0, 2), ['ng', 'ng']);
  }
});

test('spell：カードは元の順にならない。判定は並んだ文字列（added の d はどちらでも）', () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const f = buildSpell({ q: 'Water', a: 'みず' }, makeRng(seed));
    assert.notEqual(f.letters.join(''), 'Water');
    assert.deepEqual([...f.letters].sort(), [...'Water'].sort());
  }
  const f = buildSpell({ q: 'added', a: 'たした' }, makeRng(3));
  assert.ok(checkFormat(f, ['a', 'd', 'd', 'e', 'd']));
  assert.ok(checkFormat(f, 'ADDED'), '大文字小文字は見ない');
  assert.ok(!checkFormat(f, 'addde'));
  assert.deepEqual(diffFormat(f, 'addde'), ['ok', 'ok', 'ok', 'ng', 'ng']);
  assert.equal(publicFormat(f).ja, 'たした');
  assert.equal(publicFormat(f).word, undefined);
});

test('type：最初は空の枠だけ。2回目に「さいしょの もじ」。合っていた枠だけ ok', () => {
  const f = buildType({ q: 'Water', a: 'みず' }, makeRng(1));
  const p1 = publicFormat(f, { attempt: 1 });
  assert.equal(p1.length, 5); assert.equal(p1.hint, undefined); assert.equal(p1.word, undefined);
  const p2 = publicFormat(f, { attempt: 2 });
  assert.equal(p2.hint, 'W');
  assert.ok(checkFormat(f, ' water ') && !checkFormat(f, 'wafer'));
  assert.deepEqual(diffFormat(f, 'wafer'), ['ok', 'ok', 'ng', 'ok', 'ok']);
});

test('order / fill / listen：クイズ小屋のための3形式も同じ部品', () => {
  const o = buildOrder('I like apples.', 'わたしは りんごが すき。', makeRng(2));
  assert.notEqual(o.words.join(' '), 'I like apples.');
  assert.ok(checkFormat(o, ['I', 'like', 'apples.']) && checkFormat(o, 'i LIKE apples.') && !checkFormat(o, 'like I apples.'));
  assert.deepEqual(revealFormat(o), { sentence: 'I like apples.' });
  const fl = buildFill('She plays tennis.', 'plays', 'かのじょは テニスを する。', ['play', 'playing', 'played'], makeRng(2));
  assert.equal(fl.before, 'She'); assert.equal(fl.after, 'tennis.'); assert.equal(fl.cards.length, 4);
  assert.ok(checkFormat(fl, 'plays') && !checkFormat(fl, 'play'));
  assert.equal(publicFormat(fl).answer, undefined);
  const li = buildListen(Q, POOL, makeRng(2));
  assert.equal(li.choices.length, 4); assert.ok(li.choices.includes('Water'));
  assert.ok(checkFormat(li, 'water') && !checkFormat(li, li.choices.find((c) => c !== 'Water')));
});

test('出題 → 1回目 不正解は もういちど（同じ問題・同じ形式）→ 2回目も外すと 逃げる', () => {
  const rng = makeRng(11);
  const q = prepare(1, { rng, now: 1000 });
  assert.ok(['mc', 'match'].includes(q.kind), q.kind);
  const ask = askPayload(q);
  assert.equal(ask.attempt, 1); assert.equal(ask.zone, 1); assert.equal(ask.en, 'Pond'); assert.equal(ask.format.kind, q.kind);
  assert.equal(JSON.stringify(ask).includes(q.fmt.answer ?? '\u0000'), q.kind === 'mc' ? true : false, 'mc の答えは選択肢の中にあるが、それ以外では答えは出ない');
  const r1 = answer(q, 'nope');
  assert.equal(r1.correct, false); assert.equal(r1.escaped, false); assert.equal(r1.format.attempt, 2); assert.equal(q.attempt, 2);
  const r2 = answer(q, 'nope');
  assert.equal(r2.escaped, true); assert.ok(r2.reveal);
  const q2 = prepare(3, { rng: makeRng(5), now: 2000 });
  assert.ok(['type', 'spell', 'mc'].includes(q2.kind));
  const right = q2.kind === 'mc' ? q2.fmt.answer : q2.word;
  assert.deepEqual(answer(q2, right), { correct: true });
});

test('くじ：catchRates の確率どおり、正解のあとは ゴミが出ない、PERFECT は レアに寄る', () => {
  const rng = makeRng(99);
  const n = 20000;
  const got = {};
  for (let i = 0; i < n; i += 1) { const f = lottery(1, 'nice', { rng, noTrash: false }); got[f.ja] = (got[f.ja] || 0) + 1; }
  for (const [ja, p] of Object.entries(FW.catchRates['1'])) if (p > 0.02) assert.ok(Math.abs(got[ja] / n - p) < 0.012, `${ja}: ${got[ja] / n} vs ${p}`);
  for (let i = 0; i < 3000; i += 1) assert.notEqual(lottery(2, 'nice', { rng }).kind, 'trash');
  const rank = (f) => ['C', 'U', 'R', 'S', 'L'].indexOf(f.rarity);
  let perfect = 0; let ok = 0;
  for (let i = 0; i < 3000; i += 1) { perfect += rank(lottery(3, 'perfect', { rng })); ok += rank(lottery(3, 'ok', { rng })); }
  assert.ok(perfect > ok * 1.2, `perfect ${perfect} vs ok ${ok}`);
  assert.ok(lottery(3, 'perfect', { rng }).zone !== 1);
});

test('図鑑：初めての魚は +dexBonus、2匹目は 0。売ると袋から減って図鑑には残る', () => {
  const fw = blankFw();
  const tuna = FW.fishByEn.get('amberjack');
  assert.deepEqual(catchFish(fw, tuna), { first: true, bonus: FW.dexBonus });
  assert.deepEqual(catchFish(fw, tuna), { first: false, bonus: 0 });
  assert.equal(fw.bag.Amberjack, 2);
  const boot = FW.fishByEn.get('boot');
  assert.deepEqual(catchFish(fw, boot), { first: false, bonus: 0 }, 'ゴミは図鑑にも袋にも入らない');
  assert.equal(fw.bag.Boot, undefined);
  assert.deepEqual(sellFrom(fw, 'Amberjack'), { coins: tuna.sell, count: 1, item: 'Amberjack' });
  assert.deepEqual(sellFrom(fw, '*'), { coins: tuna.sell, count: 1, item: '*' });
  assert.throws(() => sellFrom(fw, 'Amberjack'), FishworldError);
  assert.ok(fw.dex.includes('Amberjack'), '売っても図鑑には残る');
  const s = statePayload(fw);
  assert.equal(s.counts[3].have, 1); assert.equal(s.bag.length, 0); assert.equal(s.dex.find((d) => d.en === 'Amberjack').have, true);
  const back = sanitizeFw(JSON.parse(JSON.stringify({ ...fw, bag: { Amberjack: 3, Nope: 2 }, dex: ['Amberjack', 'Nope'] })));
  assert.deepEqual(back.bag, { Amberjack: 3 }); assert.deepEqual(back.dex, ['Amberjack']);
});

test('every fish has a photo that is really in assets/fish, and the catch payload carries it', async () => {
  const { existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../../client/dist/assets/fish/', import.meta.url));
  for (const f of FW.fish) {
    assert.ok(f.photo, `${f.en} has no photo`);
    assert.ok(existsSync(`${dir}${f.photo}.jpg`), `${f.en}: assets/fish/${f.photo}.jpg is missing`);
    assert.equal(fishPayload(f).photo, f.photo);
  }
});

test('the three fishing spots stand by real water: pond, river bank, sea pier', () => {
  const { island } = FW;
  const w = island.water;
  assert.ok(w?.pond && Array.isArray(w.river) && w.pier, 'water block');
  for (const sp of island.spots) assert.ok(sp.cast && Number.isFinite(sp.cast.x) && Number.isFinite(sp.cast.z), `${sp.id} has a cast point`);
  const pond = island.spots.find((s) => s.id === 'pond').cast;
  assert.ok(((pond.x - w.pond.x) / w.pond.rx) ** 2 + ((pond.z - w.pond.z) / w.pond.rz) ** 2 < 1, 'the pond float lands in the pond');
  assert.ok(island.spots.find((s) => s.id === 'sea').cast.x > w.pier.x0, 'the sea float lands off the pier');
});
