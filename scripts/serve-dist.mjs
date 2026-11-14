#!/usr/bin/env node
// Serves the built site (dist/) under /wkd, as GitHub Pages does, and prints its address:
// the app the test sheets run against (.testing.lua, `sheets.apps.site`). It ends when its
// stdin is closed, which is how testing.nvim ends an app, or on Ctrl+C.
//
//   pnpm build && node scripts/serve-dist.mjs
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '../tests/browser/chrome.mjs';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (!existsSync(`${dist}/index.html`)) {
  console.error('no dist/index.html: run pnpm build first');
  process.exit(1);
}
const server = await serve(dist);
console.log(server.url);
const stop = () => server.close().finally(() => process.exit(0));
process.stdin.resume();
process.stdin.on('end', stop);
process.stdin.on('close', stop);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
