// のりもの島: the gates, the prices, and the course. The data file is checked hard here
// because both the browser and the server build from it — a gate in the sea or a
// checkpoint on top of another one would be a bug a child finds, not a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  RIDE, ISLAND, COURSE, COURSE_CAP, loadVehicles, vehiclePayload, sanitizeGarage,
  sanitizeRiding, speedOf, startLap, crossGate, nextGate, DATA_PATH,
} from '../src/game/vehicles.js';

const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'ride-'));
const write = (data) => { const f = join(dir, 'v.json'); writeFileSync(f, JSON.stringify(data)); return f; };
const clone = () => JSON.parse(JSON.stringify(raw));

test('four vehicles, each dearer and further off than the last', () => {
  assert.deepEqual(RIDE.order, ['kick', 'bike', 'kart', 'hover']);
  let price = 0; let level = 0; let speed = 1;
  for (const id of RIDE.order) {
    const v = RIDE.vehicles.get(id);
    assert.ok(v.price > price && v.level >= level && v.speed > speed, `${id} does not climb`);
    ({ price, level, speed } = v);
  }
  // Every one has an English word, because that is what the island is for.
  for (const v of RIDE.vehicles.values()) { assert.ok(v.word.trim()); assert.ok(v.ja.trim()); }
});

test('a gold sign means the gate would open, and nothing else', () => {
  const kart = RIDE.vehicles.get('kart');   // level 6, 1200 coins
  const poor = vehiclePayload(kart, { level: 9, coins: 100 });
  assert.equal(poor.ready, false);
  assert.equal(poor.needCoins, 1100);
  assert.equal(poor.needLevel, 0, 'the level is already there');
  const young = vehiclePayload(kart, { level: 2, coins: 5000 });
  assert.equal(young.ready, false);
  assert.equal(young.needLevel, 4);
  assert.equal(vehiclePayload(kart, { level: 6, coins: 1200 }).ready, true);
  // Owning it is enough on its own, whatever the purse says afterwards.
  assert.equal(vehiclePayload(kart, { owned: true, level: 1, coins: 0 }).ready, true);
});

test('a garage only holds vehicles that exist, and you ride only what you own', () => {
  assert.deepEqual(sanitizeGarage(['bike', 'bike', 'rocket', 7, 'kick']), ['bike', 'kick']);
  assert.deepEqual(sanitizeGarage('bike'), []);
  assert.equal(sanitizeRiding('bike', ['bike']), 'bike');
  assert.equal(sanitizeRiding('hover', ['bike']), '', 'a wish is not a vehicle');
  assert.equal(speedOf('hover') > speedOf('kick'), true);
  assert.equal(speedOf('nothing'), 1, 'on foot');
});

test('the course is driven in order, and out of order simply waits', () => {
  const lap = startLap(1000);
  assert.equal(nextGate(lap).order, 1);
  const gates = COURSE.gates;
  // Crossing the third checkpoint first is not the next one; the lap does not advance.
  const skipped = crossGate(lap, gates[2].id, 1100);
  assert.equal(skipped.ok, false);
  assert.equal(skipped.want.id, gates[0].id);
  assert.equal(lap.next, 0);
  let out;
  for (let i = 0; i < gates.length; i += 1) {
    out = crossGate(lap, gates[i].id, 1000 + (i + 1) * 1000);
    assert.equal(out.ok, true, gates[i].id);
    assert.equal(out.done, i === gates.length - 1);
  }
  assert.equal(out.ms, gates.length * 1000, 'the lap is timed from its start');
  assert.equal(nextGate(lap), null);
  // Six checkpoints, six direction words, all different.
  assert.equal(new Set(gates.map((g) => g.word)).size, gates.length);
  assert.equal(COURSE.reward.coins * 10, COURSE_CAP, 'ten laps is a full day');
});

test('the island is a place before it is a menu', () => {
  // Nothing sits in the sea, and no two places can be stood at together.
  const spots = [...ISLAND.spotById.values()];
  assert.equal(spots.length, 5);
  for (const s of spots) assert.ok(Math.abs(s.x) <= 30 && Math.abs(s.z) <= 25, `${s.id} is off the island`);
  for (let i = 0; i < spots.length; i += 1) {
    for (let j = i + 1; j < spots.length; j += 1) {
      assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) > ISLAND.radius * 2);
    }
  }
  // Every vehicle can be bought somewhere, and the start line exists.
  for (const id of RIDE.order) assert.ok(spots.some((s) => s.vehicle === id), `${id} has no gate`);
  assert.equal(ISLAND.start.kind, 'start');
  // A checkpoint must not sit inside a gate's shop, or the lap counts a corner nobody drove.
  for (const g of COURSE.gates) {
    for (const s of spots) {
      assert.ok(Math.hypot(g.x - s.x, g.z - s.z) > 3, `${g.id} is on top of ${s.id}`);
    }
  }
});

test('broken vehicle data is refused rather than half-loaded', () => {
  assert.equal(loadVehicles(write(clone())).order.length, 4);
  const noGate = clone();
  noGate.island.spots = noGate.island.spots.filter((s) => s.vehicle !== 'kart');
  assert.throws(() => loadVehicles(write(noGate)), /kart has no gate/);
  const jumped = clone();
  jumped.vehicles[2].tier = 5;
  assert.throws(() => loadVehicles(write(jumped)), /expected 3/);
  const cheaper = clone();
  cheaper.vehicles[3].price = 10;
  assert.throws(() => loadVehicles(write(cheaper)), /not dearer/);
  const fast = clone();
  fast.vehicles[0].speed = 9;
  assert.throws(() => loadVehicles(write(fast)), /unreasonable speed/);
  const sea = clone();
  sea.island.spots[0].x = 99;
  assert.throws(() => loadVehicles(write(sea)), /off the island/);
  const stacked = clone();
  stacked.island.spots[1].x = stacked.island.spots[0].x;
  stacked.island.spots[1].z = stacked.island.spots[0].z;
  assert.throws(() => loadVehicles(write(stacked)), /stood at together/);
  const shuffled = clone();
  shuffled.course.gates[1].order = 5;
  assert.throws(() => loadVehicles(write(shuffled)), /out of order/);
  const crowded = clone();
  crowded.course.gates[1].x = crowded.course.gates[0].x;
  crowded.course.gates[1].z = crowded.course.gates[0].z;
  assert.throws(() => loadVehicles(write(crowded)), /overlap/);
  const noStart = clone();
  noStart.island.spots = noStart.island.spots.filter((s) => s.kind !== 'start');
  assert.throws(() => loadVehicles(write(noStart)), /no start line/);
});
