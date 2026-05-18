import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ReviewSlots } from "@plugins/review/web";
import { PluginChangesSection } from "./components/plugin-changes-section";

export { PluginChanges as PluginChangesSlots } from "./slots";

export default {
  id: "review-plugin-changes",
  name: "Review: Plugin Changes",
  description:
    "Shows which plugins were added/modified and their public API diff.",
  contributions: [
    ReviewSlots.Section({
      id: "plugin-changes",
      label: "Plugin Changes",
      component: PluginChangesSection,
    }),
  ],
} satisfies PluginDefinition;
