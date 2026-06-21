---
name: theme
description: >
  Map of theming surfaces — design tokens, tweakcn presets, per-app theme
  config, and typography/radius/z-index enforcement. Read BEFORE any theming,
  token, or design-standard work.
---

# Theming Surfaces

High-level map of where to look. Open the linked `CLAUDE.md` for details.

## Design tokens
Umbrella of CSS token-group plugins (color-palette, typography, density, shape/radius, shadow, chart, categorical, sidebar-palette, ...), each with switchable presets. Ships global presets (Default, Ocean, Warm).
→ [`plugins/ui/plugins/tokens/CLAUDE.md`](../../../plugins/ui/plugins/tokens/CLAUDE.md)

## tweakcn presets
Imports tweakcn themes as dynamic presets across all token groups; `community-browser` sub-plugin browses + applies the community catalog.
→ [`plugins/ui/plugins/tweakcn/CLAUDE.md`](../../../plugins/ui/plugins/tweakcn/CLAUDE.md)

## theme-engine
Central slot bus (`ThemeEngine.{TokenGroup,VariantGroup,GlobalPreset,PresetSource,ColorTransform}`) and the customizer settings pane. Owns the per-app theme config (`globalPreset`, `colorMode`).
→ [`plugins/ui/plugins/theme-engine/CLAUDE.md`](../../../plugins/ui/plugins/theme-engine/CLAUDE.md)

