// Which failures of the pairing step belong to the code field. A failure that is about what the person
// typed or pasted stays at the field (flagged invalid, focus back, same attempt again); one about the
// connection itself ends the attempt and is only spoken by the status line.

import { BadCodeError, LinkFailedError } from './net.ts';

export type PairingStep = 'accept-reply' | 'join-invitation';

export interface FieldError {
  message: string;
}

const NOT_VALID: Record<PairingStep, string> = {
  'accept-reply': 'That reply code is not valid. Check it.',
  'join-invitation': 'That invitation code is not valid. Check it.',
};

/**
 * The message for the field, or null when the failure is not about the field.
 * A bad code always is. While joining, anything but a failed link is as well: the browser could not
 * build a reply from that code, nothing was started, and the same field can be tried again. When
 * accepting a reply the invitation is used up by any other failure, so those end the attempt.
 */
export function fieldError(error: unknown, step: PairingStep): FieldError | null {
  if (error instanceof BadCodeError) return { message: NOT_VALID[step] };
  if (step === 'join-invitation' && !(error instanceof LinkFailedError)) {
    return { message: 'This invitation code could not be used. Check it and try again.' };
  }
  return null;
}
