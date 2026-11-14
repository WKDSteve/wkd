-- T15 of the live list: the remembered skin. With "tui" stored, a node of the tree and a spoke of the
-- orbit on the modern page lead into the TUI skin (their links are SVG anchors, which once were not
-- rewritten). With "modern" stored, the TUI page shows its hint bar and keeps its layout.
--   testing sheets step skin-preference --headed
local q = "document.querySelector"
local store = function(skin)
  return ("(localStorage.setItem('wkd:skin', %q), true)"):format(skin)
end
local hint_shown = "!" .. q .. "('[data-skin-hint]').hidden"
local in_tui = "location.pathname.startsWith('/wkd/tui/p/')"
local all_tui = function(sel)
  return ("[...document.querySelectorAll(%q)].every((a) => a.getAttribute('href').includes('/tui/p/'))"):format(
    sel
  )
end
local box = function(sel)
  return q .. ("(%q).getBoundingClientRect()"):format(sel)
end

return {
  id = "wkd.skin-preference",
  title = "wkd: the remembered skin steers tree and orbit, and the TUI page shows its hint bar",
  task = "wkd/testblaetter-der-browser-engine-fuer-wkd",
  engine = "browser",
  app = "site",
  sizes = { { cols = 1280, rows = 900 } },
  steps = {
    { open = "${link}/nvim/", note = "the modern plugin area, nothing stored yet" },
    { expect = q .. "('[data-skin-hint]').hidden", note = "no preference, no hint" },
    { expect = store("tui"), note = "the visitor prefers the TUI skin" },

    { open = "${link}/nvim/", note = "the same page again, now with the preference" },
    { wait = hint_shown, note = "the hint bar offers the TUI skin" },
    { click = "label[for=view-tree]", note = "the tree" },
    { wait = "getComputedStyle(" .. q .. "('.home-tree')).display !== 'none'" },
    {
      expect = all_tui(".home-tree a[data-nav^='p/']"),
      note = "every node of the tree points into the TUI skin",
    },
    { shot = "tree-with-hint" },
    { click = ".home-tree a[data-nav='p/ui'] circle", note = "a node of the tree, on its dot" },
    { wait = in_tui, timeout = 8000, note = "the click lands in the TUI skin, not back in modern" },
    { expect = "document.documentElement.dataset.skin === 'tui'" },

    { open = "${link}/nvim/", note = "back on the modern page" },
    { click = "label[for=view-orbit]", note = "the orbit" },
    { wait = "getComputedStyle(" .. q .. "('.home-orbit')).display !== 'none'" },
    {
      expect = all_tui(".home-orbit a.m-orbit-spoke"),
      note = "every spoke points into the TUI skin",
    },
    {
      click = ".home-orbit a.m-orbit-spoke[data-nav='p/ui'] text",
      note = "a spoke of the orbit, on its name",
    },
    { wait = in_tui, timeout = 8000, note = "the spoke lands in the TUI skin too" },

    { expect = store("modern"), note = "now the visitor prefers the modern skin" },
    { open = "${link}/tui/", note = "and opens the TUI start page" },
    { wait = hint_shown, note = "the hint bar is there" },
    {
      expect = box(".tui-hint") .. ".height < 60",
      note = "the hint bar is one or two lines, not blown up",
    },
    {
      expect = box(".tui-hint") .. ".top >= " .. box(".tui-status") .. ".bottom - 1",
      note = "it sits under the statusline",
    },
    {
      expect = box(".tui-body") .. ".top >= " .. box(".tui-hint") .. ".bottom - 1",
      note = "the sidebar and the content start under the hint bar",
    },
    { expect = box(".tui-side") .. ".left < 2", note = "the sidebar is at the left edge" },
    {
      expect = "Math.abs("
        .. box(".tui-cmd")
        .. ".bottom - Math.max(innerHeight, "
        .. box(".tui")
        .. ".bottom)) < 2",
      note = "the command line is the last row, at the bottom",
    },
    { shot = "tui-with-hint" },
    { click = "[data-skin-keep]", note = ":set skin=tui keeps this skin" },
    { wait = q .. "('[data-skin-hint]').hidden", note = "the hint is gone" },
    { expect = "localStorage.getItem('wkd:skin') === 'tui'", note = "and the choice is stored" },
  },
  judge = {
    "tree-with-hint: the hint bar of the modern skin reads well above the tree",
    "tui-with-hint: the yellow hint bar is one line, the sidebar and the footer are where they belong",
  },
}
