import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useConfig } from "./internal/use-config";
export { useSetConfig } from "./internal/use-set-config";
export { useConfigRegistrations } from "./internal/use-config-registrations";
export type { ConfigRegistration } from "./internal/use-config-registrations";
export { ConfigV2 } from "./internal/slots";

export default {
  name: "Config v2",
  description: "Reactive useConfig hook for reading typed JSONC config in the browser.",
  contributions: [],
} satisfies PluginDefinition;
