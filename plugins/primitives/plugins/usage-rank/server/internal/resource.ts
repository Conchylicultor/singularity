import { serveCollection } from "@plugins/network/plugins/live/server";
import { usageStats } from "../../core";
import { _usageStats } from "./tables";

// Server half of the lookup-only collection: every row field binds to its
// `_usageStats` column by name, and the loader reads only the subscribed id set
// (`WHERE usage_key IN (ids)`). The `:rows` point routing sends a `recordUsage`
// upsert to a tuple iff the changed usage keys intersect its set — so recording
// one use never sweeps the whole table. No order — an id set is unordered; the
// ordering is the CLIENT's job (`sortByUsage`), because the comparison must
// decay to the reader's `now`.
export const usageStatsServed = serveCollection(usageStats, {
  from: _usageStats,
});
