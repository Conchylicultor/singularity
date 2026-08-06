import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { recordUsage } from "./internal/record-usage";
export { useUsageOrder } from "./internal/use-usage-order";

export default {
  description:
    "Frecency usage ranking for any (namespace, key) set: recordUsage() fires one atomic decay-and-increment, and useUsageOrder() returns the most-used-first order — one coalesced point subscription, frozen per context so chips never move under the cursor, seeded from a local cache so the first paint does not re-sort.",
  contributions: [],
} satisfies PluginDefinition;
