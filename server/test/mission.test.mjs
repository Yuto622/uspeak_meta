import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMissions } from '../src/game/missions.js';
import { sanitizeTurn, buildSystemPrompt, mentionsModel, PERSONA } from '../src/ai/tutor.js';
import { applyOp, blankWallet, EconomyError } from '../src/game/economy.js';

const { byId } = loadMissions();
const mission = byId.get('bakery-two-drinks');

test('every shipped mission is well formed', () => {
  assert.ok(byId.size >= 10);
  for (const m of byId.values()) {
    assert.ok(m.goals.length >= 2, `${m.id} needs goals`);
    assert.ok(m.hints.length >= m.goals.length, `${m.id} needs a hint per goal`);
    assert.ok(m.opening.length < 200, `${m.id} opening is too long`);
    assert.ok(m.reward > 0 && m.reward <= 1000);
  }
});

test('a malformed mission file is rejected rather than half-loaded', async () => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = mkdtempSync(path.join(tmpdir(), 'missions-'));
  const write = (data) => { const f = path.join(dir, `${Math.random()}.json`); writeFileSync(f, JSON.stringify(data)); return f; };
  const island = {
    id: 'errand', name: 'n', en: 'N', x: 0, z: 0, radius: 5,
    spots: [
      { id: 'plaza', kind: 'plaza', name: 'Plaza', character: 'Mia', ja: 'ミア', x: 0, z: 0 },
      { id: 'p', kind: 'shop', name: 'p', character: 'c', ja: 'c', x: 20, z: 0 },
    ],
  };
  const base = { id: 'a', grade: '5', title: 't', character: 'c', place: 'p', spot: 'p', from: 'plaza', item: 'i', request: 'r', requestJa: 'r', thanks: 'th', situation: 's', opening: 'o', goals: [{ id: 'g', ja: 'j', en: 'e' }], hints: ['h'], reward: 10 };
  const file = (missions, is = island) => write({ island: is, missions });
  // A well-formed file still loads.
  assert.equal(loadMissions(file([base])).byId.size, 1);

  assert.throws(() => loadMissions(file([base, { ...base }])), /duplicate id/);
  assert.throws(() => loadMissions(file([{ ...base, grade: '1' }])), /unknown grade/);
  assert.throws(() => loadMissions(file([{ ...base, reward: -5 }])), /invalid reward/);
  assert.throws(() => loadMissions(file([{ ...base, goals: [] }])), /no goals/);
  assert.throws(() => loadMissions(file([])), /no missions/);
  assert.throws(() => loadMissions(write({ missions: [base] })), /no island block/);

  // The walk is part of the data, so the data has to describe a real one.
  assert.throws(() => loadMissions(file([{ ...base, spot: 'nowhere' }])), /unknown spot/);
  assert.throws(() => loadMissions(file([{ ...base, from: 'nowhere' }])), /unknown pickup spot/);
  assert.throws(() => loadMissions(file([{ ...base, spot: 'plaza' }])), /without walking anywhere/);
  assert.throws(() => loadMissions(file([{ ...base, character: 'someone else' }])), /but p is c/);
  assert.throws(() => loadMissions(file([{ ...base, place: 'somewhere else' }])), /but p is "p"/);
  assert.throws(() => loadMissions(file([{ ...base, item: '' }])), /missing item/);

  // Two spots close enough to stand in at once would let a leg be skipped.
  const tooClose = { ...island, spots: [island.spots[0], { ...island.spots[1], x: 6 }] };
  assert.throws(() => loadMissions(file([base], tooClose)), /overlap/);
  assert.throws(() => loadMissions(file([base], { ...island, spots: [] })), /no spots/);
  assert.throws(() => loadMissions(file([base], { ...island, radius: 0 })), /radius/);
});

test('the island the errands are walked on is the one the client renders', () => {
  const { island } = loadMissions();
  assert.ok(island.spotById.size >= 5);
  const plaza = [...island.spotById.values()].filter((s) => s.kind === 'plaza');
  assert.equal(plaza.length, 1, 'errands are handed out in exactly one place');
  for (const m of byId.values()) {
    const spot = island.spotById.get(m.spot);
    const from = island.spotById.get(m.from);
    // Far enough that a child cannot stand in both at once, whatever the latency.
    assert.ok(Math.hypot(spot.x - from.x, spot.z - from.z) > island.radius * 3, `${m.id} is too short a walk`);
    // World coordinates are what a `move` message carries.
    assert.equal(spot.wx, island.x + spot.x);
    assert.equal(spot.wz, island.z + spot.z);
  }
});

