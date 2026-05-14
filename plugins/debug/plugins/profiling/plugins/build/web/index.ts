import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { BuildSection } from "./components/build-section";

export default {
  id: "debug-profiling-build",
  name: "Build Profiling",
  description: "Build step profiling for the Gantt debug pane.",
  contributions: [
    Profiling.Section({
      id: "build",
      order: 0,
      component: BuildSection,
    }),
  ],
} satisfies PluginDefinition;
