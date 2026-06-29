import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { conversationsSidebarRegionWeb } from "./region";

export { SidebarRegion, conversationsSidebarRegionWeb } from "./region";

export default {
  description:
    "Variant region for the agent-manager conversation sidebar body (classic / future dataview). Owns the switch; the parent conversations-view mount point renders its Region + Picker.",
  contributions: [...conversationsSidebarRegionWeb.contributions],
} satisfies PluginDefinition;
