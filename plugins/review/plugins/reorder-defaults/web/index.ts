import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReviewSlots } from "@plugins/review/web";
import { ReorderDefaultsSection } from "./components/reorder-defaults-section";
import { ReorderDefaultsSummary } from "./components/reorder-defaults-summary";

export default {
  description:
    "Lists staged reorder 'default for everyone' edits in the review pane with a before→after diff and Apply / Discard.",
  contributions: [
    ReviewSlots.Section({
      id: "reorder-defaults",
      label: "Reorder Defaults",
      component: ReorderDefaultsSection,
      summary: ReorderDefaultsSummary,
    }),
  ],
} satisfies PluginDefinition;
