import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/core";

export const _buildRuns = pgTable(
  "build_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger").notNull(),
    commitHash: text("commit_hash"),
    // Namespace (worktree slug, or MAIN_WORKTREE_NAME on main) that produced this
    // run. A worktree DB is forked from main and inherits main's rows; tagging the
    // producing namespace lets the history resource and orphan sweep scope to their
    // own runs so inherited main builds don't surface a phantom "Build failed".
    // Backfills to MAIN_WORKTREE_NAME — historically only main's auto-build wrote here.
    namespace: text("namespace").notNull().default(MAIN_WORKTREE_NAME),
    // What this run built: "main" for a normal deploy, or a composition id
    // (sonata, website, …) for a compose-serve child. Flat rows in one history
    // list, distinguished by this field. Backfills to "main" — historically every
    // row was a main deploy.
    target: text("target").notNull().default("main"),
    // Soft reference to the parent main run that spawned this composition build
    // (the compose-serve stage). No FK: the parent may be pruned past the 50-row
    // retention while a child row survives. Null on main rows.
    parentId: text("parent_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    exitCode: integer("exit_code"),
    // OS pid of the detached `./singularity build` process that owns this run.
    // It outlives backend restarts (the build restarts the backend itself), so its
    // liveness — not an in-process flag — is the source of truth for whether the
    // build is still running. Used by the durable build lock and the orphan
    // reconciler. Internal only; stripped from the BuildRun resource payload.
    pid: integer("pid"),
  },
  (t) => [
    // At most one in-flight build per namespace, enforced atomically by the DB.
    // The durable lock (hasLiveInflightBuild) is a check-then-act fast path with a
    // TOCTOU window: two triggers racing across backend processes (where the
    // in-process `inflight` flag gives no protection) can both pass the liveness
    // check before either inserts, then both spawn `./singularity build` and the
    // two competing builds stomp each other's backend restart, leaving both rows
    // unfinished → the reconciler stamps both exit_code=-1. This partial unique
    // index makes the claiming INSERT itself the lock: the loser fails with a
    // 23505 and bails instead of starting a second build.
    //
    // Scoped by (namespace, target): the backend's claim INSERT omits `target`, so
    // it defaults to "main" and the main-vs-main claim semantics are unchanged.
    // Composition rows (target = sonata, website, …) never collide with the main
    // claim or with each other, so all of a build's compose-serve children can be
    // open concurrently under the same namespace.
    uniqueIndex("build_runs_inflight_uniq")
      .on(t.namespace, t.target)
      .where(sql`${t.finishedAt} IS NULL`),
  ],
);
