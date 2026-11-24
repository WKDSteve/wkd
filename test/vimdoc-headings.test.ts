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

test('code, keys, references and code blocks of a help page are marked as not to be translated', () => {
  const text = [
    '==============================================================================',
    'ONE *x-one*',
    "Use `:Foo` with <C-w> or <Esc>, set 'wrap', see |x-one| and |elsewhere|, pass {arg}.",
    'See https://example.com/x.',
    '',
    'Example: >lua',
    '    require("x").setup()',
  ].join('\n');
  const { html } = renderVimdoc(text, {
    ...options,
    resolve: (t) => (t === 'x-one' ? { page: 'p/x/help' } : null),
  });
  // A code block carries the attribute for what is inside it; the prose block (vd-text) stays translatable.
  const blocks = [...html.matchAll(/<pre class="vd-code"[^>]*>/g)].map((m) => m[0]);
  assert.ok(blocks.length > 0 && blocks.every((b) => b.includes('translate="no"')));
  const rest = html.replace(/<pre class="vd-code"[\s\S]*?<\/pre>/g, '');
  const bare = [...rest.matchAll(/<(code|kbd|var)(?![^>]*translate="no")[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(bare, []);
  for (const needle of [
    '<kbd',
    '<var',
    '<code',
    'class="vd-ref"',
    'class="vd-url"',
    'class="vd-tag"',
    'vd-code',
  ])
    assert.ok(html.includes(needle), `the sample renders ${needle}`);
  for (const a of html.match(/<a class="vd-(?:ref|url|tag)"[^>]*>/g) ?? [])
    assert.match(a, /translate="no"/);
});
