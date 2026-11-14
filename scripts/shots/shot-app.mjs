#!/usr/bin/env node
// Screenshots of an app of the family for public/shots/<slug>/, with invented data only.
//
//   node scripts/shots/shot-app.mjs <slug> [--out=<folder>] [--exe=<binary>] [--explore]
//
// What to start and which pictures to take is in apps/<slug>.json (see README.md here).
// Two kinds of app:
//   hub      its own hub (the built binary) with a config folder of its own, as the e2e
//            harness of its repository starts it: nothing is installed, nothing is read
//            from or written to the real configuration. The data comes from `demo`.
//   preview  docmap-desktop, a Tauri window: the browser preview its repository uses to
//            look at the window (tools/preview), served here, with the map of a public
//            repository in the map pane.
// Every picture is written as PNG and as WebP to out/shots/<slug>/ (ignored by git).
// Look at them, then copy the .webp files into public/shots/<slug>/.
//
// REPOS_DIR (or PLUGINS_DIR) names the folder of the checkouts; without it, the parent
// of this repository. --explore prints the menus, links and buttons after each step.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../tests/browser/chrome.mjs';
import { expand, parseStep, validateApp } from './app-config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const slug = args.find((a) => !a.startsWith('--'));
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error(
    'usage: node scripts/shots/shot-app.mjs <slug> [--out=<folder>] [--exe=<binary>] [--explore]',
  );
  process.exit(2);
}
const explore = args.includes('--explore');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const root = join(tmpdir(), `wkd-shot-${process.pid}`);
const vars = {
  REPOS_DIR: resolve(process.env.REPOS_DIR ?? process.env.PLUGINS_DIR ?? join(repo, '..')),
  ROOT: root,
  DEMO: join(root, 'demo'),
  HERE: here,
};
const app = expand(
  validateApp(JSON.parse(readFileSync(join(here, 'apps', `${slug}.json`), 'utf8')), slug),
  vars,
);
const out = resolve(flag('out') ?? join(repo, 'out', 'shots', slug));
const [W, H] = [app.width ?? 1360, app.height ?? 850];

// What a started program may see of this machine: enough to run, nothing that names a
// real vault or a real configuration. The hub gets no AppData at all (its config folder
// is the one of this run); the demo command gets it, because the Neovim it runs for the
// invented test results looks for its state there.
const PASS = [
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'windir',
  'ComSpec',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
];
const cleanEnv = (more = []) => ({
  ...Object.fromEntries(
    [...PASS, ...more].filter((k) => process.env[k]).map((k) => [k, process.env[k]]),
  ),
  REPOS_DIR: vars.REPOS_DIR,
});

