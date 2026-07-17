import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { CompositionDetail } from "@plugins/apps/plugins/studio/plugins/compositions/web";
import { AutoServeSection } from "./components/auto-serve-section";

export default {
  description:
    "Auto build & serve section in the composition detail pane: toggle the composition's autoBuild flag and open its live serve URL.",
  contributions: [
    CompositionDetail.Section({
      id: "auto-serve",
      label: "Auto build & serve",
      component: AutoServeSection,
    }),
  ],
} satisfies PluginDefinition;
