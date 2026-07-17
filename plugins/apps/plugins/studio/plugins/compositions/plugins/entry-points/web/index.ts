import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { CompositionDetail } from "@plugins/apps/plugins/studio/plugins/compositions/web";
import { EntryPointsSection } from "./components/entry-points-section";

export default {
  description:
    "Entry-point editor section in the composition detail pane: the draft's entry plugins, with add / remove.",
  contributions: [
    CompositionDetail.Section({
      id: "entry-points",
      label: "Entry points",
      component: EntryPointsSection,
    }),
  ],
} satisfies PluginDefinition;
