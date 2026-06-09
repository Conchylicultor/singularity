import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { RuntimeSection } from "./components/runtime-section";

export default {
  description: "Runtime HTTP/DB/loader profiling tables in the Gantt debug pane.",
  contributions: [
    Profiling.Section({
      id: "runtime",
      order: 5,
      component: RuntimeSection,
    }),
  ],
} satisfies PluginDefinition;
