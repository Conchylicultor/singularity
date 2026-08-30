import { defineRunArmFields } from "@plugins/runs/core";
import { DEPLOY_RUN_KIND } from "./kind";

/**
 * The columns only a deploy run has.
 *
 * One declaration, read by both runtimes: `defineRunKind` demands a column
 * expression for exactly these keys, and `runArmFields` demands that any web
 * `FieldDef` binding one of them agrees about its type — so a field id that
 * drifts off its server column does not compile, rather than silently degrading
 * into client-side-only filtering over the loaded window.
 *
 * `deploy.verb` is also projected as the base `trigger`, deliberately: the verb
 * is the closest thing a deploy has to "how did this start", and `trigger` is
 * the column a person filters across kinds by. Keeping it here too is what lets
 * the same fact be filtered *precisely* — as a closed three-value enum with
 * chips — rather than only as free text.
 *
 * The four ids (`serverId`, `deploymentId`, `compositionId`, `releaseRunId`) are
 * dimensions, not decoration: they are what makes "every run that touched this
 * box" or "everything that shipped this release" a query rather than a scroll.
 */
export const deployRunFields = defineRunArmFields(DEPLOY_RUN_KIND, {
  /** `converge` / `ship` / `update` — what the run was asked to do. */
  "deploy.verb": { type: "enum", sqlType: "text" },
  /** Which leg of an `update` died. Null on a success, and on a single-verb run. */
  "deploy.phaseFailed": { type: "enum", sqlType: "text", nullable: true },
  /** The remote box. An opaque id — a dimension to filter by, not a name. */
  "deploy.serverId": { type: "text", sqlType: "text" },
  /** The (composition × server) install this run belongs to. */
  "deploy.deploymentId": { type: "text", sqlType: "text" },
  "deploy.compositionId": { type: "text", sqlType: "text" },
  /** The commit the shipped bundle was built from. Null where genuinely unknown. */
  "deploy.commitSha": { type: "text", sqlType: "text", nullable: true },
  /**
   * The `release_runs.id` this `ship` pinned. Null on a converge, and on a bare
   * ship that let the CLI follow `latest-<platform>` inside its own process.
   */
  "deploy.releaseRunId": { type: "text", sqlType: "text", nullable: true },
  /** The CLI's exit code. Null while running, and when it could not be spawned. */
  "deploy.exitCode": { type: "number", sqlType: "integer", nullable: true },
});
