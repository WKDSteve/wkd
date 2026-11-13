import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doorExamples, SHOWN_STATS, type StartItem, workshopStats } from '../src/lib/start.ts';

const item = (name: string, over: Partial<StartItem> = {}): StartItem => ({
  name,
  kind: 'plugin',
  stage: null,
  status: 'unknown',
  commitCount: 0,
  featureCount: 0,
  helpTagCount: 0,
  testFiles: 0,
  release: null,
  shots: [],
  demos: [],
  ...over,
});

const ITEMS = [
  item('cascade.nvim', { commitCount: 120, featureCount: 12, status: 'stable' }),
  item('tasks.nvim', { commitCount: 900, featureCount: 40 }),
  item('lib.nvim', { commitCount: 300 }),
  item('ui.nvim', { commitCount: 50 }),
  item('takt', { kind: 'app', stage: 'building', commitCount: 700 }),
  item('pult', { kind: 'app', stage: 'showcase', commitCount: 80, release: { tag: 'v1' } }),
  item('tasks-desktop', { kind: 'app', stage: 'companion', commitCount: 484 }),
  item('streamtap', { kind: 'app', stage: 'showcase', commitCount: 200 }),
  item('tasks-web', { kind: 'web', commitCount: 5 }),
  item('appkit', { kind: 'kit', commitCount: 60 }),
];

test('the figures shown without script say what the workshop is', () => {
  const pool = workshopStats(ITEMS, 1);
  assert.deepEqual(pool.slice(0, SHOWN_STATS), [
    { label: 'plugins', value: '4' },
    { label: 'apps', value: '4' },
    { label: 'web variants', value: '1' },
    { label: 'commits', value: '2,800+' },
  ]);
});

test('the pool holds figures of the apps, and no label twice', () => {
  const pool = workshopStats(ITEMS, 1);
  const value = (label: string): string | undefined => pool.find((m) => m.label === label)?.value;
  assert.equal(value('apps with a version tag'), '1');
  assert.equal(value('apps ready to show'), '2');
  assert.equal(value('app commits'), '1,400+');
  assert.equal(value('experiments'), '1');
  assert.equal(value('repositories'), String(ITEMS.length));
  assert.equal(new Set(pool.map((m) => m.label)).size, pool.length);
  // More figures than slots: otherwise the page has nothing to rotate in.
  assert.ok(pool.length > SHOWN_STATS);
});

test('a door shows the three most worked-on plugins', () => {
  assert.deepEqual(
    doorExamples(ITEMS, 'plugin').map((i) => i.name),
    ['tasks.nvim', 'lib.nvim', 'cascade.nvim'],
  );
});

test('the door of the apps shows what is ready to show before the rest', () => {
  assert.deepEqual(
    doorExamples(ITEMS, 'app').map((i) => i.name),
    ['streamtap', 'pult', 'takt'],
  );
  // No web variant, no kit: they are no apps.
  assert.ok(doorExamples(ITEMS, 'app', 10).every((i) => i.kind === 'app'));
});

test('equal commit counts fall back to the name, so two builds agree', () => {
  const tie = [item('b.nvim', { commitCount: 3 }), item('a.nvim', { commitCount: 3 })];
  assert.deepEqual(
    doorExamples(tie, 'plugin').map((i) => i.name),
    ['a.nvim', 'b.nvim'],
  );
  assert.deepEqual(doorExamples([], 'app'), []);
});
