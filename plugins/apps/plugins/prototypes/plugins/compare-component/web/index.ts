import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PrototypeStages } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { ComponentStage } from "./components/component-stage";

export default {
  description:
    "The Component stage of the prototype detail pane: the prototype mock and the real app component it declares it mocks (a layout-harness fixture, named in the prototype's own <meta name=\"mocks\">), side by side, both live and both at one shared width the reader changes. Contributed into the gallery's open stage slot, so this is the only place prototypes are tied to app internals.",
  contributions: [
    PrototypeStages.Stage({
      id: "component",
      label: "Component",
      order: 30,
      component: ComponentStage,
    }),
  ],
} satisfies PluginDefinition;
