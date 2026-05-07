import type { PluginDefinition } from "@core";
import { SegmentedProgressBarSlots } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { SegmentedRenderer } from "./components/segmented-renderer";

export default {
  id: "ui-segmented-progress-bar-segmented",
  name: "UI: Segmented Progress Bar — Segmented",
  description: "Flat 4px-tall pill segments with a single tooltip.",
  contributions: [
    SegmentedProgressBarSlots.Variant({
      id: "segmented",
      label: "Segmented",
      component: SegmentedRenderer,
    }),
  ],
} satisfies PluginDefinition;
