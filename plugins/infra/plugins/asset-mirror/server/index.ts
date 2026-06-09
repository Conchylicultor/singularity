import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleMirror } from "./internal/handle-mirror";
import { MIRROR_ROUTE_KEY } from "./internal/registry";

export { defineAssetMirror } from "./internal/registry";
export type { AssetMirrorSpec } from "./internal/registry";

export default {
  description:
    "Generic server-side asset mirror: plugins declare a remote asset source via defineAssetMirror; files are lazily downloaded on first request, cached on local disk, and served same-origin thereafter (offline-capable after one warm-up).",
  httpRoutes: {
    [MIRROR_ROUTE_KEY]: handleMirror,
  },
} satisfies ServerPluginDefinition;
