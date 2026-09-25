import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SegmentedProgressBarSlots } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { PieRenderer } from "./components/pie-renderer";

export default {
  description:
    "Pie progress: a small circle cut into one wedge per step, filled clockwise from the top in accent shades; hover lists every step.",
  contributions: [
    SegmentedProgressBarSlots.Variant({
      id: "pie",
      label: "Pie",
      match: "pie",
      component: PieRenderer,
    }),
  ],
} satisfies PluginDefinition;
