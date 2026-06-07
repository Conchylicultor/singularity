import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReviewSlots } from "@plugins/review/web";
import { PluginChangesSection } from "./components/plugin-changes-section";
import { PluginChangesSummary } from "./components/plugin-changes-summary";

export { PluginChanges as PluginChangesSlots } from "./slots";
export { usePluginFacetDiffs } from "./use-facet-diffs";
export type { FacetDiff } from "./use-facet-diffs";

export default {
  name: "Review: Plugin Changes",
  description:
    "Shows which plugins were added/modified and their public API diff.",
  contributions: [
    ReviewSlots.Section({
      id: "plugin-changes",
      label: "Plugin Changes",
      component: PluginChangesSection,
      summary: PluginChangesSummary,
    }),
  ],
} satisfies PluginDefinition;
