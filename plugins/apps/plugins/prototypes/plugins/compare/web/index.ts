import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PrototypeStages } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { Counterpart } from "./slots";
import { CompareStage } from "./components/compare-stage";

export { Counterpart, useCounterpartKinds } from "./slots";
export type {
  CounterpartKindMeta,
  CounterpartKindProps,
  CounterpartResolution,
  WidthChoices,
} from "./types";

export default {
  description:
    'The Compare stage of the prototype detail pane: the prototype mock beside the real app thing it declares it mocks (<meta name="mocks" content="<kind>:<ref>">), both live and both at one shared width the reader changes. Owns the declaration dispatch and the side-by-side chrome; each kind of counterpart (a layout-harness fixture, the running app at a route) is a child plugin contributed into the open Counterpart.Kind registry.',
  contributions: [
    PrototypeStages.Stage({
      id: "compare",
      label: "Compare",
      order: 20,
      component: CompareStage,
    }),
  ],
  slots: {
    kind: Counterpart.Kind,
  },
} satisfies PluginDefinition;
