import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { getMapsKey, type MapsKeyResult } from "./internal/key";

export default {
  description:
    "Google Maps Platform access broker (server): getMapsKey() reads the stored API key via the shared auth/central store, so consumers never import @plugins/auth.",
  contributions: [],
} satisfies ServerPluginDefinition;
