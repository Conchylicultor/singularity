---
name: theme
description: >
  Map of theming surfaces — the Theme model, design tokens, saved and tweakcn
  themes, per-app theme selection, and typography/radius/z-index enforcement.
  Read BEFORE any theming, token, or design-standard work.
---

# Theming Surfaces

High-level map of where to look. Open the linked `CLAUDE.md` for details.

## Theme model (read first)
A **theme** is a named, sparse set of token values across the token groups. Each **scope** — the desktop, or one app — selects ONE theme; nothing is stored per token group, so an app cannot own part of a look and inherit the rest. A group a theme never mentions paints that group's schema defaults (in git), never another scope's choice. There are no global presets: the **Default** theme is simply every group's schema defaults.
→ [`plugins/ui/plugins/theme-engine/CLAUDE.md`](../../../plugins/ui/plugins/theme-engine/CLAUDE.md) (model, resolution, copy-on-write edits, missing-theme reporting)

**Sub-themes** are the one exception to "one theme per scope": a region (the website's pages) wraps itself in `<Theme name={subThemeScope(sub)}>` to wear a few extra values (`defineSubTheme` + `ThemeEngine.SubTheme`) over the surrounding theme. Tokens it leaves out come from the surrounding theme, not from the defaults, and popups opened from the region leave it. Use one when part of an app needs different sizes or colours from the rest of the app's UI.

## Design tokens
Umbrella of token-group plugins (color-palette, type-scale, density, shape, shadow, font-family, chart, categorical, sidebar-palette, rich-text-palette). Each declares its CSS variables with schema defaults (`default` + `darkDefault`) via `defineTokenGroup`, registers through `ThemeEngine.TokenGroup`, and contributes a customizer section that edits the scope's theme. Shape, shadow, density and color-adjust add "Fill from…" shortcuts — values copied into the theme, not settings.
→ [`plugins/ui/plugins/tokens/CLAUDE.md`](../../../plugins/ui/plugins/tokens/CLAUDE.md)

## theme-engine
Slots `ThemeEngine.{TokenGroup, VariantGroup, Theme, ThemeSource}`, the per-scope selection config (`themeSelectionConfig`: `theme`, `colorMode`), `useThemes` / `useResolvedTheme` / `useThemeSelections`, and the painter. Code themes are `defineTheme(…)` + `ThemeEngine.Theme` (Default here; `equin` in the website shell).
→ [`plugins/ui/plugins/theme-engine/CLAUDE.md`](../../../plugins/ui/plugins/theme-engine/CLAUDE.md)

## saved-themes · theme-gallery · tweakcn
- **`theme-engine/saved-themes`** — the one table of stored themes (tweakcn imports + custom themes), the resident theme source (boot-hydrated), `useEditTheme` (the one place edits land; editing a read-only theme creates and selects a "<name> copy"), and delete (moves the scopes that select it to Default first). → [`CLAUDE.md`](../../../plugins/ui/plugins/theme-engine/plugins/saved-themes/CLAUDE.md)
- **`theme-engine/theme-gallery`** — the Theme DataView (My themes / Community / Curated) in the customizer and the quick-theme popover; picking a theme selects it for the current scope. → [`CLAUDE.md`](../../../plugins/ui/plugins/theme-engine/plugins/theme-gallery/CLAUDE.md)
- **`tweakcn`** — an importer: converts a tweakcn theme into token-group fragments and saves it as a saved theme. `community-browser` offers the community catalog as a `browse` theme source, plus the import-by-URL customizer section. → [`CLAUDE.md`](../../../plugins/ui/plugins/tweakcn/CLAUDE.md)

## Painting and pre-paint
A subtree's theme = its nearest `data-theme-scope` ancestor. `ThemeInjector` paints the **focused full-surface app's** theme into `:root` (the desktop's when nothing is focused or the focus is a floating window). `AppScopeThemes` (one `<ScopedAppTheme>` per registered app, at `Core.Root`) adds a `[data-theme-scope="app:<id>"]` block for each *other* visible app that has its own theme document; an app without one inherits `:root`. There is no `chrome` scope. Color mode (`<html>.dark`) is a single global class driven by the desktop's `colorMode` (per-scope dark is deferred).

Pre-paint behavior (no FOUC / no theme flash on refresh):
- ThemeInjector consolidates every group's rendered CSS into a localStorage envelope ([`theme-cache.ts`](../../../plugins/ui/plugins/theme-engine/web/internal/theme-cache.ts), key `theme-engine:critical-css`, shape `v: 2`); a generic inline replay script in [`web-core/web/index.html`](../../../plugins/framework/plugins/web-core/web/index.html) re-injects the `<style>` elements (same ids, adopted in place by GroupStyle) before first paint. Key + envelope shape are a contract between those two files — change them together.
- The envelope is keyed by **app path** (`entries: Record<appPath, { styles, mode }>`, `""` = global): the replay script longest-prefix matches the pathname (mirroring apps' `appMatchesPath`) and falls back to `""`, so an app with its own theme replays its own theme instead of whichever app wrote last.
- Each entry stores the **configured** color mode (`"light"|"dark"|"system"`), not a resolved dark bit — the script re-resolves `"system"` against live `matchMedia` each load, so an OS scheme flip between sessions still paints correctly.
- A `resident` theme source (`ThemeEngine.ThemeSource`) returns `undefined` while loading and MUST hydrate via a `Core.Boot` task (see saved-themes' `web/boot.ts` + live-state's `hydrateEndpoint`); the injector skips style injection while any source is pending instead of painting a guess over the replayed CSS.
- `<html>` carries no hardcoded `dark` class — the replay script sets it (cached configured mode re-resolved against the OS, or `prefers-color-scheme` on a cold cache over the `html { background: Canvas }` floor); `ColorModeApplier` owns it after mount.

## Per-app theme = one selection
`themeSelectionConfig` is `scope: "app"` in config_v2: an app gets its own theme by having its own document — "Customize for <App>" in the customizer forks it at runtime (`useScopeMembership` answers "does it have one"), and a committed `config/ui/theme-engine/@app/<id>/theme.jsonc` (e.g. the website's `{ "theme": "equin" }`) sets it in git. To give an app a designed look: `defineTheme` with one `<group>.fragment(…)` per group it cares about, contribute it via `ThemeEngine.Theme`, select it in that file. The light/dark switch is `ui/theme-toggle`.
→ [`plugins/config_v2/CLAUDE.md`](../../../plugins/config_v2/CLAUDE.md) · config at [`plugins/ui/plugins/theme-engine/core/config.ts`](../../../plugins/ui/plugins/theme-engine/core/config.ts)

## Pluggable component variants
Components contribute `ThemeEngine.VariantGroup`; variant sub-plugins are switched from the customizer. Canonical example: `segmented-progress-bar` (dots vs segmented).
→ [`plugins/ui/plugins/segmented-progress-bar/CLAUDE.md`](../../../plugins/ui/plugins/segmented-progress-bar/CLAUDE.md)

## Custom `@utility` classes ⇄ tailwind-merge
Mental model: **every custom `@utility` in `app.css` must be registered with tailwind-merge, or `cn()` silently strips it.** twMerge classifies a class by its *name*; a custom utility whose suffix is a word (`text-caption`, `z-base`, `h-chrome-bar`, …) gets misfiled into a built-in group — `text-*` falls into text-color — and is dropped when a real class from that group appears later in the string (e.g. a Badge variant's `text-muted-foreground` deleting `text-caption`).
The single source of truth is the co-located `/* twmerge: … */` marker on each `@utility` in [`plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css`](../../../plugins/primitives/plugins/css/plugins/ui-kit/web/theme/app.css). A marker either `extend`s a built-in group (single-property, e.g. text roles → `font-size`), names a synthetic `<sg-id>` declared once as `/* @twmerge group <sg-id> excludes: <builtin…> */` (multi-property, e.g. `icon-auto` → w+h+size), or is `standalone -- <reason>` (no collision, e.g. `focus-ring`). `./singularity build` generates `custom-utilities.generated.ts` from those markers and `lib/utils.ts` derives the whole twMerge config from it — never hand-edit the conflict map. See [`ui-kit/web/theme/CLAUDE.md`](../../../plugins/primitives/plugins/css/plugins/ui-kit/web/theme/CLAUDE.md) for the grammar.
To add a `@utility`: declare it in `app.css` **and** add it to a `*_UTILITIES` array + a registry entry. The `app-css-utilities-in-sync` check is **total** — any unregistered `@utility` fails `./singularity check`, so the silent-strip class cannot recur.

## Control size = density inherited from context
A control's size is a **bundle** (height + padding + radius + text + gap + icon), named by a density `ControlSize = xs|sm|md|lg`. Don't size buttons individually.
- **Region primitives declare intrinsic density** (Phase 3): `Bar` (toolbars/headers) is `sm` by construction; `DataTable` is compact (`xs`) by default; `Card` opts in via an explicit `controlSize` prop. This means you declare *where you are* by composing the region primitive — you no longer hand-wrap `ControlSizeProvider` around chrome or table content in the common cases.
- For bespoke markup that isn't a `Bar`/`DataTable`/`Card`, **declare density once** at the root — `defineRenderSlot(id, { controlSize })` (auto-wraps contributions; a host can't forget), or wrap a subtree in `<ControlSizeProvider size>`. Every control inside inherits via React context. Innermost wins.
- Each control maps that density to **its own shape**: text→`control-sm`, icon→`control-icon-sm`, chip→its `sm`. Same height, different shapes.
- **No control has a `size` prop** — `Badge`, `ToggleChip`, `SegmentedControl`, `IconButton`/`PaneIconAction`, and `Button` all derive density *solely* from ambient `ControlSize` (`useControlSize`); passing `size` is a **compile error** on every one of them. There is no longer any per-instance density override anywhere in the app. `Button`'s **shape** (text vs square-icon vs inline) is chosen via a separate `aspect` prop (`"text"` default | `"icon"` | `"inline"`), which carries no density.
- **Text size tracks density too** (Phase 4): `Text` (and `Badge`, `Button`) read the ambient `ControlSize` and step their type rung via the **single** `textStepFor(density)` policy. The rule: **type size steps only at `xs`** — `sm`/`md`/`lg` stay at the comfortable size. Chrome (`Bar` defaults to `sm`) stays legible; only the explicitly-compact `xs` regions (`DataTable`, tree rows, compact `Card`) drop a rung, swapping each `Text` variant for its weight-preserving `-compact` form. No prop — the region owns it.
- Runtime home: web-core `@/theme/control-size` (`ControlSizeProvider`, `useControlSize`, `iconSizeFor`/`textSizeFor`, `textStepFor`/`buttonTextClassFor`) — co-located with the ambient ui-kit, not the primitive, so foundational `Button` reads it without inverting layers. The CSS `control-*` scale + `no-adhoc-control` lint live in the `control-size` primitive.
→ [`plugins/primitives/plugins/control-size/CLAUDE.md`](../../../plugins/primitives/plugins/control-size/CLAUDE.md)

## Design-standard enforcement (lint, fails `./singularity check`)
Use the primitive instead of raw Tailwind classes — each ad-hoc class is banned:
- **Typography** → `<Text variant>`, bans raw `text-{sm,lg,...}`/`leading-*` — [`plugins/primitives/plugins/text/CLAUDE.md`](../../../plugins/primitives/plugins/text/CLAUDE.md)
- **Radius** → `rounded-*` from `--radius`, bans bare/arbitrary — [`plugins/primitives/plugins/radius/CLAUDE.md`](../../../plugins/primitives/plugins/radius/CLAUDE.md)
- **Control size** → `control-{xs,sm,md,lg}` height scale + density-from-context (above) — [`plugins/primitives/plugins/control-size/CLAUDE.md`](../../../plugins/primitives/plugins/control-size/CLAUDE.md)
- **Z-index** → `z-base..z-max`, bans raw `z-*` — [`plugins/primitives/plugins/z-layers/CLAUDE.md`](../../../plugins/primitives/plugins/z-layers/CLAUDE.md)
- **Surface elevation** → `<Surface level={sunken|base|raised|overlay}>` (or `<Card>` / `PopoverContent`), bans open-coded raised (`bg-card`+border+rounded+pad) and overlay (`bg-popover`+shadow+rounded) recipes via `no-adhoc-surface` — [`plugins/primitives/plugins/surface/CLAUDE.md`](../../../plugins/primitives/plugins/surface/CLAUDE.md)
- **Icons** → no direct `lucide-react` — [`plugins/framework/plugins/tooling/plugins/lint/plugins/icon-safety/CLAUDE.md`](../../../plugins/framework/plugins/tooling/plugins/lint/plugins/icon-safety/CLAUDE.md)

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.
