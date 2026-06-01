import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const _buildRuns = pgTable("build_runs", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  commitHash: text("commit_hash"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  exitCode: integer("exit_code"),
  // OS pid of the detached `./singularity build` process that owns this run.
  // It outlives backend restarts (the build restarts the backend itself), so its
  // liveness — not an in-process flag — is the source of truth for whether the
  // build is still running. Used by the durable build lock and the orphan
  // reconciler. Internal only; stripped from the BuildRun resource payload.
  pid: integer("pid"),
});
