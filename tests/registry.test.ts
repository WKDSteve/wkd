import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  type Entry,
  familyOf,
  type RawRegistry,
  slugOf,
  validateRegistry,
} from '../src/lib/registry.ts';

const base = (plugins: RawRegistry['plugins']): RawRegistry => ({
  owner: 'someone',
  categories: { edit: 'Editing', foundation: 'Foundation' },
  appCategories: { tooling: 'Tooling', media: 'Media' },
  plugins,
});

const bySlug = (entries: Entry[], slug: string): Entry => {
  const e = entries.find((x) => x.slug === slug);
  assert.ok(e, `no entry ${slug}`);
  return e;
};

test('an entry without a kind is a plugin, with every field decided', () => {
  const [e] = validateRegistry(base([{ name: 'cascade.nvim', category: 'edit' }]));
  assert.deepEqual(e, {
    name: 'cascade.nvim',
    slug: 'cascade',
    kind: 'plugin',
    category: 'edit',
    family: null,
    variantOf: null,
    platforms: [],
  });
});

test('the slug drops .nvim and nothing else', () => {
  assert.equal(slugOf('lib.nvim'), 'lib');
  assert.equal(slugOf('tasks-desktop'), 'tasks-desktop');
  assert.equal(slugOf('color_my_ascii.nvim'), 'color_my_ascii');
});

test('an unknown kind fails, the old word "desktop" included', () => {
  assert.throws(
    () => validateRegistry(base([{ name: 'x-desktop', kind: 'desktop', category: 'tooling' }])),
    /x-desktop has unknown kind "desktop"/,
  );
});

test('a plugin takes its category from the plugins, an app from the apps', () => {
  assert.throws(
    () => validateRegistry(base([{ name: 'a.nvim', category: 'tooling' }])),
    /a\.nvim \(plugin\) has category "tooling", not in categories/,
  );
  assert.throws(
    () => validateRegistry(base([{ name: 'a-desktop', kind: 'app', category: 'edit' }])),
    /a-desktop \(app\) has category "edit", not in appCategories/,
  );
  assert.throws(
    () => validateRegistry(base([{ name: 'a-desktop', kind: 'app' }])),
    /a-desktop \(app\) has no category/,
  );
});

test('a kit may use a category of either list', () => {
  const entries = validateRegistry(
    base([
      { name: 'lib.nvim', kind: 'kit', category: 'foundation' },
      { name: 'appkit', kind: 'kit', category: 'tooling' },
    ]),
  );
  assert.equal(bySlug(entries, 'lib').category, 'foundation');
  assert.equal(bySlug(entries, 'appkit').category, 'tooling');
});

test('one id in both category lists fails: the filter could not tell them apart', () => {
  const reg = base([]);
  reg.appCategories = { edit: 'Editing apps' };
  assert.throws(() => validateRegistry(reg), /category "edit" is in both/);
});

test('a web variant names its app and takes its category', () => {
  const entries = validateRegistry(
    base([
      { name: 'tasks-web', kind: 'web', variantOf: 'tasks-desktop', family: 'tasks' },
      { name: 'tasks-desktop', kind: 'app', category: 'tooling', family: 'tasks' },
    ]),
  );
  const web = bySlug(entries, 'tasks-web');
  assert.equal(web.variantOf, 'tasks-desktop');
  assert.equal(web.category, 'tooling');
});

test('a web variant may state its own category, from the apps', () => {
  const entries = validateRegistry(
    base([
      { name: 'a-desktop', kind: 'app', category: 'tooling' },
      { name: 'a-web', kind: 'web', variantOf: 'a-desktop', category: 'media' },
    ]),
  );
  assert.equal(bySlug(entries, 'a-web').category, 'media');
});

test('variantOf must name an app of this registry', () => {
  const app = { name: 'a-desktop', kind: 'app', category: 'tooling' };
  assert.throws(
    () => validateRegistry(base([app, { name: 'a-web', kind: 'web', variantOf: 'b-desktop' }])),
    /a-web is a variant of "b-desktop", which is no app here/,
  );
  assert.throws(
    () =>
      validateRegistry(
        base([
          { name: 'a.nvim', category: 'edit' },
          { name: 'a-web', kind: 'web', variantOf: 'a.nvim' },
        ]),
      ),
    /which is no app here/,
  );
  assert.throws(
    () => validateRegistry(base([{ name: 'a-web', kind: 'web', variantOf: 'a-web' }])),
    /which is no app here/,
  );
  assert.throws(
    () => validateRegistry(base([app, { name: 'a-web', kind: 'web' }])),
    /a-web \(web\) does not say which app/,
  );
});