/** Starts the hub of the app with its own config folder; returns where it listens and how to open it. */
async function startHub() {
  const exe = resolve(flag('exe') ?? app.exe);
  if (!existsSync(exe))
    throw new Error(`no binary at ${exe}: build the hub first, or name one with --exe=`);
  if (app.demo) {
    const [cmd, ...rest] = app.demo;
    execFileSync(cmd, rest, {
      env: cleanEnv(['LOCALAPPDATA', 'APPDATA']),
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  }
  mkdirSync(join(root, 'config'), { recursive: true });
  mkdirSync(join(root, 'project'), { recursive: true });
  for (const [name, content] of Object.entries(app.config ?? {})) {
    writeFileSync(join(root, 'config', name), JSON.stringify(content));
  }
  const port = 47000 + Math.floor(Math.random() * 900);
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...cleanEnv(),
    [`${app.prefix}_CONFIG_DIR`]: join(root, 'config'),
    [`${app.prefix}_PORT`]: String(port),
    [`${app.prefix}_EDITOR_LOG`]: join(root, 'editor.log'),
    // The hub looks for repositories here: an empty folder, not the real checkouts.
    REPOS_DIR: join(root, 'repos'),
    ...app.env,
  };
  const hub = spawn(exe, ['serve'], { env, stdio: 'ignore' });
  console.log('hub pid', hub.pid, 'port', port);
  const stop = async () => {
    hub.kill();
    await sleep(1500);
  };
  try {
    let ready = false;
    for (let i = 0; i < 150 && !ready; i++) {
      await sleep(200);
      try {
        const r = await fetch(`${origin}/api/${app.api}/hello`);
        if (r.ok) ready = (await r.json()).engine?.ready === true;
      } catch {}
    }
    if (!ready) throw new Error('the hub or its engine did not get ready');
    // The port answers before hub.json is written, and the pairing needs that file.
    for (let i = 0; i < 100 && !existsSync(join(root, 'config', 'hub.json')); i++) await sleep(100);
    const link = execFileSync(exe, ['open'], { env, encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    const exchange = await fetch(`${origin}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ code: link.split('#pair=')[1] }),
    });
    if (!exchange.ok) throw new Error(`exchange refused: ${exchange.status}`);
    const { token } = await exchange.json();
    return {
      url: `${origin}/`,
      ready: `!!document.querySelector('[role=menubar]')`,
      before: `sessionStorage.setItem(${JSON.stringify(app.session)}, ${JSON.stringify(token)});`,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
};

/** Serves the browser preview of a Tauri app, as its tools/preview builds it, with the stub patched. */
async function startPreview() {
  const appDir = resolve(app.app);
  const mapDir = resolve(app.map);
  const MAIN = '<script type="module" src="main.js"></script>';
  let html = readFileSync(join(appDir, 'src/index.html'), 'utf8');
  if (!html.includes('<head>') || !html.includes(MAIN))
    throw new Error('src/index.html changed its shape');
  html = html
    .replace('<head>', '<head>\n    <base href="/src/" />')
    .replace(MAIN, `<script src="/stub.js"></script>\n    ${MAIN}`);
  let stub = readFileSync(join(appDir, 'tools/preview/stub.js'), 'utf8');
  const patches = [
    // The map pane shows the real generated map instead of the stub's placeholder page.
    [
      'convertFileSrc: () => "/tools/preview/map-stub.html"',
      'convertFileSrc: () => "/map/index.html"',
    ],
    ...(app.stubPatch ?? []),
  ];
  for (const [from, to] of patches) {
    if (!stub.includes(from)) throw new Error(`stub.js has no: ${from}`);
    stub = stub.replaceAll(from, to);
  }
  const under = (base, rel) => {
    const file = normalize(join(base, rel));
    const inside = file.startsWith(normalize(base) + sep);
    return inside && existsSync(file) && statSync(file).isFile() ? file : null;
  };
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const send = (body, type) => {
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    };
    if (path === '/' || path === '/preview.html') return send(html, TYPES['.html']);
    if (path === '/stub.js') return send(stub, TYPES['.js']);
    const file = path.startsWith('/map/')
      ? under(mapDir, path.slice(5))
      : path.startsWith('/src/')
        ? under(join(appDir, 'src'), path.slice(5))
        : null;
    if (!file) return res.writeHead(404).end();
    send(readFileSync(file), TYPES[extname(file)] ?? 'application/octet-stream');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log('preview at', origin);
  return {
    url: `${origin}/preview.html`,
    ready: `document.readyState === 'complete'`,
    before: null,
    stop: () => new Promise((r) => server.close(r)),
  };
}

/** The click on the element with this label; a preview only looks among what is visible. */
function pick(want, exact, doc = 'document') {
  const visible = app.kind === 'preview' ? '.filter((x) => x.offsetParent !== null)' : '';
  const match = exact ? 't === want' : 't.includes(want)';
  return `(() => {
    const want = ${JSON.stringify(want)};
    const all = [...${doc}.querySelectorAll('button,[role=tab],[role=menuitem],[role=menuitemradio],[role=option],a,li,tr,[role=row],summary')]${visible};
    const hits = all.filter((x) => { const t = (x.getAttribute('aria-label') || x.textContent).trim(); return ${match}; });
    // Of nested matches the innermost one: the row, not the list around it.
    const e = hits.sort((a, b) => a.textContent.length - b.textContent.length || (a.contains(b) ? 1 : -1))[0];
    if (!e) throw new Error('nothing on the page is labelled: ' + want);
    e.click();
  })()`;
}

async function act(page, step) {
  const { action, arg } = parseStep(step);
  if (action === 'click') await page.eval(pick(arg, true));
  else if (action === 'has') await page.eval(pick(arg, false));
  else if (action === 'frame')
    await page.eval(pick(arg, true, `document.querySelector('iframe').contentDocument`));
  else if (action === 'wait') await sleep(Number(arg));
  else if (action === 'hash') await page.eval(`location.hash = ${JSON.stringify(arg)}`);
  else {
    await page.key(arg, {
      code: arg.length === 1 ? `Key${arg.toUpperCase()}` : arg,
      vk: arg === 'Escape' ? 27 : arg === 'Enter' ? 13 : 0,
      text: arg.length === 1 ? arg : arg === 'Enter' ? '\r' : undefined,
    });
  }
  await sleep(350);
}

let failed = false;
let started;
let page;
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
try {
  started = await (app.kind === 'hub' ? startHub() : startPreview());
  mkdirSync(out, { recursive: true });
  page = await launch({ width: W, height: H });
  await page.viewport(W, H);
  // The interface in English, whatever this machine speaks.
  const ua = (await page.send('Browser.getVersion')).result.userAgent.replace('Headless', '');
  await page.send('Network.enable');
  await page.send('Network.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en' });
  await page.send('Emulation.setLocaleOverride', { locale: 'en-US' });
  // An app without a theme menu follows the system: `"dark": true` makes the system say dark.
  if (app.dark) {
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    });
  }
  if (started.before)
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: started.before });
  await page.goto(started.url);
  await page.until(started.ready, 'the page of the app', 20000);
  await sleep(app.settle ?? 1500);

  const labels = (sel) =>
    page.eval(
      `[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => (e.getAttribute('aria-label') || e.textContent).trim().split(/\\s+/).join(' ')).filter(Boolean).slice(0, 80).join(' | ')`,
    );
  const look = async () => {
    if (!explore) return;
    console.log('  at', await page.eval('location.hash'));
    console.log('  menus', await labels('[role=menubar] [role=menuitem]'));
    console.log('  links', await labels('nav a'));
    console.log('  buttons', await labels('button,[role=tab]'));
    console.log('  headings', await labels('h1,h2,h3'));
  };
  await look();
  for (const shot of app.shots) {
    for (const step of shot.steps ?? []) await act(page, step);
    await sleep(900);
    if (shot.shot !== false) {
      for (const format of ['png', 'webp']) {
        const r = await page.send('Page.captureScreenshot', {
          format,
          ...(format === 'webp' ? { quality: 80 } : {}),
        });
        writeFileSync(join(out, `${shot.name}.${format}`), Buffer.from(r.result.data, 'base64'));
      }
      console.log('shot', join(out, `${shot.name}.webp`));
    }
    await look();
  }
  const errors = page.logs.filter((l) => /^(error|exception):/.test(l));
  if (errors.length > 0) console.log('the page reported:', JSON.stringify(errors.slice(0, 10)));
} catch (error) {
  failed = true;
  console.error('ERROR', error);
} finally {
  await page?.close();
  await started?.stop();
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.log('left behind:', root, String(error));
  }
}
process.exit(failed ? 1 : 0);
