# wkd

The website of the workshop (Astro 7, TypeScript, Biome), published to GitHub Pages under `/wkd/`. Read
[README.md](README.md) first: two skins (`modern`, `tui`) over one content layer, the areas and addresses, and how
content is read from the sibling repositories at build time. Nothing about a plugin or an app is written twice.

## Before you change something

- Every page exists in both skins (`test/nav.test.ts`); an address that is linked from outside stays (`MOVED` in
  `src/lib/nav.ts`, checked after every build by `src/integrations/routes.ts`).
- Content comes from the repositories (README, docs, git); do not copy it into this repo.

## Checks

`pnpm verify` (= `pnpm lint && pnpm check && pnpm test && pnpm build`), then `pnpm test:browser` against the built
`dist/`. The test sheets in `TESTS/sheets` run with testing.nvim (`.testing.lua`, engine `browser`). CI:
`.github/workflows/deploy.yml`.

## Web platform

- Browser Support: Baseline Widely available (`.mwgrc`, `browserslist` in `package.json`). Newer features only behind
  feature detection with a fallback; polyfills where browsers still in use need them (rather one too many), run only after the check: dynamic `import()`, or bundled in a `file://` page. The site must also work without script.
- Before writing or changing HTML, CSS or client-side JS, use the `modern-web-guidance` skill (`search` → `retrieve` →
  verify). Not for build config, CI or the content loaders.
- `legacy-scan`: `DISABLE_TELEMETRY=1 pnpm exec modern-web-guidance legacy-scan src --json` (exact devDependency); CI
  runs it as an informative step. Known false positive (decided 2026-11-21): `checkbox` in `src/styles/tui.css`. It is not a
  checkbox with `opacity: 0` but the radio filters of the TUI pills (`CategoryFilter`, `AreaFilter`): their inputs are
  visually hidden (`.visually-hidden`), stay keyboard-operable and work without script, which is the `dropWhen` case of
  the guide; the `[ ]` brackets of the labels switch with `opacity`. Check each other finding against `keepWhen`/`dropWhen`.
- `.claude/settings.json` turns the tool's telemetry off and allows only `npx -y modern-web-guidance@latest *`.
- Rules: the maintainer's ruleset for the web platform (private, so not named or cited here by id).
