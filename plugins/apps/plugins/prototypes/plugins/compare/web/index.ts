import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { FrameSource } from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import { REAL_APP_SOURCE } from "@plugins/apps/plugins/prototypes/plugins/compare/core";
import { Counterpart } from "./slots";
import { RealAppSource } from "./components/real-app-source";

export { Counterpart, useCounterpartKinds } from "./slots";
export type {
  CounterpartKindMeta,
  CounterpartKindProps,
  CounterpartResolution,
} from "./types";

export default {
  description:
    'The prototype canvas\'s "Real app" frame: the real app thing a prototype declares it mocks (<meta name="mocks" content="<kind>:<ref>">), resolved through the open Counterpart.Kind registry and contributed as a FrameSource, so the canvas shows it beside the prototype at the canvas\'s size. Each kind of counterpart (a layout-harness fixture, a live component specimen, the running app at a route) is a child plugin.',
  contributions: [
    FrameSource({
      match: REAL_APP_SOURCE,
      addLabel: "Real app",
      component: RealAppSource,
    }),
  ],
  slots: {
    kind: Counterpart.Kind,
  },
} satisfies PluginDefinition;
