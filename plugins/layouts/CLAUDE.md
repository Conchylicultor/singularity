# layouts

Umbrella for layout renderers — plugins that decide *how* the matched pane
chain is composed on screen. The pane primitive resolves a URL to an
ordered chain of panes; a layout plugin maps that chain to a visible
arrangement (columns, tabs, grid, overlays, …).

Only one layout is mounted at a time. The shell wires it in by importing
the layout plugin's renderer component (e.g. `<MillerColumns/>`) and
mounting it in place of `<PaneRouter/>`.

## Plugins

- **`miller`** — Drill-down columns: each `MatchEntry` in the chain becomes
  one column. New columns appear on the right as the chain grows. Per-pane
  default widths via `chrome.width`; columns are user-resizable and
  collapsible (sessionStorage-persisted within a tab).
