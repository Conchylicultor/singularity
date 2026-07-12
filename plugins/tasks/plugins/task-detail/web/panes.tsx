import { type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TasksListView } from "@plugins/tasks/plugins/task-list/web";
import { tasksResource, tasksRootRoute, taskDetailRoute } from "@plugins/tasks/plugins/tasks-core/core";
import { useTask } from "@plugins/tasks/web";
import { TaskDetailFlushProvider } from "./context";
import { TaskDetail } from "./components/task-detail";

// Panes are declared first so their types are known before the component
// bodies reference them. Component identifiers below are function
// declarations (hoisted), so the forward reference is safe at runtime.

export const tasksRootPane = Pane.define({
  route: tasksRootRoute,
  component: TasksRoot,
  width: 320,
});

function useResolveTask({ taskId }: { taskId: string }) {
  const result = useResource(tasksResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((t) => t.id === taskId) };
}

export const taskDetailPane = Pane.define({
  route: taskDetailRoute,
  component: TaskDetailBody,
  width: 480,
  resolve: useResolveTask,
});

function TasksRoot(): ReactElement {
  const openPane = useOpenPane();
  const selectedId = taskDetailPane.useRouteEntry()?.params.taskId;

  return (
    <PaneChrome pane={tasksRootPane} title="Tasks">
      <Inset pad="lg">
        <TasksListView
          selectedId={selectedId}
          onSelect={(id) => openPane(taskDetailPane, { taskId: id }, { mode: "push" })}
        />
      </Inset>
    </PaneChrome>
  );
}

// One mode everywhere: the pane always shows the detail of the task named in
// the route. Task-to-task navigation is the sections' job (deps tree, graph),
// which re-root this pane by swapping its own route param.
function TaskDetailBody(): ReactElement {
  const { taskId } = taskDetailPane.useParams();
  const task = useTask(taskId);

  return (
    <TaskDetailFlushProvider key={taskId}>
      <PaneChrome pane={taskDetailPane} title={task?.title}>
        <TaskDetail taskId={taskId} />
      </PaneChrome>
    </TaskDetailFlushProvider>
  );
}
