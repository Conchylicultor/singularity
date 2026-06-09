import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BuildDetailSlots } from "@plugins/build/web";
import { BuildProfilingSection } from "./components/build-profiling-section";

export default {
  description:
    "Per-run build profiling Gantt section in the build detail pane.",
  contributions: [
    BuildDetailSlots.Section({
      id: "profiling",
      label: "Profiling",
      component: BuildProfilingSection,
    }),
  ],
} satisfies PluginDefinition;
