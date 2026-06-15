import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { InclusionSection } from "./components/inclusion-section";

export default {
  description:
    "Composition-membership section in the plugin detail pane: state badge, why-included edge path, select/prune impact, and a pin-as-root affordance.",
  contributions: [
    PluginViewSlots.Section({
      id: "inclusion",
      label: "Composition membership",
      component: InclusionSection,
    }),
  ],
} satisfies PluginDefinition;
