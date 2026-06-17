import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Cluster, type ClusterProps } from "./internal/cluster";

export default {
  description:
    "Wrap-friendly chip group layout primitive: <Cluster> lays out a wrapping row of rigid identity chips that never individually shrink, delegating to Stack.",
  contributions: [],
} satisfies PluginDefinition;
