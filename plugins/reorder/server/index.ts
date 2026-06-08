import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { reorderConfigRegistrations } from "./internal/config-registrations";

export default {
  name: "Reorder",
  description:
    "Generic reorder primitive: per-slot config_v2 directives for contribution order/visibility.",
  loadBearing: true,
  // One config_v2 directive descriptor per reorderable slot, registered under
  // the slot's DEFINING plugin (via `pluginId`).
  contributions: reorderConfigRegistrations,
} satisfies ServerPluginDefinition;
