// じゆうにゅうりょく — what a child may type, and what never leaves their iPad.
//
// The rules here are the ones a nine-year-old will meet: a message that is too long, the
// same message twice, a wall of one character, a telephone number, and a word that would
// hurt to read. The word list is a fence rather than a guard — the teacher's switch, the
// pause and the log are the rest of it — but the fence has to hold where it claims to.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LOG_LEVEL = 'error';
const { cleanSay, findUnkindWord, MAX_CHARS } = await import('../src/game/say.js');

test('じゆうにゅうりょく: ordinary things a child writes go through', () => {
  for (const said of [
    'Hello! My name is Yuto.',
    'I like soccer. Do you like soccer?',
    'いっしょに つりに いこう',
    'のりもの島で レースしよう！',
    'My favourite food is カレー :)',
  ]) {
    const out = cleanSay(said);
    assert.equal(out.ok, true, `${said} should be sendable`);
    assert.equal(out.text, said);
  }
  // Tidied, not refused: stray spaces and invisible characters are cleaned off.
  assert.equal(cleanSay('  hello   there ​ ').text, 'hello there');
});

test('じゆうにゅうりょく: length, repetition and noise', () => {
  assert.equal(cleanSay('').reason, 'empty');
  assert.equal(cleanSay('   ').reason, 'empty');
  assert.equal(cleanSay(null).reason, 'empty');
  assert.equal(cleanSay(42).reason, 'empty');
  assert.equal(cleanSay('あ'.repeat(MAX_CHARS + 1)).reason, 'long');
  assert.equal(cleanSay('わ'.repeat(20)).reason, 'spam', 'a wall of one character is not a message');
  // A sentence of exactly the limit is inside it, and emoji count as one character each
  // rather than as the two the string is made of.
  assert.equal(cleanSay('ab'.repeat(MAX_CHARS / 2)).ok, true);
  assert.equal(cleanSay('🐟🐠'.repeat(MAX_CHARS / 2)).ok, true);
  assert.equal(cleanSay('🐟🐠'.repeat(MAX_CHARS / 2) + '🐟').reason, 'long');
  assert.equal(cleanSay('hello', { last: 'hello' }).reason, 'same');
  assert.equal(cleanSay('hello', { last: 'hi' }).ok, true);
});

test('じゆうにゅうりょく: no way to arrange to meet somewhere nobody is watching', () => {
  for (const said of [
    'https://example.com',
    'see you at www.example.com',
    'my email is me@example.com',
    '09012345678',
    '090-1234-5678',
    'LINE id おしえて',
  ]) {
    assert.equal(cleanSay(said).reason, 'contact', `${said} must not reach another child`);
  }
});

test('じゆうにゅうりょく: words that would hurt to read do not arrive', () => {
  for (const said of ['しね', 'きえろ', 'おまえ うざい', 'You are stupid', 'shut up']) {
    assert.equal(cleanSay(said).reason, 'word', `${said} must not reach another child`);
  }
  // And the list does not eat innocent words that happen to contain one.
  for (const said of ['ばかりで つかれた', 'Let me assist you', 'That is a classic song', 'Do you like cats?']) {
    assert.equal(cleanSay(said).ok, true, `${said} is a perfectly ordinary thing to write`);
  }
  assert.equal(findUnkindWord('こんにちは'), '');
  // Full-width and spaced-out spellings are the same word.
  assert.equal(cleanSay('ＳＴＵＰＩＤ').reason, 'word');
});
