import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * How many recent deadline hits the server keeps and the resource carries.
 *
 * Part of the contract, not a server detail: the schema below refuses a longer
 * list, which is what makes this resource a schema-bounded scalar (the bounded
 * working-set rule) rather than an open collection that happens to be small.
 */
export const QUERY_DEADLINE_RING_CAPACITY = 20;

/** One lost query, as the Database health row needs it. */
export const QueryDeadlineHitSchema = z.object({
  /** Epoch ms at which the deadline fired. */
  at: z.number(),
  /** The query's label (the report's fingerprint). */
  sql: z.string(),
  /** How long the caller waited before it was given up on. */
  elapsedMs: z.number(),
});
export type QueryDeadlineHit = z.infer<typeof QueryDeadlineHitSchema>;

export const QueryDeadlinesSchema = z.object({
  /** Oldest first; at most {@link QUERY_DEADLINE_RING_CAPACITY}. Since this backend started. */
  hits: z.array(QueryDeadlineHitSchema).max(QUERY_DEADLINE_RING_CAPACITY),
});
export type QueryDeadlines = z.infer<typeof QueryDeadlinesSchema>;

/**
 * The last {@link QUERY_DEADLINE_RING_CAPACITY} query-deadline hits on this
 * backend, pushed on every hit. In-memory on the server (it resets when the
 * backend restarts; the durable record is the report), so it is an external
 * push resource with a hand `notify()`.
 */
export const dbQueryDeadlinesResource = resourceDescriptor<QueryDeadlines>(
  "db-query-deadlines",
  QueryDeadlinesSchema,
  { hits: [] },
);
