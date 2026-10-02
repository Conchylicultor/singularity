import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";

export const MetricRevisionSchema = z.object({
  /** `<bootId>:<n>` — opaque; only equality matters. Part of every metric query's cache key. */
  rev: z.string(),
});
export type MetricRevision = z.infer<typeof MetricRevisionSchema>;

// Freshness without polling: a source declares what makes its numbers stale
// (`changes` on its server contribution), each change moves this value, and a
// metric query keyed by it refetches. Served external in
// `server/internal/revision.ts`.
export const metricRevision = liveValue("metrics.revision", {
  schema: MetricRevisionSchema,
  params: ["sourceId"],
});
