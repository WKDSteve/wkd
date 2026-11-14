// Builds invented repositories with real test runs for screenshots of testing-desktop: a
// colorscheme plugin "lumen.nvim" and three small companions, each with spec files, run for real
// by testing.nvim into a state folder of their own. Nothing comes from a real repository.
//
//   node make-demo-tests.mjs <target folder>     (the folder is replaced)
//
// Makes <target>/repos, <target>/state and <target>/areas.json (the data classes).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const target = process.argv[2];
if (!target) throw new Error('target folder');
const repos = process.env.REPOS_DIR;
if (!process.env.TESTING_ENGINE_DIR && !repos) throw new Error('REPOS_DIR is not set');
const engine = process.env.TESTING_ENGINE_DIR ?? join(repos ?? '', 'testing.nvim');
const script = join(engine, 'scripts', 'testing.lua');
if (!existsSync(script)) throw new Error(`no testing.nvim checkout at ${engine}`);
rmSync(target, { recursive: true, force: true });

const ok = (name) => [`  it("${name}", function()`, '    assert.is_true(true)', '  end)'];
const red = (name, want, got) => [
  `  it("${name}", function()`,
  `    assert.are.equal(${JSON.stringify(want)}, ${JSON.stringify(got)})`,
  '  end)',
];
const spec = (title, cases) =>
  [`describe("${title}", function()`, ...cases.flat(), 'end)', ''].join('\n');

/** name, class, runs: each run is { file: [title, cases] }; the last run is what the page shows first. */
const REPOS = [
  {
    name: 'lumen.nvim',
    class: 'public',
    files: (fixed) => ({
      palette: spec('palette', [
        ok('loads the four palettes'),
        ok('every palette defines all sixteen terminal colours'),
        ok('an unknown palette name is reported with the name'),
        ok('a palette is a plain table, never a function'),
      ]),
      highlights: spec('highlights', [
        ok('links treesitter captures to the named groups'),
        ok('semantic tokens refine, never replace'),
        ok('italic comments can be switched off'),
        fixed
          ? ok('the cursor line keeps the contrast of the palette')
          : red('the cursor line keeps the contrast of the palette', '#24283b', '#1f2335'),
        ok('inactive windows are dimmed only when asked'),
      ]),
      setup: spec('setup', [
        ok('works without setup()'),
        ok('an unknown option is reported'),
        ok('switching the palette reloads the highlights once'),
      ]),
    }),
  },
  {
    name: 'lumen-export.nvim',
    class: 'public',
    files: () => ({
      export: spec('export', [
        ok('writes a palette for the first terminal emulator'),
        ok('writes a palette for the second terminal emulator'),
        red('keeps the alpha channel of the selection colour', '#33467cee', '#33467c'),
        ok('refuses to overwrite a file it did not write'),
      ]),
      names: spec('names', [
        ok('a file is named after its palette'),
        ok('spaces in a palette name become dashes'),
      ]),
    }),
  },
  {
    name: 'lumen-preview.nvim',
    class: 'internal',
    files: () => ({
      preview: spec('preview', [
        ok('opens a scratch buffer with every group'),
        ok('follows the palette while it is edited'),
        ok('closes with the window that opened it'),
        ok('never writes the scratch buffer to disk'),
      ]),
    }),
  },
  {
    name: 'contrast.nvim',
    class: 'public',
    files: (fixed) => ({
      ratio: spec('contrast ratio', [
        ok('black on white is 21 to 1'),
        ok('a colour against itself is 1 to 1'),
        ok('the order of the two colours does not matter'),
        fixed
          ? ok('three-digit hex colours are read')
          : red('three-digit hex colours are read', 4.5, 4.48),
      ]),
      report: spec('report', [
        ok('lists every pair below 4.5 to 1'),
        ok('a palette that passes prints one line'),
      ]),
    }),
  },
];

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
  'LOCALAPPDATA',
  'APPDATA',
];
const env = Object.fromEntries(PASS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
env.CI = 'true'; // trusts the folder, as the pipeline does

const state = join(target, 'state');
mkdirSync(state, { recursive: true });
const areas = {};
for (const r of REPOS) {
  const dir = join(target, 'repos', r.name);
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, '.testing.lua'), 'return {}\n');
  areas[r.name] = { class: r.class, repo: r.name };
  // Two runs: the first with what was broken then, the second as it stands now.
  for (const fixed of [false, true]) {
    for (const [file, text] of Object.entries(r.files(fixed)))
      writeFileSync(join(dir, 'tests', `${file}_spec.lua`), text);
    try {
      execFileSync(
        'nvim',
        [
          '-n',
          '-i',
          'NONE',
          '--headless',
          '-u',
          'NONE',
          '-l',
          script,
          'run',
          '.',
          '--state-dir',
          state,
        ],
        { cwd: dir, env, stdio: 'ignore' },
      );
      console.log(r.name, 'green');
    } catch (error) {
      if (error.status !== 1) throw error;
      console.log(r.name, 'red');
    }
  }
}
writeFileSync(join(target, 'areas.json'), JSON.stringify({ schema: 1, areas }));
