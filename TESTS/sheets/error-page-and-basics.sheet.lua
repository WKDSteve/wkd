-- The page behind a missing address, the icons and the way to the main content, in both skins. The served
-- site answers a missing address with 404.html under status 404, as GitHub Pages does (test/browser/chrome.mjs).
--   testing sheets step error-page-and-basics --headed
local q = "document.querySelector"
local text = function(sel)
  return q .. ("(%q).textContent"):format(sel)
end

return {
  id = "wkd.error-page-and-basics",
  title = "wkd: a missing address shows the 404 page, the icons are there and the skip link leads to the content",
  task = "wkd/website-wsg-und-vercel-punkte",
  engine = "browser",
  app = "site",
  sizes = { { cols = 1280, rows = 900 } },
  steps = {
    { open = "${link}/there/is/no/such/page/", note = "an address without a page" },
    { expect = text("h1") .. ".trim() === 'Page not found'", note = "the modern 404 page says what happened" },
    { expect = q .. "('meta[name=robots]').content === 'noindex'", note = "it is not indexed" },
    { expect = "!" .. q .. "('link[rel=canonical]')", note = "and has no canonical address" },
    { shot = "404-modern" },

    { open = "${link}/tui/404/", note = "the same page in the TUI skin" },
    { expect = text("h1") .. ".includes('E404')", note = "an error line, as the Neovim window would say it" },
    { shot = "404-tui" },

    { open = "${link}/", note = "the start page" },
    {
      expect = "[...document.querySelectorAll('link[rel=icon]')].map((l) => l.getAttribute('href').split('/').pop()).join() === 'favicon.ico,favicon.svg'",
      note = "an icon file and the svg",
    },
    {
      expect = "(" .. q .. "('.skip-link').focus(), document.activeElement.matches('.skip-link'))",
      note = "the skip link takes the focus",
    },
    { expect = q .. "('.skip-link').getAttribute('href') === '#main' && !!" .. q .. "('main#main')", note = "and leads to the main content" },
    { expect = "document.querySelectorAll('h1').length === 1", note = "one h1 on the page" },
  },
}
