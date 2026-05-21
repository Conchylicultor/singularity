import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BuildDetailSlots } from "@plugins/build/web";
import { BuildFixSection } from "./components/build-fix-section";

export default {
  id: "build-fix",
  name: "Build: Fix",
  description:
    "Launch-agent button in the build detail pane for failed builds.",
  contributions: [
    BuildDetailSlots.Section({ id: "fix", label: "Fix", component: BuildFixSection }),
  ],
} satisfies PluginDefinition;
