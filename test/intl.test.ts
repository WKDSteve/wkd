import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatClock, formatCount, formatDay, SITE_LANG } from '../src/lib/intl.ts';

test('a day is read in UTC, whatever offset the commit carried', () => {
  // 23:30 at -05:00 is already the 25th in UTC, as the grouping by day has it.
  assert.equal(formatDay('2026-11-24T23:30:00-05:00'), 'Nov 25, 2026');
  assert.equal(formatDay('2026-11-24T00:10:00+02:00'), 'Nov 23, 2026');
});

test('numbers carry the grouping of the page language', () => {
  assert.equal(SITE_LANG, 'en');
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(formatCount(7), '7');
});

test('a clock is m:ss with two digits of seconds', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9.9), '0:09');
  assert.equal(formatClock(75), '1:15');
  assert.equal(formatClock(600), '10:00');
});
