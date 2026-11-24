// Size budgets of the built site: `node scripts/budget.mjs [dist]` (CI: after the build).
// The rules are in budgets.json; a violation names the rule, the file and both sizes, and fails the run.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Every file below `dir` as a path relative to it, with `/` as the separator. */
export function listFiles(dir, rel = '') {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const sub = rel ? `${rel}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(dir, sub) : [sub];
  });
}

/** The size of a file under a rule: compressed for "gzip", as it lies on disk for "bytes". */
function sizeOf(path, measure) {
  return measure === 'gzip' ? gzipSync(readFileSync(path)).length : statSync(path).size;
}

/**
 * The violations of `rules` in `dist`, as sentences. A rule matches a file by extension (none listed: every
 * file) and, with `dir`, by the folder it lies in.
 */
export function checkBudgets(dist, rules) {
  const files = listFiles(dist);
  const out = [];
  for (const rule of rules) {
    const matched = files.filter(
      (f) =>
        (!rule.ext?.length || rule.ext.includes(extname(f))) &&
        (!rule.dir || f.startsWith(`${rule.dir}/`)),
    );
    const sizes = matched.map((f) => [f, sizeOf(join(dist, f), rule.measure)]);
    for (const [f, n] of sizes) {
      if (rule.perFile !== undefined && n > rule.perFile) {
        out.push(`${rule.name}: ${f} is ${n} bytes, the limit is ${rule.perFile}`);
      }
    }
    const total = sizes.reduce((sum, [, n]) => sum + n, 0);
    if (rule.total !== undefined && total > rule.total) {
      out.push(
        `${rule.name}: ${matched.length} files add up to ${total} bytes, the limit is ${rule.total}`,
      );
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dist = process.argv[2] ?? join(root, 'dist');
  const { rules } = JSON.parse(readFileSync(join(root, 'budgets.json'), 'utf8'));
  const problems = checkBudgets(dist, rules);
  for (const p of problems) console.error(`budget: ${p}`);
  if (problems.length > 0) process.exit(1);
  console.log(`budget: ${rules.length} rules hold for ${relative(root, dist) || dist}`);
}
