import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { viewsDescriptor } from "../shared";
export { buildViewConfigRegistrations } from "./internal/config-registrations";

export default {
  description:
    "Type-agnostic named-view-instance engine (server): the per-id `views` config descriptor + a generic registration helper. Consumers register their own ids under their own plugin.",
  // Headless engine — registers no contributions of its own. Consumers register
  // their own per-id `ConfigV2.Register` via `buildViewConfigRegistrations`.
  contributions: [],
} satisfies ServerPluginDefinition;
