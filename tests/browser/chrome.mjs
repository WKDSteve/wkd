// A small driver for the browser checks: a static server over `dist/` and a
// headless Chrome spoken to over the DevTools protocol. No dependency: Node
// has fetch and WebSocket, Chrome is the one on this machine (or $CHROME).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const CANDIDATES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

/** The Chrome to drive, or null when this machine has none. */
export function chromePath() {
  return CANDIDATES.find((p) => p && existsSync(p)) ?? null;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

/**
 * Serves a built site the way GitHub Pages does: under its base path, a
 * folder answers with its index.html, nothing else is rewritten.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serve(dist, base = '/wkd') {
  const root = resolve(dist);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (!path.startsWith(`${base}/`)) {
      res.writeHead(404).end();
      return;
    }
    let file = normalize(join(root, path.slice(base.length)));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      done({
        url: `http://127.0.0.1:${port}${base}`,
        close: () =>
          new Promise((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The promise, or nothing after `ms`; the timer does not outlive the promise (it would hold the process open). */
function within(promise, ms) {
  let timer;
  const late = new Promise((r) => {
    timer = setTimeout(r, ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const PROFILE = 'wkd-chrome-';

/** Removes the profiles earlier runs could not remove (Chrome still held them), once they are ten minutes old. */
function sweepProfiles() {
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(PROFILE)) continue;
    const dir = join(tmpdir(), name);
    try {
      if (Date.now() - statSync(dir).mtimeMs > 600_000)
        rmSync(dir, { recursive: true, force: true });
    } catch {
      // Held by a Chrome that still runs, or gone meanwhile.
    }
  }
}

/** Starts a headless Chrome and returns one page of it. */
export async function launch({ width = 1280, height = 900 } = {}) {
  const exe = chromePath();
  if (!exe) throw new Error('no Chrome found; set CHROME to its path');
  sweepProfiles();
  const profile = mkdtempSync(join(tmpdir(), PROFILE));
  const chrome = spawn(
    exe,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      // A hosted runner forbids the user namespaces Chrome's sandbox needs, and
      // its /dev/shm is small. The pages loaded there are this repo's own build.
      ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
      'about:blank',
    ],
    // Only stderr is read (for the port); a pipe nobody reads would fill up.
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  // Chrome prints the port it took to stderr.
  const port = await new Promise((done, fail) => {
    let err = '';
    const timer = setTimeout(() => fail(new Error(`Chrome did not start: ${err}`)), 20000);
    const read = (d) => {
      err += d;
      const m = err.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        // From here on stderr is drained and dropped.
        chrome.stderr.off('data', read);
        chrome.stderr.resume();
        done(Number(m[1]));
      }
    };
    chrome.stderr.on('data', read);
  });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
    if (!target) await sleep(100);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  const waiters = new Map();
  /** Console messages, exceptions and browser log entries (CSP reports land here). */
  const logs = [];
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description).join(' ');
      logs.push(`${msg.params.type}: ${text}`);
    } else if (msg.method === 'Log.entryAdded') {
      logs.push(`${msg.params.entry.level}: ${msg.params.entry.text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`exception: ${d.text} ${d.exception?.description ?? ''}`);
    }
    const waiting = waiters.get(msg.method);
    if (waiting) {
      waiters.delete(msg.method);
      for (const w of waiting) w();
    }
  });
  const send = (method, params = {}) =>
    new Promise((done) => {
      const n = ++id;
      pending.set(n, done);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const once = (method) =>
    new Promise((done) => {
      waiters.set(method, [...(waiters.get(method) ?? []), done]);
    });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  const page = {
    logs,
    sleep,
    send,
    /** Loads a page and waits for its load event (the scripts are modules: they ran by then). */
    async goto(url) {
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await within(loaded, 15000);
      await sleep(150);
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.result.exceptionDetails) {
        throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
      }
      return r.result.result.value;
    },
    /** Waits until the expression is truthy and returns its value; throws with `what` after the timeout. */
    async until(expression, what = expression, timeout = 8000) {
      const end = Date.now() + timeout;
      for (;;) {
        const v = await page.eval(expression).catch(() => undefined);
        if (v) return v;
        if (Date.now() > end) throw new Error(`timed out waiting for: ${what}`);
        await sleep(100);
      }
    },
    /** A real key press, as the keyboard sends it (`text` for a key that types). */
    async key(key, { code = key, vk = 0, text } = {}) {
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode: vk,
        text,
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
    },
    escape: () => page.key('Escape', { vk: 27 }),
    type: (text) => send('Input.insertText', { text }),
    /** A viewport of this size; `mobile` also makes the page see a touch phone. */
    viewport: (w, h, mobile = false) =>
      send('Emulation.setDeviceMetricsOverride', {
        width: w,
        height: h,
        deviceScaleFactor: 1,
        mobile,
      }),
    noScript: (off) => send('Emulation.setScriptExecutionDisabled', { value: off }),
    async close() {
      const gone = new Promise((r) => chrome.once('exit', r));
      ws.close();
      try {
        // Browser.close belongs to the browser's own endpoint, not to a page's.
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const browser = new WebSocket(version.webSocketDebuggerUrl);
        await within(new Promise((r) => browser.addEventListener('open', r)), 2000);
        browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      } catch {
        // Not reachable any more: the kill below ends it.
      }
      await within(gone, 1500);
      if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
      // On Windows the process and its helpers outlive this by seconds and
      // hold the pipe and the profile: neither may keep this process open.
      chrome.stderr.destroy();
      chrome.unref();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Still held: the next launch sweeps it (see sweepProfiles).
      }
    },
  };
  return page;
}
