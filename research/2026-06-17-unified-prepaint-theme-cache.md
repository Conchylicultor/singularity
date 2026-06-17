# Unified pre-paint theme cache (scoped blocks included)

## Root cause

The pre-paint theme cache (localStorage envelope replayed by the inline script in
`plugins/framework/plugins/web-core/web/index.html` before first paint) covered
ONLY the global `:root`/`.dark` style blocks emitted by `ThemeInjector`. The
per-surface scoped blocks were excluded:

- `GroupStyle` (in `theme-injector.tsx`) reported its CSS to the cache via a React
  context (`CssReportContext`), but gated scoped blocks OUT with
  `if (!scopeToken) report(...)`.
- `ScopedAppTheme` (one per open app, emits `[data-theme-scope="app:<id>"]`) and
  `ChromeTheme` (emits `[data-theme-scope="chrome"]`) are mounted in DIFFERENT
  React subtrees (`ScopedAppTheme` lives deep inside `apps/surface` surface-body;
  `ThemeInjector`/`ChromeTheme` are `Core.Root`) and could not share
  `ThemeInjector`'s context. Their `report` was the default no-op anyway.

So on a warm reload every surface painted from the global `:root` first, then
snapped to its own scope once React mounted and the `useLayoutEffect` injected the
scoped blocks — the flicker, and the tab/window "sometimes app theme, sometimes
global theme" inconsistency.

## Aggregator design

Replaced the React-context reporter + per-injector refs with a module-level
singleton: `web/internal/paint-cache-aggregator.ts`. A module singleton is the
correct home — the cache is a localStorage side effect, and a singleton is the
only thing that spans the three disjoint React subtrees that emit themed CSS.
(`primitives/scoped-store` does not fit: it is per-Provider-instance,
React-scoped.)

State:
- `styles: Map<styleId, cssText>` — every reported style, both `theme-engine-*`
  (global) and `theme-scope-*` (chrome + each open app scope).
- `claimed: Set<styleId>` — ids owned by a currently-mounted `GroupStyle` (prune
  set).
- `context: { appPath, mode, forked }` — set by `ThemeInjector`.

API:
- `reportPaintStyle(id, text | null)` — upsert/delete in the Map; no-op if
  unchanged; schedule a debounced flush.
- `claimPaintStyle(id)` / `releasePaintStyle(id)` — maintain the prune set.
- `setPaintContext(ctx)` — store context; re-flush on change (covers switching to
  an app with an identical theme, a fork toggle, or a configured-mode change).
- Flush (single `queueMicrotask`, debounced via a scheduled flag): writes the FULL
  current style Map into the active app-path entry via `writeCriticalCss`
  (unchanged — it already does read-merge-write per path and the unforked → also
  write `""` rule). One atomic write per tick; no torn cache.

`GroupStyle.useLayoutEffect` now, for BOTH scoped and unscoped blocks: adopts the
replay-injected `<style>` by id, sets text, `claimPaintStyle(id)`,
`reportPaintStyle(id, text)`; on cleanup `releasePaintStyle(id)` +
`reportPaintStyle(id, null)`.

The old `map.size < groupCount` torn-cache guard was DROPPED — it assumed only the
global groups report, and cannot express "all groups × all mounted scopes". The
microtask-after-commit timing is what guarantees a complete snapshot: React runs
all of a commit's layout effects synchronously, so a single debounced microtask
scheduled after the first report observes every style of that commit.

The localStorage envelope shape is UNCHANGED (`{ v: 2, entries: { [appPath]:
{ styles: { [styleId]: cssText }, mode } } }`). The replay script is agnostic to
CSS content — it injects every `<style>` in the chosen entry by id — so scoped CSS
text in `entry.styles` replays with zero replay-script changes. `index.html` was
NOT touched.

## Prune invariant

Replay-injected `theme-engine-*` / `theme-scope-*` elements whose owning
`GroupStyle` is not mounted this session (a removed token group; a scope no longer
open after reload) must be removed so they don't declare dead vars. This replaces
`ThemeInjector`'s old `[groups]`-keyed `theme-engine-`-only prune with a uniform
claim-based prune covering both id families.

Mechanism: each mounted `GroupStyle` `claimPaintStyle(id)` in its layout effect;
`schedulePrune()` queues a microtask that removes any
`style[id^="theme-engine-"], style[id^="theme-scope-"]` element whose id is not in
`claimed`.

CRITICAL invariant — never remove an element before the owning `GroupStyle`'s
layout effect has run in the same commit. Claims happen in the layout effect;
prune is a microtask scheduled FROM that claim, so it runs strictly after all of
the commit's layout effects (and hence all of the commit's claims) have executed.
A still-mounted element is therefore always claimed before prune runs. Adoption of
the replay-injected element by `getElementById(id)` also happens in the same layout
effect, before any prune could touch it.

## Touched files

All inside `plugins/ui/plugins/theme-engine/` (NOT load-bearing):
- `web/internal/paint-cache-aggregator.ts` (new)
- `web/internal/paint-cache-aggregator.test.ts` (new, bun:test)
- `web/components/theme-injector.tsx` (rewired GroupStyle + ThemeInjector; removed
  CssReportContext, refs/flush machinery, and the old prune effect)

Plus this design note. `theme-cache.ts` and `index.html` unchanged.

## Deferred follow-ups (need their own design — touch load-bearing apps/shell)

These were explicitly OUT of scope here:

- **Full duality elimination.** Make the desktop itself a real app scope so
  `:root` = the global desktop theme rather than = the focused app, then drop the
  redundant `chrome` scope / `ChromeTheme` entirely. Today `:root` doubles as
  "focused app" AND "neutral base", which is why `ChromeTheme` exists as a
  separate stable layer.
- **Per-scope dark mode.** `.dark` is still a single global class driven by the
  focused app (`ColorModeApplier`). Per-window/per-app color mode needs the dark
  bit pushed into each `data-theme-scope` block instead.

Both touch `plugins/apps/**` and `plugins/shell/**` (surface-body, app-rail,
app-tab-bar, toaster) and the `<html>.dark` model, so they belong in a separate
design pass.
