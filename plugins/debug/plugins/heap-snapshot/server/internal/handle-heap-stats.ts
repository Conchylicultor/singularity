import { heapStats } from "bun:jsc";
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
  return {
    heapSizeMb: stats.heapSize / BYTES_PER_MB,
    heapCapacityMb: stats.heapCapacity / BYTES_PER_MB,
    objectCount: stats.objectCount,
    types,
  };
});
