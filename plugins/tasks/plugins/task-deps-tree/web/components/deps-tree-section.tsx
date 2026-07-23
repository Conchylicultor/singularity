import { useCallback, useMemo } from "react";
import { MdAccountTree, MdFolderOpen } from "react-icons/md";
import {
  useResource,
  ResourceView,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  ViewSwitcher,
  useActiveViewId,
  type ViewSwitcherOption,
} from "@plugins/primitives/plugins/view-switcher/web";
import {
  tasksResource,
  type TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";
import { TasksSubtree } from "@plugins/tasks/plugins/task-list/web";
import { taskClusterIds } from "@plugins/tasks/plugins/task-deps-tree/core";
import { DepsTreeView } from "./deps-tree-view";

const OPTIONS: ViewSwitcherOption[] = [
  { id: "deps", title: "Dependencies", icon: MdAccountTree },
  { id: "creation", title: "Created", icon: MdFolderOpen },
];

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
  const { activeViewId, setActiveView } = useActiveViewId("task-deps-tree:view");
  const activeId = activeViewId ?? "deps";

  // Selecting a task in the tree re-roots this pane in place, so the URL stays
  // truthful and the new root is shareable.
  const openPane = useOpenPane();
  const onNavigate = useCallback(
    (id: string) => openPane(taskDetailPane, { taskId: id }, { mode: "swap" }),
    [openPane],
  );

  // The single member set both tabs render — one set, organized two ways.
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

  return (
    <Stack gap="sm">
      <ViewSwitcher options={OPTIONS} activeId={activeId} onSelect={setActiveView} />
      {activeId === "creation" ? (
        <TasksSubtree
          members={memberIds}
          readOnly
          selectedId={taskId}
          onSelect={onNavigate}
        />
      ) : (
        <DepsTreeView
          taskId={taskId}
          allTasks={allTasks}
          memberIds={memberIds}
          onNavigate={onNavigate}
        />
      )}
    </Stack>
  );
}
