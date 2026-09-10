import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Slider, type SliderProps } from "./internal/slider";

export default {
  description:
    "Thin-track range slider: a themed range input that normalizes its own fill against (min, max) — so a range other than 0–1 cannot paint a fill that disagrees with its thumb — and owns the optional `detent` home position, both the tick on the track and the magnetic snap onto it.",
  contributions: [],
} satisfies PluginDefinition;
