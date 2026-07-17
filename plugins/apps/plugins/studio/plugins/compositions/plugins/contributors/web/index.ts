import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { CompositionDetail } from "@plugins/apps/plugins/studio/plugins/compositions/web";
import { ContributorsSection } from "./components/contributors-section";

export default {
  description:
    "Contributor selection section in the composition detail pane: toggle the available frontier with per-chip impact cost.",
  contributions: [
    CompositionDetail.Section({
      id: "contributors",
      label: "Contributors",
      component: ContributorsSection,
    }),
  ],
} satisfies PluginDefinition;
