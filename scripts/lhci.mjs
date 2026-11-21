#!/usr/bin/env node
// `pnpm lhci`: Lighthouse CI over the built dist/ (budgets in lighthouserc.cjs). The site is built for the base
// /wkd/, so the folder Lighthouse CI serves has dist/ under that name. Chrome: $CHROME_PATH, else $CHROME, else
// the first one this machine has (the same list as test/browser/chrome.mjs).
//
//   pnpm build && pnpm lhci
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromePath } from '../test/browser/chrome.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
if (!existsSync(`${dist}/index.html`)) {
  console.error('no dist/index.html: run pnpm build first');
  process.exit(1);
}
const site = `${root}.lhci-site`;
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
cpSync(dist, `${site}/wkd`, { recursive: true });

const chrome = process.env.CHROME_PATH ?? chromePath() ?? '';
if (!chrome) {
  console.error('no Chrome on this machine: set CHROME_PATH');
  process.exit(1);
}
rmSync(`${root}.lighthouseci`, { recursive: true, force: true });
const bin = `${root}node_modules/.bin/lhci${process.platform === 'win32' ? '.cmd' : ''}`;
const run = spawnSync(bin, ['autorun', `--config=${root}lighthouserc.cjs`], {
  stdio: 'inherit',
  cwd: root,
  shell: process.platform === 'win32',
  env: { ...process.env, CHROME_PATH: chrome, LHCI_SITE: site },
});
rmSync(site, { recursive: true, force: true });
process.exit(run.status ?? 1);
