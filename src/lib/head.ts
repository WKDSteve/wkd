// The policy metas have to be the first thing the parser meets after the charset: a policy only governs what
// comes after it, and the stylesheets and preloads of a page come before the place where Astro puts its CSP.
// Astro writes the hashed CSP <meta> last in <head>, and GitHub Pages cannot send the header, so the finished
// document is rearranged: charset, CSP, referrer policy, the rest. (`hoistPolicyMetas`, used by
// src/integrations/head.ts after the build.)

const CHARSET = /<meta charset=(?:"[^"]*"|'[^']*'|[^\s>]+)\s*\/?>/i;
const CSP = /<meta http-equiv=(?:"content-security-policy"|content-security-policy)[^>]*>/i;
const REFERRER = /<meta name=(?:"referrer"|referrer)[^>]*>/i;

/**
 * The document with its CSP <meta> (and the referrer policy, if it has one) directly after `<meta charset>`.
 * Throws when the page has no charset or no CSP: a page that lost its policy must not ship.
 */
export function hoistPolicyMetas(html: string): string {
  const csp = CSP.exec(html)?.[0];
  if (!csp) throw new Error('no Content-Security-Policy <meta> in the document');
  const referrer = REFERRER.exec(html)?.[0];
  const rest = html.replace(csp, '').replace(referrer ?? '', '');
  const charset = CHARSET.exec(rest);
  if (!charset) throw new Error('no <meta charset> in the document');
  const at = charset.index + charset[0].length;
  return rest.slice(0, at) + csp + (referrer ?? '') + rest.slice(at);
}

/** The `<meta>` elements of the head that carry an `http-equiv` or the referrer policy, in order, for the checks. */
export function headMetaOrder(html: string): string[] {
  const head = html.slice(0, html.indexOf('</head>'));
  return [...head.matchAll(/<meta\s+(charset|http-equiv|name)=["']?([^"'\s>]*)/gi)].map((m) =>
    (m[1] === 'charset' ? 'charset' : `${m[1]}=${m[2]}`).toLowerCase(),
  );
}
