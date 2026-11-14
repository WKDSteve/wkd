import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectRequires } from '../src/lib/lua-requires.ts';

const lua = (...lines: string[]): string => lines.join('\n');
const roots = (...sources: string[]): Record<string, boolean> => {
  const found = new Map<string, boolean>();
  for (const s of sources) collectRequires(s, found);
  return Object.fromEntries(found);
};

test('a plain require is a hard dependency, in each of its spellings', () => {
  assert.deepEqual(
    roots(lua('local fs = require("lib.nvim.fs")', "local kit = require 'ui.kit'")),
    { lib: false, ui: false },
  );
});

test('a require inside a pcall is optional; one behind a closed pcall is not', () => {
  assert.deepEqual(
    roots(
      lua(
        'local ok, kit = pcall(require, "ui.kit")',
        'local ok2, m = pcall(function() return require("media") end)',
        'pcall(vim.cmd, "redraw") local d = require("diff")',
      ),
    ),
    { ui: true, media: true, diff: false },
  );
});

test('the soft loaders are optional without a pcall around them', () => {
  assert.deepEqual(
    roots(
      lua(
        'local telemetry = require("docmap.core.soft_require").probe("runtime-analysis.telemetry")',
        'local engine = probe("pickers.engines." .. name)',
        'local ok, command = safe("pickers.command")',
        "local loaded = require('lib.nvim.require').safe 'x'",
        'local ft = package.loaded["filetree"]',
        "local t = package.loaded['terminal']",
        'local s = package.loaded.sandbox',
      ),
    ),
    {
      docmap: false,
      'runtime-analysis': true,
      pickers: true,
      lib: false,
      filetree: true,
      terminal: true,
      sandbox: true,
    },
  );
});

test('one plain require anywhere makes it a hard dependency, whatever the order of the files', () => {
  const soft = 'local r = probe("rules.engine.runner")';
  const hard = 'local r = require("rules")';
  assert.deepEqual(roots(soft, hard), { rules: false });
  assert.deepEqual(roots(hard, soft), { rules: false });
});

test('names that only look like a loader are left alone', () => {
  assert.deepEqual(
    roots(
      lua(
        'local a = my_require("ui")',
        'local b = M.safe_call("ui")',
        'local c = lock.probe_ok("ui")',
        'local d = unsafe("ui")',
        'local e = package.loaded',
      ),
    ),
    {},
  );
});

test('comments are no code: a doc example loads nothing', () => {
  assert.deepEqual(
    roots(
      lua(
        '--- local ok = require("lib.nvim.require").safe("pickers")',
        '  -- probe("rules")',
        '--[[ package.loaded["terminal"] ]]',
        '--[==[',
        'require("ui")',
        ']==]',
      ),
    ),
    {},
  );
});
