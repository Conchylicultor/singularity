import { z } from "zod";
import { pointQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

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
 * Bounded POINT resource: a consumer subscribes by an explicit usage-key set
 * (`useUsageOrder` coalesces the visible keys into ONE tuple), so a read costs
 * O(subscribed ids) and a `recordUsage` write recomputes only the tuples whose
 * set contains the touched key — never the whole table. Rows key on `usageKey`,
 * which IS the table's single-column pk (`point.by`).
 *
 * NOT bootCritical: point resources hydrate post-mount by construction (the
 * server cannot know a client's id set at snapshot time). `useUsageOrder`
 * covers that one round-trip with its persistent-draft order cache.
 */
export const usageStatsResource = pointQueryResourceDescriptor<UsageStat>(
  "usage-stats",
  UsageStatSchema,
  "usageKey",
);
