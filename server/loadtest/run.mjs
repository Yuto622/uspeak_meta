// Headless load test: N clients join one class, walk randomly at 20 Hz, and we measure
//  * server CPU / memory (polled from /healthz),
//  * downstream bandwidth per client (KB/s, raw WebSocket bytes),
//  * broadcast latency distribution (client send timestamp -> other clients' receive),
//  * disconnects over the whole run (default 10 minutes).
//
// Usage: node loadtest/run.mjs --url=ws://localhost:2567 --clients=25 --duration=600 --class=loadtest
import { Client } from 'colyseus.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const URL = args.url || process.env.LOADTEST_URL || 'ws://localhost:2567';
const CLIENTS = Number(args.clients || 25);
const DURATION_S = Number(args.duration || 600);
const CLASS = args.class || 'loadtest';
const SEND_HZ = Number(args.hz || 20);
const HEALTH_URL = URL.replace(/^ws/, 'http') + '/healthz';
const OUT_DIR = args.out || path.resolve('loadtest-results');
const SPEED = 5; // world units / s, same as the game

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowMod = () => Date.now() % 4294967296;
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

const clients = [];
const latencies = []; // ms, sampled
const health = [];
let disconnects = 0;
let errors = 0;
const started = Date.now();

async function spawnClient(i) {
  const name = `bot${String(i + 1).padStart(2, '0')}`;
  const c = { name, bytes: 0, messages: 0, room: null, x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30, dir: Math.random() * Math.PI * 2, ok: true, joinedAt: 0 };
  const client = new Client(URL);
  const room = await client.joinOrCreate('class', { classCode: CLASS, name, avatar: { id: 'kai' } });
  c.room = room;
  c.joinedAt = Date.now();
  // Count raw bytes at the socket level (state patches + messages).
  const ws = room.connection.transport.ws;
  const count = (data) => { c.bytes += data?.byteLength ?? data?.length ?? 0; c.messages++; };
  if (typeof ws.addEventListener === 'function') ws.addEventListener('message', (e) => count(e.data));
  else if (typeof ws.on === 'function') ws.on('message', (d) => count(d));
  room.onMessage('*', () => {});
  room.onError((code, msg) => { errors++; console.log(`[${name}] error ${code} ${msg}`); });
  room.onLeave((code) => { if (Date.now() - started < DURATION_S * 1000 - 500) { disconnects++; console.log(`[${name}] left code=${code}`); c.ok = false; } });
  // Broadcast latency: other players' ts (their Date.now() at send) vs our Date.now() at receive.
  room.state.players.onAdd((p, id) => {
    if (id === room.sessionId) return;
    let n = 0;
    p.listen('ts', (v) => { if (!v || (n++ % 10) !== 0) return; const d = (nowMod() - v + 4294967296) % 4294967296; if (d < 60000) latencies.push(d); });
  });
  clients.push(c);
}

