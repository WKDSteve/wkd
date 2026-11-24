// Browser checks against the built site: what the unit tests cannot see
// (focus, keys, :has() filters, the strict CSP, layout width).
//
//   pnpm build && pnpm test:browser               against dist/
//   WKD_BASE=https://wkdsteve.github.io/wkd pnpm test:browser   against the live site
//
// Needs a Chrome on this machine (or $CHROME); without one every check is skipped,
// unless WKD_BROWSER_REQUIRED is set (the deploy workflow): then that is a failure.
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

/** Every page of the build as its address below the base ("tui/play/"), from its index.html files. */
function indexPages(dir, rel = '') {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const sub = `${rel}${e.name}`;
    if (e.isDirectory()) return indexPages(dir, `${sub}/`);
    return e.name === 'index.html' ? [rel] : [];
  });
}

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
    // The start page shows two: the matrix of the families and the map of everything.
    const cases = [
      ['/', '.m-graph img', 2],
      ['/nvim/', '.m-graph img', 1],
      ['/apps/', '.m-graph img', 1],
      ['/p/hover/', '.m-graph img', 1],
      ['/apps/tasks-desktop/', '.m-graph img', 1],
    ];
    for (const [url, selector, count] of cases) {
      const found = await served(url, selector);
      assert.equal(found.length, count, `${url} has ${count} picture(s) of connections`);
      for (const [n, picture] of found.entries()) {
        assert.deepEqual(
          [
            picture.ok,
            picture.type,
            picture.bytes > 5000,
            picture.alt,
            picture.linked,
            picture.hint,
          ],
          [true, 'image/png', true, true, true, true],
          `${url}, picture ${n + 1}`,
        );
      }
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
    // The bars scale (compositor), they do not animate their width; reduced motion makes them jump.
    const bar = $('[data-fight-health="player"]');
    const motion = () =>
      p.eval(
        `JSON.stringify([getComputedStyle(${bar}).transitionProperty, getComputedStyle(${bar}).transitionDuration])`,
      );
    const [prop, dur] = JSON.parse(await motion());
    assert.equal(prop, 'transform');
    assert.notEqual(dur, '0s');
    await p.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    assert.equal(JSON.parse(await motion())[1], '0s', 'no transition under reduced motion');
    await p.send('Emulation.setEmulatedMedia', { features: [] });
    const start = Number(await p.eval(`${$('[data-fight-timer]')}.textContent`));
    assert.equal(start, 60);
    await p.until(`Number(${$('[data-fight-timer]')}.textContent) < 60`, 'the clock to run');
  });

  test('text fields are 16px or more, so iOS does not zoom into them on focus', async () => {
    for (const page of ['/', '/tui/']) {
      await p.goto(`${B}${page}`);
      const px = Number(await p.eval(`parseFloat(getComputedStyle(${$('#search-q')}).fontSize)`));
      assert.ok(px >= 16, `${page} search field is ${px}px`);
    }
    await p.goto(`${B}/play/`);
    const area = Number(
      await p.eval(`parseFloat(getComputedStyle(${$('[data-fight-code-in]')}).fontSize)`),
    );
    assert.ok(area >= 16, `the code field is ${area}px`);
  });

  test('numbers that change are set in tabular figures, and the door titles balance their lines', async () => {
    await p.goto(`${B}/play/`);
    for (const sel of ['.fight-timer', '.fight-record']) {
      assert.match(
        await p.eval(`getComputedStyle(${$(sel)}).fontVariantNumeric`),
        /tabular-nums/,
        sel,
      );
    }
    await p.goto(`${B}/`);
    assert.match(
      await p.eval(`getComputedStyle(${$('.search-status')}).fontVariantNumeric`),
      /tabular-nums/,
    );
    // text-wrap is progressive: where the browser knows it, the title uses it.
    if (await p.eval(`CSS.supports('text-wrap', 'balance')`)) {
      assert.equal(
        await p.eval(`getComputedStyle(${$('.m-door-title')}).textWrapStyle`),
        'balance',
      );
    }
  });

  test('a bad pairing code is flagged on its own field, not only in the status line', async () => {
    await p.goto(`${B}/play/`);
    await p.until(`!${$('[data-fight-online]')}.hidden`, 'the online block (WebRTC)');
    await p.eval(`${$('[data-fight-join]')}.click()`);
    await p.until(shown('[data-fight-code-in-step]'), 'the code field');
    const field = $('[data-fight-code-in]');
    assert.equal(await p.eval(`${field}.getAttribute('aria-invalid')`), null);
    await p.eval(`${field}.value = 'not a code'; ${$('[data-fight-code-submit]')}.click()`);
    await p.until(`${field}.getAttribute('aria-invalid') === 'true'`, 'the field flagged invalid');
    const target = await p.eval(
      `document.getElementById(${field}.getAttribute('aria-describedby'))?.hasAttribute('data-fight-online-status')`,
    );
    assert.equal(
      target,
      true,
      'the field is described by the status line that carries the message',
    );
    assert.equal(
      await p.eval(`document.activeElement === ${field}`),
      true,
      'focus returns to the field',
    );
    // Typing again clears the flag.
    await p.eval(`${field}.dispatchEvent(new Event('input'))`);
    assert.equal(await p.eval(`${field}.getAttribute('aria-invalid')`), null);
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

  test('every picture has a size, and none of them is both lazy and fetched with high priority', async () => {
    // One page of each kind, in both skins: a start page, an area, a plugin, an app with
    // screenshots, an app with a picture of its connections, a page of its own.
    const pages = [
      '/',
      '/nvim/',
      '/apps/',
      '/activity/',
      '/play/',
      '/p/hover/',
      '/p/ui/',
      '/p/lib/',
    ];
    pages.push('/apps/tasks-desktop/', '/apps/hub-desktop/', '/apps/pult/');
    const urls = pages.flatMap((u) => [u, `/tui${u}`]);
    for (const url of urls) {
      await p.goto(`${B}${url}`);
      const bad = JSON.parse(
        await p.eval(`JSON.stringify([...document.images].flatMap((i) => {
          const why = [];
          if (!i.getAttribute('width') || !i.getAttribute('height')) why.push('no width/height');
          if (i.getAttribute('fetchpriority') === 'high' && i.getAttribute('loading') === 'lazy') why.push('high and lazy');
          return why.map((w) => i.getAttribute('src') + ': ' + w);
        }))`),
      );
      assert.deepEqual(bad, [], url);
      const high = await p.eval(`document.querySelectorAll('img[fetchpriority="high"]').length`);
      assert.ok(high <= 2, `${url}: ${high} pictures with fetchpriority=high`);
    }
  });

  test('where a picture is the largest paint of the page, it is fetched with high priority and not lazy', async () => {
    // Measured on the built site (a PerformanceObserver for largest-contentful-paint): the first
    // screenshot of an app page and the picture of the connections of an app without screenshots.
    // The text pages have no picture to prioritise, so they are not part of this.
    const lcp = `new Promise((resolve) => {
      new PerformanceObserver((list) => {
        const e = list.getEntries().at(-1);
        const i = e?.element;
        resolve(JSON.stringify({
          tag: i?.tagName ?? '',
          src: i?.getAttribute('src') ?? '',
          priority: i?.getAttribute('fetchpriority') ?? '',
          loading: i?.getAttribute('loading') ?? '',
        }));
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    })`;
    for (const skin of ['', '/tui']) {
      await p.goto(`${B}${skin}/apps/tasks-desktop/`);
      const shot = JSON.parse(await p.eval(lcp));
      assert.equal(
        shot.tag,
        'IMG',
        `${skin}/apps/tasks-desktop/: the largest paint is a screenshot`,
      );
      assert.equal(shot.priority, 'high', shot.src);
      assert.notEqual(shot.loading, 'lazy', shot.src);
    }
    await p.goto(`${B}/apps/hub-desktop/`);
    const graph = JSON.parse(await p.eval(lcp));
    assert.equal(
      graph.tag,
      'IMG',
      'the largest paint of /apps/hub-desktop/ is the picture of its connections',
    );
    assert.equal(graph.priority, 'high', graph.src);
    assert.notEqual(graph.loading, 'lazy', graph.src);
  });

  test('the pause box of the ticker is a visible native checkbox: focus ring, Space toggles, the band stops', async () => {
    await p.goto(`${B}/`);
    const box = `${$('#ticker-pause')}`;
    const seen = JSON.parse(
      await p.eval(`(() => {
        const e = ${box}, r = e.getBoundingClientRect(), c = getComputedStyle(e);
        return JSON.stringify({ type: e.type, opacity: c.opacity, w: r.width, h: r.height, appearance: c.appearance, accent: c.accentColor });
      })()`),
    );
    assert.equal(seen.type, 'checkbox');
    assert.notEqual(seen.opacity, '0', 'the box is not hidden by opacity');
    assert.ok(seen.w >= 12 && seen.h >= 12, 'the box has a size');
    assert.notEqual(seen.accent, 'auto', 'it is coloured with accent-color');
    const state = () =>
      p.eval(`JSON.stringify({
      on: ${box}.checked,
      play: getComputedStyle(${$('.ticker-track')}).animationPlayState,
      ring: getComputedStyle(${$('.ticker-pause')}).outlineStyle,
    })`);
    // The band pauses itself while it is off screen (prefs.ts), so bring it on screen first.
    await p.eval(`${$('.ticker')}.scrollIntoView()`);
    await p.until(`!${$('.ticker-track')}.classList.contains('is-off')`, 'the band on screen');
    assert.equal(JSON.parse(await state()).play, 'running', 'the band runs by default');
    // A key before the focus, so that :focus-visible applies as it does for a keyboard user.
    await p.key('Shift', { code: 'ShiftLeft', vk: 16 });
    await p.eval(`${box}.focus()`);
    assert.deepEqual(JSON.parse(await state()), { on: false, play: 'paused', ring: 'solid' });
    await p.key(' ', { code: 'Space', vk: 32, text: ' ' });
    await p.eval(`${box}.blur()`);
    assert.deepEqual(JSON.parse(await state()), { on: true, play: 'paused', ring: 'none' });
    await p.eval(`${box}.focus()`);
    await p.key(' ', { code: 'Space', vk: 32, text: ' ' });
    await p.eval(`${box}.blur()`);
    assert.deepEqual(JSON.parse(await state()), { on: false, play: 'running', ring: 'none' });
  });

  test('the figures rotate only while they may: a pause button, a hidden tab and reduced motion stop them', async () => {
    // The swap delay is 4 to 8 s: make it a tenth of a second, and count what the tiles do.
    const hook = await p.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        const set = window.setTimeout.bind(window);
        window.setTimeout = (f, d, ...a) => set(f, d >= 4000 && d <= 8000 ? d / 40 : d, ...a);
        window.__swaps = 0;
        document.addEventListener('DOMContentLoaded', () => {
          const dl = document.querySelector('.m-stats');
          if (dl) new MutationObserver(() => { window.__swaps++; }).observe(dl, { childList: true, characterData: true, subtree: true });
        });
      })()`,
    });
    const swaps = () => p.eval('window.__swaps');
    const settle = async () => {
      await p.sleep(900);
      const before = await swaps();
      await p.sleep(900);
      return (await swaps()) - before;
    };
    try {
      await p.goto(`${B}/`);
      const btn = $('.m-stats-toggle');
      assert.ok(await p.eval(`!!${btn}`), 'the pause button exists');
      assert.ok((await settle()) > 0, 'the figures rotate by default');
      // Hidden tab: no timer runs, and it goes on when the tab is back.
      await p.eval(`(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      })()`);
      assert.equal(await settle(), 0, 'a hidden tab does not rotate');
      await p.eval(`(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      })()`);
      assert.ok((await settle()) > 0, 'a visible tab rotates again');
      // The button stops it and starts it again.
      await p.eval(`${btn}.click()`);
      assert.equal(await settle(), 0, 'paused by the button');
      assert.match(await p.eval(`${btn}.textContent`), /Rotate/);
      await p.eval(`${btn}.click()`);
      assert.ok((await settle()) > 0, 'resumed by the button');
      // Reduced motion: static until asked for.
      await p.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      await p.goto(`${B}/`);
      assert.equal(await settle(), 0, 'reduced motion starts still');
      await p.eval(`${btn}.click()`);
      assert.ok((await settle()) > 0, 'and rotates once asked');
    } finally {
      await p.send('Emulation.setEmulatedMedia', { features: [] });
      await p.send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: hook.result.identifier,
      });
    }
  });

  test('every page opens with the charset, then the CSP, then the referrer policy, before any style or preload', async () => {
    // Every page type of the build (both skins, the moved addresses included); the live site: the fixed pages.
    const pages = live
      ? ['/', '/tui/', '/play/', '/tui/play/', '/nvim/', '/apps/', '/activity/', '/stack/']
      : indexPages(dist).map((f) => `/${f}`);
    assert.ok(pages.length >= 8, 'the build has its pages');
    const bad = [];
    for (const page of pages) {
      const html = await (await fetch(`${B}${page}`)).text();
      const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
      const first = [...head.matchAll(/<(meta|link|style|script|title)\b[^>]*>/gi)]
        .slice(0, 3)
        .map((m) => m[0].toLowerCase().replace(/ content=.*$/, '>'));
      const ok =
        /^<meta charset=/.test(first[0] ?? '') &&
        /^<meta http-equiv="content-security-policy">/.test(first[1] ?? '') &&
        /^<meta name="referrer">/.test(first[2] ?? '');
      const csp = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(head)?.[1];
      if (!ok || !csp?.includes("require-trusted-types-for 'script'")) bad.push(page);
    }
    assert.deepEqual(bad, []);
  });

  test('robots.txt allows every crawler and names no sitemap the site does not have', async () => {
    const res = await fetch(`${B}/robots.txt`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /^User-agent: \*$/m);
    assert.match(text, /^Allow: \/$/m);
    assert.doesNotMatch(text, /^Sitemap:/im);
  });

  test('a missing address gets the 404 page, in the modern and in the TUI skin, with a way back', async () => {
    const res = await fetch(`${B}/there/is/no/such/page/`);
    assert.equal(res.status, 404);
    for (const [url, twin, h1] of [
      [`${B}/404.html`, `${B}/tui/404/`, 'Page not found'],
      [`${B}/tui/404/`, `${B}/404.html`, 'E404: page not found'],
    ]) {
      const html = await (await fetch(url)).text();
      assert.ok(html.includes(h1), `${url} says what happened`);
      assert.match(html, /<meta name="robots" content="noindex">/, `${url} is not indexed`);
      assert.doesNotMatch(html, /rel="canonical"/, `${url} has no canonical address`);
      assert.ok(html.includes(`href="${new URL(twin).pathname}"`), `${url} links to its twin`);
      assert.match(html, /data-nav="nvim"/, `${url} leads back to content`);
    }
    // The page that answers a missing address is the modern one.
    assert.ok((await res.text()).includes('Page not found'));
  });

  test('every page names a favicon.ico besides the svg, and the file is an icon', async () => {
    await p.goto(`${B}/`);
    assert.deepEqual(
      JSON.parse(
        await p.eval(`JSON.stringify([...document.querySelectorAll('link[rel="icon"]')]
        .map((l) => l.getAttribute('href').split('/').pop()))`),
      ),
      ['favicon.ico', 'favicon.svg'],
    );
    const ico = new Uint8Array(await (await fetch(`${B}/favicon.ico`)).arrayBuffer());
    assert.deepEqual([...ico.slice(0, 4)], [0, 0, 1, 0], 'the signature of an icon file');
  });

  test('every page has one h1 and no heading that skips a level, a skip link to the main content, a language and a theme colour', async () => {
    const pages = live
      ? ['/', '/tui/', '/play/', '/tui/play/', '/nvim/', '/apps/', '/activity/', '/tui/activity/']
      : indexPages(dist).map((f) => `/${f}`);
    const bad = [];
    for (const page of pages) {
      const html = await (await fetch(`${B}${page}`)).text();
      if (/<meta http-equiv="refresh"/.test(html)) continue; // an address that moved: no content of its own
      const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
      const jumps = levels.filter((l, i) => l > (levels[i - 1] ?? 0) + 1);
      const skip =
        /<a class="skip-link" href="#main">/.test(html) && /<main[^>]* id="main"/.test(html);
      const lang = /<html lang="[a-z-]+"/.test(html);
      const theme = /<meta name="theme-color" content="#/.test(html);
      if (levels.filter((l) => l === 1).length !== 1 || jumps.length || !skip || !lang || !theme) {
        bad.push(
          `${page}: h1=${levels.filter((l) => l === 1).length} jumps=${jumps} skip=${skip} lang=${lang} theme=${theme}`,
        );
      }
    }
    assert.deepEqual(bad, []);
  });

  test('under Trusted Types the page works: search and the fight load, and no string reaches a script or HTML sink', async () => {
    await p.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));`,
    });
    await p.goto(`${B}/`);
    const result = await search('workshop');
    assert.ok(result.hits.length > 0, 'the search answers, with its worker and its excerpts');
    const reported = JSON.parse(await p.eval(`JSON.stringify(window.__csp)`));
    await startMatch();
    reported.push(...JSON.parse(await p.eval(`JSON.stringify(window.__csp)`)));
    // The browser enforces the directive: a string in an HTML sink and a foreign script URL are refused.
    // The refusals are logged by the browser; they are this test's own probes, not a report about the page.
    const probed = p.logs.length;
    assert.equal(
      await p.eval(
        `(() => { try { document.body.innerHTML = 'x'; return 'allowed'; } catch (e) { return e.name; } })()`,
      ),
      'TypeError',
    );
    assert.equal(
      await p.eval(
        `(() => { try { new Worker('https://example.com/w.js'); return 'allowed'; } catch (e) { return e.name; } })()`,
      ),
      'TypeError',
    );
    p.logs.splice(probed);
    assert.deepEqual(reported, [], 'nothing the page itself did was reported');
  });

  test('nothing was reported to the console: no error, no CSP violation', () => {
    const bad = p.logs.filter((l) => /^(error|exception)|Content Security Policy/i.test(l));
    assert.deepEqual(bad, []);
  });
});
