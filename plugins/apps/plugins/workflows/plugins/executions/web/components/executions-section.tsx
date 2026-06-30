import { useMemo } from "react";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  workflowExecutionsDescriptor,
  type WorkflowExecution,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { executionDetailPane } from "../panes";
import { ExecutionStatusBadge } from "./execution-status-badge";
import { RunDefinitionButton } from "./run-definition-button";

const WORKFLOWS_EXECUTIONS_VIEW = defineDataView("workflows.executions");

export function ExecutionsSection({ definitionId }: { definitionId: string }) {
  const result = useResource(workflowExecutionsDescriptor);
  const openPane = useOpenPane();

  const fields: FieldDef<WorkflowExecution>[] = useMemo(
    () => [
      {
        id: "status",
        label: "Status",
        type: "enum",
        options: [
          { value: "pending", label: "Pending" },
          { value: "running", label: "Running" },
          { value: "suspended", label: "Suspended" },
          { value: "completed", label: "Completed" },
          { value: "failed", label: "Failed" },
          { value: "cancelled", label: "Cancelled" },
          { value: "expired", label: "Expired" },
        ],
        value: (e) => e.status,
        cell: (e) => <ExecutionStatusBadge status={e.status} />,
      },
      {
        id: "created",
        label: "Created",
        value: (e) => e.createdAt,
        cell: (e) => <RelativeTime date={new Date(e.createdAt)} />,
      },
      {
        id: "completed",
        label: "Completed",
        value: (e) => e.completedAt ?? "",
        cell: (e) =>
          e.completedAt ? (
            <RelativeTime date={new Date(e.completedAt)} />
          ) : (
            <Text as="span" variant="caption" className="text-muted-foreground">—</Text>
          ),
      },
      {
        id: "steps",
        label: "Steps",
        type: "number",
        align: "end",
        value: (e) => e.steps.length,
      },
    ],
    [],
  );

  const renderList = (executions: WorkflowExecution[], loading: boolean) => (
    <DataView<WorkflowExecution>
      rows={executions}
      fields={fields}
      rowKey={(e) => e.id}
      views={["list"]}
      defaultView="list"
      storageKey={WORKFLOWS_EXECUTIONS_VIEW}
      loading={loading}
      onRowActivate={(e) =>
        openPane(executionDetailPane, { executionId: e.id }, { mode: "push" })
      }
      actions={<RunDefinitionButton definitionId={definitionId} />}
      emptyState="No runs yet. Click Run to start one."
    />
  );

  return matchResource(result, {
    pending: () => renderList([], true),
    error: () => renderList([], true),
    ready: (executions) =>
      renderList(
        executions.filter((e) => e.definitionId === definitionId),
        false,
      ),
  });
}
