import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { PushSection } from "./components/push-section";
import { pushDetailPane } from "./panes";

export { pushDetailPane } from "./panes";
export { getPushProfiling } from "../shared/endpoints";

export default {
  description: "Push contention profiling for the Gantt debug pane.",
  contributions: [
    Profiling.Section({
      id: "push",
      order: 3,
      component: PushSection,
    }),
    Pane.Register({ pane: pushDetailPane }),
  ],
} satisfies PluginDefinition;
