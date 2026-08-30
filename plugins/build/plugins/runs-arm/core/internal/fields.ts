import { defineRunArmFields } from "@plugins/runs/core";
import { BUILD_RUN_KIND } from "@plugins/build/plugins/run-ledger/core";

/**
 * The columns only a build row has.
 *
 * `build.status` is the whole point of the arm. The shared `outcome` axis
 * deliberately collapses `superseded` / `interrupted` / `killed` into one
 * `canceled`, because those three distinctions are not true of every kind of
 * run — but they are exactly the distinctions a person reading a build list
 * needs, and none of the three is a defect. Keeping the six-way taxonomy as an
 * arm field is how precision survives the collapse: filter `outcome is canceled`
 * across every ledger, then filter `build.status is superseded` when the
 * question is about builds.
 *
 * `build.exitCode` is here because it is the one fact that separates two builds
 * sharing a status, and because it is what makes the drift between
 * `buildStatusOf` and the SQL `CASE` observable from the surface itself.
 */
// Passing the ledger's own kind constant is what ties these column ids to it:
// the call throws at module eval if any id is not prefixed with that exact
// string, so a rename cannot leave the columns behind.
export const buildRunArmFields = defineRunArmFields(BUILD_RUN_KIND, {
  "build.status": { type: "enum", sqlType: "text" },
  "build.targets": { type: "tags", sqlType: "text[]" },
  "build.commitHash": { type: "text", sqlType: "text", nullable: true },
  "build.exitCode": { type: "number", sqlType: "integer", nullable: true },
});
