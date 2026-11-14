-- T15 of the live list: the category filter by keyboard alone. A pill reached with the keyboard gets
-- its neon colour picked anew as a hovered one does (src/scripts/hue.ts sets data-hue on the label of
-- the focused radio), and never the same one twice in a row. What the keyboard user sees is the focus
-- ring: the pill under the focus is the chosen one and is drawn in ink; the neon colour is what a
-- pointer over a pill shows, which the last steps check.
--   testing sheets step filter-keyboard --headed
local active = "document.activeElement"
local label = active .. ".labels[0]"
local in_filter = active .. ".matches('.m-filter input')"
local neon = "['0', '1', '2', '3', '4'].includes(" .. label .. ".dataset.hue)"
local colour = "getComputedStyle(" .. label .. ").getPropertyValue('--hover').trim()"
local other = ".m-filter input:not(:checked) + label"
local background = "getComputedStyle(document.querySelector(%q)).backgroundColor"

return {
  id = "wkd.filter-keyboard",
  title = "wkd: a filter pill reached by keyboard gets a new neon colour, shows its focus ring and filters",
  task = "wkd/testblaetter-der-browser-engine-fuer-wkd",
  engine = "browser",
  app = "site",
  sizes = { { cols = 1280, rows = 900 } },
  steps = {
    { open = "${link}/nvim/", note = "the plugin area" },
    { wait = "document.querySelectorAll('.m-filter input').length > 3" },
    {
      expect = "(window.__plain = " .. background:format(other) .. ", true)",
      note = "a pill at rest",
    },
    { press = "Tab", note = "the keyboard is in use from here on (the skip link)" },
    {
      focus = ".m-filter input:checked",
      note = "on to the filter, as further Tabs would get there",
    },
    {
      expect = in_filter .. " && " .. active .. ".matches(':focus-visible')",
      note = "keyboard focus",
    },
    { press = "ArrowRight", note = "the next pill" },
    {
      wait = in_filter .. " && " .. neon,
      note = "the pill under the focus got a neon colour picked",
    },
    {
      expect = "getComputedStyle(" .. label .. ").outlineStyle === 'solid'",
      note = "and it shows the focus ring",
    },
    { expect = "(window.__first = " .. label .. ".dataset.hue, true)" },
    {
      expect = "(window.__colour = " .. colour .. ", window.__colour !== '')",
      note = "the colour is a real one",
    },
    { shot = "pill-focused" },
    { press = "ArrowRight", note = "and the one after it" },
    { wait = in_filter .. " && " .. neon },
    {
      expect = label .. ".dataset.hue !== window.__first",
      note = "never the same colour twice in a row",
    },
    { expect = colour .. " !== window.__colour", note = "so the colour really changes" },
    {
      expect = "[...document.querySelectorAll('.roster .m-card')]"
        .. ".some((c) => getComputedStyle(c).display === 'none')",
      note = "the pill also filters: some tiles are gone",
    },
    { hover = other, note = "a pointer over a pill that is not the chosen one" },
    {
      wait = background:format(other) .. " !== window.__plain",
      note = "it is filled with its neon colour",
    },
    { shot = "pill-hovered" },
  },
  judge = {
    "pill-focused: the pill under the keyboard focus has a clear ring",
    "pill-hovered: the hovered pill is filled with a loud colour and its label stays readable",
  },
}
