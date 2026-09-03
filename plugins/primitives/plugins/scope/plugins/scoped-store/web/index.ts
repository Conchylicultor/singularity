import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { defineScopedStore } from "./internal/scoped-store";
export type { ScopedStore, ScopedStoreHandle } from "./internal/scoped-store";

export default {
  description:
    "Per-Provider-instance external store primitive: defineScopedStore. Module-level factory, per-mount isolated state, with imperative reads, reactive whole-state, and selector subscriptions with re-render bailout.",
  contributions: [],
} satisfies PluginDefinition;
