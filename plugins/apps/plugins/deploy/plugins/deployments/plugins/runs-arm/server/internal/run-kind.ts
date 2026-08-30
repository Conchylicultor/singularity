import { sql, type SQL } from "drizzle-orm";
import { _deployServers } from "@plugins/apps/plugins/deploy/plugins/servers/server";
import { _deployRuns } from "@plugins/apps/plugins/deploy/plugins/deployments/server";
import { defineRunKind } from "@plugins/runs/server";
import {
  DEPLOY_RUN_KIND,
  DEPLOY_STATUS_OUTCOME,
  deployRunFields,
} from "../../core";

/**
 * `deploy_runs.status` → the shared outcome vocabulary.
 *
 * One-to-one today, and written out anyway rather than passing the column
 * through. A passthrough would let a fourth status added to `deploy_runs` reach
 * the page as an outcome the shared vocabulary does not have; folding the
 * branches out of the typed map in `core/` makes that a `tsc` error instead, and
 * a status that somehow escaped it still yields `NULL` and throws loudly rather
 * than rendering as nothing.
 */
function outcomeExpr(): SQL {
  const branches = Object.entries(DEPLOY_STATUS_OUTCOME).map(
    ([status, outcome]) => sql`when ${status}::text then ${outcome}::text`,
  );
  return sql`(case ${_deployRuns.status} ${sql.join(branches, sql` `)} end)`;
}

/**
 * `<composition> on <server name>` — what this run put where.
 *
 * The run row carries `server_id`, which is a mint-time string like
 * `srv-1712…-ab12cd`: a fine dimension to filter by and useless as a label. The
 * server's own name is one correlated read away, and the label is the one place
 * a person reads rather than filters, so it is worth the subquery — evaluated
 * per returned row, of which there are at most a page.
 *
 * `coalesce` back to the id because `server_id` is copied onto the run rather
 * than joined (see the table's comment): the server row can be gone while the
 * run record remains, and `label` is a non-nullable base column.
 */
const labelExpr = sql`(${_deployRuns.compositionId} || ' on ' || coalesce(
  (select ${_deployServers.name} from ${_deployServers}
   where ${_deployServers.id} = ${_deployRuns.serverId}),
  ${_deployRuns.serverId}
))`;

/**
 * The deploy arm of the merged run space.
 *
 * ## The base column that reads `null`, and why
 *
 * `namespace` — a deploy targets a **remote server**, not a worktree. There is
 * no namespace it belongs to, and the worktree whose backend happened to launch
 * the CLI is a fact about who pressed the button, not about where the software
 * went.
 *
 * ## `trigger` is the verb
 *
 * A deploy records no separate initiator, and the verb is the closest thing to
 * "how did this start": `update` is the app's primary action, `converge` and
 * `ship` are the scripted / row-action ones. It is kept as `deploy.verb` too, so
 * the same fact is filterable precisely (a closed enum with chips) as well as
 * generically.
 *
 * ## `message` is the CLI's own words
 *
 * The CLI owns every refusal; this app only launches it. The column holds that
 * refusal verbatim and the row renders it untruncated, because a paraphrase of
 * "the command refused, and this is what it said" is the one thing that must not
 * happen to it.
 */
export const deployRunKind = defineRunKind({
  kind: DEPLOY_RUN_KIND,
  table: _deployRuns,
  fields: deployRunFields,
  base: {
    id: _deployRuns.id,
    label: labelExpr,
    outcome: outcomeExpr(),
    trigger: _deployRuns.verb,
    startedAt: _deployRuns.startedAt,
    finishedAt: _deployRuns.finishedAt,
    namespace: null,
    message: _deployRuns.message,
  },
  extra: {
    "deploy.verb": _deployRuns.verb,
    "deploy.phaseFailed": _deployRuns.phaseFailed,
    "deploy.serverId": _deployRuns.serverId,
    "deploy.deploymentId": _deployRuns.deploymentId,
    "deploy.compositionId": _deployRuns.compositionId,
    "deploy.commitSha": _deployRuns.commitSha,
    "deploy.releaseRunId": _deployRuns.releaseRunId,
    "deploy.exitCode": _deployRuns.exitCode,
  },
});
