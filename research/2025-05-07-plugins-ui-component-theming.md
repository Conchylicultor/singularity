# UI Component Theming System

## Context

We want a plugin-based UI component system where visual components (segmented progress bar, buttons, tabs, etc.) are theme-agnostic. Consumers call `<SegmentedProgressBar />` and the active visual variant is injected via the plugin contribution system. Designers implement variants as sub-plugins. The first use case is the conversation progress bar with two designs (dots, segmented bar) from `research/2026-05-07-conversations-progress-bar-designs.md`.

## Architecture

### Answers to open questions

| Question | Answer |
|---|---|
| **Folder structure** | `plugins/ui/` umbrella; `plugins/ui/plugins/theme-engine/` for central settings; `plugins/ui/plugins/<component>/` for each component with variant sub-plugins |
| **Where the chosen theme lives** | Per-component config field via `defineConfig({ variant: "dots" })` stored in the `config` table (per-worktree Postgres, propagates via DB fork) |
| **How the theme gets injected** | Each component defines a `Variant` slot; variant sub-plugins contribute renderers; the component reads active variant ID from config and picks the matching contribution |
| **Typing** | End-to-end typed via generic `<T extends string>` on the public component — `activeStep` is constrained to match step IDs at the call site |
| **Granularity** | v1: variant selection (pick a renderer). v2: per-variant token customization (CSS custom properties). v3: theme presets (named bundles of variant + token choices across all components) |

### Layers

```
Layer 3 (future): Theme presets — named bundles that batch-set all variants
Layer 2 (future): Token customization — CSS vars overridden per variant
Layer 1 (this PR): Variant selection — pick which renderer draws the component
```

### Dependency graph

```
conversation-progress → @plugins/ui/plugins/segmented-progress-bar/web  (SegmentedProgressBar component)
                              ↓ (reads config)
                        @plugins/config/web  (useConfigValues)

dots variant → @plugins/ui/plugins/segmented-progress-bar/web  (slot import)
segmented variant → @plugins/ui/plugins/segmented-progress-bar/web  (slot import)

segmented-progress-bar → @plugins/ui/plugins/theme-engine/web  (VariantGroup slot)
theme-engine → @plugins/config/web  (Config.Section)
```

No cycles. Theme-engine never imports from component plugins.

## Folder structure

```
plugins/ui/
  web/index.ts                                       # umbrella plugin (label only)
  plugins/
    theme-engine/
      web/
        index.ts                                     # plugin def; contributes Config.Section
        slots.ts                                     # ThemeEngine.VariantGroup slot
        components/variant-settings.tsx              # Settings section: renders all VariantGroup pickers
      shared/index.ts                                # (empty for now; future: preset types)
    segmented-progress-bar/
      shared/
        index.ts                                     # SegmentedProgressBarProps, Step types
      web/
        index.ts                                     # plugin def; exports SegmentedProgressBar + slot; contributes VariantGroup
        slots.ts                                     # SegmentedProgressBar.Variant slot
        components/
          segmented-progress-bar.tsx                 # public <SegmentedProgressBar /> component
          variant-picker.tsx                         # picker UI contributed to ThemeEngine.VariantGroup
        internal/
          config.ts                                  # defineConfig({ variant: "dots" })
      server/
        index.ts                                     # minimal: registers config descriptor
      plugins/
        dots/
          web/
            index.ts                                 # contributes SegmentedProgressBar.Variant
            components/dots-renderer.tsx             # moved from conversation-progress
        segmented/
          web/
            index.ts                                 # contributes SegmentedProgressBar.Variant
            components/segmented-renderer.tsx        # new, from research doc
```

## Detailed design

### 1. Typed props — `plugins/ui/plugins/segmented-progress-bar/shared/index.ts`

```ts
export interface Step {
  id: string;
  label: string;
}

export interface SegmentedProgressBarProps<T extends string = string> {
  steps: readonly { id: T; label: string }[];
  activeStep: T;
  compact?: boolean;
}
```

