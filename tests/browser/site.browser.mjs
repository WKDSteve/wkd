// Browser checks against the built site: what the unit tests cannot see
// (focus, keys, :has() filters, the strict CSP, layout width).
//
//   pnpm build && pnpm test:browser               against dist/
//   WKD_BASE=https://wkdsteve.github.io/wkd pnpm test:browser   against the live site
//
// Needs a Chrome on this machine (or $CHROME); without one every check is skipped,
// unless WKD_BROWSER_REQUIRED is set (the deploy workflow): then that is a failure.
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

// Where the checks gate a deploy, a skip must not pass for a green run.
test('the browser checks can run here', { skip: !process.env.WKD_BROWSER_REQUIRED }, () => {
  assert.equal(skip, false);
});

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

  test('every plugin shows its icon on the roster and on its page, and the file is served as a PNG', async () => {
    await p.goto(`${B}/nvim/`);
    const tiles = JSON.parse(
      await p.eval(`JSON.stringify([...document.querySelectorAll('.roster .m-card')].map((t) => ({
        slug: t.dataset.nav.replace('p/', ''),
        src: t.querySelector('.m-app-icon')?.getAttribute('src') ?? null,
      })))`),
    );
    assert.ok(tiles.length > 30, 'the roster lists the plugins');
    assert.deepEqual(
      tiles.filter((t) => !t.src?.endsWith(`/app-icons/${t.slug}.png`)).map((t) => t.slug),
      [],
    );
    // The lazy images of a tile far down are not loaded yet, so the files are asked for directly.
    const served = JSON.parse(
      await p.eval(`Promise.all([...document.querySelectorAll('.roster .m-app-icon')].map(async (i) => {
        const r = await fetch(i.src);
        return r.ok && r.headers.get('content-type') === 'image/png' && (await r.arrayBuffer()).byteLength > 200;
      })).then((all) => JSON.stringify(all.filter((ok) => !ok).length))`),
    );
    assert.equal(served, 0, 'every icon is a PNG that is served');
    await p.goto(`${B}/p/hover/`);
    await p.until(
      `!!${$('.m-apppage-icon')} && ${$('.m-apppage-icon')}.naturalWidth > 0`,
      'the icon of the plugin page',
    );
  });

  test('the pictures of the connections are served as PNGs: the overviews and the neighbourhood of a repo', async () => {
    const served = async (url, selector) => {
      await p.goto(`${B}${url}`);
      return JSON.parse(
        await p.eval(`Promise.all([...document.querySelectorAll(${JSON.stringify(selector)})].map(async (i) => {
          const r = await fetch(i.src);
          return {
            ok: r.ok,
            type: r.headers.get('content-type'),
            bytes: (await r.arrayBuffer()).byteLength,
            alt: i.alt.length > 20,
            // on a phone the picture is shrunk to a quarter: it opens on its own at full size
            linked: i.closest('a')?.href === i.src,
            hint: !!i.closest('section').querySelector('.m-graph-hint'),
          };
        })).then((all) => JSON.stringify(all))`),
      );
    };
    const cases = [
      ['/', '.m-graph img'],
      ['/nvim/', '.m-graph img'],
      ['/apps/', '.m-graph img'],
      ['/p/hover/', '.m-graph img'],
      ['/apps/tasks-desktop/', '.m-graph img'],
    ];
    for (const [url, selector] of cases) {
      const found = await served(url, selector);
      assert.equal(found.length, 1, `${url} has one picture of connections`);
      assert.deepEqual(
        [
          found[0].ok,
          found[0].type,
          found[0].bytes > 5000,
          found[0].alt,
          found[0].linked,
          found[0].hint,
        ],
        [true, 'image/png', true, true, true, true],
        url,
      );
    }
  });

  test('on a phone the picture of the connections is drawn across the column, not shrunk to nothing', async () => {
    // Served is not yet shown: the picture sits in a link and loads lazily, so check it is drawn at phone width.
    try {
      await p.viewport(375, 800, true);
      for (const url of ['/nvim/', '/p/hover/']) {
        await p.goto(`${B}${url}`);
        await p.eval(`document.querySelector('.m-graph img').scrollIntoView({ block: 'center' })`);
        const width = await p.until(
          `(() => { const i = document.querySelector('.m-graph img'); return i.naturalWidth > 0 && Math.round(i.getBoundingClientRect().width); })()`,
          `the picture on ${url} loads and has a width`,
        );
        assert.ok(width > 300, `${url}: drawn ${width} px wide`);
        const hint = await p.eval(
          `getComputedStyle(document.querySelector('.m-graph-hint')).display`,
        );
        assert.equal(hint, 'block', `${url}: the phone is told to tap it`);
      }
    } finally {
      await p.send('Emulation.clearDeviceMetricsOverride');
    }
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

  test('no page scrolls sideways on a phone or a tablet', async () => {
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
    try {
      const wide = [];
      for (const width of [375, 768]) {
        await p.viewport(width, 800, width < 768);
        for (const path of paths) {
          await p.goto(`${B}${path}`);
          const [scroll, inner] = JSON.parse(
            await p.eval(`JSON.stringify([document.documentElement.scrollWidth, innerWidth])`),
          );
          if (scroll > inner) wide.push(`${width}px ${path} ${scroll}/${inner}`);
        }
      }
      assert.deepEqual(wide, []);
    } finally {
      await p.send('Emulation.clearDeviceMetricsOverride');
    }
  });

  test('on a phone the subject of a commit has the width of its line, not a column one word wide', async () => {
    try {
      await p.viewport(375, 800, true);
      const narrow = [];
      for (const path of ['/', '/nvim/', '/activity/']) {
        await p.goto(`${B}${path}`);
        const rows = JSON.parse(
          await p.eval(`JSON.stringify([...document.querySelectorAll('.m-list li')]
            .filter((l) => l.querySelector('.cplug') && l.querySelector('.csubj'))
            .slice(0, 12)
            .map((l) => {
              const s = l.querySelector('.csubj').getBoundingClientRect();
              const line = l.getBoundingClientRect();
              return [s.left - line.left, s.top - l.querySelector('time').getBoundingClientRect().bottom];
            }))`),
        );
        assert.ok(rows.length > 0, `${path} lists commits with their repository`);
        // The subject is a flex item as wide as its text, so a short one is
        // narrow anywhere. What says it has the line: it starts at the left
        // edge, below the date, instead of to the right of date, mark and name.
        for (const [indent, below] of rows) {
          if (indent > 2 || below < 0) narrow.push(`${path} indent ${Math.round(indent)}`);
        }
      }
      assert.deepEqual(narrow, []);
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

  test('four fighters to pick; a match starts with full bars and a running clock', async () => {
    await p.goto(`${B}/play/`);
    await p.until($('[data-fighter]'), 'a fighter card');
    assert.equal(await p.eval(`document.querySelectorAll('[data-fighter]').length`), 4);
    await startMatch();
    const bars = JSON.parse(
      await p.eval(`JSON.stringify(['player', 'enemy'].map((who) => {
        const bar = document.querySelector('[data-fight-health="' + who + '"]');
        return Math.round((bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width) * 100);
      }))`),
    );
    assert.deepEqual(bars, [100, 100]);
    const start = Number(await p.eval(`${$('[data-fight-timer]')}.textContent`));
    assert.equal(start, 60);
    await p.until(`Number(${$('[data-fight-timer]')}.textContent) < 60`, 'the clock to run');
  });

  test('P pauses a match against the AI: the clock stands, Resume goes on', async () => {
    await startMatch();
    await p.until(`Number(${$('[data-fight-timer]')}.textContent) < 60`, 'the intro to end');
    await p.eval(`document.activeElement?.blur()`);
    await p.key('p', { code: 'KeyP', vk: 80 });
    await p.until(shown('[data-fight-paused]'), 'the pause panel');
    const at = await p.eval(`${$('[data-fight-timer]')}.textContent`);
    await p.sleep(2200);
    assert.equal(await p.eval(`${$('[data-fight-timer]')}.textContent`), at);
    await p.eval(`${$('[data-fight-resume]')}.click()`);
    await p.until(`${$('[data-fight-paused]')}.hidden`, 'the pause panel to close');
    await p.until(
      `Number(${$('[data-fight-timer]')}.textContent) < ${Number(at)}`,
      'the clock to run again',
    );
  });

  test('difficulty and music are remembered over a reload', async () => {
    const state = `JSON.stringify({
      hard: ${$('[data-fight-difficulty="hard"]')}.getAttribute('aria-pressed'),
      music: ${$('[data-fight-music]')}.getAttribute('aria-pressed'),
    })`;
    await p.goto(`${B}/play/`);
    await p.until(`${$('[data-fight-music]')}.hasAttribute('aria-pressed')`, 'the fight script');
    const before = JSON.parse(await p.eval(state));
    await p.eval(
      `${$('[data-fight-difficulty="hard"]')}.click(); ${$('[data-fight-music]')}.click()`,
    );
    const want = { hard: 'true', music: String(before.music !== 'true') };
    assert.deepEqual(JSON.parse(await p.eval(state)), want);
    await p.goto(`${B}/play/`);
    await p.until(`${$('[data-fight-music]')}.hasAttribute('aria-pressed')`, 'the fight script');
    assert.deepEqual(JSON.parse(await p.eval(state)), want);
    // Back to what a fresh visitor has, for the checks that follow.
    await p.eval(
      `${$('[data-fight-difficulty="normal"]')}.click(); ${$('[data-fight-music]')}.click()`,
    );
  });

  test('?net=loopback plays through the rollback netcode and says so', async () => {
    await startMatch('?net=loopback&lag=100');
    await p.until(
      `!${$('[data-fight-net]')}.hidden && /rollback/i.test(${$('[data-fight-net]')}.textContent)`,
      'the status line of the netcode',
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
