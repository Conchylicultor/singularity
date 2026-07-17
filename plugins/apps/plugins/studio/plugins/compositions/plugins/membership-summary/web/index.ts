import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { CompositionDetail } from "@plugins/apps/plugins/studio/plugins/compositions/web";
import { MembershipSummarySection } from "./components/membership-summary-section";

export default {
  description:
    "Bundle-size summary section in the composition detail pane: plugin counts per membership state.",
  contributions: [
    CompositionDetail.Section({
      id: "membership-summary",
      label: "Summary",
      component: MembershipSummarySection,
    }),
  ],
} satisfies PluginDefinition;
