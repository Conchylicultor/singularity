import { type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { tasksResource } from "@plugins/tasks/core";
import { useTask } from "@plugins/tasks/web";
import { TaskDetailFlushProvider } from "./context";
import { TaskDetail } from "./components/task-detail";

// Panes are declared first so their types are known before the component
// bodies reference them. Component identifiers below are function
// declarations (hoisted), so the forward reference is safe at runtime.

export const tasksRootPane = Pane.define({
  id: "tasks-root",
  segment: "tasks",
  component: TasksRoot,
  // No chrome; the tasks list is its own UI.
  chrome: false,
  width: 320,
});

function useResolveTask({ taskId }: { taskId: string }) {
  const result = useResource(tasksResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((t) => t.id === taskId) };
}

export const taskDetailPane = Pane.define({
  id: "task-detail",
  defaultAncestors: [tasksRootPane],
  segment: "t/:taskId",
  component: TaskDetailBody,
  width: 480,
  resolve: useResolveTask,
});

function TasksRoot(): ReactElement {
  const openPane = useOpenPane();
  const selectedId = taskDetailPane.useChainEntry()?.params.taskId;

  return (
    <Tasks.Host
      className="h-full p-4"
      selectedId={selectedId}
      onSelect={(id) => openPane(taskDetailPane, { taskId: id }, { mode: "push" })}
    />
  );
}

function TaskDetailBody(): ReactElement {
  const { taskId } = taskDetailPane.useParams();
  const task = useTask(taskId);

  return (
    <TaskDetailFlushProvider>
      <PaneChrome pane={taskDetailPane} title={task?.title}>
        <TaskDetail key={taskId} taskId={taskId} />
      </PaneChrome>
    </TaskDetailFlushProvider>
  );
}

