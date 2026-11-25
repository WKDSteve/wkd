// Copies the picture of a repository's connections into what the site serves, and has AVIF and WebP made for
// it. Free of Astro (the content loader passes its logger in), so `pnpm test` covers it with folders in tmp.

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPH_MAX_BYTES, isPng } from './app-facts.ts';

const CONVERTER = fileURLToPath(new URL('../../scripts/graph-images.mjs', import.meta.url));

export interface GraphLogger {
  warn(message: string): void;
}

/**
 * Copies `<dir>/assets/graphs/<name>.png` (written by the app-icons tool of the workshop) to
 * `<outDir>/<slug>.png` and returns the path below `public/` (`graphs/repo/<slug>.png`), or null without a
 * usable one. Like an icon it comes from a repository and ends up under the site's origin: a regular file (a
 * symlink is not followed) and a PNG by its content. A repository without a picture is not an error.
 */
export function copyGraph(
  dir: string,
  entry: { name: string; slug: string },
  logger: GraphLogger,
  outDir: string,
): string | null {
  const src = join(dir, 'assets', 'graphs', `${entry.name}.png`);
  const stat = lstatSync(src, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size > GRAPH_MAX_BYTES) return null;
  const bytes = readFileSync(src);
  if (!isPng(bytes, GRAPH_MAX_BYTES)) {
    logger.warn(`${entry.name}: ${src} is not a PNG -- left out`);
    return null;
  }
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${entry.slug}.png`);
  const old = lstatSync(out, { throwIfNoEntry: false })?.isFile() ? readFileSync(out) : null;
  // Written only when it differs: every content sync comes through here, and in `astro dev` a write into
  // public/ is a change the dev server reacts to.
  if (!old?.equals(bytes)) writeFileSync(out, bytes);
  // AVIF and WebP next to it (the same script as `pnpm build` runs for the fixed pictures). Without them
  // the picture is just the PNG, so a failure here is a warning, not a stop.
  try {
    execFileSync(process.execPath, [CONVERTER, out], { stdio: 'pipe' });
  } catch (error) {
    logger.warn(
      `${entry.name}: no AVIF/WebP for its graph (${(error as Error).message.split('\n')[0]})`,
    );
  }
  return `graphs/repo/${entry.slug}.png`;
}
