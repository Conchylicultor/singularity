import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { VariantPicker } from "./components/variant-picker";

export { SegmentedProgressBar } from "./components/segmented-progress-bar";
export { SegmentedProgressBar as SegmentedProgressBarSlots } from "./slots";
export type { SegmentedProgressBarVariantContribution } from "./slots";
export type { SegmentedProgressBarProps, Step } from "../core";

export default {
  id: "ui-segmented-progress-bar",
  name: "UI: Segmented Progress Bar",
  description:
    "Pluggable segmented progress bar with switchable visual variants.",
  contributions: [
    ThemeEngine.VariantGroup({
      componentId: "segmented-progress-bar",
      componentLabel: "Segmented Progress Bar",
      component: VariantPicker,
    }),
  ],
} satisfies PluginDefinition;
