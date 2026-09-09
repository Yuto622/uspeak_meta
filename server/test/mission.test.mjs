import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMissions } from '../src/game/missions.js';
import { sanitizeTurn, buildSystemPrompt } from '../src/ai/tutor.js';
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
  const base = { id: 'a', grade: '5', title: 't', character: 'c', place: 'p', situation: 's', opening: 'o', goals: [{ id: 'g', ja: 'j', en: 'e' }], hints: ['h'], reward: 10 };
  assert.throws(() => loadMissions(write({ missions: [base, { ...base }] })), /duplicate id/);
  assert.throws(() => loadMissions(write({ missions: [{ ...base, grade: '1' }] })), /unknown grade/);
  assert.throws(() => loadMissions(write({ missions: [{ ...base, reward: -5 }] })), /invalid reward/);
  assert.throws(() => loadMissions(write({ missions: [{ ...base, goals: [] }] })), /no goals/);
  assert.throws(() => loadMissions(write({ missions: [] })), /no missions/);
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
