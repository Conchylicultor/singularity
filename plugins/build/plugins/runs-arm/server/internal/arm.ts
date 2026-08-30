import { eq, sql } from "drizzle-orm";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { defineRunKind } from "@plugins/runs/server";
import { _buildRuns } from "@plugins/build/plugins/run-ledger/server";
import { BUILD_RUN_KIND } from "@plugins/build/plugins/run-ledger/core";
import { buildRunArmFields } from "../../core";
import { buildOutcomeExpr, buildStatusExpr } from "./status-sql";

// Decided once and projected twice — as the shared `outcome` (collapsed) and as
// the `build.status` arm field (precise). Two projections of ONE expression, so
// a row can never be `canceled` on one column and `failed` on the other.
const statusExpr = buildStatusExpr(_buildRuns.finishedAt, _buildRuns.exitCode);

/**
 * Builds, as an arm of the merged run space.
 *
 * `label` is the targets joined, because that is what a build *is of*:
 * `./singularity build --composition sonata website` is one invocation carrying
 * two target chips, and the ledger deliberately records it as one row rather
 * than two. A plain build reads `singularity`.
 *
 * Two base columns are worth explaining:
 *
 * - `message: null` — `build_runs` has no error column. A build's own words
 *   about why it failed live in its transcript (`build-logs`), which is a file
 *   on disk, not a column; putting the first line of it here would be inventing
 *   a summary the ledger never wrote. The exit code carries what the row
 *   actually knows, and it is `build.exitCode`.
 * - `trigger` — a real column, and the one base field builds fill in that most
 *   other kinds cannot.
 */
export const buildRunKind = defineRunKind({
  kind: BUILD_RUN_KIND,
  table: _buildRuns,
  fields: buildRunArmFields,
  base: {
    id: _buildRuns.id,
    // `array_to_string`, not the array itself: `label` is the row's title, and a
    // title is text. The array survives untouched as `build.targets`, where it
    // is a `tags` field a person can filter one chip of.
    label: sql`array_to_string(${_buildRuns.targets}, ', ')`,
    outcome: buildOutcomeExpr(statusExpr),
    trigger: _buildRuns.trigger,
    startedAt: _buildRuns.startedAt,
    finishedAt: _buildRuns.finishedAt,
    namespace: _buildRuns.namespace,
    message: null,
  },
  extra: {
    "build.status": statusExpr,
    "build.targets": _buildRuns.targets,
    "build.commitHash": _buildRuns.commitHash,
    "build.exitCode": _buildRuns.exitCode,
  },
  // THIS WORKTREE'S builds only, and it must be here rather than left to the
  // user's filter. A worktree DB is FORKED from main, so it inherits every row
  // main had at fork time; unscoped, the merged list would open on main's stale
  // history — including a finished-long-ago failure that reads as this
  // worktree's own. `buildHistoryResource`, the surface this replaces, has
  // carried exactly this predicate for the same reason, so dropping it here
  // would be a silent regression on the app's most-used surface rather than a
  // new view being generous.
  //
  // `currentWorktreeName()` reads `process.env.SINGULARITY_WORKTREE`, constant
  // for the process lifetime (one backend per worktree), so evaluating it once
  // at module eval is correct — same call, same reasoning, as the resource.
  where: eq(_buildRuns.namespace, currentWorktreeName()),
});
