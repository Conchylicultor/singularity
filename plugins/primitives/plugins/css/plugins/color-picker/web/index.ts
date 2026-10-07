import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ColorArea, type ColorAreaProps } from "./internal/color-area";
export { HueSlider, type HueSliderProps } from "./internal/hue-slider";
export { AlphaSlider, type AlphaSliderProps } from "./internal/alpha-slider";
export {
  ColorValueFields,
  type ColorValueFieldsProps,
} from "./internal/color-value-fields";
export {
  SwatchGrid,
  type Swatch,
  type SwatchGridProps,
} from "./internal/swatch-grid";
export { ColorPicker, type ColorPickerProps } from "./internal/color-picker";
export {
  ColorPickerPopover,
  type ColorPickerPopoverProps,
} from "./internal/color-picker-popover";

export default {
  description:
    "Composable color picker primitive: a fitted (always-in-gamut) OKLCH ColorArea, HueSlider, AlphaSlider, per-channel ColorValueFields (HEX / OKLCH / HSL), SwatchGrid with named suggestions, and ColorPicker / ColorPickerPopover with before/after, Reset, eyedropper and a shared Recent row. The Color math (parse, convert, gamut) is in core.",
  contributions: [],
} satisfies PluginDefinition;
