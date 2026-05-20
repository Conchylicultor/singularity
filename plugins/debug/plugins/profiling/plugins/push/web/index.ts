import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { PushSection } from "./components/push-section";

export default {
  id: "debug-profiling-push",
  name: "Push Profiling",
  description: "Push contention profiling for the Gantt debug pane.",
  contributions: [
    Profiling.Section({
      id: "push",
      order: 3,
      component: PushSection,
    }),
  ],
} satisfies PluginDefinition;
