import {
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Generic (namespace, key) usage rollup — ONE row per tracked thing, no event
 * log. Works for any consumer: `namespace` names the domain (`prompt-templates`,
 * a command palette, …), `usage_key` is `${namespace}:${key}` (see `usageKey`
 * in core).
 *
 * A plain `pgTable`, NOT `defineExtension`: an extension needs a parent table +
 * FK, and the things ranked here are config items / registry entries with no DB
 * row to hang off.
 *
 * The single-column text PK is load-bearing — it IS the point resource's
 * identity (`point.by`), which the change-feed intersects against each
 * subscribed tuple's id set.
 *
 * `score` is the frecency score as of `last_used_at`, not as of now: the upsert
 * decays it to the write instant then adds 1, and every reader decays again to
 * its own now (`decayedScore`).
 */
export const _usageStats = pgTable("usage_stats", {
  usageKey: text("usage_key").primaryKey(),
  namespace: text("namespace").notNull(),
  score: doublePrecision("score").notNull().default(0),
  useCount: integer("use_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
});
