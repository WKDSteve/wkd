// Which Lua modules a source text loads, and whether it can do without them.
// Free of Astro imports, so `pnpm test` covers it (tests/lua-requires.test.ts).

// require("mod"), require "mod" and the family's optional-dependency idiom
// pcall(require, "mod"); `\b` keeps a `my_require(...)` helper out.
const REQUIRE = /\brequire\s*(?:\(\s*|,\s*)?['"]([\w.-]+)/g;

// The loaders that answer "not installed" instead of raising, so what they
// load is optional by construction and no pcall stands around it:
//   probe("mod")            docmap.nvim's core.soft_require
//   safe("mod")             lib.nvim.require
//   package.loaded["mod"]   "only if somebody else loaded it already"
// A name may be completed at run time (`probe("pickers.engines." .. name)`),
// so the closing quote is not asked for. `probe` and `safe` are everyday
// names: a match only counts where its root is the module of another plugin
// (the caller maps roots to plugins), and a string such as a path never is.
const SOFT_LOADERS = [
  /\b(?:probe|safe)\s*\(\s*['"]([\w.-]+)/g,
  /\bpackage\.loaded\s*\[\s*['"]([\w.-]+)/g,
  /\bpackage\.loaded\.([A-Za-z_]\w*)/g,
];

// Block comments and full-line comments (including `---` doc comments, whose
// example code would otherwise count as dependencies).
const LUA_COMMENT = /--\[(=*)\[[\s\S]*?\]\1\]|^[ \t]*--.*$/gm;

/**
 * Whether the require at `at` sits inside a pcall(...): only a pcall( whose
 * parenthesis is still open at that point guards it -- an earlier, already
 * closed pcall on the same lines does not.
 */
function guardedBy(src: string, at: number): boolean {
  const window = src.slice(Math.max(0, at - 160), at);
  const last = [...window.matchAll(/pcall\s*\(/g)].pop();
  if (!last) return false;
  let depth = 1;
  for (const ch of window.slice((last.index ?? 0) + last[0].length)) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  return depth > 0;
}

/**
 * Adds the module roots one Lua source loads to `roots`, e.g. "lib" from
 * require("lib.nvim.fs"). A root stays `true` (optional) as long as every
 * place that loads it is guarded: a require inside a pcall, or one of the
 * soft loaders. One plain require anywhere makes it a hard dependency.
 */
export function collectRequires(source: string, roots: Map<string, boolean>): void {
  const src = source.replace(LUA_COMMENT, '');
  const note = (name: string | undefined, guarded: boolean): void => {
    const root = name?.split('.')[0];
    if (!root) return;
    roots.set(root, (roots.get(root) ?? true) && guarded);
  };
  for (const m of src.matchAll(REQUIRE)) note(m[1], guardedBy(src, m.index ?? 0));
  for (const loader of SOFT_LOADERS) {
    for (const m of src.matchAll(loader)) note(m[1], true);
  }
}
