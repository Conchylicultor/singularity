import { useMemo, type ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import type { RunRow } from "@plugins/runs/core";
import {
  DeployPhaseSchema,
  DeployVerbSchema,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { deployRunColumns } from "../../core";

/** This arm's slice of a row, or null on another kind's row. */
const own = (run: RunRow) => deployRunColumns.read(run);

/** An id column reads as a monospace chip, or as nothing on another kind's row. */
function idCell(value: string | null): ReactNode {
  return value === null ? null : (
    <Badge variant="muted" mono title={value}>
      {value}
    </Badge>
  );
}

/**
 * The deploy arm's own columns in the merged run DataView.
 *
 * Every one binds the arm's own column (`deployRunColumns.column(…)`), so its
 * sort and filter are SQL over the union, and its value is read off the arm's
 * slice of the row (`null` on another kind's row).
 *
 * The verb and phase options come from the deployments plugin's own schemas, not
 * from the loaded rows: the window is server-paginated, so deriving them would
 * offer only the verbs that happen to be on screen — and a fourth verb added
 * there appears here for free.
 *
 * Everything defaults to hidden. These are dimensions first — "every run that
 * touched this box", "everything that shipped this release" — and a column blank
 * on three kinds out of four does not earn a permanent place in a mixed table.
 */
export function DeployRunFields({
  render,
}: FieldExtensionProps<RunRow>): ReactNode {
  const fields = useMemo<FieldDef<RunRow>[]>(() => {
    const verb = (r: RunRow) => own(r)?.verb ?? null;
    const phaseFailed = (r: RunRow) => own(r)?.phaseFailed ?? null;
    const compositionId = (r: RunRow) => own(r)?.compositionId ?? null;
    const serverId = (r: RunRow) => own(r)?.serverId ?? null;
    const deploymentId = (r: RunRow) => own(r)?.deploymentId ?? null;
    const commitSha = (r: RunRow) => own(r)?.commitSha ?? null;
    const releaseRunId = (r: RunRow) => own(r)?.releaseRunId ?? null;
    const exitCode = (r: RunRow) => own(r)?.exitCode ?? null;
    return [
      {
        id: "deploy.verb",
        column: deployRunColumns.column("verb"),
        label: "Verb",
        type: "enum",
        options: DeployVerbSchema.options.map((value) => ({
          value,
          label: value,
        })),
        value: verb,
        cell: (r) => {
          const v = verb(r);
          return v === null ? null : <Badge variant="muted">{v}</Badge>;
        },
        sortable: true,
        filterable: true,
        groupable: true,
        visible: false,
        width: "7rem",
      },
      {
        id: "deploy.phaseFailed",
        column: deployRunColumns.column("phaseFailed"),
        label: "Failed phase",
        type: "enum",
        options: DeployPhaseSchema.options.map((value) => ({
          value,
          label: value,
        })),
        value: phaseFailed,
        cell: (r) => {
          const v = phaseFailed(r);
          return v === null ? null : <Badge variant="destructive">{v}</Badge>;
        },
        sortable: true,
        filterable: true,
        groupable: true,
        visible: false,
        width: "8rem",
      },
      {
        id: "deploy.compositionId",
        column: deployRunColumns.column("compositionId"),
        label: "Composition",
        type: "text",
        value: compositionId,
        sortable: true,
        filterable: true,
        visible: false,
        width: "10rem",
      },
      {
        id: "deploy.serverId",
        column: deployRunColumns.column("serverId"),
        label: "Server",
        type: "text",
        value: serverId,
        cell: (r) => idCell(serverId(r)),
        sortable: true,
        filterable: true,
        visible: false,
        width: "12rem",
      },
      {
        id: "deploy.deploymentId",
        column: deployRunColumns.column("deploymentId"),
        label: "Deployment",
        type: "text",
        value: deploymentId,
        cell: (r) => idCell(deploymentId(r)),
        sortable: true,
        filterable: true,
        visible: false,
        width: "12rem",
      },
      {
        id: "deploy.commitSha",
        column: deployRunColumns.column("commitSha"),
        label: "Commit",
        type: "text",
        value: commitSha,
        // Short in the cell, whole in the tooltip and in the filter — the value
        // accessor is untouched, so a search for a full sha still matches.
        cell: (r) => {
          const v = commitSha(r);
          return v === null ? null : (
            <Badge variant="muted" mono title={v}>
              {v.slice(0, 8)}
            </Badge>
          );
        },
        sortable: true,
        filterable: true,
        visible: false,
        width: "8rem",
      },
      {
        id: "deploy.releaseRunId",
        column: deployRunColumns.column("releaseRunId"),
        label: "Release run",
        type: "text",
        value: releaseRunId,
        cell: (r) => idCell(releaseRunId(r)),
        sortable: true,
        filterable: true,
        visible: false,
        width: "12rem",
      },
      {
        id: "deploy.exitCode",
        column: deployRunColumns.column("exitCode"),
        label: "Exit code",
        type: "number",
        value: exitCode,
        sortable: true,
        filterable: true,
        visible: false,
        width: "6rem",
      },
    ];
  }, []);

  return <>{render(fields)}</>;
}
