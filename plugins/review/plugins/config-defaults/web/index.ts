import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReviewSlots } from "@plugins/review/web";
import { ConfigDefaultsSection } from "./components/config-defaults-section";
import { ConfigDefaultsSummary } from "./components/config-defaults-summary";

export default {
  description:
    "Lists staged config_v2 'default for everyone' edits in the review pane with a per-config before→after diff (pluggable renderer, generic fallback) and Apply / Discard.",
  contributions: [
    ReviewSlots.Section({
      id: "config-defaults",
      label: "Default for everyone",
      component: ConfigDefaultsSection,
      summary: ConfigDefaultsSummary,
    }),
  ],
} satisfies PluginDefinition;
