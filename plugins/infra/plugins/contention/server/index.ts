import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { getContentionSnapshot } from "./internal/snapshot";
export type { ContentionSnapshot } from "../core";

export default {
  description:
    "Cached, cluster-wide system-contention snapshot (OS load average + Postgres backend counts) stamped onto slow ops.",
} satisfies ServerPluginDefinition;
