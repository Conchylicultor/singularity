import { z } from "zod";
import { liveArmColumns } from "@plugins/network/plugins/live/core";
import {
  liveNumber,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { runs } from "@plugins/runs/core";
import { DEPLOY_RUN_KIND } from "./kind";

/**
 * The columns only a deploy run has — its slice of the `runs` union
 * (`$columns.deploy`), wire names `deploy.<field>`.
 *
 * `verb` is also projected as the base `trigger`, deliberately: the verb is the
 * closest thing a deploy has to "how did this start", and `trigger` is the
 * column a person filters across kinds by. Keeping it here too lets the same
 * fact be filtered *precisely* — a closed three-value enum with chips.
 *
 * The four ids (`serverId`, `deploymentId`, `compositionId`, `releaseRunId`) are
 * dimensions: "every run that touched this box" or "everything that shipped
 * this release" is a query rather than a scroll.
 */
export const deployRunColumns = liveArmColumns(runs, DEPLOY_RUN_KIND, {
  row: z.object({
    /** `converge` / `ship` / `update` — what the run was asked to do. */
    verb: z.string(),
    /** Which leg of an `update` died. Null on a success, and on a single-verb run. */
    phaseFailed: z.string().nullable(),
    /** The remote box. An opaque id — a dimension to filter by, not a name. */
    serverId: z.string(),
    /** The (composition × server) install this run belongs to. */
    deploymentId: z.string(),
    compositionId: z.string(),
    /** The commit the shipped bundle was built from. Null where genuinely unknown. */
    commitSha: z.string().nullable(),
    /** The `release_runs.id` this `ship` pinned. Null on a converge, or a bare ship. */
    releaseRunId: z.string().nullable(),
    /** The CLI's exit code. Null while running, and when it could not be spawned. */
    exitCode: z.number().nullable(),
  }),
  filterable: {
    verb: liveText(),
    phaseFailed: liveText(),
    serverId: liveText(),
    deploymentId: liveText(),
    compositionId: liveText(),
    commitSha: liveText(),
    releaseRunId: liveText(),
    exitCode: liveNumber(),
  },
  sortable: [
    "verb",
    "phaseFailed",
    "serverId",
    "deploymentId",
    "compositionId",
    "commitSha",
    "releaseRunId",
    "exitCode",
  ],
});
