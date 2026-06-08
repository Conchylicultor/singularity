import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { BuildSection } from "./components/build-section";
import { buildProfileDetailPane } from "./panes";

export { buildProfileDetailPane } from "./panes";

export default {
  name: "Build Profiling",
  description: "Build step profiling for the Gantt debug pane.",
  contributions: [
    Profiling.Section({
      id: "build",
      order: 0,
      component: BuildSection,
    }),
    Pane.Register({ pane: buildProfileDetailPane }),
  ],
} satisfies PluginDefinition;
