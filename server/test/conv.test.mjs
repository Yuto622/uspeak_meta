// 英会話島 — the part of a conversation this server decides.
//
// The talking itself belongs to the AI; what is tested here is everything around it that
// a child's record depends on: that the island the page draws is the island this server
// judges positions against, that a scene is shaped into something the tutor can run, that
// the aims come with no answers attached, and that the page cannot start a conversation in
// a house it is not standing in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

process.env.LOG_LEVEL = 'error';
const { CONV, loadConv, asMission, topicPayload, convSpots, CONV_PATH } = await import('../src/game/conv.js');
const { buildSystemPrompt, PERSONA } = await import('../src/ai/tutor.js');

test('英会話島: four houses, eight scenes, and every aim in two languages', () => {
  assert.equal(CONV.id, 'conv');
  assert.equal(CONV.island.spots.length, 4);
  const topics = [...CONV.topicById.values()];
  assert.equal(topics.length, 8, 'two scenes per house');
  for (const topic of topics) {
    assert.ok(topic.opening.length > 8, `${topic.id} opens with a real line`);
    assert.ok(/[?!]$/.test(topic.opening), `${topic.id} opens with something to answer`);
    assert.ok(topic.goals.length >= 2 && topic.goals.length <= 4);
    assert.equal(topic.hints.length, topic.goals.length, `${topic.id}: one model sentence per aim`);
    for (const g of topic.goals) assert.ok(g.ja && g.en, `${topic.id}:${g.id} says what it is in both languages`);
  }
  // Houses stand apart and each has a path drawn from the courtyard: the page walks it.
  for (const a of CONV.island.spots) {
    assert.ok(a.path && Number.isFinite(a.path.x), `${a.id} has a path`);
    for (const b of CONV.island.spots) {
      if (a === b) continue;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 10, `${a.id} and ${b.id} are not on top of each other`);
    }
  }
});

test('英会話島: the island the page draws is the island the server judges', () => {
  // One file, read by both. A house that moves in the JSON moves in both places at once.
  const raw = JSON.parse(readFileSync(CONV_PATH, 'utf8'));
  assert.deepEqual(raw.island.spots.map((s) => [s.id, s.x, s.z]), CONV.island.spots.map((s) => [s.id, s.x, s.z]));
  assert.equal(raw.island.x, CONV.island.x);
  assert.equal(raw.island.z, CONV.island.z);
});

test('英会話島: a scene is a mission the existing tutor can run, played by ウーピー', () => {
  const topic = CONV.topicById.get('shopping');
  const mission = asMission(topic);
  assert.equal(mission.character, PERSONA.ja, 'one AI, one name, everywhere');
  assert.equal(mission.grade, '5', 'the house decides how plainly ウーピー speaks');
  assert.equal(mission.goals, topic.goals);
  const prompt = buildSystemPrompt(mission);
  assert.ok(prompt.startsWith('IMPORTANT CHARACTER RULES'), 'the persona rule still leads');
  assert.match(prompt, /英会話島 \(Conversation Isle\)/, 'the scene is this island, not おつかい島');
  assert.match(prompt, /acting as ウーピー at おかいものストリート/);
  assert.match(prompt, /id="price" - The child asks how much it costs\./, 'the aims travel into the prompt');
  assert.ok(!prompt.includes('How much is it?'), 'the model sentences are the scripted stand-in\'s cues, not the prompt\'s');
  assert.match(prompt, /Never mention ChatGPT/);
});

test('英会話島: the page is told the aims, never how to meet them', () => {
  const payload = topicPayload(CONV.topicById.get('dream'));
  const text = JSON.stringify(payload);
  assert.deepEqual(payload.aims.map((a) => a.id), ['want', 'why', 'plan']);
  for (const aim of payload.aims) assert.ok(aim.ja && !aim.en, 'a child sees what to try, in Japanese');
  // The scene file itself is shared with the page (the island is built from it, exactly as
  // おつかい島 is built from missions.json). What never travels is this: the message a turn
  // comes back in carries the aims a child sees and nothing the AI is judged by.
  assert.ok(!text.includes('I want to be a doctor'), 'no model sentences in the turn payload');
  assert.ok(!text.includes('The child says'), 'and none of the wording the AI is judged against');
  assert.equal(payload.turnLimit, CONV.turnLimit);
  // The menu the page builds its house list from carries no scene text either.
  assert.ok(!JSON.stringify(convSpots()).includes('You are'), 'no situation text on the wire');
});

test('英会話島: a malformed island file is refused at startup, not at a child\'s first tap', () => {
  const raw = JSON.parse(readFileSync(CONV_PATH, 'utf8'));
  const refuses = (fn, why) => {
    const copy = JSON.parse(JSON.stringify(raw));
    fn(copy);
    const file = new URL(`../.tmp-conv-${Math.random().toString(36).slice(2)}.json`, import.meta.url);
    writeFileSync(file, JSON.stringify(copy));
    try { assert.throws(() => loadConv(file), why); } finally { rmSync(file, { force: true }); }
  };
  refuses((c) => { c.island.spots[0].topics[0].goals = [{ id: 'only', ja: 'x', en: 'y' }]; }, /two to four aims/);
  refuses((c) => { c.island.spots[1].topics[0].id = c.island.spots[0].topics[0].id; }, /duplicate topic/);
  refuses((c) => { delete c.island.spots[2].topics[0].opening; }, /no scene/);
  refuses((c) => { c.island.spots = []; }, /no island/);
});
