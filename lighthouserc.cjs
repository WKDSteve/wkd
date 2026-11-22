// Lighthouse CI over the built site (`pnpm lhci`, after `pnpm build`): the Core Web Vitals as budgets. The result goes
// to a folder (.lighthouseci/), no service and no token. scripts/lhci.mjs puts dist/ under /wkd/ first (the site
// is built for that base) and passes that folder as `staticDistDir`.
//
// One page of each kind, in both skins (the kinds are those of test/browser/site.browser.mjs): the start page, an
// area, the activity stream, the play page, a plugin, an app with screenshots, an app with the picture of its
// connections. In CI all of them must be in dist/; on a machine whose checkouts are missing only the pages the
// build has are measured (the list says which).
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
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