async function main() {
  console.log(`loadtest: ${CLIENTS} clients -> ${URL} class=${CLASS} for ${DURATION_S}s at ${SEND_HZ} Hz`);
  for (let i = 0; i < CLIENTS; i++) {
    try { await spawnClient(i); } catch (err) { errors++; console.log(`spawn ${i} failed: ${err.message}`); }
    await sleep(80); // classroom-like staggered joins
  }
  console.log(`${clients.length} clients joined in ${Date.now() - started} ms`);

  // Random walk at SEND_HZ.
  const dt = 1 / SEND_HZ;
  const walker = setInterval(() => {
    for (const c of clients) {
      if (!c.room || !c.ok) continue;
      if (Math.random() < 0.05) c.dir += (Math.random() - 0.5) * 2;
      c.x += Math.cos(c.dir) * SPEED * dt; c.z += Math.sin(c.dir) * SPEED * dt;
      if (Math.abs(c.x) > 24) c.dir = Math.PI - c.dir; if (Math.abs(c.z) > 19) c.dir = -c.dir;
      c.room.send('move', { s: 'willow', x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100, r: c.dir, a: 'walk', t: nowMod() });
    }
  }, 1000 / SEND_HZ);

  // Health sampling every 5 s.
  const poll = setInterval(async () => {
    try { const r = await fetch(HEALTH_URL); const j = await r.json(); health.push({ t: Date.now() - started, cpu: j.cpuPercent, rss: j.memory.rssMb, heap: j.memory.heapUsedMb, clients: j.clients }); }
    catch (err) { health.push({ t: Date.now() - started, error: err.message }); }
  }, 5000);

  // Progress line every 30 s.
  const progress = setInterval(() => {
    const el = (Date.now() - started) / 1000;
    const kbps = mean(clients.map((c) => c.bytes / 1024 / el));
    const last = health[health.length - 1] || {};
    console.log(`t=${el.toFixed(0)}s alive=${clients.filter((c) => c.ok).length}/${clients.length} down=${kbps.toFixed(2)}KB/s/client lat p50=${pct(latencies, 50)}ms p95=${pct(latencies, 95)}ms cpu=${last.cpu ?? '?'}% rss=${last.rss ?? '?'}MB disconnects=${disconnects}`);
  }, 30000);

  await sleep(DURATION_S * 1000);
  clearInterval(walker); clearInterval(poll); clearInterval(progress);
  const elapsed = (Date.now() - started) / 1000;
  const perClient = clients.map((c) => c.bytes / 1024 / Math.max(1, (Date.now() - c.joinedAt) / 1000));
  const cpuSamples = health.filter((h) => h.cpu != null).map((h) => h.cpu);
  const rssSamples = health.filter((h) => h.rss != null).map((h) => h.rss);
  const summary = {
    url: URL, clients: clients.length, requested: CLIENTS, durationSec: Math.round(elapsed), sendHz: SEND_HZ,
    bandwidthKBps: { mean: +mean(perClient).toFixed(2), min: +Math.min(...perClient).toFixed(2), max: +Math.max(...perClient).toFixed(2) },
    broadcastLatencyMs: { samples: latencies.length, p50: pct(latencies, 50), p90: pct(latencies, 90), p95: pct(latencies, 95), p99: pct(latencies, 99), max: Math.max(0, ...latencies), mean: +mean(latencies).toFixed(1) },
    server: { cpuPercent: { mean: +mean(cpuSamples).toFixed(1), max: Math.max(0, ...cpuSamples) }, rssMb: { mean: +mean(rssSamples).toFixed(1), max: Math.max(0, ...rssSamples) }, samples: health.length },
    disconnects, errors,
    verdict: disconnects === 0 && errors === 0 ? 'PASS: no disconnects' : `CHECK: ${disconnects} disconnects, ${errors} errors`,
  };
  console.log('\n===== LOAD TEST SUMMARY =====');
  console.table({
    'clients': summary.clients, 'duration (s)': summary.durationSec,
    'downstream KB/s per client (mean/max)': `${summary.bandwidthKBps.mean} / ${summary.bandwidthKBps.max}`,
    'broadcast latency ms p50/p95/p99/max': `${summary.broadcastLatencyMs.p50} / ${summary.broadcastLatencyMs.p95} / ${summary.broadcastLatencyMs.p99} / ${summary.broadcastLatencyMs.max}`,
    'server CPU % (mean/max)': `${summary.server.cpuPercent.mean} / ${summary.server.cpuPercent.max}`,
    'server RSS MB (mean/max)': `${summary.server.rssMb.mean} / ${summary.server.rssMb.max}`,
    'disconnects / errors': `${summary.disconnects} / ${summary.errors}`,
  });
  console.log(summary.verdict);
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `loadtest-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ summary, health, latencyHistogram: histogram(latencies) }, null, 2));
  console.log(`written ${file}`);
  await Promise.all(clients.map((c) => c.room?.leave().catch(() => {})));
  process.exit(summary.disconnects || summary.errors ? 1 : 0);
}

function histogram(values, buckets = [25, 50, 75, 100, 150, 200, 300, 500, 1000]) {
  const out = {};
  let prev = 0;
  for (const b of buckets) { out[`${prev}-${b}ms`] = values.filter((v) => v >= prev && v < b).length; prev = b; }
  out[`>=${prev}ms`] = values.filter((v) => v >= prev).length;
  return out;
}

main().catch((err) => { console.error(err); process.exit(1); });
