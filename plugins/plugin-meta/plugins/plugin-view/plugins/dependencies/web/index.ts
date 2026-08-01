import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  DependsOnCount,
  DependsOnSection,
  UsedByCount,
  UsedBySection,
} from "./components/dependency-tree";

export default {
  description:
    "Deduped cargo-tree-style dependency trees in the plugin detail pane: 'Depends on' (recursive forward deps) and 'Used by' (recursive reverse dependents), each marking soft slot-contributions and collapsing DAG diamonds via first-occurrence dedup.",
  contributions: [
    PluginViewSlots.Section({
      id: "dependencies",
      label: "Depends on",
      component: DependsOnSection,
      summary: DependsOnCount,
    }),
    PluginViewSlots.Section({
      id: "dependents",
      label: "Used by",
      component: UsedBySection,
      summary: UsedByCount,
    }),
  ],
} satisfies PluginDefinition;
