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

## Design-standard enforcement (lint, fails `./singularity check`)
Use the primitive instead of raw Tailwind classes — each ad-hoc class is banned:
- **Typography** → `<Text variant>`, bans raw `text-{sm,lg,...}`/`leading-*` — [`plugins/primitives/plugins/text/CLAUDE.md`](../../../plugins/primitives/plugins/text/CLAUDE.md)
- **Radius** → `rounded-*` from `--radius`, bans bare/arbitrary — [`plugins/primitives/plugins/radius/CLAUDE.md`](../../../plugins/primitives/plugins/radius/CLAUDE.md)
- **Control size** → `control-{xs,sm,md,lg}` — [`plugins/primitives/plugins/control-size/CLAUDE.md`](../../../plugins/primitives/plugins/control-size/CLAUDE.md)
- **Z-index** → `z-base..z-max`, bans raw `z-*` — [`plugins/primitives/plugins/z-layers/CLAUDE.md`](../../../plugins/primitives/plugins/z-layers/CLAUDE.md)
- **Icons** → no direct `lucide-react` — [`plugins/framework/plugins/tooling/plugins/lint/plugins/icon-safety/CLAUDE.md`](../../../plugins/framework/plugins/tooling/plugins/lint/plugins/icon-safety/CLAUDE.md)

---
If something was missing from this skill, report it (`add_task` or tell the user) so it gets added.
