import { z } from "zod";
import { liveCollection } from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";

/**
 * One (namespace, key) usage rollup. `score` is the frecency score as of
 * `lastUsedAt` (NOT as of now — decay it with `decayedScore` before comparing);
 * `useCount` is the raw lifetime count, kept for display/debugging only.
 * `lastUsedAt` crosses the wire as an ISO string, so it is coerced back to a
 * `Date` on read (the `conversation-category` precedent).
 */
export const UsageStatSchema = z.object({
  usageKey: z.string(),
  namespace: z.string(),
  score: z.number(),
  useCount: z.number(),
  lastUsedAt: z.coerce.date(),
});
export type UsageStat = z.infer<typeof UsageStatSchema>;

/**
 * The collection over `usage_stats`, read two ways:
 *
 * - by an explicit usage-key set, `useLive(usageStats, { ids })` —
 *   `useUsageOrder` coalesces the visible keys into ONE tuple — so a read costs
 *   O(subscribed ids) and a `recordUsage` write recomputes only the tuples
 *   whose set contains the touched key (the `:rows` point routing), never the
 *   whole table. Rows key on `usageKey`, which IS the table's single-column pk;
 * - as a bounded window of ONE namespace's most recently used keys
 *   (`useRecentUsage`): the answer to "what did I use last" when the caller
 *   has no candidate set to rank — an emoji picker's Recent row, out of every
 *   emoji there is. `where` on `namespace`, newest `lastUsedAt` first, a small
 *   limit.
 *
 * NOT preloaded: the server cannot know a client's id set at snapshot time,
 * and the default window (every namespace) is never what anyone reads.
 * `useUsageOrder` covers that one round-trip with its persistent-draft order
 * cache.
 */
export const usageStats = liveCollection("usage-stats", {
  row: UsageStatSchema,
  id: "usageKey",
  filterable: { namespace: liveText() },
  sortable: ["lastUsedAt"],
  default: { orderBy: [["lastUsedAt", "desc"]], limit: 20 },
  maxLimit: 100,
});
