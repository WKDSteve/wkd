-- T7 and its follow-up round of the live list, and "Space on buttons" of the review: a match against the
-- AI ends by knockout or after 60 s, the result text says what happened, the record between the health
-- bars counts it, and Space on the focused Rematch button starts the next match (in a running match
-- Space stays the light attack). Read from the DOM, not from the canvas. The AI is set to
-- "unwinnable", so the match ends by knockout within seconds; the wait still covers a full 60 s match.
--   testing sheets step fight-result --headed
local q = "document.querySelector"
local hidden = function(sel)
  return q .. ("(%q).hidden"):format(sel)
end
local shown = function(sel)
  return "!" .. hidden(sel)
end
local text = function(sel)
  return q .. ("(%q).textContent.trim()"):format(sel)
end
local width = function(who)
  return ("parseFloat(" .. q .. "('[data-fight-health=%q]').style.width || '100')"):format(who)
end
local result = text("[data-fight-result-text]")
local record = text("[data-fight-record]")
-- "3W 5L" as [wins, losses]
local counts = record .. ".match(/^(\\d+)W (\\d+)L$/).slice(1).map(Number)"
local timer = "Number(" .. text("[data-fight-timer]") .. ")"
local running = shown("[data-fight-arena]")
  .. " && "
  .. hidden("[data-fight-result]")
  .. " && "
  .. hidden("[data-fight-paused]")

return {
  id = "wkd.fight-result",
  title = "wkd: a match ends with the right verdict, the record counts it, Space on Rematch starts the next",
  task = "wkd/testblaetter-der-browser-engine-fuer-wkd",
  engine = "browser",
  app = "site",
  sizes = { { cols = 1280, rows = 900 } },
  steps = {
    { open = "${link}/play/", note = "the play area" },
    { wait = "!!" .. q .. "('[data-fighter]')", timeout = 8000, note = "the fighter cards" },
    { click = "[data-fight-difficulty=unwinnable]", note = "an opponent that ends the match fast" },
    {
      expect = "(window.__before = " .. counts .. ", window.__before.length === 2)",
      note = "the record so far",
    },
    { click = "[data-fighter]", note = "pick the first fighter: the match starts" },
    { wait = running, timeout = 8000, note = "the arena, no result yet" },
    {
      wait = timer .. " > 0 && " .. timer .. " < 60",
      timeout = 15000,
      note = "the clock runs down from 60",
    },
    { focus = "[data-fight-canvas]", note = "the keys go to the match" },
    { press = "Space", note = "Space in a running match is the light attack" },
    { expect = running, note = "it neither paused nor ended the match" },

    {
      wait = shown("[data-fight-result]"),
      timeout = 90000,
      note = "knockout, or the 60 s are over",
    },
    {
      expect = "/^(K\\.O\\.|Time up\\.) (You win\\.|You lose\\.|Draw\\.)$/.test(" .. result .. ")",
      note = "the result names how it ended and who won",
    },
    {
      expect = "(() => { const t = "
        .. result
        .. ", p = "
        .. width("player")
        .. ", e = "
        .. width("enemy")
        .. "; return t.endsWith('You win.') ? p > e : t.endsWith('You lose.') ? p < e : p === e; })()",
      note = "the verdict matches the health bars: more health left wins",
    },
    {
      expect = "(() => { const t = " .. result .. ", p = " .. width("player") .. ", e = " .. width(
        "enemy"
      ) .. "; return t.startsWith('K.O.') === (Math.min(p, e) === 0); })()",
      note = "K.O. exactly when one bar is empty, Time up otherwise",
    },
    {
      expect = "(() => { const t = "
        .. result
        .. ", [w, l] = "
        .. counts
        .. ", [w0, l0] = window.__before; return w === w0 + (t.endsWith('You win.') ? 1 : 0)"
        .. " && l === l0 + (t.endsWith('You lose.') ? 1 : 0); })()",
      note = "the record counts this match, and only this one",
    },
    { shot = "result" },

    { expect = "(window.__after = " .. counts .. ", true)" },
    { focus = "[data-fight-again]", note = "Tab to Rematch" },
    { press = "Space", note = "Space presses the focused button" },
    { wait = running, timeout = 8000, note = "a new match runs" },
    { wait = timer .. " > 50", timeout = 8000, note = "with a fresh clock" },
    {
      expect = "(() => { const [w, l] = "
        .. counts
        .. "; return w === window.__after[0] && l === window.__after[1]; })()",
      note = "starting a rematch counts nothing",
    },
    { press = "Escape", note = "Esc ends the match" },
    { wait = shown("[data-fight-select]"), timeout = 8000, note = "back at the fighter cards" },
  },
  judge = {
    "result: the result box reads well over the arena, and the record sits between the health bars",
  },
  manual = {
    "a match that really runs the full 60 s (two players of equal skill):"
      .. " the text is 'Time up.' with the right verdict",
  },
}
