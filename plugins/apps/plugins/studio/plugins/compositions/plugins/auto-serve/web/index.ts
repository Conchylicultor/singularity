import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ServeTargetPanel } from "./components/serve-target-panel";
export { useServeComposition } from "./internal/use-serve-composition";

export default {
  description:
    "Serve capability for compositions: the live-serve toggle panel + the enable→build hook, consumed by the unified Build & serve section and the compositions list.",
} satisfies PluginDefinition;
