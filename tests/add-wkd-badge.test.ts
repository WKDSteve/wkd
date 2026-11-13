import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('the badge script takes on every plugin and every app, no web variant and no kit', () => {
  const taken = namesTheScriptTakesOn();
  const wanted = entries.filter((e) => e.kind === 'plugin' || e.kind === 'app').map((e) => e.name);
  const others = entries.filter((e) => e.kind === 'web' || e.kind === 'kit').map((e) => e.name);
  assert.ok(others.length > 0, 'the registry has no web variant or kit to tell apart');
  assert.deepEqual([...taken].sort(), [...wanted].sort());
});

test('--only narrows the run to one entry, a web variant to none', () => {
  const app = entries.find((e) => e.kind === 'app');
  const web = entries.find((e) => e.kind === 'web');
  assert.ok(app && web);
  assert.deepEqual(namesTheScriptTakesOn([`--only=${app.slug}`]), [app.name]);
  assert.deepEqual(namesTheScriptTakesOn([`--only=${web.slug}`]), []);
});

/** Runs the script with --write over one app README and returns what it left. */
function badged(readme: string): string {
  const app = entries.find((e) => e.kind === 'app');
  assert.ok(app);
  const dir = mkdtempSync(join(tmpdir(), 'wkd-badge-'));
  try {
    mkdirSync(join(dir, app.name));
    const file = join(dir, app.name, 'README.md');
    writeFileSync(file, readme);
    const run = () =>
      execFileSync(process.execPath, [script, '--write', `--only=${app.slug}`], {
        env: { ...process.env, PLUGINS_DIR: dir },
        encoding: 'utf8',
      });
    run();
    const once = readFileSync(file, 'utf8');
    run();
    assert.equal(readFileSync(file, 'utf8'), once, 'a second run changes nothing');
    return once.replaceAll(app.slug, 'APP');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const BADGE =
  '[![wkd](https://img.shields.io/badge/wkd-family-c6ff3d)](https://wkdsteve.github.io/wkd/apps/APP/)';

test('an app README gets the badge under its heading, pointing at its app page', () => {
  const out = badged('![x](icon.png)\n\n# x\n\nThe pitch.\n\n**Status: alpha.** More.\n');
  assert.equal(
    out,
    `![x](icon.png)\n\n# x\n\n${BADGE}\n\nThe pitch.\n\n**Status: alpha.** More.\n`,
  );
  // No quote is added: the loader reads an opening quote as the status.
  assert.ok(!out.includes('\n>'));
});

test('an app README with a banner instead of a heading gets the badge under the banner', () => {
  const out = badged('![x](icon.png)\n\n```\n# not a heading\n```\n\n> **know**\n\nPitch.\n');
  assert.equal(
    out,
    `![x](icon.png)\n\n\`\`\`\n# not a heading\n\`\`\`\n\n${BADGE}\n\n> **know**\n\nPitch.\n`,
  );
});

test('an app README with neither heading nor banner is left alone', () => {
  assert.equal(badged('Just text.\n'), 'Just text.\n');
});

test('a README with CRLF line ends keeps them', () => {
  const out = badged(['![x](icon.png)', '', '# x', '', 'The pitch.', ''].join('\r\n'));
  assert.equal(out, ['![x](icon.png)', '', '# x', '', BADGE, '', 'The pitch.', ''].join('\r\n'));
});
