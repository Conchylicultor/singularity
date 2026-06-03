import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BuildDetailSlots } from "@plugins/build/web";
import { BuildLogSection } from "./components/build-log-section";

export default {
  name: "Build: Logs",
  description: "Live log stream section in the build detail pane.",
  contributions: [
    BuildDetailSlots.Section({ id: "logs", label: "Logs", component: BuildLogSection }),
  ],
} satisfies PluginDefinition;
