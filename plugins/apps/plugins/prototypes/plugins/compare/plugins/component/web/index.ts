import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Counterpart } from "@plugins/apps/plugins/prototypes/plugins/compare/web";
import { ComponentCounterpart } from "./components/component-counterpart";

export default {
  description:
    "The component: counterpart kind for the prototype Compare stage: a real app component a plugin exhibits as a specimen (plugin-meta/specimens), looked up by id (component:<id>) and rendered live inside the running app — real slots, config and data — at the stage's shared width.",
  contributions: [
    Counterpart.Kind({
      match: "component",
      label: "Live component",
      example: "component:task-draft/composer",
      component: ComponentCounterpart,
    }),
  ],
} satisfies PluginDefinition;
