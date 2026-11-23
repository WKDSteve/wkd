import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderVimdoc } from '../src/lib/vimdoc.ts';

const options = { resolve: () => null, href: (page: string) => `/${page}`, self: 'p/x/help' };
const levels = (html: string): number[] =>
  [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

test('a sub-heading before any section heading does not skip a level below the page h1', () => {
  const text = [
    'Intro ~',
    'Some text.',
    '',
    '==============================================================================',
    'ONE *x-one*',
    'Text.',
    '',
    'Sub ~',
    'More.',
  ].join('\n');
  const { html } = renderVimdoc(text, options);
  const found = [1, ...levels(html)];
  const jumps = found.filter((l, i) => i > 0 && l > (found[i - 1] ?? 0) + 1);
  assert.deepEqual(jumps, [], found.join(','));
});

test('a sub-heading after a section keeps its level and its class', () => {
  const text = [
    '==============================================================================',
    'ONE *x-one*',
    'Text.',
    '',
    'Sub ~',
    'More.',
  ].join('\n');
  const { html } = renderVimdoc(text, options);
  assert.match(html, /<h3 class="vd-h3">Sub/);
});
