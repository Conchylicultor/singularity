import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdAdd } from "react-icons/md";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { FieldDef, HierarchyConfig } from "@plugins/primitives/plugins/data-view/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { createTask } from "@plugins/tasks/core";
import type { TaskListItem, TaskStatus } from "@plugins/tasks/plugins/tasks-core/core";
import { patchTask } from "@plugins/tasks/web";
import { STATUS_META, StatusIcon, StatusBadge } from "@plugins/tasks/plugins/task-status/web";
import { Tasks } from "../slots";

// The generic tree primitive speaks `parentId`; the tasks domain stores the
// display hierarchy as `folderId`. Map at this boundary so the primitive stays
// domain-neutral and the folder concept never leaks into it.
export async function createTaskRow(args: {
  parentId: string | null;
  afterId?: string;
}): Promise<string> {
  const task = await fetchEndpoint(
    createTask,
    {},
    { body: { folderId: args.parentId, afterId: args.afterId } },
  );
  return task.id;
}

// Filter chip choices are derived from the single status-metadata source, so the
// labels never drift from the rest of the app.
const STATUS_OPTIONS = (
  Object.entries(STATUS_META) as [TaskStatus, { label: string }][]
).map(([value, meta]) => ({ value, label: meta.label }));

export const taskFields: FieldDef<TaskListItem>[] = [
  {
    id: "title",
    label: "Title",
    type: "text",
    primary: true,
    value: (t) => t.title || "Untitled",
    onEdit: (t, next) =>
      patchTask(t.id, { title: String(next ?? "").trim() || "Untitled" }),
  },
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

export const taskHierarchy: HierarchyConfig<TaskListItem> = {
  getParentId: (t) => t.folderId,
  getRank: (t) => t.rank,
  isExpanded: (t) => t.expanded,
  onToggleExpanded: (id, next) => patchTask(id, { expanded: next }),
  onMove: (id, dest) =>
    patchTask(id, { folderId: dest.parentId, rank: dest.rank }),
  onCreate: createTaskRow,
};

// Read-only variant: drop the two mutating hooks. Omitting `onMove` disables
// drag in the tree primitive; omitting `onCreate` removes the root "Add" and
// per-row add affordances. Expand/collapse and parent mapping are preserved.
const { onMove: _onMove, onCreate: _onCreate, ...readOnlyHierarchy } =
  taskHierarchy;
const readOnlyTaskHierarchy: HierarchyConfig<TaskListItem> = readOnlyHierarchy;

// Cluster variant: also drop the expand hooks, so a scoped inspection tree (a
// dependency+creation cluster) keeps expand state ephemeral instead of writing
// the shared `expanded` DB flag — collapsing a node here must not collapse it in
// the main Tasks list. Pairs with `buildTreeOptions({ defaultExpanded: true })`.
const {
  isExpanded: _isExpanded,
  onToggleExpanded: _onToggleExpanded,
  ...clusterHierarchy
} = readOnlyTaskHierarchy;
export const clusterTaskHierarchy: HierarchyConfig<TaskListItem> =
  clusterHierarchy;

export function buildTreeOptions({
  readOnly,
  defaultExpanded,
}: {
  readOnly?: boolean;
  defaultExpanded?: boolean;
}): TreeViewOptions<TaskListItem> {
  return {
    leadingIcon: (t) => <StatusIcon status={t.status} />,
    labelClassName: (t) =>
      cn(
        t.status === "dropped" && "text-muted-foreground/70 line-through italic",
        t.status === "done" && "text-muted-foreground",
      ),
    expandAll: true,
    defaultExpanded,
    addLabel: readOnly ? null : "Add",
    toolbarStart: <Tasks.ListActions.Render />,
    // The per-row "Add item below" is an options-driven create affordance — drop
    // it under readOnly so no dead menu item survives the hierarchy's missing
    // onCreate.
    rowMenu: readOnly
      ? undefined
      : ({ addBelow }) => [
          {
            icon: MdAdd,
            label: "Add item below",
            onClick: () => void addBelow(),
          },
        ],
    dragOverlay: (t) => t.title || "Untitled",
  };
}
