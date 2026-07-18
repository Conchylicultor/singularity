import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { OpSection } from "./components/op-section";
import { opDetailPane } from "./panes";

export { opDetailPane } from "./panes";
export { useOpClick } from "./internal/use-op-click";
export { getOpProfiling } from "../shared/endpoints";

export default {
  description:
    "Op contention profiling for the Gantt debug pane: the ops/op-detail endpoints and the Profiling section hosting the unified build/push/check Gantt.",
  contributions: [
    Profiling.Section({
      id: "ops",
      order: 3,
      component: OpSection,
    }),
    Pane.Register({ pane: opDetailPane }),
  ],
} satisfies PluginDefinition;
