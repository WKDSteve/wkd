import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { convert } from '../scripts/graph-images.mjs';
import { graphSources, SMALL_WIDTH, variantPath } from '../src/lib/graph-sources.ts';

const url = (p: string): string => `/wkd/${p}`;

test('the names of the variants, and which sources a picture gets', () => {
  assert.equal(variantPath('graphs/map.png', 'avif', false), 'graphs/map.avif');
  assert.equal(variantPath('graphs/map.png', 'webp', true), `graphs/map-${SMALL_WIDTH}.webp`);
  const all = (): boolean => true;
  assert.deepEqual(graphSources('graphs/map.png', 1760, url, all), [
    {
      type: 'image/avif',
      srcset: `/wkd/graphs/map-${SMALL_WIDTH}.avif ${SMALL_WIDTH}w, /wkd/graphs/map.avif 1760w`,
    },
    {
      type: 'image/webp',
      srcset: `/wkd/graphs/map-${SMALL_WIDTH}.webp ${SMALL_WIDTH}w, /wkd/graphs/map.webp 1760w`,
    },
  ]);
  // A picture narrower than the small variant has only the full width; a missing file has no source.
  assert.deepEqual(
    graphSources('graphs/m.png', 900, url, (p) => p.endsWith('.webp')),
    [{ type: 'image/webp', srcset: '/wkd/graphs/m.webp 900w' }],
  );
  assert.deepEqual(
    graphSources('graphs/m.png', 900, url, () => false),
    [],
  );
});

test('the converter writes AVIF and WebP, smaller than the PNG, and leaves them alone the second time', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wkd-graph-'));
  try {
    const png = join(dir, 'g.png');
    // Wider than the small variant, and busy enough that the small one is clearly lighter.
    await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: '#fff',
        noise: { type: 'gaussian', mean: 128, sigma: 30 },
      },
    })
      .png()
      .toFile(png);
    assert.ok((await convert(png)) >= 3);
    for (const name of ['g.avif', 'g.webp', `g-${SMALL_WIDTH}.avif`, `g-${SMALL_WIDTH}.webp`]) {
      const file = join(dir, name);
      assert.ok(existsSync(file), name);
      assert.ok(statSync(file).size < statSync(png).size, `${name} is smaller than the PNG`);
    }
    const small = await sharp(join(dir, `g-${SMALL_WIDTH}.webp`)).metadata();
    assert.equal(small.width, SMALL_WIDTH);
    assert.equal(await convert(png), 0, 'nothing to do the second time');
  } finally {
    rmSync(dir, { recursive: true });
  }
});
