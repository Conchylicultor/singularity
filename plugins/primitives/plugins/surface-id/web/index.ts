import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SurfaceIdContext, useSurfaceTabId } from "./internal/surface-id";

export default {
  description:
    "Stable per-surface-instance id context (the tab's tabId): SurfaceIdContext + useSurfaceTabId. A leaf so low-level primitives (shortcuts, scoped-store) can read which surface they're rendered in without importing pane.",
  contributions: [],
} satisfies PluginDefinition;