Theme model (one rule): a subtree's theme = its nearest `data-theme-scope` ancestor, and **`:root` carries the stable global "desktop" theme** (focus-independent, fed by the unscoped/global config). `ThemeInjector` writes the desktop `:root`/`.dark` blocks from the global config — it does NOT track the focused app. Because an unforked app's theme *is* the `:root` theme, only **forked** apps emit a `[data-theme-scope="app:<id>"]` override block (via theme-engine's `AppScopeThemes`, one `<ScopedAppTheme>` per registered app, mounted at `Core.Root`); unforked apps inherit `:root`. There is no `chrome` scope — chrome surfaces with no app to track (floating / no-app fallback) simply inherit the desktop `:root`. Color mode (`<html>.dark`) is a single global class driven by the global config (per-scope dark is deferred).

Pre-paint behavior (no FOUC / no preset flash on refresh):
- ThemeInjector consolidates every group's rendered CSS into a localStorage envelope ([`theme-cache.ts`](../../../plugins/ui/plugins/theme-engine/web/internal/theme-cache.ts), key `theme-engine:critical-css`, shape `v: 2`); a generic inline replay script in [`web-core/web/index.html`](../../../plugins/framework/plugins/web-core/web/index.html) re-injects the `<style>` elements (same ids, adopted in place by GroupStyle) before first paint. Key + envelope shape are a contract between those two files — change them together.
- The envelope is keyed by **app path** (`entries: Record<appPath, { styles, mode }>`, `""` = global): the replay script longest-prefix matches the pathname (mirroring apps' `appMatchesPath`) and falls back to `""`, so a forked app's reload replays its own theme instead of whichever app wrote last. An unforked app writes both its own key and `""` (its CSS *is* the global theme); a forked app never clobbers `""`.
- Each entry stores the **configured** color mode (`"light"|"dark"|"system"`), not a resolved dark bit — the script re-resolves `"system"` against live `matchMedia` each load, so an OS scheme flip between sessions still paints correctly.
- Dynamic preset sources (`ThemeEngine.PresetSource.usePresets`) return `undefined` while loading and MUST hydrate via a `Core.Boot` task (see tweakcn's `web/boot.ts` + live-state's `hydrateEndpoint`); the injector skips style injection while any source is pending instead of falling back to the default preset and overwriting the replayed CSS.
- `<html>` carries no hardcoded `dark` class — the replay script sets it (cached configured mode re-resolved against the OS, or `prefers-color-scheme` on a cold cache over the `html { background: Canvas }` floor); `ColorModeApplier` owns it after mount.

## Per-app theme via config_v2
Theme config uses `scope: "app"` + `useScopeForked`, so each app carries its own preset and light/dark mode. The light/dark toggle lives in the top-level `theme` plugin.
→ [`plugins/config_v2/CLAUDE.md`](../../../plugins/config_v2/CLAUDE.md) · config at [`plugins/ui/plugins/theme-engine/core/config.ts`](../../../plugins/ui/plugins/theme-engine/core/config.ts)

## Pluggable component variants
Components contribute `ThemeEngine.VariantGroup`; variant sub-plugins are switched from the customizer. Canonical example: `segmented-progress-bar` (dots vs segmented).
→ [`plugins/ui/plugins/segmented-progress-bar/CLAUDE.md`](../../../plugins/ui/plugins/segmented-progress-bar/CLAUDE.md)

## Custom `@utility` classes ⇄ tailwind-merge
Mental model: **every custom `@utility` in `app.css` must be registered with tailwind-merge, or `cn()` silently strips it.** twMerge classifies a class by its *name*; a custom utility whose suffix is a word (`text-caption`, `z-base`, `h-chrome-bar`, …) gets misfiled into a built-in group — `text-*` falls into text-color — and is dropped when a real class from that group appears later in the string (e.g. a Badge variant's `text-muted-foreground` deleting `text-caption`).
The single source of truth is `CUSTOM_UTILITY_REGISTRY` in [`plugins/framework/plugins/web-core/web/theme/custom-utilities.ts`](../../../plugins/framework/plugins/web-core/web/theme/custom-utilities.ts): each utility family declares its twMerge wiring as data — `extend` a built-in group (mutual conflict, e.g. text roles → `font-size`), a synthetic `group` + `conflictsWith` (multi-property, e.g. `icon-auto` → w+h+size), or `standalone` with a reason (no collision, e.g. `focus-ring`). `lib/utils.ts` *derives* the whole twMerge config from the registry — never hand-edit the conflict map.
To add a `@utility`: declare it in `app.css` **and** add it to a `*_UTILITIES` array + a registry entry. The `app-css-utilities-in-sync` check is **total** — any unregistered `@utility` fails `./singularity check`, so the silent-strip class cannot recur.

## Control size = density inherited from context
A control's size is a **bundle** (height + padding + radius + text + gap + icon), named by a density `ControlSize = xs|sm|md|lg`. Don't size buttons individually.
- **Region primitives declare intrinsic density** (Phase 3): `Bar` (toolbars/headers) is `sm` by construction; `DataTable` is compact (`xs`) by default; `Card` opts in via an explicit `controlSize` prop. This means you declare *where you are* by composing the region primitive — you no longer hand-wrap `ControlSizeProvider` around chrome or table content in the common cases.
- For bespoke markup that isn't a `Bar`/`DataTable`/`Card`, **declare density once** at the root — `defineRenderSlot(id, { controlSize })` (auto-wraps contributions; a host can't forget), or wrap a subtree in `<ControlSizeProvider size>`. Every control inside inherits via React context. Innermost wins.
- Each control maps that density to **its own shape**: text→`control-sm`, icon→`control-icon-sm`, chip→its `sm`. Same height, different shapes.
- **No control has a `size` prop** — `Badge`, `ToggleChip`, `SegmentedControl`, `IconButton`/`PaneIconAction`, and `Button` all derive density *solely* from ambient `ControlSize` (`useControlSize`); passing `size` is a **compile error** on every one of them. There is no longer any per-instance density override anywhere in the app. `Button`'s **shape** (text vs square-icon vs inline) is chosen via a separate `aspect` prop (`"text"` default | `"icon"` | `"inline"`), which carries no density.
- Runtime home: web-core `@/theme/control-size` (`ControlSizeProvider`, `useControlSize`, `iconSizeFor`/`textSizeFor`) — co-located with the ambient ui-kit, not the primitive, so foundational `Button` reads it without inverting layers. The CSS `control-*` scale + `no-adhoc-control` lint live in the `control-size` primitive.
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
