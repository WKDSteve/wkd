// The part of the Trusted Types API the site uses (TypeScript's DOM library does not carry it yet). Absent in a
// browser without the feature, which then does not enforce `require-trusted-types-for` either.

export interface PolicyOptions {
  createHTML?: (input: string) => string;
  createScriptURL?: (input: string) => string;
}

export interface Policy {
  /** Returns a TrustedHTML object, which the DOM sinks take in place of a string. */
  createHTML(input: string): string;
}

export interface Factory {
  readonly defaultPolicy: unknown;
  createPolicy(name: string, options: PolicyOptions): Policy;
}

export function trustedTypes(): Factory | undefined {
  return (globalThis as { trustedTypes?: Factory }).trustedTypes;
}
