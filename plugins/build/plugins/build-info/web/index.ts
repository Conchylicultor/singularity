import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BuildDetailSlots } from "@plugins/build/web";
import { BuildInfo } from "./components/build-info";

export default {
  description:
    "Status, trigger, commit hash, and timing section in the build detail pane.",
  contributions: [
    BuildDetailSlots.Section({ id: "info", label: "Info", component: BuildInfo }),
  ],
} satisfies PluginDefinition;
