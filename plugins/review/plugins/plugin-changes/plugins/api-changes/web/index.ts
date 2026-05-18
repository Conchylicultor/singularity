import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import { ApiChangesSection, hasDiffs } from "./components/api-changes-section";
import { ApiChangesSummary } from "./components/api-changes-summary";

export default {
  id: "review-plugin-changes-api",
  name: "Review: API Changes",
  description:
    "API surface diff section for per-plugin review cards.",
  contributions: [
    PluginChangesSlots.Section({
      id: "api-changes",
      label: "API Changes",
      component: ApiChangesSection,
      summary: ApiChangesSummary,
      hasContent: (plugin) => hasDiffs(plugin),
    }),
  ],
} satisfies PluginDefinition;