The generic `T` provides end-to-end type safety: when consumers pass a `const` steps array, TypeScript infers `T` from the step IDs and constrains `activeStep` to match. The `= string` default keeps the slot's `ComponentType<SegmentedProgressBarProps>` usable without explicit instantiation.

Example at the call site:
```ts
const STEPS = [
  { id: "research", label: "Research" },
  { id: "design", label: "Design" },
] as const;

<SegmentedProgressBar steps={STEPS} activeStep="research" />  // ✓ — T inferred as "research" | "design"
<SegmentedProgressBar steps={STEPS} activeStep="invalid" />   // ✗ — type error
```

### 2. Variant slot — `plugins/ui/plugins/segmented-progress-bar/web/slots.ts`

```ts
import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { SegmentedProgressBarProps } from "../shared";

export interface SegmentedProgressBarVariantContribution {
  id: string;
  label: string;
  component: ComponentType<SegmentedProgressBarProps>;
}

export const SegmentedProgressBar = {
  Variant: defineSlot<SegmentedProgressBarVariantContribution>("ui.segmented-progress-bar.variant"),
};
```

Standard `defineSlot` — same pattern as `FilePane.Renderer` and `JsonlViewer.EventRenderer`. Variant renderers accept `SegmentedProgressBarProps` (with `T = string` — the internal dispatch erases the generic since all variant implementations must handle arbitrary steps).

### 3. Config — `plugins/ui/plugins/segmented-progress-bar/web/internal/config.ts`

```ts
import { defineConfig } from "@plugins/config/shared";

export const segmentedProgressBarConfig = defineConfig({
  variant: { default: "dots", label: "Segmented Progress Bar style" },
});
```

Single `string` scalar field. Stored in the config table as `ui-segmented-progress-bar.variant`.

### 4. Public component — `plugins/ui/plugins/segmented-progress-bar/web/components/segmented-progress-bar.tsx`

```tsx
import { useConfigValues } from "@plugins/config/web";
import { SegmentedProgressBar as Slots } from "../slots";
import { segmentedProgressBarConfig } from "../internal/config";
import type { SegmentedProgressBarProps } from "../../shared";

const PLUGIN_ID = "ui-segmented-progress-bar";

export function SegmentedProgressBar<T extends string>(props: SegmentedProgressBarProps<T>) {
  const variants = Slots.Variant.useContributions();
  const { variant: activeId } = useConfigValues(segmentedProgressBarConfig, PLUGIN_ID);
  const active = variants.find((v) => v.id === activeId) ?? variants[0] ?? null;
  if (!active) return null;
  const Renderer = active.component;
  return <Renderer {...(props as SegmentedProgressBarProps)} />;
}
```

The generic `T` on the public API provides compile-time safety for consumers. The internal dispatch widens to `string` (via the cast) since variant renderers are registered dynamically and handle any steps array.

### 5. Dots variant — `plugins/ui/plugins/segmented-progress-bar/plugins/dots/web/components/dots-renderer.tsx`

Direct adaptation of the existing `ProgressDots` from `conversation-progress`, rewritten to accept `SegmentedProgressBarProps`. Computes `currentIndex = steps.findIndex(s => s.id === activeStep)`. Same visual output.

### 6. Segmented variant — `plugins/ui/plugins/segmented-progress-bar/plugins/segmented/web/components/segmented-renderer.tsx`

From `research/2026-05-07-conversations-progress-bar-designs.md` Design 2, adapted to generic props. In compact mode, renders the same 40px bar (already compact). In non-compact, same 40px bar.

### 7. ThemeEngine.VariantGroup slot — `plugins/ui/plugins/theme-engine/web/slots.ts`

```ts
import { defineSlot } from "@core";
import type { ComponentType } from "react";

export interface VariantGroupContribution {
  componentId: string;
  componentLabel: string;
  component: ComponentType;
}

export const ThemeEngine = {
  VariantGroup: defineSlot<VariantGroupContribution>("ui.theme-engine.variant-group"),
};
```

