// Lighthouse CI over the built site (`pnpm lhci`, after `pnpm build`): the Core Web Vitals as budgets. The result goes
// to a folder (.lighthouseci/), no service and no token. scripts/lhci.mjs puts dist/ under /wkd/ first (the site
// is built for that base) and passes that folder as `staticDistDir`.
//
// One page of each kind, in both skins (the kinds are those of test/browser/site.browser.mjs): the start page, an
// area, the activity stream, the play page, a plugin, an app with screenshots, an app with the picture of its
// connections. In CI all of them must be in dist/; on a machine whose checkouts are missing only the pages the
// build has are measured (the list says which).
//
// Measured on 24 Nov 2026 with all checkouts (medians of three runs, simulated mobile): LCP 0.75-0.94 s on the
// pages without a picture, 1.8-2.1 s on a plugin page and 2.0-2.3 s on an app with its screenshots and its
// picture, CLS 0 everywhere, TBT at most 47 ms. The LCP of the app page is the one near its limit.
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const PAGES = [
  '',
  'nvim/',
  'apps/',
  'activity/',
  'play/',
  'p/hover/',
  'apps/tasks-desktop/',
  'apps/hub-desktop/',
];
const root = process.env.LHCI_SITE ?? join(__dirname, '.lhci-site');
const built = (page) => existsSync(join(root, 'wkd', page, 'index.html'));
const wanted = PAGES.flatMap((p) => [`wkd/${p}`, `wkd/tui/${p}`]);
const missing = wanted.filter((p) => !built(p.replace(/^wkd\//, '')));
if (missing.length > 0 && process.env.CI) {
  throw new Error(`lighthouserc: not in the build: ${missing.join(', ')}`);
}
const urls = wanted.filter((p) => !missing.includes(p)).map((p) => `http://localhost/${p}`);

module.exports = {
  ci: {
    collect: {
      staticDistDir: root,
      url: urls,
      numberOfRuns: 3,
      settings: {
        onlyCategories: ['performance'],
        // A hosted runner forbids the sandbox of Chrome (as in test/browser/chrome.mjs).
        chromeFlags: '--no-sandbox --headless=new --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'largest-contentful-paint': [
          'error',
          { maxNumericValue: 2500, aggregationMethod: 'median' },
        ],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median' }],
        'total-blocking-time': ['warn', { maxNumericValue: 300, aggregationMethod: 'median' }],
        // What a page weighs on the wire. The pictures of the connections are <picture>s now (AVIF or WebP in
        // two widths, the PNG only as fallback and link): the heaviest page of the list, an app with its
        // screenshots and its picture, was 429 KB in a local run with all checkouts (24 Nov 2026, medians of
        // three); the limit is that plus a tenth. A page that goes back to serving the PNG shows up here.
        'total-byte-weight': ['warn', { maxNumericValue: 472000, aggregationMethod: 'median' }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
