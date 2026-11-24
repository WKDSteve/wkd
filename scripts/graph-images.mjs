// AVIF and WebP next to every graph PNG: `node scripts/graph-images.mjs [file.png ...]` (no argument:
// everything below public/graphs/). Part of `pnpm build`, and run by the content loader for the
// picture of a repository. A variant that is newer than its PNG is left alone. The names are in
// src/lib/graph-sources.ts, which is also what GraphPicture.astro reads.
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FORMATS, SMALL_WIDTH, variantPath } from '../src/lib/graph-sources.ts';

const OPTIONS = { avif: { quality: 60, effort: 4 }, webp: { quality: 82, effort: 5 } };

function pngsBelow(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? pngsBelow(join(dir, e.name))
      : e.name.endsWith('.png')
        ? [join(dir, e.name)]
        : [],
  );
}

/** Writes the variants of one PNG; returns how many files it wrote. */
export async function convert(png) {
  const { width = 0 } = await sharp(png).metadata();
  const stamp = statSync(png).mtimeMs;
  let written = 0;
  for (const format of FORMATS) {
    for (const small of [false, true]) {
      if (small && width <= SMALL_WIDTH) continue;
      const out = variantPath(png, format, small);
      if (existsSync(out) && statSync(out).mtimeMs >= stamp) continue;
      let image = sharp(png);
      if (small) image = image.resize({ width: SMALL_WIDTH });
      const bytes = await image[format](OPTIONS[format]).toBuffer();
      // A narrow variant that is hardly smaller is not worth a second file.
      const full = variantPath(png, format, false);
      if (small && existsSync(full) && bytes.length > statSync(full).size * 0.75) {
        rmSync(out, { force: true });
        continue;
      }
      writeFileSync(out, bytes);
      written++;
    }
  }
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const given = process.argv.slice(2).map((f) => resolve(f));
  const files = given.length > 0 ? given : pngsBelow(join(root, 'public', 'graphs'));
  let written = 0;
  for (const f of files) written += await convert(f);
  if (written > 0)
    console.log(`graph-images: wrote ${written} file(s) for ${files.length} picture(s)`);
}
