import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { getTabId } from "./internal/tab-id";

export default {
  description:
    "Stable per-tab id (sessionStorage-backed) for crash/notification attribution.",
  contributions: [],
} satisfies PluginDefinition;
