import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headMetaOrder, hoistPolicyMetas } from '../src/lib/head.ts';

const page = (extra = '') =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title>` +
  `<meta name="referrer" content="strict-origin-when-cross-origin"><style>a{}</style><link rel="preload" href="/f.woff2" as="font">` +
  `${extra}<meta http-equiv="content-security-policy" content="default-src 'self'"></head><body></body></html>`;

test('the CSP and the referrer policy come directly after the charset, before style and preload', () => {
  const out = hoistPolicyMetas(page());
  assert.deepEqual(headMetaOrder(out).slice(0, 3), [
    'charset',
    'http-equiv=content-security-policy',
    'name=referrer',
  ]);
  assert.ok(out.indexOf('content-security-policy') < out.indexOf('<style>'));
  assert.ok(out.indexOf('content-security-policy') < out.indexOf('rel="preload"'));
});

test('nothing is lost or doubled, and a second run changes nothing', () => {
  const once = hoistPolicyMetas(page());
  assert.equal(once.length, page().length);
  assert.equal(once.match(/content-security-policy/g)?.length, 1);
  assert.equal(hoistPolicyMetas(once), once);
});

test('a page without a referrer meta still gets its CSP first', () => {
  const html = page().replace(/<meta name="referrer"[^>]*>/, '');
  assert.deepEqual(headMetaOrder(hoistPolicyMetas(html)).slice(0, 2), [
    'charset',
    'http-equiv=content-security-policy',
  ]);
});

test('a page without a CSP or without a charset fails the build', () => {
  assert.throws(
    () => hoistPolicyMetas('<head><meta charset="utf-8"></head>'),
    /Content-Security-Policy/,
  );
  assert.throws(
    () => hoistPolicyMetas('<head><meta http-equiv="content-security-policy" content="x"></head>'),
    /charset/,
  );
});
