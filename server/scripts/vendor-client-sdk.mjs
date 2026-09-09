// Bundles the pinned colyseus.js SDK for browsers into client/dist/vendor/colyseus.js
// (global `Colyseus`). The package's own dist/ file drags in Node-only code (ws/Buffer),
// so we build a clean browser IIFE with esbuild. No CDN is used in the classroom.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.resolve(here, '../node_modules/colyseus.js/package.json'), 'utf8'));
const outfile = path.resolve(here, '../../client/dist/vendor/colyseus.js');
await build({
  entryPoints: [path.resolve(here, '../node_modules/colyseus.js/lib/index.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'Colyseus',
  target: ['es2019', 'safari14'],
  minify: true,
  sourcemap: false,
  legalComments: 'inline',
  banner: { js: `/* colyseus.js ${pkg.version} browser bundle (MIT). Built by server/scripts/vendor-client-sdk.mjs */` },
  outfile,
  logLevel: 'warning',
});
console.log(`vendored colyseus.js ${pkg.version} -> client/dist/vendor/colyseus.js`);
