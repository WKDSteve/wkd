import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type AppLike, appMeta, appSections, kits, otherForms, SECTIONS } from '../src/lib/apps.ts';
import { type RawRegistry, STAGES, validateRegistry } from '../src/lib/registry.ts';

const item = (slug: string, over: Partial<AppLike> = {}): AppLike => ({
  slug,
  name: slug,
  kind: 'app',
  family: null,
  variantOf: null,
  stage: 'showcase',
  ...over,
});

test('apps land in the section of their stage, sorted by name, in page order', () => {
  const sections = appSections([
    item('takt', { stage: 'building' }),
    item('streamtap'),
    item('tasks-desktop', { stage: 'companion' }),
    item('pult'),
  ]);
  assert.deepEqual(
    sections.map((s) => [s.section.stage, s.apps.map((a) => a.slug)]),
    [
      ['showcase', ['pult', 'streamtap']],
      ['companion', ['tasks-desktop']],
      ['building', ['takt']],
    ],
  );
});

test('a section without an app is left out', () => {
  assert.deepEqual(
    appSections([item('pult')]).map((s) => s.section.stage),
    ['showcase'],
  );
  assert.deepEqual(appSections([]), []);
});

test('only apps are in the sections: no plugin, no web variant, no kit', () => {
  const sections = appSections([
    item('a', { kind: 'plugin', stage: null }),
    item('b', { kind: 'web', stage: null, variantOf: 'c' }),
    item('d', { kind: 'kit', stage: null }),
  ]);
  assert.deepEqual(sections, []);
});

test('the kits are listed apart', () => {
  assert.deepEqual(
    kits([item('pult'), item('b', { kind: 'kit', stage: null }), item('a', { kind: 'kit' })]).map(
      (k) => k.slug,
    ),
    ['a', 'b'],
  );
});

test('the other forms of an app are its plugin, then its web variants', () => {
  const app = item('tasks-desktop', { family: 'tasks', stage: 'companion' });
  const items = [
    app,
    item('tasks-web', { kind: 'web', stage: null, variantOf: 'tasks-desktop', family: 'tasks' }),
    item('tasks', { kind: 'plugin', stage: null, family: 'tasks' }),
    item('rules', { kind: 'plugin', stage: null, family: 'rules' }),
  ];
  assert.deepEqual(
    otherForms(items, app).map((i) => i.slug),
    ['tasks', 'tasks-web'],
  );
});

test('an app without a family has no plugin, even next to a plugin without a family', () => {
  const app = item('pult');
  const items = [app, item('cascade', { kind: 'plugin', stage: null })];
  assert.deepEqual(otherForms(items, app), []);
});

test('the same family does not make another app a form of this one', () => {
  const app = item('a-desktop', { family: 'a' });
  assert.deepEqual(otherForms([app, item('a-other', { family: 'a' })], app), []);
});

test('the meta line names the platforms, then the tech, and may be empty', () => {
  assert.equal(appMeta(['windows', 'macos'], ['Rust', 'egui']), 'Windows · macOS · Rust · egui');
  assert.equal(appMeta([], []), '');
});

test('every stage has a section, and every app of the real registry is in one', () => {
  assert.deepEqual(
    SECTIONS.map((s) => s.stage),
    [...STAGES],
  );
  const entries = validateRegistry(
    JSON.parse(
      readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'),
    ) as RawRegistry,
  );
  const listed = appSections(entries).flatMap((s) => s.apps.map((a) => a.slug));
  const apps = entries.filter((e) => e.kind === 'app').map((e) => e.slug);
  assert.deepEqual([...listed].sort(), [...apps].sort());
});

test('the filter of the apps pages does not announce itself as a filter of plugins', () => {
  for (const page of ['apps/index.astro', 'tui/apps/index.astro']) {
    const src = readFileSync(new URL(`../src/pages/${page}`, import.meta.url), 'utf8');
    assert.match(src, /<CategoryFilter [^>]*legend="Filter apps by category"/, page);
  }
});

test('filter.css hides a section the chosen category leaves empty, for every app category', () => {
  const real = JSON.parse(
    readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'),
  ) as RawRegistry;
  const css = readFileSync(new URL('../src/styles/filter.css', import.meta.url), 'utf8');
  for (const id of Object.keys(real.appCategories ?? {})) {
    assert.ok(
      css.includes(`.home:has(#cat-${id}:checked) .apps-section:not(:has([data-cat="${id}"]))`),
      `filter.css has no section rule for "${id}"`,
    );
  }
});
