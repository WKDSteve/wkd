// Browser checks against the built site: what the unit tests cannot see
// (focus, keys, :has() filters, the strict CSP, layout width).
//
//   pnpm build && pnpm test:browser               against dist/
//   WKD_BASE=https://wkdsteve.github.io/wkd pnpm test:browser   against the live site
//
// Needs a Chrome on this machine (or $CHROME); without one every check is skipped.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromePath, launch, serve } from './chrome.mjs';

const dist = fileURLToPath(new URL('../../dist', import.meta.url));
const live = process.env.WKD_BASE?.replace(/\/$/, '');
const skip = chromePath()
  ? !live && !existsSync(dist) && 'no dist/ folder: run pnpm build first'
  : 'no Chrome on this machine';

/** @type {Awaited<ReturnType<typeof launch>>} */
let p;
/** @type {{ url: string, close: () => Promise<void> } | undefined} */
let server;
let B = live ?? '';

const $ = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
const shown = (sel) => `(() => { const e = ${$(sel)}; return !!e && !e.hidden; })()`;
const fight = `JSON.stringify({
  select: !${$('[data-fight-select]')}.hidden,
  arena: !${$('[data-fight-arena]')}.hidden,
})`;

async function startMatch(query = '') {
  await p.goto(`${B}/play/${query}`);
  await p.until($('[data-fighter]'), 'a fighter card');
  await p.eval(`${$('[data-fighter]')}.click()`);
  await p.until(shown('[data-fight-arena]'), 'the arena');
}