test('variantOf on anything but a web variant fails', () => {
  assert.throws(
    () =>
      validateRegistry(
        base([
          { name: 'a-desktop', kind: 'app', category: 'tooling' },
          { name: 'b-desktop', kind: 'app', category: 'tooling', variantOf: 'a-desktop' },
        ]),
      ),
    /b-desktop has variantOf but is not of kind "web"/,
  );
});

test('a name listed twice, or two names with one slug, fail', () => {
  assert.throws(
    () =>
      validateRegistry(
        base([
          { name: 'a.nvim', category: 'edit' },
          { name: 'a.nvim', category: 'edit' },
        ]),
      ),
    /a\.nvim is listed twice/,
  );
  assert.throws(
    () =>
      validateRegistry(
        base([
          { name: 'a.nvim', category: 'edit' },
          { name: 'a', kind: 'app', category: 'tooling' },
        ]),
      ),
    /shares its slug "a"/,
  );
});

test('a name that is no repository name fails', () => {
  for (const name of ['..', '.nvim', 'a/b', 'a b', '']) {
    assert.throws(
      () => validateRegistry(base([{ name, category: 'edit' }])),
      /is not a repository name/,
      name,
    );
  }
});

test('platforms are a known word each, once, and only for what is not a plugin', () => {
  const [e] = validateRegistry(
    base([
      { name: 'p', kind: 'app', category: 'media', platforms: ['windows', 'linux', 'windows'] },
    ]),
  );
  assert.deepEqual(e?.platforms, ['windows', 'linux']);
  assert.throws(
    () =>
      validateRegistry(base([{ name: 'p', kind: 'app', category: 'media', platforms: ['win'] }])),
    /p has unknown platform "win"/,
  );
  assert.throws(
    () => validateRegistry(base([{ name: 'a.nvim', category: 'edit', platforms: ['linux'] }])),
    /a\.nvim is a plugin, platforms are for apps/,
  );
});

test('a family is a lower-case word', () => {
  assert.throws(
    () => validateRegistry(base([{ name: 'a.nvim', category: 'edit', family: 'Tasks App' }])),
    /a\.nvim has family "Tasks App"/,
  );
});

test('familyOf lists the other members in registry order, and nothing for a loner', () => {
  const entries = validateRegistry(
    base([
      { name: 'tasks.nvim', category: 'edit', family: 'tasks' },
      { name: 'cascade.nvim', category: 'edit' },
      { name: 'tasks-desktop', kind: 'app', category: 'tooling', family: 'tasks' },
      { name: 'tasks-web', kind: 'web', variantOf: 'tasks-desktop', family: 'tasks' },
      { name: 'solo.nvim', category: 'edit', family: 'solo' },
    ]),
  );
  assert.deepEqual(
    familyOf(entries, bySlug(entries, 'tasks-desktop')).map((e) => e.slug),
    ['tasks', 'tasks-web'],
  );
  assert.deepEqual(familyOf(entries, bySlug(entries, 'cascade')), []);
  assert.deepEqual(familyOf(entries, bySlug(entries, 'solo')), []);
});

test('the real registry is valid and has no entry of the retired kind', () => {
  const real = JSON.parse(
    readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'),
  ) as RawRegistry;
  const entries = validateRegistry(real);
  assert.equal(entries.length, real.plugins.length);
  assert.ok(entries.some((e) => e.kind === 'app'));
  for (const e of entries) {
    assert.match(e.slug, /^[\w.-]+$/);
    if (e.kind === 'app') assert.ok(real.appCategories?.[e.category], `${e.name}: ${e.category}`);
    if (e.kind === 'plugin') assert.ok(real.categories[e.category], `${e.name}: ${e.category}`);
  }
});

test('every category of the real registry has its rule in filter.css', () => {
  const real = JSON.parse(
    readFileSync(new URL('../src/data/registry.json', import.meta.url), 'utf8'),
  ) as RawRegistry;
  const css = readFileSync(new URL('../src/styles/filter.css', import.meta.url), 'utf8');
  for (const id of [...Object.keys(real.categories), ...Object.keys(real.appCategories ?? {})]) {
    assert.ok(css.includes(`#cat-${id}:checked`), `filter.css has no rule for "${id}"`);
  }
});
