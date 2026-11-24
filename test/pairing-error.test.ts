import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadCodeError, LinkFailedError } from '../src/lib/fight-engine/net.ts';
import { fieldError } from '../src/lib/fight-engine/pairing-error.ts';

test('a bad code belongs to the field in both steps, with the message of its step', () => {
  assert.match(fieldError(new BadCodeError(), 'accept-reply')?.message ?? '', /reply code/);
  assert.match(fieldError(new BadCodeError(), 'join-invitation')?.message ?? '', /invitation code/);
});

test('joining: any failure but a failed link keeps the attempt at the field', () => {
  const domError = new DOMException('createAnswer failed', 'InvalidStateError');
  assert.ok(fieldError(domError, 'join-invitation'));
  assert.ok(fieldError(new Error('no session description'), 'join-invitation'));
});

test('a failed link and a used-up invitation are not about the field', () => {
  assert.equal(fieldError(new LinkFailedError(), 'join-invitation'), null);
  assert.equal(fieldError(new LinkFailedError(), 'accept-reply'), null);
  assert.equal(fieldError(new Error('code too large'), 'accept-reply'), null);
});
