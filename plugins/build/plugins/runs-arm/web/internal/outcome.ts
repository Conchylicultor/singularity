import { armNumber } from "@plugins/runs/web";
import type { UnionRun } from "@plugins/runs/core";
import type { BuildRunOutcome } from "@plugins/build/plugins/build-status/core";
import { buildRunArmFields } from "../../core";

/** Bound once, against this arm's own column declaration. */
const exitCodeOf = armNumber(buildRunArmFields, "build.exitCode");

/**
 * The two fields `BuildStatusDot` / `BuildStatusChip` / `BuildStatusBadge` decide
 * a status from, recovered off a merged row.
 *
 * Both are already on the row — `finishedAt` is a base column every kind has,
 * and the exit code is this arm's own — so the build-status components are
 * reused exactly as they are on the build pane, rather than re-implemented
 * against the projected `build.status` string. The two agree by construction:
 * the projected column is `buildStatusExpr`, and `status-sql.test.ts` holds it
 * equal to the `buildStatusOf` these components call.
 */
export function buildOutcomeOf(run: UnionRun): BuildRunOutcome {
  return { finishedAt: run.finishedAt, exitCode: exitCodeOf(run) };
}
