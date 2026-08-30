import { useMemo, type ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { armNumber, armText, runArmFields } from "@plugins/runs/web";
import type { UnionRun } from "@plugins/runs/core";
import {
  DeployPhaseSchema,
  DeployVerbSchema,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { deployRunFields } from "../../core";

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
 * Every one is a real projected SQL column, bound to the arm's
 * `defineRunArmFields` declaration twice over — `runArmFields` checks the
 * `FieldDef.id`, and `armText` / `armNumber` check the accessor's type against
 * the same declaration. A field id that drifts off its server column does not
 * fail at runtime; it silently degrades into client-side-only filtering over the
 * loaded window, so both halves are made not to compile instead.
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
}: FieldExtensionProps<UnionRun>): ReactNode {
  const fields = useMemo<FieldDef<UnionRun>[]>(() => {
    const verb = armText(deployRunFields, "deploy.verb");
    const phaseFailed = armText(deployRunFields, "deploy.phaseFailed");
    const compositionId = armText(deployRunFields, "deploy.compositionId");
    const serverId = armText(deployRunFields, "deploy.serverId");
    const deploymentId = armText(deployRunFields, "deploy.deploymentId");
    const commitSha = armText(deployRunFields, "deploy.commitSha");
    const releaseRunId = armText(deployRunFields, "deploy.releaseRunId");
    const exitCode = armNumber(deployRunFields, "deploy.exitCode");
    return runArmFields(deployRunFields, [
      {
        id: "deploy.verb",
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
        label: "Exit code",
        type: "number",
        value: exitCode,
        sortable: true,
        filterable: true,
        visible: false,
        width: "6rem",
      },
    ]);
  }, []);

  return <>{render(fields)}</>;
}
