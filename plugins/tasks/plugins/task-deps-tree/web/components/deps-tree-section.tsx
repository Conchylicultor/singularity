import { useCallback, useMemo } from "react";
import {
  useResource,
  ResourceView,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import {
  MergedDataView,
  defineDataView,
} from "@plugins/primitives/plugins/data-view/web";
import {
  tasksResource,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { taskClusterIds } from "@plugins/tasks/plugins/task-deps-tree/core";
import { DepsSources } from "../internal/deps-sources";

// The merged DataView surface id — the config lives under this plugin's tree at
// `config/tasks/task-deps-tree/task-deps-tree.jsonc`.
const DEPS_TREE_VIEW = defineDataView("task-deps-tree");

export function DepsTreeSection({ taskId }: { taskId: string }) {
  const result = useResource(tasksResource);
  return (
    <ResourceView resource={result}>
      {(allTasks) => (
        <DepsTreeSectionLoaded taskId={taskId} allTasks={allTasks} />
      )}
    </ResourceView>
  );
}

function DepsTreeSectionLoaded({
  taskId,
  allTasks,
}: {
  taskId: string;
  allTasks: readonly TaskListItem[];
}) {
  // Selecting a task in the tree re-roots this pane in place, so the URL stays
  // truthful and the new root is shareable.
  const openPane = useOpenPane();
  const onNavigate = useCallback(
    (id: string) => openPane(taskDetailPane, { taskId: id }, { mode: "swap" }),
    [openPane],
  );

  // The single member set both sources render — one set, organized two ways.
  const memberIds = useMemo(
    () => taskClusterIds(allTasks, taskId),
    [allTasks, taskId],
  );

  // Self-hide with the original trigger: the task must take part in a dependency
  // edge (either direction) OR have created children. When it does, the cluster
  // adds the surrounding creation context (creator, siblings) for both views.
  const self = allTasks.find((t) => t.id === taskId);
  const hasDepEdge =
    (self?.dependencies.length ?? 0) > 0 ||
    allTasks.some((t) => t.dependencies.includes(taskId));
  const hasFolderChildren = allTasks.some((t) => t.folderId === taskId);
  if (!hasDepEdge && !hasFolderChildren) return null;

  // ONE merged DataView surface: the Dependencies / Created organisations are
  // contributed sources, unified under a single switcher + config file.
  return (
    <MergedDataView
      storageKey={DEPS_TREE_VIEW}
      sources={DepsSources}
      hostProps={{ taskId, allTasks, memberIds, onNavigate }}
      defaultView="deps"
    />
  );
}
