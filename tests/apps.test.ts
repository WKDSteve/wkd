import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  type AppLike,
  alsoAs,
  appMeta,
  appSections,
  formMark,
  getLinks,
  kits,
  NOTE_MAX,
  otherForms,
  SECTIONS,
  shortNote,
  variantsOf,
} from '../src/lib/apps.ts';
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

const family = [
  item('tasks-desktop', { family: 'tasks', stage: 'companion' }),
  item('tasks-web', { kind: 'web', family: 'tasks', variantOf: 'tasks-desktop', stage: null }),
  item('tasks', { kind: 'plugin', family: 'tasks', stage: null }),
  item('lib', { kind: 'plugin', stage: null }),
  item('appkit', { kind: 'kit', stage: null }),
  item('pult'),
];
const roles = (forms: { role: string; item: AppLike }[]): string[][] =>
  forms.map((f) => [f.role, f.item.slug]);

test('the variants of an app are the app, its web variants, then its plugin', () => {
  const app = family[0] as AppLike;
  assert.deepEqual(roles(variantsOf(family, app)), [
    ['native', 'tasks-desktop'],
    ['web', 'tasks-web'],
    ['plugin', 'tasks'],
  ]);
});

test('a web variant shows the same variants as its app', () => {
  assert.deepEqual(
    roles(variantsOf(family, family[1] as AppLike)),
    roles(variantsOf(family, family[0] as AppLike)),
  );
});

test('an app that stands alone, a kit and a plugin have no variants block', () => {
  assert.deepEqual(variantsOf(family, family[5] as AppLike), []);
  assert.deepEqual(variantsOf(family, family[4] as AppLike), []);
  assert.deepEqual(variantsOf(family, family[2] as AppLike), []);
});

test('a web variant whose app is not there has no variants block', () => {
  const web = item('x-web', { kind: 'web', variantOf: 'x-desktop', stage: null });
  assert.deepEqual(variantsOf([web], web), []);
});

test('the links to a build name a tag a tag, then the rolling build', () => {
  assert.deepEqual(getLinks({ release: null, rollingUrl: null }), []);
  const links = getLinks({
    release: { tag: 'v0.1.0', url: 'https://github.com/o/r/releases/tag/v0.1.0' },
    rollingUrl: 'https://github.com/o/r/releases/tag/latest',
  });
  assert.deepEqual(
    links.map((l) => l.label),
    ['v0.1.0', 'latest'],
  );
  assert.ok(
    links.every((l) => !/\brelease\b/i.test(l.note)),
    'a tag is not called a release',
  );
});

test('a short status note stays as it is', () => {
  assert.equal(shortNote('Status: beta. Works.'), 'Status: beta. Works.');
});

test('a long status note keeps the whole sentences that fit', () => {
  const note = `Status: early development. No release yet. ${'More words here. '.repeat(30)}`;
  assert.equal(
    shortNote(note, 60),
    'Status: early development. No release yet. More words here. …',
  );
  assert.ok(shortNote(note).length <= NOTE_MAX + 2);
});

test('a dot that ends no sentence does not split one, nor drop text', () => {
  const note = `Status: early. It reads /api/x?key=..., v0.1 and more. ${'Tail words. '.repeat(30)}`;
  assert.equal(shortNote(note, 60), 'Status: early. It reads /api/x?key=..., v0.1 and more. …');
});

test('a first sentence longer than the limit is cut at a word', () => {
  const note = `${'word '.repeat(80)}end.`;
  const short = shortNote(note, 50);
  assert.ok(short.endsWith(' …'));
  assert.ok(short.length <= 52);
  assert.ok(!short.includes('wor …'), 'cut inside a word');
});

test('a plugin whose family has three members names the app, then its web variant', () => {
  const plugin = item('tasks', { kind: 'plugin', family: 'tasks', stage: null });
  const items = [
    item('tasks-web', { kind: 'web', family: 'tasks', variantOf: 'tasks-desktop', stage: null }),
    plugin,
    item('tasks-desktop', { family: 'tasks', stage: 'companion' }),
    item('rules-desktop', { family: 'rules', stage: 'companion' }),
  ];
  const also = alsoAs(items, plugin);
  assert.deepEqual(
    also.map((v) => [v.role, v.item.slug]),
    [
      ['native', 'tasks-desktop'],
      ['web', 'tasks-web'],
    ],
  );
  assert.equal(formMark(also.map((v) => v.item)), 'app · web');
});

test('a family of one shows nothing, and so does a plugin without a family', () => {
  const alone = item('ai', { kind: 'plugin', family: 'ai', stage: null });
  const none = item('cascade', { kind: 'plugin', stage: null });
  const items = [alone, none, item('pult')];
  assert.deepEqual(alsoAs(items, alone), []);
  assert.deepEqual(alsoAs(items, none), []);
  assert.equal(formMark([]), '');
  // The app side of the same rule: an app whose family has no other member.
  assert.deepEqual(
    variantsOf([item('pult', { family: 'pult' })], item('pult', { family: 'pult' })),
    [],
  );
});

test('only a plugin has an "also as": an app shows its variants instead', () => {
  const app = item('tasks-desktop', { family: 'tasks' });
  assert.deepEqual(alsoAs([app, item('tasks', { kind: 'plugin', family: 'tasks' })], app), []);
});
