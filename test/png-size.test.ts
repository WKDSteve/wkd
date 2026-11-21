import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { pngSize } from '../src/lib/png-size.ts';

// A 1x1 PNG, the smallest valid one.
const ONE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('the size of a PNG is read from its header', () => {
  assert.deepEqual(pngSize(ONE), { width: 1, height: 1 });
});

test('a drawn picture of the site has a size', () => {
  const file = new URL('../public/graphs/matrix.png', import.meta.url);
  const size = pngSize(readFileSync(file));
  assert.ok(size && size.width > 100 && size.height > 100);
});

test('anything that is no PNG, or too short, has none', () => {
  assert.equal(pngSize(new Uint8Array(0)), null);
  assert.equal(pngSize(Buffer.from('GIF89a'.padEnd(40, '\0'))), null);
  assert.equal(pngSize(ONE.subarray(0, 20)), null);
});
