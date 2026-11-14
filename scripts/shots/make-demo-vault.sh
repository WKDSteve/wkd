#!/usr/bin/env bash
# Builds an invented vault for screenshots of tasks-desktop: a colorscheme plugin "lumen.nvim", its
# palette editor "lumen-desktop" and their docs. Nothing in it comes from a real vault.
#
#   bash make-demo-vault.sh <target folder>     (the folder is replaced)
set -euo pipefail
V="${1:?target folder}"
TASKS="${TASKS_CLI:-${REPOS_DIR:?REPOS_DIR is not set}/tasks.nvim/bin/tasks}"
# Nothing of this machine's own vault: with TASKS_MARKER_DOCS set, finishing a task here would
# refresh a document of the real vault.
unset TASKS_VAULT TASKS_MARKER_DOCS TASKS_EXTRA_AREAS TASKS_LISTS_FILE TASKS_FRECENCY_FILE TASKS_LINKS
rm -rf "$V"
"$TASKS" init-vault "$V" --area=lumen.nvim --lang=en --apply >/dev/null
rm -f "$V/lumen.nvim/ROADMAP/tasks/first-task-create-edit-finish.md"
t() { "$TASKS" --vault="$V" "$@"; }
t bootstrap lumen-desktop --lang=en --apply >/dev/null
t bootstrap docs --lang=en --apply >/dev/null

PLAN=$(t plan-new lumen.nvim "Lumen 1.0: palettes, integrations, release" --areas=lumen.nvim,lumen-desktop,docs \
  --phases=design,build,release --summary="Four palettes, the integrations people ask for, and a first tagged release." | cut -f2 | head -1)

n() { t new "$@" --lang=en --no-index >/dev/null; }
P="--plan=$PLAN"

# design
n lumen.nvim "Decide the default palette" --slug=decide-the-default-palette --kind=task --status=decision --prio=1 --effort=XS --value=5 --actor=me $P --phase=design --created=2026-11-02 --tags=palette \
  --summary="Dawn or dusk as the palette a new install starts with."
n lumen.nvim "Contrast check for every palette (WCAG AA)" --slug=contrast-check --kind=task --prio=1 --effort=S --value=5 --actor=cdx $P --phase=design --created=2026-11-03 --tags=palette,a11y --category=tests \
  --summary="Every foreground on every background of the four palettes reaches 4.5:1."
n lumen.nvim "Name the highlight groups of the public API" --slug=name-the-highlight-groups --kind=task --prio=2 --effort=S --value=4 --actor=pair $P --phase=design --created=2026-11-03 --tags=api \
  --summary="One list of group names that integrations may rely on."
n lumen-desktop "Sketch the palette editor" --slug=sketch-the-palette-editor --kind=task --prio=2 --effort=S --value=3 --actor=pair $P --phase=design --created=2026-11-04 --tags=ui \
  --summary="Swatches on the left, a live preview of a buffer on the right."

# build
n lumen.nvim "Treesitter captures for Lua, Rust and TypeScript" --slug=treesitter-captures --kind=task --status=doing --prio=1 --effort=M --value=5 --actor=cdx $P --phase=build --after=lumen.nvim/name-the-highlight-groups --created=2026-11-05 --tags=treesitter \
  --summary="The captures of the three languages map to the named groups."
n lumen.nvim "LSP semantic tokens" --slug=lsp-semantic-tokens --kind=task --prio=2 --effort=M --value=4 --actor=cdx $P --phase=build --after=lumen.nvim/treesitter-captures --created=2026-11-05 --tags=lsp \
  --summary="Semantic tokens refine what treesitter coloured, never fight it."
n lumen.nvim "Integration: statusline" --slug=integration-statusline --kind=task --prio=2 --effort=S --value=4 --actor=cdx $P --phase=build --after=lumen.nvim/name-the-highlight-groups --created=2026-11-06 --tags=integration \
  --summary="Mode colours and the git branch follow the palette."
n lumen.nvim "Integration: file tree and pickers" --slug=integration-tree-and-pickers --kind=task --prio=2 --effort=S --value=3 --actor=cdx $P --phase=build --after=lumen.nvim/name-the-highlight-groups --created=2026-11-06 --tags=integration \
  --summary="Folders, matches and the selection read the same groups."
n lumen.nvim "Terminal colours 0 to 15" --slug=terminal-colours --kind=task --prio=3 --effort=XS --value=3 --actor=cdx $P --phase=build --created=2026-11-07 --tags=terminal \
  --summary="The sixteen ANSI colours come from the active palette."
n lumen.nvim "Dim inactive windows" --slug=dim-inactive-windows --kind=task --prio=3 --effort=S --value=2 --actor=cdx $P --phase=build --created=2026-11-08 --tags=ui \
  --summary="An option, off by default."
