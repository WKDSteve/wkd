import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkBudgets } from '../scripts/budget.mjs';

function site(files: Record<string, string>): string {
  const dist = mkdtempSync(join(tmpdir(), 'wkd-budget-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dist, name, '..'), { recursive: true });
    writeFileSync(join(dist, name), text);
  }
  return dist;
}
const noise = (n: number): string =>
  Array.from({ length: n }, (_, i) => String((i * 2654435761) % 9973)).join(',');

test('a file over its limit and a group over its total are named', () => {
  const dist = site({
    '_astro/a.js': noise(20000),
    '_astro/b.js': noise(100),
    'index.html': '<p>hi</p>',
  });
  try {
    const rules = [
      {
        name: 'scripts',
        ext: ['.js'],
        dir: '_astro',
        measure: 'bytes',
        perFile: 1000,
        total: 1500,
      },
      { name: 'pages', ext: ['.html'], measure: 'bytes', perFile: 1000 },
    ];
    const found = checkBudgets(dist, rules);
    assert.equal(found.length, 2);
    assert.match(found[0] ?? '', /scripts: _astro\/a\.js is \d+ bytes, the limit is 1000/);
    assert.match(found[1] ?? '', /scripts: 2 files add up to \d+ bytes, the limit is 1500/);
  } finally {
    rmSync(dist, { recursive: true });
  }
});

test('gzip counts the compressed size, and a rule without extensions covers everything', () => {
  const dist = site({ 'index.html': 'a'.repeat(50000), 'robots.txt': 'x' });
  try {
    assert.deepEqual(
      checkBudgets(dist, [{ name: 'page', ext: ['.html'], measure: 'gzip', perFile: 1000 }]),
      [],
    );
    assert.equal(
      checkBudgets(dist, [{ name: 'all', ext: [], measure: 'bytes', total: 50000 }]).length,
      1,
    );
  } finally {
    rmSync(dist, { recursive: true });
  }
});

test('budgets.json is well formed: every rule has a name, a measure and a limit', () => {
  const { rules } = JSON.parse(readFileSync(new URL('../budgets.json', import.meta.url), 'utf8'));
  assert.ok(rules.length > 0);
  for (const r of rules) {
    assert.ok(typeof r.name === 'string' && ['gzip', 'bytes'].includes(r.measure), r.name);
    assert.ok(Number.isFinite(r.perFile ?? r.total), `${r.name} has a limit`);
  }
});
