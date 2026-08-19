import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { getConfig } from "@plugins/config_v2/server";
import {
  currentWorktreeName,
  isMain,
} from "@plugins/infra/plugins/paths/server";
import { _buildRuns } from "@plugins/build/plugins/run-ledger/server";
import { wantsBuild } from "@plugins/build/plugins/deployment/core";
import type { BuildAttempt } from "@plugins/build/plugins/deployment/core";
import { readDeployment } from "@plugins/build/plugins/deployment/server";
import { buildConfig } from "../../shared";

/**
 * What the last FINISHED main build was for. `build_runs.commitHash` +
 * `exitCode` already are the attempt record — there is no new storage here.
 *
 * Closed rows only, so `ok` is always an outcome rather than a guess about a run
 * still in flight. The cost is that a reconcile firing while a build is running
 * can decide "yes" and then have `triggerBuild` drop it against the durable
 * in-flight lock — harmless, because the build's own terminal edge reconciles
 * again. Scoped to this namespace's own main runs: a worktree DB is forked from
 * main and inherits its rows.
 */
export async function lastClosedAttempt(): Promise<BuildAttempt | null> {
  const [row] = await db
    .select({
      commitHash: _buildRuns.commitHash,
      exitCode: _buildRuns.exitCode,
    })
    .from(_buildRuns)
    .where(
      and(
        eq(_buildRuns.namespace, currentWorktreeName()),
        eq(_buildRuns.target, "main"),
        isNotNull(_buildRuns.finishedAt),
      ),
    )
    .orderBy(desc(_buildRuns.startedAt))
    .limit(1);
  if (row === undefined) return null;
  return { commit: row.commitHash, ok: row.exitCode === 0 };
}

/**
 * Does the current state call for an auto-build? The policy itself is the pure
 * `wantsBuild`; this only binds it to the db / config / git singletons and to
 * the v1 scope decision.
 *
 * Auto-build stays MAIN-ONLY: worktrees build via an explicit
 * `./singularity build`. `autoBuild: false` remains the kill switch.
 */
export async function deploymentWantsBuild(): Promise<boolean> {
  if (!isMain()) return false;
  if (!getConfig(buildConfig).autoBuild) return false;
  return wantsBuild(await readDeployment(), await lastClosedAttempt());
}
