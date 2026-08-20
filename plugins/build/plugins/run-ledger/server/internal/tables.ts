import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/core";
import { MAIN_COMPOSITION_ID } from "@plugins/infra/plugins/namespace/core";

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
    // WHICH COMPOSITIONS this one invocation built. `./singularity build
    // --composition sonata website` is ONE shared build — one install, one
    // codegen, one migration pass, one checks pass, one transcript, one profile,
    // one verdict — so it is ONE row carrying N target chips, not N rows sharing
    // a transcript. A plain build is `{singularity}`.
    //
    // The default is derived from MAIN_COMPOSITION_ID, never spelled: the string
    // is `"singularity"`, which is also what `namespace` defaults to, and the
    // table used to contradict itself by saying `"main"` here and `"singularity"`
    // there for the same row. Existing rows take this default, so historical
    // COMPOSITION rows read `{singularity}` — mislabelled, and accepted: the
    // history resource is a LIMIT 50 window over a 50-row retention, so it rolls
    // over within a day or two of normal building.
    targets: text("targets").array().notNull().default([MAIN_COMPOSITION_ID]),
    // Soft reference to a parent run. Nothing writes it any more — composition
    // builds were child rows of a main build until the serve fan-out made one
    // invocation one row. Kept as a column (and off the write path) until the
    // Phase 8 cleanup drops it; see
    // research/2026-08-19-global-composition-build-serve-half.md.
    parentId: text("parent_id"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
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
    // Scoped by `namespace` alone. It used to be `(namespace, target)` so main's
    // row and its compose-serve children could be open at once; with no children
    // left it says exactly what the per-checkout `.build.lock` already enforces —
    // one build in flight per checkout.
    //
    // Narrowing it in the same change that drops `target` is safe: an index is
    // DDL, applied by the backend's migration runner and never named by any
    // writer, and both writers (the CLI's hand-written INSERT and run-build.ts)
    // supply `namespace`.
    uniqueIndex("build_runs_inflight_uniq")
      .on(t.namespace)
      .where(sql`${t.finishedAt} IS NULL`),
  ],
);
