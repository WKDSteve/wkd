import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detectTech,
  englishParagraph,
  ICON_MAX_BYTES,
  installSnippet,
  isPngIcon,
  latestVersionTag,
  mentionsRolling,
  statusParagraph,
} from '../src/lib/app-facts.ts';

const md = (...lines: string[]): string => lines.join('\n');

test('the English paragraph of a German README is found, without its marker', () => {
  const readme = md(
    '![pult](assets/icons/pult/png/pult-128.png)',
    '',
    '# pult',
    '',
    'Ein eigener virtueller Audio-Mixer für Windows, in Rust.',
    '',
    '> **Status (2026-11-03): Stufe 2 fertig.** Ein Kommandozeilen-Programm.',
    '',
    '**English.** pult is a personal virtual audio mixer for Windows',
    'written in Rust.',
    '',
    '## Was geht schon',
  );
  assert.equal(
    englishParagraph(readme),
    'pult is a personal virtual audio mixer for Windows written in Rust.',
  );
});

test('no marker, an empty marker and a marker in a code fence are no English paragraph', () => {
  assert.equal(englishParagraph(md('# x', '', 'A plugin.')), null);
  assert.equal(englishParagraph(md('**English.**', '', 'Next paragraph.')), null);
  assert.equal(englishParagraph(md('```', '**English.** not this', '```')), null);
});

test('the marker is read with or without its full stop, in any case', () => {
  assert.equal(englishParagraph('**English** Short.'), 'Short.');
  assert.equal(englishParagraph('**english.** Short.'), 'Short.');
});

test('the English paragraph ends at a blank line or at a code fence', () => {
  assert.equal(
    englishParagraph(md('**English.** One.', 'Two.', '```', 'code', '```')),
    'One. Two.',
  );
});

test('the status of an app is the paragraph or quote that opens with a bold Status', () => {
  assert.equal(
    statusParagraph(
      md(
        '# hub-desktop',
        '',
        'One place to start every app.',
        '',
        '> **Status: first milestone.** The hub lists the apps',
        '> and starts them.',
        '',
        '## Install',
      ),
    ),
    '**Status: first milestone.** The hub lists the apps and starts them.',
  );
  assert.equal(
    statusParagraph(md('# x', '', '**Status: early development. No release yet.** More', 'text.')),
    '**Status: early development. No release yet.** More text.',
  );
});

test('a status quote ends where the quote ends', () => {
  assert.equal(
    statusParagraph(md('> **Status: alpha.**', 'Not part of the quote.')),
    '**Status: alpha.**',
  );
});

test('a README without a marked status has none, and a fence hides one', () => {
  assert.equal(statusParagraph(md('# x', '', 'The status is fine.')), null);
  assert.equal(statusParagraph(md('```', '**Status: fake**', '```')), null);
});

test('the install snippet is the first code block under an Install heading', () => {
  const readme = md(
    '# hub-desktop',
    '',
    '```',
    'ascii banner',
    '```',
    '',
    '## Install (Windows)',
    '',
    'In your own PowerShell:',
    '',
    '```',
    'powershell -c "irm https://example.invalid/install.ps1 | iex"',
    '```',
    '',
    '```',
    'second block',
    '```',
  );
  assert.equal(
    installSnippet(readme),
    'powershell -c "irm https://example.invalid/install.ps1 | iex"',
  );
});

test('a German heading and a deeper level are read too', () => {
  assert.equal(
    installSnippet(md('### Installieren', '```bash', 'make install', '```')),
    'make install',
  );
  assert.equal(installSnippet(md('## Installation', '~~~', 'x', '~~~')), 'x');
});

test('no Install heading, no block before the next heading, or a heading in a fence: none', () => {
  assert.equal(installSnippet(md('## Usage', '```', 'run', '```')), null);
  assert.equal(
    installSnippet(md('## Install', 'See the docs.', '## Usage', '```', 'run', '```')),
    null,
  );
  assert.equal(installSnippet(md('```', '## Install', '```', '', '```', 'x', '```')), null);
});

