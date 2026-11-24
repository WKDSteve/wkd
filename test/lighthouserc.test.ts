import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// Under CI the config refuses a folder without the pages (it is meant for the run after the build); here only the
// assertions are of interest, so it is read as on a machine without them.
const { CI } = process.env;
delete process.env.CI;
const config = createRequire(import.meta.url)('../lighthouserc.cjs');
if (CI !== undefined) process.env.CI = CI;

test('the Lighthouse budgets: LCP and CLS fail, blocking time and the weight of a page warn', () => {
  const a = config.ci.assert.assertions;
  assert.equal(a['largest-contentful-paint'][0], 'error');
  assert.equal(a['largest-contentful-paint'][1].maxNumericValue, 2500);
  assert.equal(a['cumulative-layout-shift'][0], 'error');
  assert.equal(a['total-blocking-time'][0], 'warn');
  // The pictures are AVIF/WebP in a <picture>: the heaviest measured page (429 KB) plus a tenth.
  assert.equal(a['total-byte-weight'][0], 'warn');
  assert.ok(a['total-byte-weight'][1].maxNumericValue <= 480_000);
});
