import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import "./internal/pane-restore-store";

export { loadRouteForConversation } from "./internal/pane-restore-store";

export default {
  name: "Pane Restore",
  description:
    "Saves and restores the pane route per conversation using localStorage.",
  contributions: [],
} satisfies PluginDefinition;
