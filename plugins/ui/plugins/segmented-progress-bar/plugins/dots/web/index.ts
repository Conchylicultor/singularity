import type { PluginDefinition } from "@core";
import { SegmentedProgressBarSlots } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { DotsRenderer } from "./components/dots-renderer";

export default {
  id: "ui-segmented-progress-bar-dots",
  name: "UI: Segmented Progress Bar — Dots",
  description:
    "Classic dot indicators with connectors. Compact and non-compact modes.",
  contributions: [
    SegmentedProgressBarSlots.Variant({
      id: "dots",
      label: "Dots",
      component: DotsRenderer,
    }),
  ],
} satisfies PluginDefinition;
