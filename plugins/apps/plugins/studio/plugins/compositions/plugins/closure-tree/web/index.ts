import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { CompositionDetail } from "@plugins/apps/plugins/studio/plugins/compositions/web";
import { ClosureTreeSection } from "./components/closure-tree-section";

export default {
  description:
    "Closure section in the composition detail pane: the plugin tree tinted by the active composition's membership.",
  contributions: [
    CompositionDetail.Section({
      id: "closure-tree",
      label: "Closure",
      component: ClosureTreeSection,
    }),
  ],
} satisfies PluginDefinition;
