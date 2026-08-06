import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { usageStatsResource as usageStatsDescriptor } from "../../core";
import { _usageStats } from "./tables";

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE usage_key IN (ids)`), and the change-feed routes a `recordUsage`
// upsert to a tuple iff the changed usage keys intersect its set — so recording
// one use never sweeps the whole table. `point.by` IS the identity pk. No
// orderBy — point sets are unordered; the ordering is the CLIENT's job
// (`sortByUsage`), because the comparison must decay to the reader's `now`.
export const usageStatsResource = windowQueryResource(usageStatsDescriptor, {
  from: _usageStats,
  select: {
    usageKey: _usageStats.usageKey,
    namespace: _usageStats.namespace,
    score: _usageStats.score,
    useCount: _usageStats.useCount,
    lastUsedAt: _usageStats.lastUsedAt,
  },
  point: { by: _usageStats.usageKey },
});
