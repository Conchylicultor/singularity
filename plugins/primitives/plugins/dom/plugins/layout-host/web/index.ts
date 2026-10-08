import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { flowAxis, layoutHost, type FlowAxis } from "./internal/layout-host";

export default {
  description:
    "Which box lays a node out, and along which axis: layoutHost(node) is the nearest ancestor that draws a box (skipping display: contents wrappers, whose width is 0 and which never resize), flowAxis(host) is row only for a row flex container (computed flex-direction alone says row for every element). Shared by the slot renderer and the reorder middleware so neither misreads a wrapped host.",
  contributions: [],
} satisfies PluginDefinition;
