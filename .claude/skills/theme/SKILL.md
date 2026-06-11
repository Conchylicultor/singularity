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
- A **toolbar/slot declares density once** — `defineRenderSlot(id, { controlSize })` (auto-wraps contributions; a host can't forget), or wrap a subtree in `<ControlSizeProvider size>`. Every control inside inherits via React context.
- Each control maps that density to **its own shape**: text→`control-sm`, icon→`control-icon-sm`, chip→its `sm`. Same height, different shapes.
- Controls (`Button`/`IconButton`/`PaneIconAction`/`ToggleChip`) **omit `size`** to inherit. An explicit `size` is the escape hatch — fine for standalone controls (forms/dialogs), wrong inside a toolbar.
- Runtime home: web-core `@/theme/control-size` (`ControlSizeProvider`, `useControlSize`, `iconSizeFor`/`textSizeFor`) — co-located with the ambient ui-kit, not the primitive, so foundational `Button` reads it without inverting layers. The CSS `control-*` scale + `no-adhoc-control` lint live in the `control-size` primitive.
→ [`plugins/primitives/plugins/control-size/CLAUDE.md`](../../../plugins/primitives/plugins/control-size/CLAUDE.md)

## Design-standard enforcement (lint, fails `./singularity check`)
Use the primitive instead of raw Tailwind classes — each ad-hoc class is banned:
- **Typography** → `<Text variant>`, bans raw `text-{sm,lg,...}`/`leading-*` — [`plugins/primitives/plugins/text/CLAUDE.md`](../../../plugins/primitives/plugins/text/CLAUDE.md)
- **Radius** → `rounded-*` from `--radius`, bans bare/arbitrary — [`plugins/primitives/plugins/radius/CLAUDE.md`](../../../plugins/primitives/plugins/radius/CLAUDE.md)
- **Control size** → `control-{xs,sm,md,lg}` height scale + density-from-context (above) — [`plugins/primitives/plugins/control-size/CLAUDE.md`](../../../plugins/primitives/plugins/control-size/CLAUDE.md)
- **Z-index** → `z-base..z-max`, bans raw `z-*` — [`plugins/primitives/plugins/z-layers/CLAUDE.md`](../../../plugins/primitives/plugins/z-layers/CLAUDE.md)
- **Icons** → no direct `lucide-react` — [`plugins/framework/plugins/tooling/plugins/lint/plugins/icon-safety/CLAUDE.md`](../../../plugins/framework/plugins/tooling/plugins/lint/plugins/icon-safety/CLAUDE.md)

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.
