import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdAdd } from "react-icons/md";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import type { TreeViewOptions } from "@plugins/primitives/plugins/data-view/plugins/tree/web";
import { tasksResource, createTask, type TaskListItem } from "@plugins/tasks/core";
import { patchTask } from "@plugins/tasks/web";
import { Tasks as TasksSlots } from "@plugins/tasks/plugins/task-list/web";
import { StatusIcon } from "@plugins/tasks/plugins/task-status/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

// The generic tree primitive speaks `parentId`; the tasks domain stores the
// display hierarchy as `folderId`. Map at this boundary so the primitive stays
// domain-neutral and the folder concept never leaks into it.
async function createTaskRow(args: {
  parentId: string | null;
  rank?: Rank;
}): Promise<string> {
  const task = await fetchEndpoint(createTask, {}, { body: { folderId: args.parentId, rank: args.rank?.toString() } });
  return task.id;
}

const TASKS_LIST_VIEW = defineDataView("tasks-list");

const isTerminal = (t: TaskListItem) =>
  t.status === "done" || t.status === "dropped";

function TasksListInner({
  rows,
  selectedId,
  rootTaskId,
  onSelect,
}: {
  rows: readonly TaskListItem[];
  selectedId?: string;
  rootTaskId?: string;
  onSelect: (id: string) => void;
}) {
  const treeOptions: TreeViewOptions<TaskListItem> = {
    leadingIcon: (t) => <StatusIcon status={t.status} />,
    labelClassName: (t) =>
      cn(
        t.status === "dropped" && "text-muted-foreground/70 line-through italic",
        t.status === "done" && "text-muted-foreground",
      ),
    hideTerminal: { isTerminal },
    expandAll: true,
    rootId: rootTaskId,
    addLabel: rootTaskId ? null : "Add",
    toolbarStart: <TasksSlots.ListActions.Render />,
    rowMenu: ({ addBelow }) => [
      { icon: MdAdd, label: "Add item below", onClick: () => void addBelow() },
    ],
    dragOverlay: (t) => t.title || "Untitled",
  };

  return (
    <DataView<TaskListItem>
      rows={rows}
      fields={[
        {
          id: "title",
          label: "Title",
          primary: true,
          value: (t) => t.title,
          onEdit: (t, next) =>
            patchTask(t.id, { title: String(next ?? "").trim() || "Untitled" }),
        },
      ]}
      rowKey={(t) => t.id}
      views={["tree"]}
      // Embedded: the tab host (tabbed-view) already owns the scroll surface, so
      // the data-view must not nest a second scroller. The tree view windows its
      // rows against that outer scroller (VirtualRows discovers it).
      mode="embedded"
      storageKey={TASKS_LIST_VIEW}
      selectedRowId={selectedId}
      onRowActivate={(t) => onSelect(t.id)}
      selection={{}}
      hierarchy={{
        getParentId: (t) => t.folderId,
        getRank: (t) => t.rank,
        isExpanded: (t) => t.expanded,
        onToggleExpanded: (id, next) => patchTask(id, { expanded: next }),
        onMove: (id, dest) =>
          patchTask(id, { folderId: dest.parentId, rank: dest.rank }),
        onCreate: createTaskRow,
      }}
      viewOptions={{ tree: treeOptions }}
      itemActions={TasksSlots.TaskActions}
    />
  );
}

export function TasksList({
  selectedId,
  rootTaskId,
  onSelect,
}: {
  selectedId?: string;
  rootTaskId?: string;
  onSelect: (id: string) => void;
}) {
  const result = useResource(tasksResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(rows) => (
        <TasksListInner
          rows={rows}
          selectedId={selectedId}
          rootTaskId={rootTaskId}
          onSelect={onSelect}
        />
      )}
    </ResourceView>
  );
}
