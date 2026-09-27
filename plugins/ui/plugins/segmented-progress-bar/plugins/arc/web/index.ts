import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SegmentedProgressBarSlots } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { ArcRenderer } from "./components/arc-renderer";

export default {
  description:
    "Arc progress: one unbroken arc on a faint ring, filled clockwise from the top through the current step (step 1 of 4 is a quarter, the last step the whole circle); one colour, no segments. Hover or click lists every step.",
  contributions: [
    SegmentedProgressBarSlots.Variant({
      id: "arc",
      label: "Arc",
      match: "arc",
      component: ArcRenderer,
    }),
  ],
} satisfies PluginDefinition;
