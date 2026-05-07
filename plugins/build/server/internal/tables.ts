import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const _buildRuns = pgTable("build_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  commitHash: text("commit_hash"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  exitCode: integer("exit_code"),
});
