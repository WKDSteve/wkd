# Pictures of the apps

The screenshots under `public/shots/<slug>/` of tasks-desktop, rules-desktop, testing-desktop and
docmap-desktop are taken by `shot-app.mjs`, so they can be taken again after the interface of an
app changed.

**Only invented data gets into a picture.** The site is public. No real vault, no real rule set,
no test results of a real repository, no path that names a person. The data is made by the
`make-demo-*` scripts here (a colorscheme plugin "lumen.nvim" that does not exist, and its
companions), and an app is started with a config folder of its own, never with the real one.

## Taking the pictures of an app again

```bash
REPOS_DIR=<folder of the checkouts> node scripts/shots/shot-app.mjs tasks-desktop
```

writes `out/shots/tasks-desktop/<name>.png` and `<name>.webp` for every picture of
`apps/tasks-desktop.json` (`out/` is ignored by git). Look at them. Then copy the `.webp` files
into `public/shots/tasks-desktop/`; `shots.json` there holds the size and the caption of each one
and only changes when a picture is added, dropped or sized differently. `pnpm build` fails on a
file that `shots.json` names and that is not there.

| Option | Meaning |
|---|---|
| `--out=<folder>` | write there instead of `out/shots/<slug>/` |
| `--exe=<binary>` | a hub built somewhere else than `target/debug/` of its checkout |
| `--explore` | print the menus, links, buttons and headings after each step: how to find the steps to a view |

Without `REPOS_DIR` (or `PLUGINS_DIR`) the checkouts are looked for next to this repository.

What has to be there:

| App | Needs |
|---|---|
| tasks-desktop | `target/debug/tasks-hub.exe` (`pnpm --dir ui build`, then `cargo build`), tasks.nvim, lib.nvim, `bash`, `nvim` |
| rules-desktop | `target/debug/rules-hub.exe` (the same two steps), rules.nvim, lib.nvim |
| testing-desktop | `target/debug/testing-hub.exe` (the same two steps), testing.nvim, lib.nvim, `nvim` |
| docmap-desktop | its checkout (no build) and docmap.nvim with its generated map in `docs/map/` |

A Chrome is needed for all of them (`CHROME=<path>` for another one than the installed).

## The two kinds of app

- **`hub`**: the app is a local web interface served by a hub. The script starts the built hub
  the way the e2e harness of its repository does: a config folder of its own
  (`<PREFIX>_CONFIG_DIR`), a port of its own, the session through `<hub> open` and
  `/auth/exchange`. Nothing is installed, nothing is read from or written to the real
  configuration, and only the hub this run started is stopped.
- **`preview`**: docmap-desktop is a Tauri window, not a hub. Taken is what its repository uses
  to look at its window, the browser preview (`tools/preview`): the markup, styles and scripts of
  `src/`, the Tauri bridge answered by `stub.js`. The script serves that itself and patches two
  answers of the stub: the map pane shows the real generated map of a public repository
  (docmap.nvim), and the invented traffic numbers are off (`stubPatch`), so no made-up numbers
  about a real repository go online. Real is everything in the map pane; the sidebar and the
  status line come from the stub.

## An app file (`apps/<slug>.json`)

| Field | Kind | Meaning |
|---|---|---|
| `kind` | both | `hub` or `preview` |
| `width`, `height` | both | the size of the picture, 1360×850 when absent |
| `dark` | both | `true` makes the system say dark, for an app without a theme menu |
| `settle` | both | milliseconds to wait after the page loaded (1500) |
| `shots` | both | the pictures in order: `{ name, steps, shot }`; `"shot": false` only runs the steps |
| `exe` | hub | the built hub |
| `prefix` | hub | e.g. `RULES_DESKTOP`: the hub reads `<prefix>_CONFIG_DIR`, `_PORT`, `_EDITOR_LOG` |
| `api` | hub | e.g. `rules`: `GET /api/<api>/hello` says when the engine is ready |
| `session` | hub | the key of the token in `sessionStorage` |
| `demo` | hub | the command that makes the invented data, run before the hub starts |
| `config` | hub | files written into the config folder, by name |
| `env` | hub | further environment of the hub |
| `app`, `map` | preview | the checkout of the app, and the folder of the generated map |
| `stubPatch` | preview | `[search, replace]` pairs applied to `stub.js`; a search that is not found fails the run |

A step is `click=<label>` (the element labelled exactly so), `has=<text>` (the innermost element
whose text contains it), `frame=<label>` (a control of the map in its iframe, preview only),
`wait=<ms>`, `hash=<fragment>`, or the name of a key (`Escape`, `Enter`, `j`).

No path of one machine belongs in an app file. The placeholders are `$REPOS_DIR` (the folder of
the checkouts), `$ROOT` (the temporary folder of the run, removed at its end), `$DEMO` (the
folder the `demo` command fills, inside `$ROOT`) and `$HERE` (this folder).
`tests/shots-config.test.ts` checks every app file: its shape, its steps, and that it names no
drive, home folder or `AppData`.

## Traps the script already knows

- A hub answers on its port before it has written `hub.json`, and pairing needs that file.
- testing-desktop has no theme menu (`"dark": true`), and its list of repositories needs about
  six seconds.
- The interface is asked for in English (`Accept-Language` and the locale), whatever the machine
  speaks.
- A started program gets a short list of environment variables, not the whole environment:
  `TASKS_VAULT` and the like of the person who runs the script never reach it.
