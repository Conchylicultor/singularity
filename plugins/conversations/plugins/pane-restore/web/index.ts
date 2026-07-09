import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import "./internal/pane-restore-store";

export { loadRouteForConversation, reportCorruptSavedRoute } from "./internal/pane-restore-store";
export type { RouteRestore } from "./internal/pane-restore-store";

export default {
  description:
    "Saves and restores the pane route per conversation using localStorage.",
  contributions: [],
} satisfies PluginDefinition;
