import { z } from "zod";
import {
  DB_CALL_PHASES,
  DB_POOL_NAMES,
} from "@plugins/database/plugins/connection/core";

/**
 * The jsonb payload behind a `db-query-deadline` report: one database call — on
 * any backend connection, opening it or running a query on it — got no answer
 * before its deadline, failed its caller, and had its connection abandoned.
 *
 * Rows filed before every connection carried a deadline have no `pool` / `phase`
 * (and may carry a since-removed `leased` flag, which parsing strips): they were
 * all queries on the app pool, which is what the defaults say.
 *
 * Mirrors the database seam's `deadline` event field for field, minus `at`: the
 * report row carries its own first/last-seen instants, and a per-occurrence
 * timestamp would only make the deduped row's `data` churn.
 *
 * `deadlineMs` is CARRIED, not looked up at render time. The default and every
 * `withQueryDeadline` scope are code, and a report records what was claimed when
 * it was filed — re-deriving the bound later would let an edit rewrite the past.
 */
export const DbQueryDeadlinePayloadSchema = z.object({
  /** The query's label, as the runtime profiler names its `db` span; `[connect]` for the connect phase. */
  sql: z.string(),
  /** How long the caller waited before the deadline gave up on it. Always ≥ `deadlineMs`. */
  elapsedMs: z.number(),
  /** The bound in force for this call: the pool default or a `withQueryDeadline` scope. */
  deadlineMs: z.number(),
  /** The runtime-profiler entry the query ran under ("push conversations-gone-stats"), when known. */
  origin: z.string().nullable(),
  /**
   * The connection the call ran on. Rows filed before every connection carried
   * a deadline had no pool: they were all the app pool's.
   */
  pool: z.enum(DB_POOL_NAMES).default("app"),
  /** `connect` (opening the connection; `sql` is `[connect]`) or `query`. Older rows: always a query. */
  phase: z.enum(DB_CALL_PHASES).default("query"),
  /** The `withQueryDeadline` reason, when a scope granted a longer bound; null for the default. */
  reason: z.string().nullable(),
});
export type DbQueryDeadlinePayload = z.infer<
  typeof DbQueryDeadlinePayloadSchema
>;

/**
 * The jsonb payload behind a `db-abandon-cap` report: the process has abandoned
 * more connections than the database plugin's capped hold set is sized for.
 *
 * A separate kind (not a second fingerprint of `db-query-deadline`) because it
 * is a different fact with a different shape: one query lost vs. what the lost
 * queries add up to for the whole process. Sharing a kind would force one
 * schema to describe both, with every field optional.
 */
export const DbAbandonCapPayloadSchema = z.object({
  /**
   * The connection whose abandon went past the cap — the latest one, since the
   * row rolls. Not part of the fingerprint: the hold set is process-wide, shared
   * by every pool. Older rows: the app pool's.
   */
  pool: z.enum(DB_POOL_NAMES).default("app"),
  /** Connections abandoned by this process so far. */
  abandoned: z.number().int(),
  /** The size of the hold set, carried for the same reason as `deadlineMs` above. */
  cap: z.number().int(),
});
export type DbAbandonCapPayload = z.infer<typeof DbAbandonCapPayloadSchema>;
