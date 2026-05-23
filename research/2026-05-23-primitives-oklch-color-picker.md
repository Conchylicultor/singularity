# ColorPicker: emit oklch + format-cycling ColorInput

## Context

The `ColorPicker` primitive internally represents all colors as OKLCH via the `Color` class, but emits hex strings through `onChange`. This creates two problems:

1. **Wasteful roundtrips** — Both `token-row.tsx` and `shadow-section.tsx` immediately convert the emitted hex back to oklch. The hex conversion is pure overhead.

2. **Theme transform bug** — The theme engine's `transformOklch` (in `transform.ts`) uses a regex that only matches `oklch(...)` strings. User-overridden tokens stored as hex silently skip hue/saturation/lightness adjustments, while preset tokens (stored as oklch) get transformed. Switching to oklch output fixes this.

The `ColorInput` currently only shows hex. Modern color pickers expose multiple formats — we'll add a clickable format label that cycles HEX → OKLCH → HSL.

## Changes

### 1. `ColorPicker` — emit oklch

**File:** `plugins/primitives/plugins/color-picker/web/internal/color-picker.tsx`

In the `emit` callback (line 39-47), change `next.toHex()` → `next.toOklch()`:

```ts
const emit = useCallback(
  (next: Color) => {
    setColor(next);
    const oklch = next.toOklch();
    lastEmitted.current = oklch;
    onChange(oklch);
  },
  [onChange],
);
```

Change default seed (line 27) from `Color.fromHex("#3b82f6")` to `Color.fromOklch(0.623, 0.214, 259.1)`.

### 2. `ColorInput` — format-cycling display

**File:** `plugins/primitives/plugins/color-picker/web/internal/color-input.tsx`

Add a `format` state (`"hex" | "oklch" | "hsl"`) persisted via `useDraft("color-picker-format", "hex", { ttl: 365 * 24 * 60 * 60 * 1000 })` (effectively permanent).

Add a helper:
```ts
type ColorFormat = "hex" | "oklch" | "hsl";
const FORMATS: ColorFormat[] = ["hex", "oklch", "hsl"];

function colorToString(color: Color, fmt: ColorFormat): string {
  if (fmt === "oklch") return color.toOklch();
  if (fmt === "hsl") return color.toHsl();
  return color.toHex();
}
```

The draft string derives from both `color` and `format`. The `useEffect` that syncs draft on `color` change must also depend on `format`. The commit fallback uses `colorToString(color, format)`.

**UI:** Add a clickable format label button to the right of the text input:

```
[swatch] [text-input] [HEX]
```

The label shows the current format in uppercase. Clicking cycles to the next format and immediately updates the draft string. Styled as: `text-[10px] font-mono text-muted-foreground hover:text-foreground uppercase tracking-wider cursor-pointer select-none w-9 text-center`.

Typing in any format always works — `Color.fromCss` already parses hex, oklch, and rgb. No change to the commit/parse logic.

### 3. `SwatchGrid` — use `Color.equals` for comparison

**File:** `plugins/primitives/plugins/color-picker/web/internal/swatch-grid.tsx`

Replace the `normalize` → `toHex()` comparison with `Color.equals`:

```ts
function colorsMatch(a: string, b: string): boolean {
  const ca = Color.fromCss(a);
  const cb = Color.fromCss(b);
  if (!ca || !cb) return a.toLowerCase() === b.toLowerCase();
  return ca.equals(cb);
}
```

After the picker emits oklch, `value` will be oklch while swatches may be hex — `Color.equals` handles cross-format comparison correctly.

### 4. `AlphaSlider` — use oklch for gradient

**File:** `plugins/primitives/plugins/color-picker/web/internal/alpha-slider.tsx`

Line 31: change `color.withAlpha(1).toHex()` → `color.withAlpha(1).toOklch()`. Both work as CSS color values. The HueSlider already uses oklch gradient stops.

### 5. `token-row.tsx` — drop hex roundtrip

**File:** `plugins/ui/plugins/theme-engine/plugins/theme-customizer/web/components/token-row.tsx`

Before (roundtrip):
```ts
// line 73: value={color.toHex()}  — oklch → hex to feed picker
// line 46-49: handleColorChange receives hex, converts back to oklch
```

