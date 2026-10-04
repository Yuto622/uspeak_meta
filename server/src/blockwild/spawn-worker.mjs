// Runs the vendored BLOCKWILD generator once, off the main thread, to find where a class's
// world starts. worldgen.js is plain ES modules with no DOM (world.js is typed arrays), so
// Node can run the same code the browser runs — which is the point: the spawn the server
// hands out is on ground the client will also generate there, from the same seed.
import { parentPort, workerData } from 'node:worker_threads';

const { setSeed, generate, findSpawn } = await import(new URL('../../../client/dist/blockwild/src/worldgen.js', import.meta.url));
setSeed(workerData.seed);
for (const step of generate()) { void step; }
parentPort.postMessage({ spawn: findSpawn() });
