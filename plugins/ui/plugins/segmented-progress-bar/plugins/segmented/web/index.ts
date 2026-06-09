import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SegmentedProgressBarSlots } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { SegmentedRenderer } from "./components/segmented-renderer";

export default {
  description: "Flat 4px-tall pill segments with a single tooltip.",
  contributions: [
    SegmentedProgressBarSlots.Variant({
      id: "segmented",
      label: "Segmented",
      match: "segmented",
      component: SegmentedRenderer,
    }),
  ],
} satisfies PluginDefinition;
