import { eq, sql } from "drizzle-orm";
import { currentWorktreeName } from "@plugins/infra/plugins/paths/server";
import { defineRunKind } from "@plugins/runs/server";
import { _releaseRuns } from "@plugins/release/server";
import { RELEASE_RUN_KIND, releaseRunArmFields } from "../../core";
import { releaseOutcomeExpr } from "./outcome-sql";

/**
 * Releases, as an arm of the merged run space.
 *
 * The base columns worth explaining:
 *
 * - `label` — composition **and** target. A release is of a composition *for* a
 *   target, and the composition alone would put two rows of the same name next
 *   to each other in a list whose whole job is telling runs apart. Both stay
 *   available as their own filterable arm fields.
 * - `trigger` is **null**. The base column means "what set this off" — a person,
 *   a schedule, another run — and `release_runs` records nothing of the sort.
 *   The nearest column is `kind` (`staged` / `candidate`), but that is *why the
 *   run was cut*, not what started it: filling `trigger` with it would make the
 *   shared Trigger column mean one thing for a build and another for a release,
 *   which is the one thing a shared column may not do. It is `release.kind`
 *   instead, where it is exactly itself.
 * - `message` is `error`, the run's own words about the failure, verbatim.
 * - `namespace` is real: a worktree DB forks main and inherits main's rows, so a
 *   release row without its producing namespace is a phantom.
 */
export const releaseRunKind = defineRunKind({
  kind: RELEASE_RUN_KIND,
  table: _releaseRuns,
  fields: releaseRunArmFields,
  base: {
    id: _releaseRuns.id,
    label: sql`concat_ws(' · ', ${_releaseRuns.composition}, ${_releaseRuns.target})`,
    outcome: releaseOutcomeExpr(_releaseRuns.status),
    trigger: null,
    startedAt: _releaseRuns.startedAt,
    finishedAt: _releaseRuns.finishedAt,
    namespace: _releaseRuns.namespace,
    message: _releaseRuns.error,
  },
  extra: {
    "release.kind": _releaseRuns.kind,
    "release.composition": _releaseRuns.composition,
    "release.target": _releaseRuns.target,
    "release.platform": _releaseRuns.platform,
    "release.commitSha": _releaseRuns.commitSha,
    "release.commitDirty": _releaseRuns.commitDirty,
    "release.artifactPath": _releaseRuns.artifactPath,
  },
  // THIS WORKTREE'S releases only — the same fork-inheritance problem as the
  // build arm, and the same fix. `release_runs` has a real `namespace` column
  // precisely because a worktree DB inherits main's rows, and the table's own
  // comment says so. Unscoped, every worktree's merged list would open on
  // main's release history.
  where: eq(_releaseRuns.namespace, currentWorktreeName()),
});
