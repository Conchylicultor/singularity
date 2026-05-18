import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { fetchEndpoint, EndpointError } from "./internal/fetch-endpoint";
export { useEndpoint } from "./internal/use-endpoint";
export { useEndpointMutation } from "./internal/use-endpoint-mutation";

export default {
  id: "endpoints",
  name: "Endpoints",
  description:
    "Typed endpoint contract primitive. fetchEndpoint, useEndpoint, and useEndpointMutation consume endpoint definitions on the client.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
