import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/core";

export const _releaseRuns = pgTable(
  "release_runs",
  {
    id: text("id").primaryKey(), // `release-${ms}-${rand}`
    composition: text("composition").notNull(),
    target: text("target").notNull(),
    // Namespace (worktree slug, or MAIN_WORKTREE_NAME on main) that produced this
    // run. A worktree DB forks main and inherits main's rows; tagging the
    // producing namespace lets the history resource and orphan sweep scope to
    // their own runs so inherited rows don't surface as phantom state.
    namespace: text("namespace").notNull().default(MAIN_WORKTREE_NAME),
    status: text("status").notNull().default("running"), // running|succeeded|failed
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    exitCode: integer("exit_code"),
    platform: text("platform"),
    artifactPath: text("artifact_path"), // staged --out dir (from RELEASE.json)
    port: integer("port"), // baked release port (RELEASE.json.port)
    error: text("error"),
    // OS pid of the detached `./singularity release` process that owns this run.
    // It outlives backend restarts, so its liveness — not an in-process flag — is
    // the source of truth for whether the release is still running. Used by the
    // durable lock and the orphan reconciler. Internal only; stripped from the
    // ReleaseRun resource payload.
    pid: integer("pid"),
  },
  (t) => [
    // At most one in-flight release per (namespace, composition), enforced
    // atomically by the DB. Unlike build (one in-flight per namespace),
    // concurrent releases of DIFFERENT compositions are legitimate — only a
    // duplicate in-flight release of the SAME composition is blocked. The
    // claiming INSERT itself is the lock: the loser fails with 23505 and bails.
    uniqueIndex("release_runs_inflight_uniq")
      .on(t.namespace, t.composition)
      .where(sql`${t.finishedAt} IS NULL`),
  ],
);
