import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ServeTargetPanel } from "./components/serve-target-panel";
export { useServeComposition } from "./internal/use-serve-composition";
export { useServeStatus } from "./internal/use-serve-status";
export type { ServeStatus } from "./internal/use-serve-status";

export default {
  description:
    "Serve capability for a composition: the live-serve toggle panel, the enable→build hook, and the served-liveness read (the composition.json marker, not the autoBuild intent). Consumed by Studio's Build & serve section and compositions list, and by the deploy pane's Test locally section.",
} satisfies PluginDefinition;
