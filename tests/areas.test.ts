import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  AREA_KINDS,
  AREA_LABELS,
  areaOfArg,
  areaOfHash,
  areaOfKind,
  hitLabel,
  parseSearch,
} from '../src/lib/areas.ts';
import { KINDS } from '../src/lib/registry.ts';

test('every kind of the registry is in exactly one area', () => {
  for (const kind of KINDS) {
    const areas = Object.entries(AREA_KINDS).filter(([, kinds]) => kinds.includes(kind));
    assert.equal(areas.length, 1, kind);
    assert.equal(areas[0]?.[0], areaOfKind(kind));
  }
});

test('a search hit says what it is, then its category', () => {
  assert.equal(hitLabel('plugin', 'Editing'), 'plugin · Editing');
  assert.equal(hitLabel('app', 'Media'), 'app · Media');
  assert.equal(hitLabel('web', undefined), 'web variant');
  assert.equal(hitLabel('play', undefined), 'play');
  assert.equal(hitLabel('help', 'Editing'), 'plugin help · Editing');
  // A page that names no kind still shows its category.
  assert.equal(hitLabel(undefined, 'Editing'), 'Editing');
  assert.equal(hitLabel(undefined, undefined), '');
});

test('a search stays in one area when it starts with app: or plugin:', () => {
  assert.deepEqual(parseSearch('app: mixer'), { query: 'mixer', area: 'apps' });
  assert.deepEqual(parseSearch('Apps:mixer'), { query: 'mixer', area: 'apps' });
  assert.deepEqual(parseSearch('  plugin:  quick fix '), { query: 'quick fix', area: 'plugins' });
  assert.deepEqual(parseSearch('plugins: x'), { query: 'x', area: 'plugins' });
});

test('any other text is the query as typed', () => {
  assert.deepEqual(parseSearch(' mixer '), { query: 'mixer', area: null });
  assert.deepEqual(parseSearch('lib.nvim: async'), { query: 'lib.nvim: async', area: null });
  assert.deepEqual(parseSearch('help: tags'), { query: 'help: tags', area: null });
  assert.deepEqual(parseSearch('application'), { query: 'application', area: null });
  assert.deepEqual(parseSearch(''), { query: '', area: null });
  // The prefix alone: nothing to search for yet.
  assert.deepEqual(parseSearch('app:'), { query: '', area: 'apps' });
});

test('an address and :log name an area', () => {
  assert.equal(areaOfHash('#area-apps'), 'apps');
  assert.equal(areaOfHash('#area-plugins'), 'plugins');
  assert.equal(areaOfHash('#area-all'), 'all');
  assert.equal(areaOfHash('#fight'), null);
  assert.equal(areaOfHash(''), null);
  assert.equal(areaOfArg(''), 'all');
  assert.equal(areaOfArg('apps'), 'apps');
  assert.equal(areaOfArg('a'), 'apps');
  assert.equal(areaOfArg('Plug'), 'plugins');
  assert.equal(areaOfArg('web'), null);
});

test('the filter has a rule for every area', () => {
  const css = readFileSync(new URL('../src/styles/filter.css', import.meta.url), 'utf8');
  for (const area of Object.keys(AREA_LABELS)) {
    assert.ok(css.includes(`#area-${area}:checked`), `no rule for area "${area}"`);
  }
});
