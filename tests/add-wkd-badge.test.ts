import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type RawRegistry, validateRegistry } from '../src/lib/registry.ts';

const script = fileURLToPath(new URL('../scripts/add-wkd-badge.mjs', import.meta.url));
const entries = validateRegistry(
  JSON.parse(
    readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'),
  ) as RawRegistry,
);

/** A dry run against an empty folder: every entry the script takes on is reported as missing. */
function namesTheScriptTakesOn(args: string[] = []): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'wkd-badge-'));
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      env: { ...process.env, PLUGINS_DIR: dir },
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .filter((l) => l.startsWith('missing README.md'))
      .map((l) => l.replace('missing README.md', '').trim());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the badge script takes on every plugin and nothing that is not one', () => {
  const taken = namesTheScriptTakesOn();
  const plugins = entries.filter((e) => e.kind === 'plugin').map((e) => e.name);
  const others = entries.filter((e) => e.kind !== 'plugin').map((e) => e.name);
  assert.ok(others.length > 0, 'the registry has no app to tell apart');
  assert.deepEqual([...taken].sort(), [...plugins].sort());
  for (const name of others) assert.ok(!taken.includes(name), `${name} is no plugin`);
});

test('--only of an app takes on nothing', () => {
  const app = entries.find((e) => e.kind === 'app');
  assert.ok(app);
  assert.deepEqual(namesTheScriptTakesOn([`--only=${app.slug}`]), []);
});
