import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { hoistPolicyMetas } from '../lib/head';

// After the build, before the checks of routes.ts read the pages: the CSP <meta> and the referrer policy move to
// the top of every <head> (see src/lib/head.ts for why).

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

export function headIntegration(): AstroIntegration {
  return {
    name: 'wkd-head',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const files = htmlFiles(fileURLToPath(dir));
        for (const f of files) writeFileSync(f, hoistPolicyMetas(readFileSync(f, 'utf8')));
        logger.info(`policy metas first in ${files.length} page(s)`);
      },
    },
  };
}
