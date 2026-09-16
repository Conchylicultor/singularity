import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  PrototypeDetailScope,
  PrototypeStages,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { Counterpart } from "./slots";
import { CompareAgainstProvider, COMPARE_STAGE_ID } from "./against";
import { CompareStage } from "./components/compare-stage";

export { Counterpart, useCounterpartKinds } from "./slots";
export { useCompareAgainst } from "./against";
export type { CompareAgainst } from "./against";
export { MockFrame } from "./components/mock-frame";
export type {
  CounterpartKindMeta,
  CounterpartKindProps,
  CounterpartPreset,
  CounterpartResolution,
  CounterpartSpec,
  WidthChoices,
} from "./types";

export default {
  description:
    'The Compare stage of the prototype detail pane: the document on screen beside a counterpart, both live and both at one shared width the reader changes. The counterpart is the real app thing the prototype declares it mocks (<meta name="mocks" content="<kind>:<ref>">), or one the reader picks in the stage\'s Against control or through a row action (another version of the prototype). Owns the dispatch, the picked-counterpart state and the side-by-side chrome; each kind of counterpart (a layout-harness fixture, the running app at a route, a version of the prototype) is a child plugin contributed into the open Counterpart.Kind registry.',
  contributions: [
    PrototypeStages.Stage({
      id: COMPARE_STAGE_ID,
      label: "Compare",
      order: 20,
      component: CompareStage,
    }),
    // What Compare compares against, shared by the pane's header, its version
    // list's row actions and the stage.
    PrototypeDetailScope({ component: CompareAgainstProvider }),
  ],
  slots: {
    kind: Counterpart.Kind,
  },
} satisfies PluginDefinition;
