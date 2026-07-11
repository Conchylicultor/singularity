import { useMemo } from "react";
import {
  useResource,
  ResourceView,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  DataView,
  defineDataView,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  tasksResource,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import { moveTaskInDepsTree } from "@plugins/tasks/core";
import {
  buildDepsTree,
  type DepsTreeRow,
} from "@plugins/tasks/plugins/task-deps-tree/core";
import { depsTreeFields, depsTreeOptions } from "../internal/deps-tree-fields";
import { DepsActions } from "../internal/deps-actions";

const DEPS_TREE_VIEW = defineDataView("task-deps-tree");

// Every `task_dependencies` edge is a literal tree edge, so the tree's shape IS
// the dependency relation. A drop is neighbour-based, not rank-based: a drop
// ONTO a row (`targetId === null`) splices into the chain; a sibling-zone drop
// branches. `dest.rank` is discarded — the server owns edge rewiring atomically.
const depsHierarchy: HierarchyConfig<DepsTreeRow> = {
  getParentId: (r) => r.depsParentId,
  getRank: (r) => r.rank,
  onMove: (id, dest) =>
    fetchEndpoint(
      moveTaskInDepsTree,
      { id },
      {
        body: {
          newParentId: dest.parentId,
          mode: dest.targetId === null ? "splice" : "branch",
        },
      },
    ),
};

export function DepsTreeView({
  taskId,
  onNavigate,
}: {
  taskId: string;
  onNavigate: (id: string) => void;
}) {
  const result = useResource(tasksResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(allTasks) => (
        <DepsTreeLoaded
          taskId={taskId}
          allTasks={allTasks}
          onNavigate={onNavigate}
        />
      )}
    </ResourceView>
  );
}

function DepsTreeLoaded({
  taskId,
  allTasks,
  onNavigate,
}: {
  taskId: string;
  allTasks: readonly TaskListItem[];
  onNavigate: (id: string) => void;
}) {
  const rows = useMemo(() => buildDepsTree(allTasks, taskId), [allTasks, taskId]);
  return (
    <DataView<DepsTreeRow>
      rows={rows}
      fields={depsTreeFields}
      rowKey={(r) => r.id}
      views={["tree"]}
      storageKey={DEPS_TREE_VIEW}
      selectedRowId={taskId}
      onRowActivate={(r) => onNavigate(r.id)}
      hierarchy={depsHierarchy}
      viewOptions={{ tree: depsTreeOptions }}
      itemActions={DepsActions}
    />
  );
}
