// The CSP says `require-trusted-types-for 'script'` (astro.config.ts): a string may not reach a script sink
// (Worker, importScripts, script.src, eval, ...) unless a policy made it. The site's own code does not use such
// sinks, but the Pagefind library starts its search worker with `new Worker(<string>)`, and the audio worklet of
// the fight is loaded by URL. The one policy here, named `default`, is what the browser applies to a plain string
// in a script sink, and it lets through only an address on this origin. It creates no HTML and no script text:
// innerHTML, eval and the like stay blocked.
//
// A browser without Trusted Types has no `trustedTypes` and does not enforce the directive either: nothing to do.

import { trustedTypes } from '../lib/trusted-types';

const tt = trustedTypes();

if (tt && !tt.defaultPolicy) {
  tt.createPolicy('default', {
    createScriptURL(input: string): string {
      if (new URL(input, location.href).origin !== location.origin) {
        throw new TypeError(`script URL outside this origin: ${input}`);
      }
      return input;
    },
  });
}
