import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  DB_CALL_PHASES,
  DB_POOL_NAMES,
} from "@plugins/database/plugins/connection/core";

/**
 * How many recent deadline hits the server keeps and the resource carries.
 *
 * Part of the contract, not a server detail: the schema below refuses a longer
 * list, which is what makes this resource a schema-bounded scalar (the bounded
 * working-set rule) rather than an open collection that happens to be small.
 */
export const QUERY_DEADLINE_RING_CAPACITY = 20;

/**
 * One database call that got no reply, as the Database health row needs it.
 *
 * No defaults: the ring is process memory and is never persisted, so every hit
 * the resource ever carries was built by the current server with every field.
 */
export const QueryDeadlineHitSchema = z.object({
  /** Epoch ms at which the deadline fired. */
  at: z.number(),
  /** The connection the call ran on. */
  pool: z.enum(DB_POOL_NAMES),
  /** `connect` (opening the connection) or `query`. */
  phase: z.enum(DB_CALL_PHASES),
  /** The query's label; `[connect]` for the connect phase. */
  sql: z.string(),
  /** The runtime-profiler entry the call ran under, when known. */
  origin: z.string().nullable(),
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
