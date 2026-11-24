import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { copyGraph } from '../src/lib/graph-copy.ts';
import { graphSources } from '../src/lib/graph-sources.ts';

const entry = { name: 'demo.nvim', slug: 'demo' };

/** A checkout and a public/graphs/repo folder in tmp; `run` gets both, the folders are removed after it. */
async function withFolders(
  run: (dir: string, out: string, warnings: string[]) => Promise<void> | void,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'wkd-graph-copy-'));
  try {
    const dir = join(root, 'demo.nvim');
    mkdirSync(join(dir, 'assets', 'graphs'), { recursive: true });
    const warnings: string[] = [];
    await run(dir, join(root, 'public', 'graphs', 'repo'), warnings);
  } finally {
    // Windows may still hold a freshly written image for a moment; a leftover in tmp is no failure.
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5 });
    } catch {}
  }
}

// Flat colour: a PNG far below the size limit of a picture (noise would be megabytes).
const picture = (width: number): Promise<Buffer> =>
  sharp({
    create: { width, height: Math.round(width * 0.75), channels: 3, background: '#7aa2f7' },
  })
    .png()
    .toBuffer();

test('a picture of a repository is copied and gets AVIF, WebP and the sources of a <picture>', async () => {
  await withFolders(async (dir, out, warnings) => {
    writeFileSync(join(dir, 'assets', 'graphs', 'demo.nvim.png'), await picture(2000));
    const site = copyGraph(dir, entry, { warn: (m) => warnings.push(m) }, out);
    assert.equal(site, 'graphs/repo/demo.png');
    assert.deepEqual(warnings, []);
    for (const name of ['demo.png', 'demo.avif', 'demo.webp']) {
      assert.ok(existsSync(join(out, name)), name);
    }
    // What GraphPicture.astro writes from the files that are there.
    const sources = graphSources(
      'graphs/repo/demo.png',
      2000,
      (path) => `/${path}`,
      (path) => existsSync(join(out, '..', '..', path)),
    );
    assert.deepEqual(
      sources.map((s) => s.type),
      ['image/avif', 'image/webp'],
    );
    assert.match(sources[0]?.srcset ?? '', /\/graphs\/repo\/demo\.avif 2000w$/);
  });
});

test('a repository without a picture has none, and nothing is created for it', async () => {
  await withFolders((dir, out, warnings) => {
    assert.equal(copyGraph(dir, entry, { warn: (m) => warnings.push(m) }, out), null);
    assert.equal(existsSync(out), false);
    assert.deepEqual(warnings, []);
  });
});

test('a file that is not a PNG by its content is left out with a warning', async () => {
  await withFolders((dir, out, warnings) => {
    writeFileSync(join(dir, 'assets', 'graphs', 'demo.nvim.png'), '<svg>not a png</svg>');
    assert.equal(copyGraph(dir, entry, { warn: (m) => warnings.push(m) }, out), null);
    assert.equal(warnings.length, 1);
    assert.equal(existsSync(join(out, 'demo.png')), false);
  });
});

test('a symlink is not followed', async (t) => {
  await withFolders(async (dir, out, warnings) => {
    const target = join(dir, 'real.png');
    writeFileSync(target, await picture(300));
    try {
      symlinkSync(target, join(dir, 'assets', 'graphs', 'demo.nvim.png'));
    } catch {
      t.skip('no symlinks on this machine');
      return;
    }
    assert.equal(copyGraph(dir, entry, { warn: (m) => warnings.push(m) }, out), null);
  });
});

test('a PNG that cannot be converted stays the picture, with a warning instead of a stop', async () => {
  await withFolders((dir, out, warnings) => {
    // The signature of a PNG and nothing behind it: the check by content passes, the converter does not.
    writeFileSync(
      join(dir, 'assets', 'graphs', 'demo.nvim.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    );
    assert.equal(
      copyGraph(dir, entry, { warn: (m) => warnings.push(m) }, out),
      'graphs/repo/demo.png',
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0] ?? '', /no AVIF\/WebP/);
    assert.equal(existsSync(join(out, 'demo.avif')), false);
  });
});
