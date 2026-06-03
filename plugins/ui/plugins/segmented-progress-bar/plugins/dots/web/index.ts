import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SegmentedProgressBarSlots } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { DotsRenderer } from "./components/dots-renderer";

export default {
  name: "UI: Segmented Progress Bar — Dots",
  description:
    "Classic dot indicators with connectors. Compact and non-compact modes.",
  contributions: [
    SegmentedProgressBarSlots.Variant({
      id: "dots",
      label: "Dots",
      match: "dots",
      component: DotsRenderer,
    }),
  ],
} satisfies PluginDefinition;
