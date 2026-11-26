// 島と 島を つなぐ 橋（client/dist/bridges-data.js）。
// サーバーは 橋を 知らない：`move` の `s`（いる 島）と x, z を 子どもの 画面が 言う とおりに 受けとる。
// だから ここで 見るのは 2 つ ─ ① 表が 正しい（ぜんぶ つながる・横切らない・錠の 島は 行き止まり）、
// ② 歩いて わたった あと（ひこうきに のらずに `s` が かわる）でも、島の 上の「ここに 立って いる」が そのまま 通る。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.STORE_BACKEND = 'memory';
process.env.LOG_LEVEL = 'error';
process.env.TASKS = 'off';

const { startServer } = await import('../src/index.js');
const { STALLS } = await import('../src/game/food.js');
const { FW } = await import('../src/game/fishworld.js');
const { PREMIUM_ISLANDS } = await import('../src/rooms/ClassRoom.js');
const { Client } = await import('colyseus.js');
const { LINKS, WALKABLE, linksOf, neighboursOf, onDeck, project, pointAt, deckY } = await import('../../client/dist/bridges-data.js');
const { HUBS, REGIONS } = await import('../../client/dist/rpg-data.js');

let server; let url;
const nextMessage = (room, type, ms = 3000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`no ${type}`)), ms);
  const off = room.onMessage(type, (m) => { clearTimeout(timer); off(); resolve(m); });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
before(async () => { server = await startServer({ port: 0 }); url = `ws://127.0.0.1:${server.server.address().port}`; });
after(async () => { await server.shutdown('test'); });

const ALL = [...HUBS, ...REGIONS];
const POS = new Map(ALL.map((r) => [r.id, r]));
// 島の 大きさ（まんなかからの 半分の はば）。メインの島は ダウンタウンと ひろばまで 入れた 箱。
const EIKEN = new Set(['eiken5', 'eiken4', 'eiken3', 'eikenp2', 'eiken2', 'eikenp1', 'eiken1']);
const box = (id) => {
  const r = POS.get(id);
  if (id === 'main') return { x0: -106, x1: 64, z0: -155, z1: -30 };
  const [hx, hz] = id === 'willow' ? [28, 24] : id === 'park' ? [36, 34] : EIKEN.has(id) ? [43, 45] : r.hub ? [33, 36] : [32.5, 28];
  return { x0: r.x - hx, x1: r.x + hx, z0: r.z - hz, z1: r.z + (EIKEN.has(id) || (r.hub && id !== 'willow' && id !== 'park') ? hz : hz) };
};
const inBox = (b, p, m = 0) => p.x >= b.x0 - m && p.x <= b.x1 + m && p.z >= b.z0 - m && p.z <= b.z1 + m;

test('橋の 表：ぜんぶの 島が 歩いて つながる', () => {
  const seen = new Set(['main']); let grew = true;
  while (grew) { grew = false; for (const l of LINKS) if (seen.has(l.a) !== seen.has(l.b)) { seen.add(l.a); seen.add(l.b); grew = true; } }
  for (const r of ALL) assert.ok(seen.has(r.id), `${r.id} can be reached on foot`);
  for (const l of LINKS) { assert.ok(POS.has(l.a) && POS.has(l.b), `${l.id} joins two real islands`); assert.notEqual(l.a, l.b); }
  assert.equal(new Set(LINKS.map((l) => [l.a, l.b].sort().join('~'))).size, LINKS.length, 'no pair is joined twice');
  assert.deepEqual(neighboursOf('willow').sort(), ['errand', 'main', 'park']);
});

test('橋の 表：はしは その 島の 岸に あり、ほかの 島も ほかの 橋も 横切らない', () => {
  for (const l of LINKS) {
    assert.ok(inBox(box(l.a), l.from, 1), `${l.id} starts on ${l.a}`);
    assert.ok(inBox(box(l.b), l.to, 1), `${l.id} ends on ${l.b}`);
    assert.ok(l.len >= 8 && l.len <= 170, `${l.id} is ${l.len.toFixed(1)} long`);
    if (l.legacy) continue;
    // 海の 上で ほかの 島の 上を 通らない（さばくと 英会話島は もともと 重なって いるので、はしの 島 どうしは 見ない）。
    for (let s = 0; s <= l.len; s += 1) {
      const p = pointAt(l, s);
      for (const r of ALL) { if (r.id === l.a || r.id === l.b) continue; assert.ok(!inBox(box(r.id), p, 2), `${l.id} passes over ${r.id} at ${p.x.toFixed(0)},${p.z.toFixed(0)}`); }
    }
  }
  const side = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  for (let i = 0; i < LINKS.length; i += 1) for (let j = i + 1; j < LINKS.length; j += 1) {
    const p = LINKS[i], q = LINKS[j];
    const cross = side(p.from, p.to, q.from) * side(p.from, p.to, q.to) < 0 && side(q.from, q.to, p.from) * side(q.from, q.to, p.to) < 0;
    assert.ok(!cross, `${p.id} crosses ${q.id}`);
    // 同じ 島に つく 2 本は はなれて いる（板が かさならない）。
    for (const [ia, ea] of [[p.a, p.from], [p.b, p.to]]) for (const [ib, eb] of [[q.a, q.from], [q.b, q.to]]) if (ia === ib) assert.ok(Math.hypot(ea.x - eb.x, ea.z - eb.z) >= 9, `${p.id} and ${q.id} land too close on ${ia}`);
  }
});

