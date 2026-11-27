// AI の へんじと 子どもの 文の 見はり（2026-11 の みなおし）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LOG_LEVEL = 'error';
const { sanitizeTurn, distressOf, guardFreeTalk, kidSafe, SAFE_REPLY } = await import('../src/ai/tutor.js');
const { cleanSay, findUnkindWord, hasContact } = await import('../src/game/say.js');

const ZW = String.fromCharCode(0x200b);
const mission = { goals: [{ id: 'a', en: 'say hello' }], persona: 'upee' };
const yupi = { goals: [], free: true, persona: 'yupi' };

test('AI の へんじ：連絡先・ことばの 表・HTML は 子どもに とどかない', () => {
  const link = sanitizeTurn({ reply: 'Visit https://evil.example to chat with me!', goalsMet: [], suggestions: [], replyJa: 'ここに きてね' }, mission);
  assert.doesNotMatch(link.reply, /https?:/);
  assert.equal(link.replyJa, '', 'the Japanese of a replaced reply is not shown');
  const rude = sanitizeTurn({ reply: 'You are stupid.', goalsMet: [] }, mission);
  assert.doesNotMatch(rude.reply, /stupid/i);
  const html = sanitizeTurn({ reply: '<img src=x onerror=alert(1)>Hello!', hint: '<b>ヒント</b>', suggestions: ['<i>Hi</i>', 'Call 090-1234-5678'], better: 'I <3 cats', goalsMet: ['a', 'zzz'] }, mission);
  assert.doesNotMatch(html.reply, /[<>]/);
  assert.equal(html.hint, 'bヒント/b');
  assert.deepEqual(html.suggestions, ['iHi/i']);
  assert.doesNotMatch(html.better, /[<>]/);
  assert.deepEqual(html.goalsMet, ['a'], 'only real goal ids');
  assert.equal(kidSafe('Hello! What do you like?'), true);
  const zw = sanitizeTurn({ reply: `I am Chat${ZW}GPT`, goalsMet: [] }, mission);
  assert.doesNotMatch(zw.reply, /GPT/);
});

test('ゆぴちゃん：見えない 文字や 全角で「die」を ばらしても あぶない 話と わかる', () => {
  assert.equal(distressOf(`I want to d${ZW}ie`), 'urgent');
  assert.equal(distressOf('I want to ｄｉｅ'), 'urgent');
  assert.equal(distressOf(`い${ZW}じめ られた`), 'urgent');
  const out = guardFreeTalk(`I want to d${ZW}ie`, sanitizeTurn({ reply: 'Let us talk about cake!', goalsMet: [] }, yupi));
  assert.equal(out.reply, SAFE_REPLY.reply);
});

test('チャット：ゼロ幅の 文字で ことばの 表を すりぬけない', () => {
  assert.equal(cleanSay(`し${ZW}ね`).reason, 'word');
  assert.equal(cleanSay(`stu${String.fromCharCode(0x2060)}pid`).reason, 'word');
  assert.equal(cleanSay(`ww${ZW}w.example`).reason, 'contact');
  assert.equal(findUnkindWord('わたし ねこが すき'), '', 'a space a child typed still separates words');
  assert.equal(cleanSay('こんにちは！').ok, true);
  assert.equal(hasContact('line id やろう'), true);
});
