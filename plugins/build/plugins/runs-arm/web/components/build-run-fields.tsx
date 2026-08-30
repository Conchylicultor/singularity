import type { ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import {
  BUILD_STATUS_OPTIONS,
  BuildStatusChip,
} from "@plugins/build/plugins/build-status/web";
import { armNumber, armTags, armText, runArmFields } from "@plugins/runs/web";
import type { UnionRun } from "@plugins/runs/core";
import { BUILD_RUN_KIND } from "@plugins/build/plugins/run-ledger/core";
import { buildRunArmFields } from "../../core";
import { buildOutcomeOf } from "../internal/outcome";

// Bound once against this arm's own column declaration: the id must be declared,
// and its declared type must be one the accessor can read, or it does not
// compile. `runArmFields` makes the same binding for the `FieldDef.id` below.
const statusOf = armText(buildRunArmFields, "build.status");
const targetsOf = armTags(buildRunArmFields, "build.targets");
const commitHashOf = armText(buildRunArmFields, "build.commitHash");
const exitCodeOf = armNumber(buildRunArmFields, "build.exitCode");

/**
 * The dimensions only a build row has.
 *
 * Every cell here has to survive being rendered on a row of ANOTHER kind: the
 * table view is strictly field-driven, so a backup row still gets a `Status`
 * cell — it is simply blank, because the column is NULL there. That is why each
 * cell reads the projected column (or checks the kind) rather than assuming a
 * build.
 *
 * Plain data behind a trivial component: `Runs.Fields` takes a component so a
 * contributor CAN load its options from a hook (the events source field does),
 * and this one has nothing to load — the six build statuses are a closed set the
 * `build-status` plugin already publishes.
 */
const FIELDS: FieldDef<UnionRun>[] = runArmFields(buildRunArmFields, [
  {
    id: "build.status",
    label: "Build status",
    type: "enum",
    // The projected column, so sort / filter / group-by compile to SQL against
    // the same expression the cell renders.
    value: statusOf,
    options: BUILD_STATUS_OPTIONS,
    cell: (run) =>
      run.kind === BUILD_RUN_KIND ? (
        <BuildStatusChip run={buildOutcomeOf(run)} />
      ) : null,
    sortable: true,
    filterable: true,
    groupable: true,
    width: "11rem",
  },
  {
    id: "build.targets",
    label: "Targets",
    type: "tags",
    // `values`, not `value`: one build carries N target chips, and filtering
    // "contains sonata" has to mean one chip of the list rather than a substring
    // of a joined string.
    values: targetsOf,
    filterable: true,
    // Off by default: `label` already IS the joined targets, so the column earns
    // its place only when someone wants to filter one chip out of the list.
    visible: false,
    width: "12rem",
  },
  {
    id: "build.commitHash",
    label: "Commit",
    type: "text",
    value: commitHashOf,
    cell: (run) => {
      const hash = commitHashOf(run);
      return hash === null ? null : (
        <Badge variant="muted" mono title={hash}>
          {hash.slice(0, 8)}
        </Badge>
      );
    },
    filterable: true,
    visible: false,
    width: "7rem",
  },
  {
    id: "build.exitCode",
    label: "Exit code",
    type: "number",
    value: exitCodeOf,
    sortable: true,
    filterable: true,
    visible: false,
    width: "6rem",
  },
]);

export function BuildRunFields({
  render,
}: FieldExtensionProps<UnionRun>): ReactNode {
  return <>{render(FIELDS)}</>;
}