test('橋の 表：入れない ことが ある 島の むこうに、入れる 島が のこらない', () => {
  // プレミアムの 島と、じょうけんつきの ちいきを ぜんぶ とりのぞいても、のこりは つながって いる。
  const premium = new Set(PREMIUM_ISLANDS);
  const gated = (id) => premium.has(id) || (!POS.get(id).hub && (POS.get(id).needs || []).length > 0);
  const open = ALL.filter((r) => !gated(r.id)).map((r) => r.id);
  const seen = new Set(['main']); let grew = true;
  while (grew) { grew = false; for (const l of LINKS) { if (gated(l.a) || gated(l.b)) continue; if (seen.has(l.a) !== seen.has(l.b)) { seen.add(l.a); seen.add(l.b); grew = true; } } }
  for (const id of open) assert.ok(seen.has(id), `${id} is reachable without passing a locked island`);
  // じょうけんつきの ちいきは 行き止まり（橋は 1 本）。
  for (const r of REGIONS) if ((r.needs || []).length) assert.equal(linksOf(r.id).length, 1, `${r.id} is a dead end`);
  // 幼児モードの 島（kids.js の KIDS_ISLANDS と 同じ 6 つ）は メインの島から とぶ。橋は 行き先が その 6 つの ときだけ ひらく。
});

test('橋の 上：板の 上は 歩ける、手すりの 外は 歩けない、まんなかの 台は ひろい', () => {
  for (const l of WALKABLE) {
    for (let s = 0; s <= l.len; s += 0.5) { const p = pointAt(l, s, 1.5); assert.ok(onDeck(l, p.x, p.z), `${l.id} deck at ${s}`); }
    const q = pointAt(l, l.len / 4, l.half + 0.5); assert.ok(!onDeck(l, q.x, q.z), `${l.id} rail`);
    const m = pointAt(l, l.len / 2, 3); assert.equal(onDeck(l, m.x, m.z), !!l.rest, `${l.id} rest platform`);
    const back = project(l, m.x, m.z); assert.ok(Math.abs(back.s - l.len / 2) < 1e-6 && Math.abs(back.w - 3) < 1e-6);
    assert.ok(deckY(l, 0) < 0.31 && deckY(l, l.len / 2) <= 0.76, `${l.id} stays low enough to walk on`);
  }
  assert.ok(WALKABLE.filter((l) => l.rest).length >= 10, 'long bridges have a place to rest');
});

test('歩いて わたる：ひこうきに のらずに 島が かわっても、部屋は その 島に 立って いると 見る', async () => {
  const room = await new Client(url).joinOrCreate('class', { classCode: 'brg1', name: 'Walker' });
  room.onMessage('*', () => {});
  await nextMessage(room, 'welcome').catch(() => {});
  // まちづくり島 → つり島の 橋（いちばん 長い）を、0.6 秒ぶんずつ 歩く。まんなかで `s` が かわる。
  const l = WALKABLE.find((x) => x.id === 'town-fishworld');
  for (let s = 0; s <= l.len; s += 4) {
    const p = pointAt(l, s);
    room.send('move', { s: s < l.len / 2 ? l.a : l.b, x: p.x, z: p.z, r: 0, a: 'walk', t: Math.round(s) });
  }
  await sleep(400);
  const me = room.state.players.get(room.sessionId);
  assert.equal(me.space, 'fishworld', 'the room follows the island the child walked onto');
  assert.ok(Math.hypot(me.x - l.to.x, me.z - l.to.z) < 4, 'and the place');
  // 歩いて ついた 子は まだ 橋の たもと：つり場では ない。
  room.send('fw:open', { spot: 'pond' });
  assert.equal((await nextMessage(room, 'fw:error')).reason, 'too far');
  // つり島の いけの 小屋まで 歩く：ひこうきで ついた ときと 同じに ひらく。
  const sp = FW.spotById.get('pond');
  room.send('move', { s: FW.id, x: FW.island.x + sp.x, z: FW.island.z + sp.z, r: 0, a: 'idle', t: 99 });
  room.send('fw:open', { spot: 'pond' });
  assert.equal((await nextMessage(room, 'fw:state')).zone, 1, 'the fishing hut answers a child who walked in');
  // 橋を もどって メインの島の 屋台へ：`s` が main に かわれば 屋台の 前に いると 見る。
  const st = STALLS.stalls.get('fruit');
  room.send('move', { s: 'arena', x: -111, z: -107, r: 0, a: 'walk', t: 100 });
  room.send('food:open', { shop: 'fruit' });
  assert.equal((await nextMessage(room, 'food:error')).reason, 'too far', 'the island named in the move is the island checked');
  room.send('move', { s: STALLS.island.id, x: st.wx, z: st.wz, r: 0, a: 'idle', t: 101 });
  room.send('food:open', { shop: 'fruit' });
  assert.ok(await nextMessage(room, 'food:menu'), 'and the stall on the main island opens after walking back');
  await room.leave();
});
