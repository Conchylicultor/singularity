import { z } from "zod";

// A second, read-set-focused typed view of the `GET /api/resources/_debug`
// payload (the live-state-health pane declares its own subscriber-focused view
// of the same route). `shared/` is plugin-private, so we cannot import that
// other view — declaring a second contract over the same route is the
// established pattern, and zod strips unknown keys so the two coexist.
//
// We model only what this pane reads. `identityTable`, `recompute`, and
// `loaderStats` are gated defensively (`.optional()`) so the response still
// parses before the sibling server change that adds them lands. `coveredOrigins`
// is required (like `readSet`) rather than defaulted, so a response that omits
// it fails loudly instead of reading as a resource that covers nothing.

export const loaderStatsSchema = z.object({
  count: z.number(),
  ratePerMin: z.number(),
  maxMs: z.number(),
});

/**
 * Per-resource notify provenance counters (L4 self-verifying parallel run).
 * `hand` = hand-called notify() invocations; `feed` = DB-change-feed-derived
 * ones. A resource with `hand > 0 && feed === 0` is a read-set-gap candidate —
 * the feed under-covers a table the hand-notify does (the bug class L4
 * eliminates). A feed-only resource is expected (out-of-process writes or a
 * now-redundant hand-notify).
 */
export const notifyStatsSchema = z.object({
  hand: z.number(),
  feed: z.number(),
});

/**
 * One route of a ROUTED resource (compiler-emitted — see
 * research/2026-09-29-global-scoped-change-routing.md): a table it is reached
 * through, how that table's rows map to its ids, and a `full` route's reason.
 */
export const routeSchema = z.union([
  z.object({
    id: z.string(),
    table: z.string(),
    map: z.literal("full"),
    reason: z.string(),
  }),
  z.object({
    id: z.string(),
    table: z.string(),
    map: z.enum(["identity", "alias", "reverse"]),
  }),
]);

export const resourceReadSetSchema = z.object({
  key: z.string(),
  mode: z.string(),
  /** Total subscriptions across all sockets. */
  subscribers: z.number(),
  /** Upstream resource keys this entry cascades from (the hand-drawn graph). */
  dependsOn: z.array(z.string()),
  /** Downstream resource keys this entry cascades to. */
  downstream: z.array(z.string()),
  /**
   * Captured table names this resource's loader read since boot (seeded from
   * the durable `tables_read`).
   */
  readSet: z.array(z.string()),
  /**
   * Read-set resolved to base-table space (views → their identity base), for
   * like-for-like comparison with coveredOrigins. Required rather than
   * defaulted (the server always emits it), so an omission fails loudly
   * instead of reading as a loader that read no base tables.
   */
  readSetBases: z.array(z.string()),
  /** Declared identity table (intent to be scoped); absent → no scoped intent. */
  identityTable: z.string().optional(),
  /** Explicit FULL-recompute opt-out (a declared choice, not a degradation). */
  recompute: z
    .object({ kind: z.literal("full"), reason: z.string() })
    .optional(),
  /** Authoritative scoped-vs-FULL routing set: tables this resource absorbs scoped. */
  coveredOrigins: z.array(z.string()),
  /**
   * A routed resource's routes; `null` = the legacy read-set path serves it.
   * Required, like `coveredOrigins`, so an omission fails loudly.
   */
  routes: z.array(routeSchema).nullable(),
  /** Loader call frequency over the profiling window (server-only). */
  loaderStats: loaderStatsSchema.optional(),
  /** Notify provenance counters (hand-called vs DB-change-feed-derived). */
  notifyStats: notifyStatsSchema,
});

export const resourcesReadSetSchema = z.object({
  topoOrder: z.array(z.string()),
  resources: z.array(resourceReadSetSchema),
});

export type LoaderStats = z.infer<typeof loaderStatsSchema>;
export type NotifyStats = z.infer<typeof notifyStatsSchema>;
export type ResourceReadSet = z.infer<typeof resourceReadSetSchema>;
export type ResourceRoute = z.infer<typeof routeSchema>;
export type ResourcesReadSet = z.infer<typeof resourcesReadSetSchema>;
