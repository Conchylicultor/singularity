import { z } from "zod";
import { liveArmColumns } from "@plugins/network/plugins/live/core";
import {
  liveNumber,
  liveStringArray,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type { BuildStatus } from "@plugins/build/plugins/build-status/core";
import { BUILD_RUN_KIND } from "@plugins/build/plugins/run-ledger/core";
import { runs } from "@plugins/runs/core";

/**
 * The six build statuses, as a schema. A `Record`-checked list rather than a
 * free `z.enum`: a seventh `BuildStatus` fails to compile here.
 */
const BUILD_STATUS_VALUES = {
  running: true,
  success: true,
  superseded: true,
  interrupted: true,
  killed: true,
  failed: true,
} satisfies Record<BuildStatus, true>;

export const BuildStatusSchema: ZodParser<BuildStatus> = z.enum(
  Object.keys(BUILD_STATUS_VALUES) as [BuildStatus, ...BuildStatus[]],
);

/**
 * The columns only a build row has — its slice of the `runs` union
 * (`$columns.build`), wire names `build.<field>`.
 *
 * `status` is the whole point of the arm. The shared `outcome` axis
 * deliberately collapses `superseded` / `interrupted` / `killed` into one
 * `canceled`, because those three distinctions are not true of every kind of
 * run — but they are exactly the distinctions a person reading a build list
 * needs. Keeping the six-way taxonomy as an arm field is how precision
 * survives the collapse: filter `outcome is canceled` across every ledger, then
 * `build.status is superseded` when the question is about builds.
 *
 * `exitCode` is the one fact that separates two builds sharing a status, and
 * what makes drift between `buildStatusOf` and the SQL `CASE` observable from
 * the surface itself.
 */
export const buildRunColumns = liveArmColumns(runs, BUILD_RUN_KIND, {
  row: z.object({
    status: BuildStatusSchema,
    targets: z.array(z.string()),
    commitHash: z.string().nullable(),
    exitCode: z.number().nullable(),
  }),
  filterable: {
    status: liveText(),
    targets: liveStringArray(),
    commitHash: liveText(),
    exitCode: liveNumber(),
  },
  sortable: ["status", "exitCode"],
});
