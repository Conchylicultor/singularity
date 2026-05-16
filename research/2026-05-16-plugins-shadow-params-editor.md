# Shadow Section Redesign: Params Editor + Visual Previews

## Context

The shadow section in the theme customizer currently shows raw `box-shadow` strings in text inputs (via `TokenRow`) with no visual preview of what each tier looks like. Meanwhile, all built-in presets are defined using `ShadowParams` (color, opacity, blur, spread, offsetX, offsetY) passed to `buildShadowTiers()`. The user should edit the source parameters — not the computed output — and see visual previews of each tier.

This mirrors tweakcn's approach where shadow customization exposes the underlying parameters (color, opacity, blur, spread, offsets) rather than raw CSS strings.

## Design

### Config format

Add a `params` field to `shadowConfig` storing `Partial<ShadowParams>` as JSON. The existing `overrides` field remains unchanged — it continues to hold `{ light: Record<string,string>, dark: Record<string,string> }` for ThemeInjector compatibility.

When the user edits a param:
1. Merge the partial params over the active preset's base params → full `ShadowParams`
2. Call `buildShadowTiers(merged)` → 8 token strings
3. Write token strings into `overrides.light` + `overrides.dark`
4. Write the partial into `params`

When the user resets, both `params` and `overrides` are cleared to `"{}"`.

### Presets expose their params

Each preset definition includes a `params: ShadowParams` field so the editor can display the active preset's base values as placeholders/defaults.

The `ShadowPresetContribution` slot interface gets an optional `params?: ShadowParams` field for backward compatibility with any external contributors.

### UI layout

```
Shadow
[■ Default] [■ None] [■ Elevated] [■ Heavy]     ← preset picker (unchanged)

▾ Parameters                                      ← collapsible, default open
  Color    [■ swatch + popover]  [↩]             ← ColorPickerPopover
  Opacity  [0.10              ]  [↩]             ← number input
  Blur     [3px               ]  [↩]             ← text input
  Spread   [0px               ]  [↩]             ← text input
  Offset X [0                 ]  [↩]             ← text input
  Offset Y [1px               ]  [↩]             ← text input

▸ Preview                                         ← collapsible, default closed
  2XS [□·····]  XS [□·····]  SM [□·····]  ... [□·····]  2XL [□·····]
```

Each preview swatch: a `size-8 rounded bg-background border border-border` box with the token's `boxShadow` applied. Arranged in a flex-wrap row so all 8 tiers are visible at a glance with their label below.

The token rows section (raw strings) is removed — replaced by the preview grid. The params editor is the primary interaction surface.

### Color editing

The `color` field in `ShadowParams` is an oklch color string like `"0 0 0"`. The editor renders a `ColorPickerPopover` (from `@plugins/primitives/plugins/color-picker/web`) for it. On change, the popover returns hex which we convert to oklch channel values (lightness, chroma, hue — without the alpha, since opacity is separate).

## Files to change

| File | Change |
|------|--------|
| `plugins/ui/plugins/tokens/plugins/shadow/shared/config.ts` | Add `params` field |
| `plugins/ui/plugins/tokens/plugins/shadow/web/presets.ts` | Extract params into named constants, add `params` field to each preset |
| `plugins/ui/plugins/tokens/plugins/shadow/web/slots.ts` | Add optional `params?: ShadowParams` to `ShadowPresetContribution` |
| `plugins/ui/plugins/tokens/plugins/shadow/web/components/shadow-section.tsx` | Full rewrite: params editor + preview grid |

No changes to: `shared/shadow-map.ts`, `shared/group.ts`, `web/index.ts`, `web/components/shadow-picker.tsx`, ThemeInjector, or any other plugin.

## Implementation details

### `shared/config.ts`

```ts
export const shadowConfig = defineConfig({
  preset: { default: "default", label: "Shadow preset" },
  params: { default: "{}", label: "Shadow params overrides" },
  overrides: { default: "{}", label: "Shadow overrides" },
});
```

### `web/presets.ts`

```ts
const defaultParams: ShadowParams = { color: "0 0 0", opacity: 0.1, blur: "3px", spread: "0px", offsetX: "0", offsetY: "1px" };
export const defaultPreset: Preset = {
  id: "default", label: "Default", params: defaultParams,
  ...both(buildShadowTiers(defaultParams)),
};
// same pattern for none, elevated, heavy
```

### `shadow-section.tsx` — key helpers

```ts
function getActiveParams(active: ShadowPresetContribution | undefined, storedParams: string): ShadowParams {
  const base: ShadowParams = active?.params ?? DEFAULT_PARAMS;
  const partial = JSON.parse(storedParams || "{}") as Partial<ShadowParams>;
  return { ...base, ...partial };
}

function setParam(key: keyof ShadowParams, value: string | number, currentParams: string, baseParams: ShadowParams) {
  const partial = JSON.parse(currentParams || "{}") as Partial<ShadowParams>;
  (partial as Record<string, unknown>)[key] = value;
  const merged = { ...baseParams, [key]: value };
  const tokens = buildShadowTiers(merged);
  void setConfigValue(`${PLUGIN_ID}.params`, JSON.stringify(partial));
  void setConfigValue(`${PLUGIN_ID}.overrides`, JSON.stringify({ light: tokens, dark: tokens }));
}
```

### Color picker integration

The color param is stored as oklch channel values `"L C H"` (e.g. `"0 0 0"` for black). The `Color` class from the color-picker plugin can parse and convert. The popover shows the current color; on change we extract L/C/H channels and store as the space-separated string.

### Migration

Old per-token `overrides` continue working (ThemeInjector still applies them). When `params` is `"{}"`, the params editor shows preset defaults. If a user had old overrides, they'll see the preset param values in the editor but the old overrides still apply until they touch any param field (which overwrites `overrides` entirely). This is acceptable — the old per-token editing was the previous UX; the new UX replaces it.

## Verification

1. `./singularity build`
2. Open theme customizer, navigate to Shadow section
3. Verify preset picker still works (switching presets updates the params display and all shadows)
4. Edit opacity → verify all shadow tokens recompute (check via devtools CSS vars)
5. Edit color via color picker → verify colored shadows appear
6. Click reset → verify returns to preset defaults
7. Open Preview collapsible → verify 8 boxes show correct shadow depths
8. Switch presets while having overrides → verify params reset to new preset values
