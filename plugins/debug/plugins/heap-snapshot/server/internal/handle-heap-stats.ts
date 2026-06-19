import { heapStats } from "bun:jsc";
import { physFootprintBytes } from "@plugins/framework/plugins/server-core/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getHeapStats } from "../../shared/endpoints";

const BYTES_PER_MB = 1024 * 1024;

// `heapStats()` is a cheap aggregated snapshot (no full graph walk), so this is
// safe to call repeatedly — it backs the everyday object-type table.
export const handleHeapStats = implement(getHeapStats, () => {
  const stats = heapStats();
  const types = Object.entries(stats.objectTypeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  // Real footprint vs JS heap — the discriminator for "is the balloon JS or native?".
  const footprintBytes = physFootprintBytes() ?? process.memoryUsage().rss;
  return {
    heapSizeMb: stats.heapSize / BYTES_PER_MB,
    heapCapacityMb: stats.heapCapacity / BYTES_PER_MB,
    objectCount: stats.objectCount,
    physFootprintMb: footprintBytes / BYTES_PER_MB,
    types,
  };
});