n lumen.nvim "Italic comments flicker in tmux" --slug=italic-comments-flicker-in-tmux --kind=bug --prio=1 --effort=S --value=4 --actor=cdx --severity=medium $P --phase=build --created=2026-11-10 --tags=terminal --category=bug \
  --summary="With tmux 3.4 a scrolled comment line loses its italics until the next redraw."
n lumen.nvim "Reload is slow with 40 buffers open" --slug=reload-is-slow --kind=bug --prio=2 --effort=M --value=3 --actor=cdx --severity=low $P --phase=build --created=2026-11-11 --tags=performance --category=performance \
  --summary="Switching the palette takes 180 ms; the budget is 30."
n lumen-desktop "Read and write palette files" --slug=read-and-write-palette-files --kind=task --status=doing --prio=1 --effort=M --value=5 --actor=cdx $P --phase=build --after=lumen-desktop/sketch-the-palette-editor --created=2026-11-06 --tags=files \
  --summary="The editor opens a palette of lumen.nvim and saves it without touching the comments."
n lumen-desktop "Live preview of a buffer" --slug=live-preview-of-a-buffer --kind=task --prio=1 --effort=L --value=5 --actor=pair $P --phase=build --after=lumen-desktop/read-and-write-palette-files --created=2026-11-07 --tags=ui \
  --summary="A change of a swatch shows in the preview within a frame."
n lumen-desktop "Export to terminal emulators" --slug=export-to-terminal-emulators --kind=task --prio=3 --effort=M --value=3 --actor=cdx $P --phase=build --created=2026-11-09 --tags=export \
  --summary="One palette, written for three terminal emulators."
n lumen-desktop "Colour-blind simulation" --slug=colour-blind-simulation --kind=task --status=parked --waits-for=contrast-check --prio=3 --effort=M --value=4 --actor=pair --created=2026-11-09 --tags=a11y \
  --summary="See a palette as someone with protanopia or deuteranopia sees it."

# release
n lumen.nvim "Write the help file" --slug=write-the-help-file --kind=task --prio=2 --effort=S --value=4 --actor=cdx $P --phase=release --created=2026-11-08 --tags=docs --category=docs \
  --summary="The options, the palettes and the group names, as :help lumen."
n docs "Screenshots of the four palettes" --slug=screenshots-of-the-four-palettes --kind=task --prio=2 --effort=S --value=4 --actor=me $P --phase=release --after=lumen.nvim/decide-the-default-palette --created=2026-11-08 --tags=docs,needs-user \
  --summary="The same buffer in dawn, day, dusk and night."
n docs "Migration notes from 0.x" --slug=migration-notes --kind=task --prio=3 --effort=XS --value=3 --actor=cdx $P --phase=release --created=2026-11-09 --tags=docs --category=docs \
  --summary="Two options were renamed; the old names warn once."
n lumen.nvim "Tag 1.0 and announce it" --slug=tag-1-0-and-announce --kind=task --prio=1 --effort=XS --value=5 --actor=me $P --phase=release --after=lumen.nvim/write-the-help-file,docs/screenshots-of-the-four-palettes,lumen.nvim/contrast-check --created=2026-11-09 --due=2026-11-28 --tags=release \
  --summary="The tag, the release notes, a post."

# outside the plan
n docs "A page that compares the palettes side by side" --slug=compare-the-palettes --kind=task --prio=3 --effort=M --value=2 --actor=cdx --created=2026-11-10 --tags=docs \
  --summary="For the site, after the release."
n lumen.nvim "Light variant of dusk" --slug=light-variant-of-dusk --kind=task --prio=3 --effort=M --value=2 --actor=pair --created=2026-11-11 --tags=palette \
  --summary="Asked for twice; needs its own contrast pass."

# what is finished already
n lumen.nvim "Palette format: one Lua table per palette" --slug=palette-format --kind=task --prio=1 --effort=S --value=5 --actor=cdx $P --phase=design --created=2026-10-28
n lumen.nvim "The four palettes: dawn, day, dusk, night" --slug=the-four-palettes --kind=task --prio=1 --effort=M --value=5 --actor=pair $P --phase=design --created=2026-10-29
n lumen.nvim "Setup function and options" --slug=setup-function-and-options --kind=task --prio=1 --effort=S --value=4 --actor=cdx $P --phase=build --created=2026-10-30
n lumen-desktop "Window, menu and the empty state" --slug=window-menu-empty-state --kind=task --prio=2 --effort=S --value=3 --actor=cdx $P --phase=build --created=2026-11-01
t done lumen.nvim/palette-format --date=2026-11-04 --no-next --no-index >/dev/null
t done lumen.nvim/the-four-palettes --date=2026-11-07 --no-next --no-index >/dev/null
t done lumen.nvim/setup-function-and-options --date="$(date +%F)" --no-next --no-index >/dev/null
t done lumen-desktop/window-menu-empty-state --date="$(date +%F)" --no-next --no-index >/dev/null

t index >/dev/null
t check
