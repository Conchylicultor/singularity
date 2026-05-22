import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BuildDetailSlots } from "@plugins/build/web";
import { BuildCommitsSection } from "./components/build-commits-section";

export default {
  id: "build-commits",
  name: "Build: Commits",
  description: "Commits included since the previous build, shown in the build detail pane.",
  contributions: [
    BuildDetailSlots.Section({
      id: "commits",
      label: "Commits",
      component: BuildCommitsSection,
    }),
  ],
} satisfies PluginDefinition;
