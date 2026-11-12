import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { builtAreas, MOVED, movedEntries, routeProblems } from '../lib/nav';
import { type RawRegistry, validateRegistry } from '../lib/registry';

// The last step of every build: the addresses that are already out in the
// world must be in the output, or the build fails and nothing is deployed.
// Those are the plugin pages (the READMEs of the plugins link to them), the
// areas the navigation shows and the addresses that moved (among them the old
// p/<slug>/ of every app, web variant and kit). The rules are in
// routeProblems() (src/lib/nav.ts), where tests/nav.test.ts covers them.

/** Every .astro file under a directory, as paths relative to it with forward slashes. */
function astroFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.astro')) out.push(relative(dir, p).replace(/\\/g, '/'));
    }
  };
  walk(dir);
  return out;
}

export function routesIntegration(): AstroIntegration {
  let base = '/';
  let outDir = '';
  let srcDir = '';

  return {
    name: 'wkd-routes',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base.replace(/\/?$/, '/');
        outDir = fileURLToPath(config.outDir);
        srcDir = fileURLToPath(config.srcDir);
      },

      'astro:build:done': ({ logger }) => {
        const registry = JSON.parse(
          readFileSync(join(srcDir, 'data', 'registry.json'), 'utf8'),
        ) as RawRegistry;
        // The same test the loader applies: an entry without a checkout is
        // skipped there (a private or missing repository), so it has no page
        // to miss here.
        const root = resolve(process.env.PLUGINS_DIR ?? '..');
        const built = validateRegistry(registry).filter((e) =>
          existsSync(join(root, e.name, '.git')),
        );
        const pluginSlugs = built.filter((e) => e.kind === 'plugin').map((e) => e.slug);
        // Every entry that is no plugin had a page under p/ before the apps
        // had their own; that address keeps sending on to apps/<slug>/.
        const moved = { ...MOVED, ...movedEntries(built) };
        const areas = builtAreas(astroFiles(join(srcDir, 'pages')).map((f) => `pages/${f}`));

        const problems = routeProblems({
          exists: (p) => existsSync(join(outDir, p)),
          read: (p) => readFileSync(join(outDir, p), 'utf8'),
          base,
          pluginSlugs,
          areas,
          moved,
        });
        if (problems.length > 0) {
          for (const p of problems) logger.error(p);
          throw new Error(
            `the build misses ${problems.length} address(es) that are linked from outside`,
          );
        }
        logger.info(
          `${pluginSlugs.length} plugin pages, ${areas.length} areas and ${Object.keys(moved).length} moved address(es) are in place, in both skins`,
        );
      },
    },
  };
}
