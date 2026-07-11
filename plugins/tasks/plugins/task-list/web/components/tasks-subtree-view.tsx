import { useMemo } from "react";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { tasksResource, type TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import { Tasks } from "../slots";
import {
  taskFields,
  taskHierarchy,
  readOnlyTaskHierarchy,
  clusterTaskHierarchy,
  buildTreeOptions,
} from "../internal/tasks-data-view";

const TASKS_SUBTREE_VIEW = defineDataView("tasks-subtree");

/**
 * The task tree scoped two mutually-exclusive ways:
 *
 *   - `rootTaskId` — a subtree: `rootTaskId` plus everything transitively
 *     `folderId`-parented under it (the classic "children of this task" view).
 *   - `members` — an arbitrary set of ids rendered as a creation forest: rows
 *     are filtered to exactly this set and organised by `folderId`, so any
 *     member whose parent is outside the set surfaces as a top-level root. Used
 *     when the set is computed elsewhere (e.g. a dependency+creation cluster)
 *     and must be shown by its creation structure without collapsing to one
 *     subtree.
 *
 * When `members` is given it wins and `rootTaskId` is ignored.
 */
export function TasksSubtree({
  selectedId,
  rootTaskId,
  members,
  onSelect,
  readOnly,
}: {
  selectedId?: string;
  rootTaskId?: string;
  members?: ReadonlySet<string>;
  onSelect: (id: string) => void;
  readOnly?: boolean;
}) {
  const result = useResource(tasksResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(rows) => (
        <SubtreeData
          rows={rows}
          selectedId={selectedId}
          rootTaskId={rootTaskId}
          members={members}
          onSelect={onSelect}
          readOnly={readOnly}
        />
      )}
    </ResourceView>
  );
}

function SubtreeData({
  rows,
  selectedId,
  rootTaskId,
  members,
  onSelect,
  readOnly,
}: {
  rows: readonly TaskListItem[];
  selectedId?: string;
  rootTaskId?: string;
  members?: ReadonlySet<string>;
  onSelect: (id: string) => void;
  readOnly?: boolean;
}) {
  const scoped = useMemo(
    () => (members ? rows.filter((t) => members.has(t.id)) : rows),
    [rows, members],
  );
  // In `members` (cluster) mode the tree is a scoped inspection view: expand
  // state stays ephemeral (clusterTaskHierarchy) and every node opens by default
  // so the whole set is visible, matching the dependency tab.
  const hierarchy = members
    ? clusterTaskHierarchy
    : readOnly
      ? readOnlyTaskHierarchy
      : taskHierarchy;
  return (
    <DataView<TaskListItem>
      rows={scoped}
      fields={taskFields}
      rowKey={(t) => t.id}
      views={["tree"]}
      storageKey={TASKS_SUBTREE_VIEW}
      selectedRowId={selectedId}
      onRowActivate={(t) => onSelect(t.id)}
      selection={{}}
      hierarchy={hierarchy}
      // With `members` the rows are already the exact set, so no subtree scoping —
      // out-of-set parents make their children render as roots (the creation forest).
      viewOptions={{
        tree: buildTreeOptions({
          rootTaskId: members ? undefined : rootTaskId,
          readOnly,
          defaultExpanded: members != null,
        }),
      }}
      itemActions={Tasks.TaskActions}
    />
  );
}