async function search(q) {
  // Mark what the last search left, so the wait below ends on the new result
  // and not on the old one (the live site answers slower than dist/).
  await p.eval(`(() => {
    for (const l of document.querySelectorAll('[data-results] li')) l.dataset.old = '1';
    ${$('[data-status]')}.textContent = '';
    const i = ${$('#search-q')};
    i.focus();
    i.value = ${JSON.stringify(q)};
    i.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await p.until(
    `${$('[data-status]')}.textContent.trim() && !${$('[data-results] li[data-old]')}`,
    `search results for ${q}`,
    15000,
  );
  return JSON.parse(
    await p.eval(`JSON.stringify({
      status: ${$('[data-status]')}.textContent,
      hits: [...document.querySelectorAll('[data-results] li a')].map(
        (a) => a.querySelector('.s-cat')?.textContent ?? '',
      ),
    })`),
  );
}

/** Opens the command line of the TUI skin, types a command and submits it. */
async function command(text) {
  await p.key(':', { code: 'Semicolon', text: ':' });
  await p.until(`${$('form[data-search]')}.dataset.mode === 'cmd'`, 'the command line');
  await p.type(text);
  await p.sleep(150);
  await p.eval(`${$('form[data-search]')}.requestSubmit()`);
}

const areasShown = `JSON.stringify([...new Set([...document.querySelectorAll('li[data-area]')]
  .filter((l) => getComputedStyle(l).display !== 'none').map((l) => l.dataset.area))].sort())`;

describe('the built site in a browser', { skip }, () => {
  before(async () => {
    if (!live) {
      server = await serve(dist);
      B = server.url;
    }
    p = await launch();
  });
  after(async () => {
    await p?.close();
    await server?.close();
  });

  test('the start page has its two doors and the play strip', async () => {
    await p.goto(`${B}/`);
    assert.equal(await p.eval(`document.querySelectorAll('.m-door').length`), 2);
    assert.ok(await p.eval(`!!${$('.m-strip a[href$="/play/"]')}`));
  });

  test('without script the start page shows its content', async () => {
    await p.noScript(true);
    try {
      await p.goto(`${B}/`);
      // Script is off, so the page cannot be asked; the DOM can.
      const { root } = (await p.send('DOM.getDocument', { depth: 0 })).result;
      const found = await p.send('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector: '.m-door',
      });
      assert.equal(found.result.nodeIds.length, 2);
      const box = await p.send('DOM.getBoxModel', { nodeId: found.result.nodeIds[0] });
      assert.ok(box.result.model.height > 50, 'the door has a size without script');
    } finally {
      await p.noScript(false);
    }
  });

  test('no page scrolls sideways on a phone', async () => {
    const paths = [
      '/',
      '/nvim/',
      '/nvim/stack/',
      '/apps/',
      '/apps/pult/',
      '/p/ui/',
      '/play/',
      '/activity/',
      '/tui/',
      '/tui/apps/',
      '/tui/p/ui/',
    ];
    await p.viewport(390, 800, true);
    try {
      const wide = [];
      for (const path of paths) {
        await p.goto(`${B}${path}`);
        const [scroll, inner] = JSON.parse(
          await p.eval(`JSON.stringify([document.documentElement.scrollWidth, innerWidth])`),
        );
        if (scroll > inner) wide.push(`${path} ${scroll}/${inner}`);
      }
      assert.deepEqual(wide, []);
    } finally {
      await p.send('Emulation.clearDeviceMetricsOverride');
    }
  });

  test('the activity filter shows one area, by click and by address', async () => {
    await p.goto(`${B}/activity/`);
    assert.deepEqual(JSON.parse(await p.eval(areasShown)), ['apps', 'plugins']);
    await p.eval(`${$('label[for=area-apps]')}.click()`);
    assert.deepEqual(JSON.parse(await p.eval(areasShown)), ['apps']);
    await p.eval(`location.hash = '#area-plugins'`);
    await p.until(`${$('input[name=area]:checked')}.id === 'area-plugins'`, 'the hash to apply');
    assert.deepEqual(JSON.parse(await p.eval(areasShown)), ['plugins']);
    await p.goto(`${B}/`);
    await p.goto(`${B}/activity/#area-apps`);
    assert.deepEqual(JSON.parse(await p.eval(areasShown)), ['apps']);
  });

  test('a search hit says what it is, and a prefix keeps the search in one area', async () => {
    await p.goto(`${B}/`);
    const all = await search('tasks');
    assert.ok(all.hits.length > 1, all.status);
    assert.ok(
      all.hits.some((h) => h.startsWith('app')),
      `an app among: ${all.hits.join(' | ')}`,
    );
    assert.ok(
      all.hits.some((h) => !h.startsWith('app')),
      'and something that is none',
    );
    const apps = await search('app: tasks');
    assert.ok(apps.hits.length > 0, apps.status);
    for (const h of apps.hits) assert.match(h, /^(app|web|foundation)/);
    const none = await search('app: zzzzqqq');
    assert.equal(none.hits.length, 0);
    await p.escape();
  });

  test('picking a fighter opens the arena, Escape ends the match', async () => {
    await startMatch();
    assert.deepEqual(JSON.parse(await p.eval(fight)), { select: false, arena: true });
    assert.match(await p.eval(`${$('[data-fight-timer]')}.textContent`), /^\d+$/);
    await p.eval(`document.activeElement?.blur()`);
    await p.escape();
    await p.until(shown('[data-fight-select]'), 'the fighter select after Escape');
    assert.deepEqual(JSON.parse(await p.eval(fight)), { select: true, arena: false });
  });

  test('Escape on a focused search result closes the search and leaves the match', async () => {
    await startMatch();
    const found = await search('tasks');
    assert.ok(found.hits.length > 0);
    await p.eval(`${$('[data-results] a')}.focus()`);
    await p.escape();
    await p.sleep(300);
    assert.deepEqual(JSON.parse(await p.eval(fight)), { select: false, arena: true });
  });

  test('?sim=wasm runs the match on the WebAssembly core', async () => {
    await startMatch('?sim=wasm');
    await p.until(
      `/WebAssembly/.test(${$('[data-fight-core]')}.textContent)`,
      'the legend to name the WebAssembly core',
    );
  });

  test(':log apps opens the activity on the apps and closes the command line', async () => {
    await p.goto(`${B}/tui/activity/`);
    await command('log apps');
    await p.until(`${$('input[name=area]:checked')}.id === 'area-apps'`, 'the apps filter');
    assert.equal(await p.eval(`${$('form[data-search]')}.dataset.mode ?? ''`), '');
    assert.deepEqual(JSON.parse(await p.eval(areasShown)), ['apps']);
  });

  test(':play opens the play area of the TUI skin', async () => {
    await p.goto(`${B}/tui/`);
    await command('play');
    await p.until(`location.pathname.endsWith('/tui/play/')`, 'the play page');
  });

  test('nothing was reported to the console: no error, no CSP violation', () => {
    const bad = p.logs.filter((l) => /^(error|exception)|Content Security Policy/i.test(l));
    assert.deepEqual(bad, []);
  });
});