After (direct):
```ts
<ColorPickerPopover
  value={value}    // pass oklch string directly
  onChange={onValueChange}  // picker now emits oklch, pass through
/>
```

Remove `handleColorChange` entirely. Remove the `Color` import if no longer used (it's still used for `Color.fromCss(value)` on line 43 to detect color-type tokens — keep it).

Line 87: change `{color.toHex()}` display to `{value}` — show the stored oklch string directly.

### 6. `shadow-section.tsx` — simplify color conversion

**File:** `plugins/ui/plugins/tokens/plugins/shadow/web/components/shadow-section.tsx`

The storage format is bare oklch channels `"0 0 0"` (not a CSS `oklch(...)` string), used by `buildShadowTiers`. This stays unchanged.

Replace the two helpers `colorToHex` / `hexToColorParam` with:

```ts
function channelsToOklch(channels: string): string {
  return `oklch(${channels})`;
}

function oklchToChannels(oklchCss: string): string | null {
  const color = Color.fromCss(oklchCss);
  if (!color) return null;
  const l = Math.round(color.l * 1000) / 1000;
  const c = Math.round(color.c * 1000) / 1000;
  const h = Math.round(color.h * 10) / 10;
  return `${l} ${c} ${h}`;
}
```

Update line 185: `const colorOklch = channelsToOklch(mergedParams.color)`.

Update the `ColorPickerPopover` (line 227-238):
```tsx
<ColorPickerPopover
  value={colorOklch}
  onChange={(oklch) => {
    const param = oklchToChannels(oklch);
    if (!param) return;
    if (param === baseParams.color) {
      const next = { ...storedPartial };
      delete next.color;
      writeParams(next, baseParams);
    } else {
      writeParams({ ...storedPartial, color: param }, baseParams);
    }
  }}
/>
```

Remove `Color.fromOklch` and `Color.fromHex` usage — only `Color.fromCss` is needed now.

### 7. `colorField` default — switch to oklch

**File:** `plugins/config_v2/plugins/fields/plugins/color/core/internal/color.ts`

Line 27: `"#000000"` → `"oklch(0 0 0)"`.

Existing stored hex values continue to parse correctly — `Color.fromCss` handles both formats. Values naturally migrate to oklch on first user edit.

## Files modified

| File | Change |
|---|---|
| `plugins/primitives/plugins/color-picker/web/internal/color-picker.tsx` | Emit oklch, update default seed |
| `plugins/primitives/plugins/color-picker/web/internal/color-input.tsx` | Format cycling (hex/oklch/hsl) |
| `plugins/primitives/plugins/color-picker/web/internal/swatch-grid.tsx` | `Color.equals` comparison |
| `plugins/primitives/plugins/color-picker/web/internal/alpha-slider.tsx` | oklch gradient stop |
| `plugins/ui/plugins/theme-engine/plugins/theme-customizer/web/components/token-row.tsx` | Drop hex roundtrip |
| `plugins/ui/plugins/tokens/plugins/shadow/web/components/shadow-section.tsx` | Simplify color helpers |
| `plugins/config_v2/plugins/fields/plugins/color/core/internal/color.ts` | Default `"oklch(0 0 0)"` |

## Backward compatibility

- `Color.fromCss` accepts hex, oklch, rgb — existing stored hex values parse without migration
- CSS `background:` supports oklch natively in all modern browsers
- `canvas.strokeStyle` doesn't reliably support oklch, but draw tools use hardcoded hex (no color picker) — unaffected
- SwatchGrid swatches can remain as hex strings — `Color.equals` comparison handles cross-format

## Verification

1. `./singularity build` — deploy
2. Open theme customizer → pick a color token → edit via the picker → verify stored value is oklch, not hex
3. Verify the hue/saturation/lightness sliders (color adjust) now affect user-overridden tokens (the bug fix)
4. Open the shadow parameter editor → change the shadow color → verify it stores as bare channels
5. Click the format label in ColorInput → verify cycling HEX → OKLCH → HSL → HEX
6. Type an oklch value directly in the input → verify it parses and updates the picker
7. Check the `colorField` config UI (if any config uses it) → verify default renders correctly
