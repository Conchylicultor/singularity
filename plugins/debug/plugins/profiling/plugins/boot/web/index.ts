import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { BootSection } from "./components/boot-section";

export default {
  id: "debug-profiling-boot",
  name: "Boot Profiling",
  description: "Server boot profiling for the Gantt debug pane.",
  contributions: [
    Profiling.Section({
      id: "boot",
      order: 1,
      component: BootSection,
    }),
  ],
} satisfies PluginDefinition;
