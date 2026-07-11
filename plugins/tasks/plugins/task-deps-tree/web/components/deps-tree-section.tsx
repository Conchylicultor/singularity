import { useCallback } from "react";
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
import {
  taskDetailPane,
  useTaskNavigate,
} from "@plugins/tasks/plugins/task-detail/web";
import { TasksSubtree } from "@plugins/tasks/plugins/task-list/web";
import { buildDepsTree } from "@plugins/tasks/plugins/task-deps-tree/core";
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

  const ctxNavigate = useTaskNavigate();
  const openPane = useOpenPane();
  const onNavigate = useCallback(
    (id: string) => {
      if (ctxNavigate) ctxNavigate(id);
      else openPane(taskDetailPane, { taskId: id }, { mode: "swap" });
    },
    [ctxNavigate, openPane],
  );

  // Self-hide: nothing to draw when the dependency closure is just this task
  // AND it created no children (mirrors the graph section's closure self-hide).
  const hasDeps = buildDepsTree(allTasks, taskId).length > 1;
  const hasFolderChildren = allTasks.some((t) => t.folderId === taskId);
  if (!hasDeps && !hasFolderChildren) return null;

  return (
    <Stack gap="sm">
      <ViewSwitcher options={OPTIONS} activeId={activeId} onSelect={setActiveView} />
      {activeId === "creation" ? (
        <TasksSubtree
          rootTaskId={taskId}
          readOnly
          selectedId={taskId}
          onSelect={onNavigate}
        />
      ) : (
        <DepsTreeView taskId={taskId} onNavigate={onNavigate} />
      )}
    </Stack>
  );
}
