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
import type { RunRow } from "@plugins/runs/core";
import { BUILD_RUN_KIND } from "@plugins/build/plugins/run-ledger/core";
import { buildRunColumns } from "../../core";
import { buildOutcomeOf } from "../internal/outcome";

/** This arm's slice of a row, or null on another kind's row. */
const own = (run: RunRow) => buildRunColumns.read(run);

/**
 * The dimensions only a build row has.
 *
 * Every cell here has to survive being rendered on a row of ANOTHER kind: the
 * table view is strictly field-driven, so a backup row still gets a `Status`
 * cell — blank, because the arm's handle reads `null` off another kind's row.
 * Each field binds its arm column (`column`), so the field id stays
 * `build.<field>` (saved views unchanged) and its sort / filter is SQL.
 *
 * Plain data behind a trivial component: `Runs.Fields` takes a component so a
 * contributor CAN load its options from a hook (the events source field does),
 * and this one has nothing to load — the six build statuses are a closed set the
 * `build-status` plugin already publishes.
 */
const FIELDS: FieldDef<RunRow>[] = [
  {
    id: "build.status",
    label: "Build status",
    type: "enum",
    // The arm's column, so sort / filter compile to SQL against the same
    // expression the cell renders.
    column: buildRunColumns.column("status"),
    value: (run) => own(run)?.status ?? null,
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
    column: buildRunColumns.column("targets"),
    values: (run) => own(run)?.targets ?? [],
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
    column: buildRunColumns.column("commitHash"),
    value: (run) => own(run)?.commitHash ?? null,
    cell: (run) => {
      const hash = own(run)?.commitHash ?? null;
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
    column: buildRunColumns.column("exitCode"),
    value: (run) => own(run)?.exitCode ?? null,
    sortable: true,
    filterable: true,
    visible: false,
    width: "6rem",
  },
];

export function BuildRunFields({
  render,
}: FieldExtensionProps<RunRow>): ReactNode {
  return <>{render(FIELDS)}</>;
}
