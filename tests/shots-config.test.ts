import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  expand,
  machinePaths,
  PLACEHOLDERS,
  parseStep,
  validateApp,
} from '../scripts/shots/app-config.mjs';

const shots = fileURLToPath(new URL('../scripts/shots/', import.meta.url));
const apps = readdirSync(`${shots}apps`).filter((f) => f.endsWith('.json'));
const vars = { REPOS_DIR: 'R:\\repos', ROOT: '/tmp/root', DEMO: '/tmp/root/demo', HERE: '/here' };

const hub = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'hub',
  exe: '$REPOS_DIR/x/x.exe',
  prefix: 'X',
  api: 'x',
  session: 'x.session',
  shots: [{ name: 'one', steps: ['click=View', 'wait=200', 'Escape'] }],
  ...over,
});

test('placeholders become paths with forward slashes, everywhere in the value', () => {
  assert.deepEqual(
    expand(
      { a: '$REPOS_DIR/x', b: ['$DEMO/repos', 7], c: { d: '$ROOT and $HERE', e: null } },
      vars,
    ),
    { a: 'R:/repos/x', b: ['/tmp/root/demo/repos', 7], c: { d: '/tmp/root and /here', e: null } },
  );
});

test('a longer name is no placeholder, and a placeholder without a value fails', () => {
  assert.equal(expand('$ROOTS and $HOME stay', vars), '$ROOTS and $HOME stay');
  assert.throws(() => expand('$DEMO', { ROOT: '/r' }), /\$DEMO has no value/);
});

test('a step is an action with its value, or the name of a key', () => {
  assert.deepEqual(parseStep('click=Save as list …'), { action: 'click', arg: 'Save as list …' });
  assert.deepEqual(parseStep('has=a=b'), { action: 'has', arg: 'a=b' });
  assert.deepEqual(parseStep('Escape'), { action: 'key', arg: 'Escape' });
  assert.throws(() => parseStep('js=alert(1)'), /unknown action/);
  assert.throws(() => parseStep('key=x'), /unknown action/);
  assert.throws(() => parseStep('click='), /needs a value/);
  assert.throws(() => parseStep('wait=soon'), /milliseconds/);
  assert.throws(() => parseStep('two words'), /not a key name/);
});

test('an app file is checked before anything is started, with every problem at once', () => {
  assert.equal(validateApp(hub(), 'x').kind, 'hub');
  assert.throws(
    () => validateApp(hub({ exe: '', shots: [] }), 'x'),
    /x: exe is missing; shots is empty/,
  );
  assert.throws(() => validateApp({ kind: 'window', shots: [{ name: 'a' }] }, 'x'), /kind must be/);
  assert.throws(() => validateApp(null, 'x'), /kind must be/);
});

test('the name of a shot is a plain file name, once', () => {
  for (const name of ['../up', 'a/b', 'A', 'with space', '', '-lead', 7]) {
    assert.throws(() => validateApp(hub({ shots: [{ name }] }), 'x'), /plain name/, String(name));
  }
  assert.throws(
    () => validateApp(hub({ shots: [{ name: 'a' }, { name: 'a' }] }), 'x'),
    /listed twice/,
  );
});

test('a step that cannot run fails the file, and an app file must take a picture', () => {
  assert.throws(
    () => validateApp(hub({ shots: [{ name: 'a', steps: ['frame=Tree'] }] }), 'x'),
    /frame= is for a preview/,
  );
  assert.throws(
    () => validateApp(hub({ shots: [{ name: 'a', steps: ['js=1'] }] }), 'x'),
    /a: unknown action/,
  );
  assert.throws(
    () => validateApp(hub({ shots: [{ name: 'a', shot: false }] }), 'x'),
    /no shot is taken/,
  );
  assert.throws(() => validateApp(hub({ demo: 'bash make.sh' }), 'x'), /demo must be a command/);
  // A shell differs per machine (on Windows `bash` may be the one of WSL): node runs the demo.
  assert.throws(
    () => validateApp(hub({ demo: ['bash', 'make.sh'] }), 'x'),
    /demo must be run by node/,
  );
  assert.equal(validateApp(hub({ demo: ['node', 'make.mjs', '$DEMO'] }), 'x').demo[0], 'node');
  assert.throws(() => validateApp(hub({ stubPatch: [['a']] }), 'x'), /pairs/);
  assert.throws(
    () => validateApp(hub({ stubPatch: [['a', 'b']] }), 'x'),
    /stubPatch is for a preview/,
  );
  assert.throws(() => validateApp(hub({ env: ['A=b'] }), 'x'), /env must be an object/);
  assert.throws(() => validateApp(hub({ config: 'x' }), 'x'), /config must be an object/);
  assert.throws(() => validateApp(hub({ width: 1360.5 }), 'x'), /width must be/);
});

test('a path of one machine is recognised', () => {
  assert.deepEqual(machinePaths('"exe": "E:/repos/x.exe", "v": "C:\\\\Users\\\\me\\\\AppData"'), [
    'E:/repos',
    'C:\\\\Users',
    'AppData',
  ]);
  assert.deepEqual(machinePaths('/Users/me/x and /home/me/y'), ['/Users/me', '/home/me']);
  assert.deepEqual(machinePaths('$REPOS_DIR/tasks.nvim, http://127.0.0.1:1/ and "a: b"'), []);
});

test('every app file is valid, names no path of one machine and its demo script exists', () => {
  assert.ok(apps.length >= 2, 'there are app files');
  for (const file of apps) {
    const text = readFileSync(`${shots}apps/${file}`, 'utf8');
    assert.deepEqual(machinePaths(text), [], file);
    const app = validateApp(JSON.parse(text), file.replace(/\.json$/, ''));
    const known = new RegExp(`\\$(?!(?:${PLACEHOLDERS.join('|')})\\b)[A-Z_]+`);
    assert.doesNotMatch(text, known, `${file}: a placeholder the script does not know`);
    for (const arg of (app.demo ?? []) as string[]) {
      if (arg.startsWith('$HERE/')) assert.ok(existsSync(shots + arg.slice(6)), `${file}: ${arg}`);
    }
  }
});

test('the demo scripts name no path of one machine either', () => {
  for (const file of readdirSync(shots).filter((f) => /^make-demo-/.test(f))) {
    assert.deepEqual(machinePaths(readFileSync(shots + file, 'utf8')), [], file);
  }
});
