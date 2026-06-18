import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { dataViewConfigRegistrations } from "./internal/config-registrations";

export default {
  description:
    "Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter.",
  // One config_v2 `views` descriptor per DataView id, registered under the
  // `primitives.data-view` plugin (server-side identity, independent of web).
  contributions: dataViewConfigRegistrations,
} satisfies ServerPluginDefinition;
