-- .testing.lua -- what the test sheets of this repository run against (testing.nvim, docs/SHEETS.md there).
-- The sheets in TESTS/sheets only name the app; how it starts is here, under testing.nvim's trust gate.
-- wkd has no Lua spec: `testing sheets run --all --engine browser` runs the sheets, after `pnpm build`.

return {
  sheets = {
    -- the Chrome of the machine, as tests/browser/ uses it; playwright-core at a fixed version from tools/sheets
    browser = { playwright_dir = "tools/sheets", channel = "chrome" },
    apps = {
      -- The built site under /wkd, as GitHub Pages serves it. No build step here: the sheets check the
      -- dist/ that `pnpm build` wrote, like `pnpm test:browser`, and the server refuses to start without one.
      site = {
        run = { "node", "scripts/serve-dist.mjs" },
        ready = { stdout = "^http", as = "link" },
      },
    },
  },
}