test('a block under a sub-heading of Install still counts', () => {
  assert.equal(
    installSnippet(md('## Install', '### Windows', '```', 'setup.exe', '```')),
    'setup.exe',
  );
});

test('an install block longer than a page should quote is left to the README', () => {
  const long = Array.from({ length: 80 }, (_, i) => `step ${i} of the long way`);
  assert.equal(installSnippet(md('## Install', '```', ...long, '```')), null);
  assert.equal(installSnippet(md('## Install', '```', '', '```')), null);
});

test('a README that points at the rolling pre-release says so', () => {
  assert.ok(mentionsRolling('see https://github.com/x/y/releases/tag/latest for it'));
  assert.ok(mentionsRolling('irm https://github.com/x/y/releases/download/latest/install.ps1'));
  assert.ok(!mentionsRolling('see https://github.com/x/y/releases/tag/v1.0.0'));
  assert.ok(!mentionsRolling('see /releases/tag/latest-and-greatest'));
});

test('the newest version tag is chosen by number, not by text', () => {
  assert.equal(latestVersionTag(['v0.9.0', 'v0.10.0', 'v0.2.1']), 'v0.10.0');
  assert.equal(latestVersionTag(['v1.0.0', 'v0.99.99']), 'v1.0.0');
  assert.equal(latestVersionTag(['v0.6', 'v0.5.9']), 'v0.6');
  assert.equal(latestVersionTag(['v0.1.0', 'v0.1.0']), 'v0.1.0');
});

test('latest, pre-releases and stray words are no version; none gives null', () => {
  assert.equal(latestVersionTag(['latest', 'v1.0.0-rc1', 'version-2', '']), null);
  assert.equal(latestVersionTag(['latest', 'v0.1.0', 'v0.2.0-beta']), 'v0.1.0');
  assert.equal(latestVersionTag([]), null);
});

test('tags are trimmed, as git prints them with line ends', () => {
  assert.equal(latestVersionTag('v0.1.0\r\nv0.2.0\r\n'.split('\n')), 'v0.2.0');
});

test('tech is read from the build files: language first, then the toolkit', () => {
  assert.deepEqual(
    detectTech({
      paths: ['Cargo.toml', 'crates/pult-app/Cargo.toml', 'README.md'],
      cargoManifests: ['[workspace]', '[dependencies]\neframe = "0.29"\ncpal = "0.15"'],
    }),
    ['Rust', 'egui'],
  );
  assert.deepEqual(
    detectTech({
      paths: ['package.json', 'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json'],
      cargoManifests: ['[dependencies]\ntauri = { version = "2" }'],
    }),
    ['Rust', 'Tauri'],
  );
  assert.deepEqual(detectTech({ paths: ['CMakeLists.txt', 'src/main.cpp'], cargoManifests: [] }), [
    'C++',
  ]);
  assert.deepEqual(detectTech({ paths: ['src/Launcher/Launcher.csproj'], cargoManifests: [] }), [
    'C#',
  ]);
});

test('a dependency whose name only starts like a toolkit does not count', () => {
  assert.deepEqual(
    detectTech({
      paths: ['Cargo.toml'],
      cargoManifests: ['[dependencies]\ntauri-build = "2"\negui_extras = "0.29"\n# tauri = "2"'],
    }),
    ['Rust'],
  );
});

test('a repository without a known build file has no tech, rather than a guess', () => {
  assert.deepEqual(detectTech({ paths: ['README.md', 'tasks.html'], cargoManifests: [] }), []);
});

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('an icon is a PNG by its content and of icon size', () => {
  assert.ok(isPngIcon(Uint8Array.from([...PNG, 0, 0, 0, 13])));
  assert.ok(!isPngIcon(Uint8Array.from(PNG.slice(0, 7))));
  assert.ok(!isPngIcon(new TextEncoder().encode('<svg onload="x()"></svg>')));
  assert.ok(!isPngIcon(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0])));
  const big = new Uint8Array(ICON_MAX_BYTES + 1);
  big.set(PNG);
  assert.ok(!isPngIcon(big));
});
