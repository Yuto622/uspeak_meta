// The circuit, measured. A track is a drawing until somebody checks that a kart can get
// round it: that the road never crosses itself, that no corner is tighter than the kart
// can turn, that the hill is a hill and not a wall, and that every box, pad, grid slot and
// checkpoint is actually on the tarmac. All of it is arithmetic on tracks.json, so it runs
// in a second with no screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tracksFrom } from '../../client/dist/kart-track-data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(here, '../../client/dist/tracks.json'), 'utf8'));
const { tracks } = tracksFrom(data);

test('every circuit is a lap a kart can drive', () => {
  assert.ok(tracks.length >= 1, 'there is a track');
  for (const t of tracks) {
    // Long enough to be a race, short enough that a lap is not a chore.
    assert.ok(t.length > 500 && t.length < 1600, `${t.id}: ${Math.round(t.length)}m round`);
    // A closed loop: the last frame leads back to the first.
    const a = t.frames[0];
    const b = t.frames[t.frames.length - 1];
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 4, `${t.id}: the lap closes`);
  }
});

test('no corner is tighter than a kart can take', () => {
  for (const t of tracks) {
    let tightest = Infinity;
    let where = 0;
    for (const f of t.frames) {
      const r = Math.abs(f.curv) > 1e-6 ? 1 / Math.abs(f.curv) : Infinity;
      if (r < tightest) { tightest = r; where = f.s; }
    }
    // A kart turns at about 2 radians a second at 15 m/s, which is a 7.5m radius flat out;
    // 12m leaves room to be going quickly and still make it without stopping.
    assert.ok(tightest > 12, `${t.id}: tightest corner ${tightest.toFixed(1)}m at ${Math.round(where)}m`);
  }
});

test('the road never crosses itself', () => {
  for (const t of tracks) {
    const n = t.frames.length;
    for (let i = 0; i < n; i += 1) {
      const a = t.frames[i];
      for (let j = i + 3; j < n; j += 1) {
        // Neighbours along the lap are meant to be close; anything else must be a road's
        // width apart or the two stretches overlap and a child drives onto the wrong one.
        const gapAlong = Math.min(Math.abs(j - i), n - Math.abs(j - i));
        if (gapAlong < 24) continue;
        const b = t.frames[j];
        if (Math.abs(a.y - b.y) > 6) continue;  // a bridge is allowed to pass overhead
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        assert.ok(d > (a.w + b.w) / 2 + 4,
          `${t.id}: the road at ${Math.round(a.s)}m and ${Math.round(b.s)}m are ${d.toFixed(1)}m apart`);
      }
    }
  }
});

test('the hill is a hill', () => {
  for (const t of tracks) {
    for (const f of t.frames) {
      // A gradient a kart cannot climb is a wall painted like a road. 25% is steep and
      // still drivable; the crest of this circuit sits well under it.
      assert.ok(Math.abs(f.grade) < 0.25, `${t.id}: ${(f.grade * 100).toFixed(0)}% at ${Math.round(f.s)}m`);
    }
  }
});

test('everything the race needs is on the road', () => {
  for (const t of tracks) {
    const onRoad = (p, what, margin = 1.2) => {
      const hit = t.project(p.x, p.z);
      const half = t.at(hit.s).w / 2;
      assert.ok(Math.abs(hit.offset) < half - margin,
        `${t.id}: ${what} is ${Math.abs(hit.offset).toFixed(1)}m off centre where the road is ${(half * 2).toFixed(1)}m wide`);
    };
    for (const c of t.checkpoints) onRoad(c, `checkpoint ${c.id}`, 0);
    for (const b of t.items) onRoad(b, `item box ${b.id}`);
    for (const b of t.boosts) onRoad(b, `boost pad ${b.id}`);
    for (const g of t.grid) onRoad(g, `grid slot ${g.place}`);
  }
});

test('the grid is behind the line, in order, and nobody shares a square', () => {
  for (const t of tracks) {
    assert.ok(t.grid.length >= 8, `${t.id}: room for a class on the grid`);
    for (let i = 0; i < t.grid.length; i += 1) {
      for (let j = i + 1; j < t.grid.length; j += 1) {
        const d = Math.hypot(t.grid[i].x - t.grid[j].x, t.grid[i].z - t.grid[j].z);
        assert.ok(d > 3.4, `${t.id}: grid ${i + 1} and ${j + 1} are ${d.toFixed(1)}m apart`);
      }
    }
    // Pole is nearest the line and the grid runs backwards from it. Two karts share a row,
    // so this is metres along the lap with a row's worth of slack rather than strict order.
    const back = t.grid.map((g) => {
      const s = t.project(g.x, g.z).s;
      return s > t.length / 2 ? s : s + t.length;   // the grid sits just before the line
    });
    for (let i = 1; i < back.length; i += 1) {
      assert.ok(back[i] <= back[i - 1] + 1.5,
        `${t.id}: grid ${i + 1} is ${(back[i] - back[i - 1]).toFixed(1)}m ahead of grid ${i}`);
    }
  }
});

test('a point on the road can be found again from its coordinates', () => {
  for (const t of tracks) {
    for (let i = 0; i < 60; i += 1) {
      const s = (i / 60) * t.length;
      const o = ((i % 7) - 3) * 1.4;
      const p = t.place(s, o);
      const back = t.project(p.x, p.z);
      const err = Math.min(Math.abs(back.s - s), t.length - Math.abs(back.s - s));
      assert.ok(err < 2.5, `${t.id}: ${Math.round(s)}m came back as ${Math.round(back.s)}m`);
      assert.ok(Math.abs(back.offset - o) < 1.2, `${t.id}: offset ${o} came back as ${back.offset.toFixed(2)}`);
    }
  }
});

test('the hint finds the same place as the full search', () => {
  for (const t of tracks) {
    let hint = -1;
    for (let i = 0; i < 200; i += 1) {
      const s = (i / 200) * t.length;
      const p = t.place(s, 2);
      const slow = t.project(p.x, p.z);
      const fast = t.project(p.x, p.z, hint);
      hint = fast.index;
      assert.ok(Math.abs(slow.s - fast.s) < 0.5, `${t.id}: at ${Math.round(s)}m the hint disagreed`);
    }
  }
});
