import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Per-path override for whether a filterable folder (from
// commitsConfig.excludedPaths) is currently being excluded from line stats.
// Rows only exist for explicit overrides; the effective default when no row
// exists is `enabled: true` (i.e. the path is excluded from stats).
export const excludedPathState = pgTable("stats_commits_excluded_path_state", {
  path: text("path").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
