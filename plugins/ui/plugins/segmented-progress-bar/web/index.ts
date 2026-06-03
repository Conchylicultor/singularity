import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/web";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { segmentedProgressBarConfig } from "../core";
import { SegmentedProgressBar } from "./slots";
import { VariantPicker } from "./components/variant-picker";

export { SegmentedProgressBar } from "./components/segmented-progress-bar";
export { SegmentedProgressBar as SegmentedProgressBarSlots } from "./slots";
export type { SegmentedProgressBarVariantContribution } from "./slots";
export type { SegmentedProgressBarProps, Step } from "../core";

export default {
  name: "UI: Segmented Progress Bar",
  description:
    "Pluggable segmented progress bar with switchable visual variants.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: segmentedProgressBarConfig }),
    DynamicEnum.Options({
      field: segmentedProgressBarConfig.fields.variant,
      useOptions: () =>
        SegmentedProgressBar.Variant.useContributions().map((v) => ({
          value: v.id,
          label: v.label,
        })),
    }),
    ThemeEngine.VariantGroup({
      id: "segmented-progress-bar",
      componentLabel: "Segmented Progress Bar",
      component: VariantPicker,
    }),
  ],
} satisfies PluginDefinition;
