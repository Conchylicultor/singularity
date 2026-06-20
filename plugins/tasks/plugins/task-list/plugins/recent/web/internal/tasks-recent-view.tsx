import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { type TaskListItem } from "@plugins/tasks/core";
import { tasksResource } from "@plugins/tasks/plugins/tasks-core/core";
import type { TaskViewProps } from "@plugins/tasks/plugins/task-list/web";
import type { TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { STATUS_META, StatusBadge } from "@plugins/tasks/plugins/task-status/web";

const RECENT_VIEW = defineDataView("tasks-recent");

// Filter chip choices are derived from the single status-metadata source, so the
// labels never drift from the rest of the app.
const STATUS_OPTIONS = (
  Object.entries(STATUS_META) as [TaskStatus, { label: string }][]
).map(([value, meta]) => ({ value, label: meta.label }));

const FIELDS: FieldDef<TaskListItem>[] = [
  { id: "title", label: "Title", type: "text", primary: true, value: (t) => t.title || "Untitled" },
  {
    id: "status",
    label: "Status",
    type: "enum",
    align: "end",
    options: STATUS_OPTIONS,
    value: (t) => t.status,
    cell: (t) => <StatusBadge status={t.status} />,
  },
  {
    id: "updatedAt",
    label: "Updated",
    type: "date",
    align: "end",
    value: (t) => t.updatedAt,
    cell: (t) => <RelativeTime date={t.updatedAt} />,
  },
];

export function TasksRecentView({ selectedId, onSelect }: TaskViewProps) {
  const result = useResource(tasksResource);

  const renderList = (rows: TaskListItem[], loading: boolean) => (
    <DataView<TaskListItem>
      rows={rows}
      fields={FIELDS}
      rowKey={(t) => t.id}
      views={["list"]}
      defaultView="list"
      storageKey={RECENT_VIEW}
      // Embedded: the tab host (tabbed-view) already owns the scroll surface, so
      // the data-view must not nest a second scroller. The list view windows its
      // rows against that outer scroller (VirtualRows discovers it).
      mode="embedded"
      loading={loading}
      selectedRowId={selectedId}
      onRowActivate={(t) => onSelect(t.id)}
      emptyState="No tasks yet."
    />
  );

  // No defaultSort hook on DataView; the list view preserves the incoming row
  // order when no user sort is active, so pre-sorting by recency here is what
  // gives the "Recent" tab its semantics.
  return matchResource(result, {
    pending: () => renderList([], true),
    error: () => renderList([], true),
    ready: (rows) =>
      renderList(
        [...rows].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
        false,
      ),
  });
}
