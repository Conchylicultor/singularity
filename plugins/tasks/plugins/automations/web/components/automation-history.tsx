import { useMemo, type ReactElement } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  combineResources,
  foldResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import type {
  HostedToolbar,
  HostedToolbarParts,
} from "@plugins/primitives/plugins/data-view/core";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  TaskStatusSchema,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import { useTasksById } from "@plugins/tasks/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import {
  STATUS_META,
  StatusIcon,
  StatusSignal,
} from "@plugins/tasks/plugins/task-status/web";
import { automationTasks, type AutomationTaskRow } from "../../core";
import { Automations } from "../internal/slots";

// Marker scraped by codegen (data-views.generated.ts). Must live in web/**.
const HISTORY_VIEW = defineDataView("tasks.automations.history");

// The collection's ceiling: one automation's history, newest first. Older
// filings past it are said to exist (below the list), never silently dropped.
const HISTORY_LIMIT = 200;

/** One filing, joined to its task — `null` for a task deleted since (its
 * origin row goes with it, so this lasts only until the delete is pushed). */
interface HistoryRow {
  origin: AutomationTaskRow;
  task: TaskListItem | null;
}

const NO_ROWS: HistoryRow[] = [];

const STATUS_OPTIONS = TaskStatusSchema.options.map((status) => ({
  value: status,
  label: STATUS_META[status].label,
}));

// The heading IS the list's header, in the same eyebrow the settings panel's
// sections wear above it: one automation's tasks are few, so a toolbar band of
// its own would be a strip that does nothing. The options trigger (search,
// filter, sort) sits beside the heading.
function HistoryFrame({ options, body }: HostedToolbarParts): ReactElement {
  return (
    <Stack gap="xs">
      <Stack direction="row" gap="sm" align="center">
        <Fill>
          <Text as="h3" variant="eyebrow" tone="muted">
            History
          </Text>
        </Fill>
        {options}
      </Stack>
      {body}
    </Stack>
  );
}

const HISTORY_TOOLBAR: HostedToolbar = { kind: "hosted", frame: HistoryFrame };

/**
 * The tasks this automation filed or started, newest first, each with its
 * task's title and status. Activating a row opens the task.
 */
export function AutomationHistory({
  automationId,
}: {
  automationId: string;
}): ReactElement {
  const openPane = useOpenPane();
  const filings = useLive(automationTasks, {
    where: { automationId },
    limit: HISTORY_LIMIT,
  });
  const ids = useMemo(
    () =>
      foldResource(filings, {
        loading: () => [],
        error: () => [],
        ready: (rows) => rows.map((r) => r.taskId),
      }),
    [filings],
  );
  const tasks = useTasksById(ids);
  const result = useMemo(
    () => combineResources({ filings, tasks }),
    [filings, tasks],
  );
  const rows = useMemo(
    () =>
      foldResource(result, {
        loading: () => NO_ROWS,
        error: () => NO_ROWS,
        ready: (d) =>
          d.filings.map((origin) => ({
            origin,
            task: d.tasks.get(origin.taskId) ?? null,
          })),
      }),
    [result],
  );
  const truncated = filings.status === "ready" && filings.canGrow;

  const fields = useMemo<FieldDef<HistoryRow>[]>(
    () => [
      {
        id: "title",
        label: "Task",
        type: "text",
        primary: true,
        value: (r) => r.task?.title ?? "",
      },
      {
        id: "status",
        label: "Status",
        type: "enum",
        value: (r) => r.task?.status ?? null,
        options: STATUS_OPTIONS,
        filterable: true,
        groupable: true,
        visible: false,
      },
      {
        id: "filedAt",
        label: "Filed or started",
        type: "date",
        value: (r) => new Date(r.origin.filedAt),
        sortable: true,
        visible: false,
      },
    ],
    [],
  );

  return (
    <Stack gap="xs">
      <DataView<HistoryRow>
        rows={rows}
        fields={fields}
        rowKey={(r) => r.origin.taskId}
        views={["list"]}
        storageKey={HISTORY_VIEW}
        readiness={result}
        toolbar={HISTORY_TOOLBAR}
        rowActivation={(r) =>
          openPane.to(
            taskDetailPane,
            { taskId: r.origin.taskId },
            { mode: "push" },
          )
        }
        searchAccessor={(r) => r.task?.title ?? ""}
        searchPlaceholder="Search its tasks…"
        viewOptions={{
          list: {
            leading: (r: HistoryRow) =>
              r.task === null ? null : <StatusIcon status={r.task.status} />,
            renderRow: (r: HistoryRow) => <HistoryRowBody row={r} />,
            detail: (r: HistoryRow) => (
              <TaskDetail
                taskId={r.origin.taskId}
                automationId={automationId}
              />
            ),
          },
        }}
        emptyState={<>It has not filed or started a task yet.</>}
      />
      {truncated ? (
        <Text variant="caption" tone="muted">
          Showing the latest {HISTORY_LIMIT} tasks it filed or started.
        </Text>
      ) : null}
    </Stack>
  );
}

function HistoryRowBody({ row }: { row: HistoryRow }): ReactElement {
  return (
    <>
      <Fill>
        <Line>
          <Text variant="label" tone={row.task === null ? "muted" : "default"}>
            {row.task?.title ?? "Deleted task"}
          </Text>
        </Line>
      </Fill>
      <Stack direction="row" gap="sm" align="center" className={rigidClass()}>
        {row.task !== null ? <StatusSignal status={row.task.status} /> : null}
        <Text variant="caption" tone="muted">
          {row.origin.role === "launched" ? "Started " : null}
          <RelativeTime date={new Date(row.origin.filedAt)} />
        </Text>
      </Stack>
    </>
  );
}

/** What the plugins contributing to `Automations.TaskDetail` say about one
 * task — an expanded History row. */
function TaskDetail({
  taskId,
  automationId,
}: {
  taskId: string;
  automationId: string;
}): ReactElement {
  return (
    <Automations.TaskDetail.Render>
      {(contribution) => (
        <contribution.component taskId={taskId} automationId={automationId} />
      )}
    </Automations.TaskDetail.Render>
  );
}
