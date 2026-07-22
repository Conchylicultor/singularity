import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { openShortLivedClient } from "@plugins/database/plugins/admin/server";
import { MAIN_WORKTREE_NAME } from "@plugins/infra/plugins/paths/core";
import { _buildRuns } from "./tables";

// The detached `./singularity build` CLI records build_runs rows directly, from
// the CLI process — which has NO `SINGULARITY_WORKTREE` env (a terminal build is
// namespace-less) and so cannot use the env-bound `db` from
// `@plugins/database/server`. Compose-serve is main-only, so main's DB is always
// the right (and only) target: the recorder opens ONE short-lived pool against
// MAIN_WORKTREE_NAME's database for its lifetime and stamps every row with that
// namespace. This module must stay side-effect-free at eval (the CLI imports it
// early) — the pool is not opened until createBuildRunRecorder() is called.
//
// Eval-safety is the whole reason this lives in the run-ledger leaf, not the heavy
// build/server barrel: its import graph is drizzle + database/admin/server +
// paths/core only — NO config_v2 / notifications / env-bound db / jobs / events.
// Never add an import here that pulls any of those into an env-less CLI process.

export interface BuildRunRecorder {
  /**
   * Claim main's in-flight row for a terminal build (direct `./singularity build`
   * on main, where the backend didn't already mint the row). Returns "lost" when
   * the partial unique index rejects the insert — another in-flight main build
   * already holds the slot (a stale orphan the next reconcile will reap).
   */
  insertMainRun(r: {
    id: string;
    trigger: "manual" | "auto";
    commitHash: string | null;
    pid: number;
  }): Promise<"claimed" | "lost">;
  /** Open a composition child row under its parent main run. */
  insertCompositionRun(r: {
    id: string;
    target: string;
    parentId: string;
    pid: number;
  }): Promise<void>;
  /** Stamp a run terminal, first-writer-wins (guarded `where(isNull(finishedAt))`). */
  closeRun(id: string, exitCode: number): Promise<void>;
  /** Release the pool. */
  close(): Promise<void>;
}

// node-postgres surfaces a unique_violation as SQLSTATE 23505 — the partial unique
// index build_runs_inflight_uniq rejecting a second in-flight row for (namespace,
// target).
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export function createBuildRunRecorder(): BuildRunRecorder {
  const pool = openShortLivedClient(MAIN_WORKTREE_NAME);
  const db: NodePgDatabase = drizzle(pool);

  return {
    async insertMainRun(r) {
      try {
        await db.insert(_buildRuns).values({
          id: r.id,
          trigger: r.trigger,
          commitHash: r.commitHash,
          target: "main",
          pid: r.pid,
          namespace: MAIN_WORKTREE_NAME,
        });
        return "claimed";
      } catch (err) {
        if (isUniqueViolation(err)) return "lost";
        throw err;
      }
    },

    async insertCompositionRun(r) {
      // Sweep-close any stale open row for this (namespace, target) before the
      // insert. A CLI killed mid-compose, a `--no-restart` build, or a
      // boot-reconcile race can leave a composition row unfinished, and the
      // (namespace, target) partial unique index would then 23505 this insert.
      // Safe by construction: the CLI file build-lock serializes compose-serve, so
      // there is never a genuinely-concurrent composition build for the same
      // target to clobber. exit_code -1 marks the sweep-recovered corpse.
      await db
        .update(_buildRuns)
        .set({ finishedAt: new Date(), exitCode: -1 })
        .where(
          and(
            eq(_buildRuns.namespace, MAIN_WORKTREE_NAME),
            eq(_buildRuns.target, r.target),
            isNull(_buildRuns.finishedAt),
          ),
        );

      // Copy trigger + commit from the parent main run so a composition row reads
      // coherently in the shared history list. Fallback ("manual" / null) covers
      // the lost-claim case where main's own row was never minted here (e.g. the
      // backend already owned it, or it was pruned).
      const [parent] = await db
        .select({
          trigger: _buildRuns.trigger,
          commitHash: _buildRuns.commitHash,
        })
        .from(_buildRuns)
        .where(eq(_buildRuns.id, r.parentId))
        .limit(1);

      await db.insert(_buildRuns).values({
        id: r.id,
        trigger: parent?.trigger ?? "manual",
        commitHash: parent?.commitHash ?? null,
        target: r.target,
        parentId: r.parentId,
        pid: r.pid,
        namespace: MAIN_WORKTREE_NAME,
      });
    },

    async closeRun(id, exitCode) {
      // First-writer-wins: the CLI's stamp is authoritative for the run it owns.
      // The backend's `proc.exited` writer and the orphan reconciler are late
      // fallbacks guarded by the same `isNull(finishedAt)` predicate, so a row
      // closed here is never re-stamped by them.
      await db
        .update(_buildRuns)
        .set({ finishedAt: new Date(), exitCode })
        .where(and(eq(_buildRuns.id, id), isNull(_buildRuns.finishedAt)));
    },

    async close() {
      await pool.end();
    },
  };
}
