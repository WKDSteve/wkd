-- T13 of the live list: the roster as grid, tree and orbit, the stack and a plugin page on a phone and a
-- tablet. Nothing may make the page wider than the screen; the tree is wider than a phone by design and
-- scrolls inside its own box.
--   testing sheets step mobile-views --headed
local fits = "document.documentElement.scrollWidth <= innerWidth"
local shown = function(sel)
  return ("getComputedStyle(document.querySelector(%q)).display !== 'none'"):format(sel)
end

return {
  id = "wkd.mobile-views",
  title = "wkd: grid, tree, orbit, stack and a plugin page fit a phone and a tablet",
  task = "wkd/testblaetter-der-browser-engine-fuer-wkd",
  engine = "browser",
  app = "site",
  sizes = { { cols = 375, rows = 800 }, { cols = 768, rows = 1024 } },
  steps = {
    { open = "${link}/nvim/", note = "the plugin area" },
    { wait = shown(".roster"), note = "the grid of tiles is the first view" },
    {
      expect = "document.querySelectorAll('.roster .m-card').length > 30",
      note = "the tiles are there",
    },
    { expect = fits, note = "grid: the page is no wider than the screen" },
    { shot = "grid" },

    { click = "label[for=view-tree]", note = "switch to the tree" },
    {
      wait = shown(".home-tree")
        .. " && "
        .. "getComputedStyle(document.querySelector('.roster')).display === 'none'",
    },
    { expect = fits, note = "tree: the page is no wider than the screen" },
    {
      expect = "(() => { const b = document.querySelector('.home-tree svg').parentElement;"
        .. " return b.scrollWidth <= b.clientWidth || getComputedStyle(b).overflowX === 'auto'; })()",
      note = "a tree wider than the screen scrolls inside its box",
    },
    { shot = "tree" },

    { click = "label[for=view-orbit]", note = "switch to the orbit" },
    {
      wait = shown(".home-orbit")
        .. " && "
        .. "getComputedStyle(document.querySelector('.home-tree')).display === 'none'",
    },
    {
      expect = "document.querySelectorAll('.home-orbit a.m-orbit-spoke').length > 30",
      note = "every plugin is a spoke",
    },
    { expect = fits, note = "orbit: the page is no wider than the screen" },
    { shot = "orbit" },

    { open = "${link}/nvim/stack/", note = "the stack" },
    { wait = "document.querySelectorAll('.m-stack-card').length > 30" },
    { expect = fits, note = "stack: the page is no wider than the screen" },
    { shot = "stack" },

    { open = "${link}/p/ui/", note = "the page of ui.nvim" },
    { wait = "!!document.querySelector('h1')" },
    { expect = fits, note = "ui.nvim: the page is no wider than the screen" },
    { shot = "plugin" },
  },
  judge = {
    "on the phone the tiles are one column and nothing is cut off at the right edge",
    "tree and orbit are readable, or scroll inside their own box without moving the page",
    "tree on the phone: the box opens on an empty part of a wide drawing; whether that needs a hint to swipe"
      .. " is a question for a person (wkd/fight-auf-echten-geraeten)",
  },
}
