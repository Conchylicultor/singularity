import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ServeTargetPanel } from "./components/serve-target-panel";
export { useServeComposition } from "./internal/use-serve-composition";
export { useDeleteComposition } from "./internal/use-delete-composition";
export type { DeleteCompositionRequest } from "./internal/use-delete-composition";
export { useServeStatus } from "./internal/use-serve-status";
export type { ServeStatus } from "./internal/use-serve-status";

export default {
  description:
    "Serve capability for a composition: the live-serve toggle panel, the enable→build hook (a `build --composition <id>` of THIS checkout), the served-liveness read (the server-resolved namespace plus the composition.json marker, not the autoBuild intent), and the delete flow — which asks what the composition owns across every checkout, names it in a confirm dialog, and reclaims it before the manifest row goes. Consumed by Studio's Build & serve section and compositions list, and by the deploy pane's Test locally section.",
} satisfies PluginDefinition;
