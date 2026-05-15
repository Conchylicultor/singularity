import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Color, MAX_CHROMA } from "./internal/color";
export { ColorArea, type ColorAreaProps } from "./internal/color-area";
export { HueSlider, type HueSliderProps } from "./internal/hue-slider";
export { AlphaSlider, type AlphaSliderProps } from "./internal/alpha-slider";
export { ColorInput, type ColorInputProps } from "./internal/color-input";
export { SwatchGrid, type SwatchGridProps } from "./internal/swatch-grid";
export { ColorPicker, type ColorPickerProps } from "./internal/color-picker";
export {
  ColorPickerPopover,
  type ColorPickerPopoverProps,
} from "./internal/color-picker-popover";

export default {
  id: "primitives/color-picker",
  name: "ColorPicker",
  description:
    "Composable color picker primitive: ColorArea, HueSlider, AlphaSlider, ColorInput, SwatchGrid, ColorPicker, and ColorPickerPopover.",
  contributions: [],
} satisfies PluginDefinition;
