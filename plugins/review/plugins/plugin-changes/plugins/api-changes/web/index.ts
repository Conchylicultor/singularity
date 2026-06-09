import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginChangesSlots } from "@plugins/review/plugins/plugin-changes/web";
import { ApiChangesSection } from "./components/api-changes-section";
import { ApiChangesSummary } from "./components/api-changes-summary";

// No `hasContent`: facet diffs are computed client-side from the
// PluginChanges.DiffRenderer slot (a hook), which a plain predicate can't reach.
// ApiChangesSection/Summary are the single source of truth for their own
// emptiness — each returns null when there are no facet diffs.
export default {
  description:
    "API surface diff section for per-plugin review cards.",
  contributions: [
    PluginChangesSlots.Section({
      id: "api-changes",
      label: "API Changes",
      component: ApiChangesSection,
      summary: ApiChangesSummary,
    }),
  ],
} satisfies PluginDefinition;
