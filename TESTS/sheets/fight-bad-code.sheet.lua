-- "Code with a typo" of the review: a wrong reply code or invitation code is answered with "not valid"
-- and costs nothing, the invitation stays and can be tried again. One browser can check that much;
-- that the right code works afterwards needs a second device (wkd/fight-online-zwischen-zwei-geraeten).
--   testing sheets step fight-bad-code --headed
local q = "document.querySelector"
local status = q .. "('[data-fight-online-status]').textContent"
local code_out = q .. "('[data-fight-code-out]').value"
local shown = function(sel)
  return "!" .. q .. ("(%q).hidden"):format(sel)
end
local type_code = function(js)
  return "(" .. q .. "('[data-fight-code-in]').value = " .. js .. ", true)"
end
local can_retry = shown("[data-fight-code-in-step]")
  .. " && !"
  .. q
  .. "('[data-fight-code-submit]').disabled"

return {
  id = "wkd.fight-bad-code",
  title = "wkd: a mistyped online code is refused as not valid and the invitation stays",
  task = "wkd/testblaetter-der-browser-engine-fuer-wkd",
  engine = "browser",
  app = "site",
  sizes = { { cols = 1280, rows = 900 } },
  steps = {
    { open = "${link}/play/", note = "the play area" },
    { wait = shown("[data-fight-online]"), timeout = 8000, note = "online play is offered" },

    { click = "[data-fight-invite]", note = "invite a friend" },
    { wait = code_out .. ".length > 20", timeout = 20000, note = "the invitation code is there" },
    { expect = "(window.__invitation = " .. code_out .. ", true)" },
    { expect = type_code("'this is no code'"), note = "nonsense as the reply code" },
    { click = "[data-fight-code-submit]", note = "Connect" },
    {
      wait = status .. ".includes('reply code is not valid')",
      timeout = 8000,
      note = "it says not valid",
    },
    {
      expect = code_out .. " === window.__invitation",
      note = "the invitation is still the same one",
    },
    { expect = can_retry, note = "and the reply can be entered again" },
    {
      expect = type_code("window.__invitation.slice(0, -9) + 'x' + window.__invitation.slice(-8)"),
      note = "a real code with one character changed (the invitation itself, which is no reply either)",
    },
    { click = "[data-fight-code-submit]" },
    {
      wait = status .. ".includes('not valid') && " .. can_retry,
      timeout = 8000,
      note = "not valid again",
    },
    {
      expect = code_out .. " === window.__invitation",
      note = "the invitation survived the second typo too",
    },
    { shot = "reply-not-valid" },
    { click = "[data-fight-online-cancel]", note = "cancel the invitation" },
    { wait = shown("[data-fight-online-menu]"), timeout = 8000, note = "back at the two choices" },

    { click = "[data-fight-join]", note = "the other side: join with an invitation code" },
    { wait = shown("[data-fight-code-in-step]"), timeout = 8000 },
    {
      expect = type_code("window.__invitation.slice(0, 40)"),
      note = "an invitation cut off in the middle",
    },
    { click = "[data-fight-code-submit]", note = "Create reply" },
    {
      wait = status .. ".includes('invitation code is not valid')",
      timeout = 8000,
      note = "not valid",
    },
    { expect = can_retry, note = "the field is still there for the right code" },
    { shot = "invitation-not-valid" },
    { click = "[data-fight-online-cancel]" },
    { wait = shown("[data-fight-online-menu]"), timeout = 8000 },
  },
  manual = {
    "after a 'not valid', the right code connects the two devices (wkd/fight-online-zwischen-zwei-geraeten)",
  },
}
