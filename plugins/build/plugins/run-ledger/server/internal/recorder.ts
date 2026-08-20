import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { openShortLivedClient } from "@plugins/database/plugins/admin/server";
import type { Namespace } from "@plugins/infra/plugins/namespace/core";
import { _buildRuns } from "./tables";

// The detached `./singularity build` CLI records build_runs rows directly, from
// the CLI process — which has NO `SINGULARITY_WORKTREE` env (a terminal build is
// namespace-less) and so cannot use the env-bound `db` from
// `@plugins/database/server`. The recorder therefore opens ONE short-lived pool
// against the database of the namespace it is told to write to — the BUILDING
// CHECKOUT's own namespace, which is where a build's row, transcript and profile
// all live — and stamps every row with that namespace. This module must stay
// side-effect-free at eval (the CLI imports it early) — the pool is not opened
// until createBuildRunRecorder() is called.
//
// Eval-safety is the whole reason this lives in the run-ledger leaf, not the heavy
// build/server barrel: its import graph is drizzle + database/admin/server +
// namespace/core only — NO config_v2 / notifications / env-bound db / jobs / events.
// Never add an import here that pulls any of those into an env-less CLI process.

export interface BuildRunRecorder {
  /**
   * Claim this namespace's in-flight row for a terminal build (a direct
   * `./singularity build`, where no backend minted the row first). Returns
   * "lost" when the partial unique index rejects the insert — another in-flight
   * build already holds this namespace's slot (a stale orphan the next reconcile
   * will reap) — and "unavailable" when the namespace has no database yet.
   *
   * "unavailable" is a real outcome, not an error: a fresh checkout that has
   * never been deployed can still run `build --composition sonata`, and its own
   * DB fork may not exist. A missing ledger must degrade to a note, never fail
   * the build it is only observing.
   *
   * `targets` is WHICH COMPOSITIONS this one invocation builds — `{singularity}`
   * for a plain build, the requested ids for a `build --composition a b`. One
   * invocation is one row with N targets, so this is an array, not a scalar.
   */
  insertRun(r: {
    id: string;
    targets: string[];
    trigger: "manual" | "auto";
    commitHash: string | null;
    pid: number;
  }): Promise<"claimed" | "lost" | "unavailable">;
  /** Stamp a run terminal, first-writer-wins (guarded `where(isNull(finishedAt))`). */
  closeRun(id: string, exitCode: number): Promise<void>;
  /** Release the pool. */
  close(): Promise<void>;
}

// node-postgres surfaces a unique_violation as SQLSTATE 23505 — the partial unique
// index build_runs_inflight_uniq rejecting a second in-flight row for this
// namespace.
function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

// 3D000 (invalid_catalog_name) is Postgres saying the database does not exist.
// The checkout has never been deployed, so there is no ledger to write to; every
// other error is a genuine fault and rethrows.
function isMissingDatabase(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "3D000";
}

/**
 * The CLI-side `build_runs` writer for ONE namespace's database — the building
 * checkout's own. It used to be hardcoded to main's, because the only rows it
 * wrote were main's deploy and its compose-serve children; a composition is now
 * built and served from any checkout, and its row belongs with the transcript
 * and profile that checkout's backend serves.
 */
export function createBuildRunRecorder(namespace: Namespace): BuildRunRecorder {
  const pool = openShortLivedClient(namespace);
  const db: NodePgDatabase = drizzle(pool);

  return {
    async insertRun(r) {
      try {
        // HAND-WRITTEN INSERT, NAMING ONLY THE COLUMNS THE CLI SUPPLIES.
        // Do NOT "modernise" this back to `db.insert(_buildRuns).values({…})`.
        //
        // The reason is a hard ordering fact plus a drizzle behaviour that
        // together make the ORM form structurally unusable HERE:
        //
        //   1. This row is minted by the `./singularity build` CLI
        //      (bin/commands/build.ts, just before `generateAppSources`), which
        //      GENERATES the migration; the migration is not APPLIED until the
        //      backend restarts at the very end of the build. So the CLI always
        //      runs NEW code against the schema the PREVIOUS build left behind.
        //
        //   2. `db.insert(table).values({…})` names EVERY column in the drizzle
        //      table definition and passes DEFAULT for the ones the caller
        //      omitted. Measured with `.toSQL()`:
        //
        //        insert into "build_runs"
        //          ("id","trigger","commit_hash","namespace","targets",
        //           "parent_id","started_at","finished_at","exit_code","pid")
        //        values ($1,$2,$3,$4,$5,default,default,default,default,$6)
        //
        //      Omitting a field does NOT keep its column out of the statement.
        //
        // So the rule is about the TABLE, not the field: the CLI cannot use the
        // ORM insert on a table whose drizzle definition has gained ANY column
        // the deployed schema lacks. The next column added here would break this
        // write again the moment it is added — the statement below cannot, because
        // it names its own columns and grows only when a human adds one, one
        // release AFTER the migration that creates it has been applied. That
        // ordering is the whole discipline: add the column, deploy, then name it.
        // (`targets` is the column that taught us this, at the cost of two failed
        // builds; it is deployed now, so it is named.)
        //
        // Parameterised (drizzle's `sql` template emits $n placeholders), never
        // concatenated.
        //
        // `targets` MUST go through `sql.param()`. An array interpolated bare
        // into a `sql` template is drizzle's `in (…)` list form — it expands to
        // one placeholder PER ELEMENT wrapped in parens, so `${r.targets}` emits
        // `($5, $6)`, a row expression, and Postgres rejects it with
        // `42804 column "targets" is of type text[] but expression is of type
        // record`. `sql.param()` binds the whole array as ONE parameter, which
        // node-postgres serialises to a Postgres array literal; the placeholder's
        // type is then inferred from the target column, so no `::text[]` cast is
        // needed. Both forms were measured with `.toSQL()` and round-tripped
        // against the deployed table.
        await db.execute(sql`
          insert into "build_runs" ("id", "trigger", "commit_hash", "namespace", "targets", "pid")
          values (${r.id}, ${r.trigger}, ${r.commitHash}, ${namespace}, ${sql.param(r.targets)}, ${r.pid})
        `);
        return "claimed";
      } catch (err) {
        if (isUniqueViolation(err)) return "lost";
        if (isMissingDatabase(err)) return "unavailable";
        throw err;
      }
    },

    async closeRun(id, exitCode) {
      // First-writer-wins: the CLI's stamp is authoritative for the run it owns.
      // The backend's `proc.exited` writer and the orphan reconciler are late
      // fallbacks guarded by the same `isNull(finishedAt)` predicate, so a row
      // closed here is never re-stamped by them.
      //
      // A namespace with no database never had a row to close (insertRun
      // answered "unavailable"), so the same tolerance applies here.
      //
      // This one stays on drizzle: unlike `.values()`, `.set()` names ONLY the
      // assigned columns, so an UPDATE is already immune to the schema skew
      // above. Verified with `.toSQL()`:
      //   update "build_runs" set "finished_at" = $1, "exit_code" = $2
      //   where ("build_runs"."id" = $3 and "build_runs"."finished_at" is null)
      try {
        await db
          .update(_buildRuns)
          .set({ finishedAt: new Date(), exitCode })
          .where(and(eq(_buildRuns.id, id), isNull(_buildRuns.finishedAt)));
      } catch (err) {
        if (!isMissingDatabase(err)) throw err;
      }
    },

    async close() {
      await pool.end();
    },
  };
}