Each component plugin contributes a picker. The theme-engine Settings section renders all pickers.

### 8. Variant picker — `plugins/ui/plugins/segmented-progress-bar/web/components/variant-picker.tsx`

Small React component that:
- Calls `SegmentedProgressBar.Variant.useContributions()` to list available variants
- Calls `useConfigValues(segmentedProgressBarConfig, PLUGIN_ID)` to get the active selection
- Renders a radio group / select
- Calls `setConfigValue("ui-segmented-progress-bar.variant", id)` on change

Contributed to `ThemeEngine.VariantGroup` by the segmented-progress-bar plugin.

### 9. Migration of conversation-progress

Replace direct `<ProgressDots>` calls with the generic component:

```tsx
// progress-bar-toolbar.tsx / progress-bar-row.tsx
import { SegmentedProgressBar } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { PHASE_ORDER, PHASE_LABELS } from "../../shared/schemas";

const STEPS = PHASE_ORDER.map(p => ({ id: p, label: PHASE_LABELS[p] }));
//    ^? readonly { id: "research" | "design" | "implementation" | "pushed"; label: string }[]

// In component — activeStep is typed to ConversationPhase, which matches step IDs:
<SegmentedProgressBar steps={STEPS} activeStep={progress.phase} compact={compact} />
```

Delete `progress-dots.tsx` from `conversation-progress` (the code moves to dots variant plugin).

### 10. Server config registration — `plugins/ui/plugins/segmented-progress-bar/server/index.ts`

```ts
import type { PluginDefinition } from "@core";
import { segmentedProgressBarConfig } from "../web/internal/config";

export default {
  id: "ui-segmented-progress-bar",
  config: segmentedProgressBarConfig,
} satisfies PluginDefinition;
```

Minimal server barrel — just registers the config field so the PATCH endpoint validates it.

## Implementation order

1. `plugins/ui/web/index.ts` — umbrella plugin definition
2. `plugins/ui/plugins/theme-engine/web/slots.ts` — VariantGroup slot
3. `plugins/ui/plugins/theme-engine/web/components/variant-settings.tsx` — settings section
4. `plugins/ui/plugins/theme-engine/web/index.ts` — plugin def with Config.Section
5. `plugins/ui/plugins/segmented-progress-bar/shared/index.ts` — generic props types
6. `plugins/ui/plugins/segmented-progress-bar/web/internal/config.ts` — config descriptor
7. `plugins/ui/plugins/segmented-progress-bar/web/slots.ts` — Variant slot
8. `plugins/ui/plugins/segmented-progress-bar/web/components/segmented-progress-bar.tsx` — public component
9. `plugins/ui/plugins/segmented-progress-bar/web/components/variant-picker.tsx` — settings picker
10. `plugins/ui/plugins/segmented-progress-bar/web/index.ts` — plugin def
11. `plugins/ui/plugins/segmented-progress-bar/server/index.ts` — config registration
12. `plugins/ui/plugins/segmented-progress-bar/plugins/dots/web/` — dots renderer (move from conversation-progress)
13. `plugins/ui/plugins/segmented-progress-bar/plugins/segmented/web/` — segmented renderer (new)
14. Update `conversation-progress` toolbar/row to use `<SegmentedProgressBar />`
15. Delete old `progress-dots.tsx`
16. Add `package.json` for each new plugin directory

## Verification

1. `./singularity build` succeeds (no import errors, config registered)
2. Visit `http://<worktree>.localhost:9000` — progress bars render with dots variant (default)
3. Open Settings → UI Component Variants → change Segmented Progress Bar to "Segmented"
4. Verify the toolbar and sidebar row both switch to the segmented bar
5. Reload the page — selection persists
6. `./singularity check` passes (plugin boundaries, eslint)
7. Type-check: passing an invalid `activeStep` string produces a compile error