test('there is one AI and it is always ウーピー', () => {
  const p = buildSystemPrompt(mission);
  // The persona rule comes first, so it outranks the scene it is playing.
  assert.ok(p.startsWith('IMPORTANT CHARACTER RULES'), 'the persona rule leads the prompt');
  assert.match(p, new RegExp(PERSONA.en));
  assert.match(p, new RegExp(PERSONA.ja));
  assert.match(p, /Never say you are an AI/);
  assert.match(p, /Never mention ChatGPT, GPT, OpenAI, Claude, Gemini/);
  // The shopkeeper is a part ウーピー plays, not a second identity.
  assert.match(p, /acting as Oliver at Sunny Bakery/);

  // And the prompt is not the only defence: a reply that talks about being a model is
  // replaced whole, because rewriting it in place produced nonsense.
  const said = (text) => sanitizeTurn({ reply: text, goalsMet: [], complete: false, hint: '' }, mission, []).reply;
  for (const bad of [
    'I am ChatGPT, a large language model made by OpenAI.',
    'ぼくは チャットGPT だよ',
    'I am an AI assistant.',
    'I am Claude, made by Anthropic.',
    '私は人工知能です',
    'I am a virtual assistant here to help.',
  ]) {
    const out = said(bad);
    assert.ok(!mentionsModel(out), `still leaks: ${out}`);
    assert.match(out, new RegExp(PERSONA.en), 'and it answers to its own name');
  }
  // An ordinary reply is left exactly alone.
  assert.equal(said('Good morning! Two juices, coming up.'), 'Good morning! Two juices, coming up.');
  // A hint that mentions a model is dropped rather than shown.
  assert.equal(sanitizeTurn({ reply: 'Hi!', hint: 'AIに聞いてね', goalsMet: [] }, mission, []).hint, '');
  // "ai" is an ordinary Japanese word; only the standalone capitals are a model name.
  assert.equal(mentionsModel('aisatsu wo shiyou'), false);
});

test('the system prompt carries the mission, the level and the safety rules', () => {
  const p = buildSystemPrompt(mission);
  assert.match(p, /Oliver/);
  assert.match(p, /Sunny Bakery/);
  assert.match(p, new RegExp(mission.title));
  for (const g of mission.goals) assert.ok(p.includes(`id="${g.id}"`), `${g.id} missing from prompt`);
  assert.match(p, /at most eight words/, 'grade 5 register');
  assert.match(p, /Never ask for or repeat personal information/);
  assert.match(p, /Never mention that you are an AI/);
});

test('the server never trusts what the model returns', () => {
  const ids = mission.goals.map((g) => g.id);
  // Invented goal ids are dropped.
  let r = sanitizeTurn({ reply: 'Sure!', goalsMet: [ids[0], 'made-up'], complete: true, hint: '' }, mission, []);
  assert.deepEqual(r.goalsMet, [ids[0]]);
  assert.equal(r.complete, false, 'complete is recomputed, not taken from the model');
  // A goal already met cannot be taken away.
  r = sanitizeTurn({ reply: 'Hm?', goalsMet: [], complete: false, hint: '' }, mission, [ids[0]]);
  assert.deepEqual(r.goalsMet, [ids[0]]);
  // Complete only when every goal is met.
  r = sanitizeTurn({ reply: 'Bye!', goalsMet: ids, complete: false, hint: '' }, mission, []);
  assert.equal(r.complete, true);
  // Garbage still yields a usable, bounded turn.
  r = sanitizeTurn(null, mission, []);
  assert.ok(r.reply.length > 0);
  assert.deepEqual(r.goalsMet, []);
  r = sanitizeTurn({ reply: 'x'.repeat(5000), goalsMet: 'nope', hint: 'y'.repeat(500) }, mission, []);
  assert.ok(r.reply.length <= 240);
  assert.ok(r.hint.length <= 80);
  assert.deepEqual(r.goalsMet, []);
});

test('mission rewards are a server-only economy operation', () => {
  const w = blankWallet();
  const entry = applyOp(w, { type: 'award', amount: 30, id: 'mission:bakery-two-drinks' });
  assert.equal(entry.delta, 30);
  assert.equal(w.coins, 30);
  assert.throws(() => applyOp(w, { type: 'award', amount: 0 }), EconomyError);
  assert.throws(() => applyOp(w, { type: 'award', amount: 99999 }), EconomyError);
  assert.throws(() => applyOp(w, { type: 'award', amount: 1.5 }), EconomyError);
});
