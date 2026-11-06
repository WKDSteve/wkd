import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AREAS,
  builtAreas,
  MOVED,
  pageOfFile,
  type RouteCheck,
  routeProblems,
} from '../src/lib/nav.ts';

test('a page file serves the page its path says', () => {
  assert.equal(pageOfFile('../../pages/index.astro'), '');
  assert.equal(pageOfFile('../../pages/activity.astro'), 'activity');
  assert.equal(pageOfFile('../../pages/nvim/index.astro'), 'nvim');
  assert.equal(pageOfFile('../../pages/nvim/stack.astro'), 'nvim/stack');
  assert.equal(pageOfFile('E:\\repos\\wkd\\src\\pages\\nvim\\index.astro'), 'nvim');
  assert.equal(pageOfFile('pages/apps/index.astro'), 'apps');
});

test('a dynamic route, a file of the TUI skin and a file that is no page serve none', () => {
  assert.equal(pageOfFile('../../pages/p/[id].astro'), null);
  assert.equal(pageOfFile('../../pages/p/[id]/help/[...file].astro'), null);
  assert.equal(pageOfFile('../../pages/tui/index.astro'), null);
  assert.equal(pageOfFile('../../pages/tui/nvim/index.astro'), null);
  assert.equal(pageOfFile('../../components/Base.astro'), null);
  assert.equal(pageOfFile('../../pages/readme.md'), null);
});

test('the navigation shows the areas that have a page, in their order', () => {
  const files = ['pages/activity.astro', 'pages/nvim/index.astro', 'pages/index.astro'];
  assert.deepEqual(
    builtAreas(files).map((a) => a.page),
    ['', 'nvim', 'activity'],
  );
});

test('an area appears once its page file exists, and not before', () => {
  const base = ['pages/index.astro', 'pages/nvim/index.astro'];
  assert.ok(!builtAreas(base).some((a) => a.page === 'apps'));
  assert.ok(builtAreas([...base, 'pages/apps/index.astro']).some((a) => a.page === 'apps'));
  assert.ok(builtAreas([...base, 'pages/play.astro']).some((a) => a.page === 'play'));
  // the TUI page alone does not make an area: both skins have every page
  assert.ok(!builtAreas([...base, 'pages/tui/apps/index.astro']).some((a) => a.page === 'apps'));
});

// A fake build output: the set of files, and the text of the moved pages.
function build(files: Record<string, string>): Pick<RouteCheck, 'exists' | 'read'> {
  return {
    exists: (p) => p in files,
    read: (p) => files[p] ?? '',
  };
}

const moved = (url: string): string =>
  `<!doctype html><html><head><meta http-equiv="refresh" content="0; url=${url}">` +
  `<link rel="canonical" href="https://example.invalid${url}"></head><body></body></html>`;

const goodFiles = (): Record<string, string> => ({
  'index.html': '',
  'tui/index.html': '',
  'nvim/index.html': '',
  'tui/nvim/index.html': '',
  'p/cascade/index.html': '',
  'tui/p/cascade/index.html': '',
  'nvim/stack/index.html': '',
  'tui/nvim/stack/index.html': '',
  'stack/index.html': moved('/wkd/nvim/stack/'),
  'tui/stack/index.html': moved('/wkd/tui/nvim/stack/'),
});

const check = (files: Record<string, string>): string[] =>
  routeProblems({
    ...build(files),
    base: '/wkd/',
    pluginSlugs: ['cascade'],
    areas: AREAS.filter((a) => a.page === '' || a.page === 'nvim'),
    moved: { stack: 'nvim/stack' },
  });

test('a build with every linked address has no problem', () => {
  assert.deepEqual(check(goodFiles()), []);
});

test('a plugin page missing in either skin is a problem', () => {
  for (const f of ['p/cascade/index.html', 'tui/p/cascade/index.html']) {
    const files = goodFiles();
    delete files[f];
    assert.deepEqual(check(files), [`plugin page missing: ${f}`]);
  }
});

test('an area the navigation shows must have its page in both skins', () => {
  const files = goodFiles();
  delete files['tui/nvim/index.html'];
  assert.deepEqual(check(files), ['area "Plugins" has no page: tui/nvim/index.html']);
});

test('a moved address must still answer, send on to the right skin and name a canonical', () => {
  let files = goodFiles();
  delete files['stack/index.html'];
  assert.deepEqual(check(files), ['moved address has no page that sends on: stack/index.html']);

  files = goodFiles();
  files['tui/stack/index.html'] = moved('/wkd/nvim/stack/'); // the modern page, from the TUI skin
  assert.deepEqual(check(files), ['tui/stack/index.html does not send on to /wkd/tui/nvim/stack/']);

  files = goodFiles();
  files['stack/index.html'] = '<meta http-equiv="refresh" content="0; url=/wkd/nvim/stack/">';
  assert.deepEqual(check(files), ['stack/index.html names no canonical address']);

  files = goodFiles();
  delete files['nvim/stack/index.html'];
  assert.deepEqual(check(files), [
    'stack moved to nvim/stack, which has no page: nvim/stack/index.html',
  ]);
});

test('a page that only links to the new address does not count as sending on', () => {
  const files = goodFiles();
  files['stack/index.html'] = '<link rel="canonical" href="x"><a href="/wkd/nvim/stack/">moved</a>';
  assert.deepEqual(check(files), ['stack/index.html does not send on to /wkd/nvim/stack/']);
});

// ---- the real source tree ----------------------------------------------------

const pagesDir = fileURLToPath(new URL('../src/pages', import.meta.url));

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

test('every page of the modern skin has its twin in the TUI skin', () => {
  const files = astroFiles(pagesDir);
  const modern = files.filter((f) => !f.startsWith('tui/'));
  for (const f of modern) {
    assert.ok(files.includes(`tui/${f}`), `src/pages/${f} has no src/pages/tui/${f}`);
  }
});

test('every moved address has a page at the old place and one at the new, in both skins', () => {
  for (const [from, to] of Object.entries(MOVED)) {
    for (const skin of ['', 'tui/']) {
      const at = (page: string): boolean =>
        existsSync(join(pagesDir, `${skin}${page}.astro`)) ||
        existsSync(join(pagesDir, `${skin}${page}`, 'index.astro'));
      assert.ok(at(from), `${skin}${from}: no page that sends on`);
      assert.ok(at(to), `${skin}${to}: no page`);
    }
  }
});

test('the plugin area and the plugin pages are where the badges point', () => {
  const pages = astroFiles(pagesDir);
  const areas = builtAreas(pages.map((f) => `pages/${f}`)).map((a) => a.page);
  assert.ok(areas.includes(''), 'no start page');
  assert.ok(areas.includes('nvim'), 'no plugin area');
  assert.ok(pages.includes('p/[id].astro'), 'the plugin page left p/<slug>/');
  assert.ok(pages.includes('tui/p/[id].astro'), 'the TUI plugin page left tui/p/<slug>/');
});
