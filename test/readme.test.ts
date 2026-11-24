import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('the README explains the size budgets: the file, how they are measured, and where they are checked', () => {
  assert.match(readme, /budgets\.json/);
  assert.match(readme, /scripts\/budget\.mjs/);
  assert.match(readme, /plus a tenth/);
  assert.match(readme, /deploy/);
  assert.match(readme, /PLUGINS_DIR=<folder of the checkouts> pnpm build/);
});
