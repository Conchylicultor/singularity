import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useConfig } from "./internal/use-config";
export { ConfigV2 } from "./internal/slots";

export default {
  id: "config-v2",
  name: "Config v2",
  description: "Reactive useConfig hook for reading typed JSONC config in the browser.",
  contributions: [],
} satisfies PluginDefinition;
