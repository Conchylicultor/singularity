import { type ReactElement } from "react";
import { Pane, PaneChrome, type, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { type Task } from "@plugins/tasks/core";
import { useTask } from "@plugins/tasks/web";
import { TaskDetailFlushProvider } from "./context";
import { TaskDetail } from "./components/task-detail";

// Panes are declared first so their types are known before the component
// bodies reference them. Component identifiers below are function
// declarations (hoisted), so the forward reference is safe at runtime.

export const tasksRootPane = Pane.define({
  id: "tasks-root",
  after: [null],
  segment: "tasks",
  component: TasksRoot,
  // No chrome; the tasks list is its own UI.
  chrome: false,
  width: 320,
});

export const taskDetailPane = Pane.define({
  id: "task-detail",
  after: [tasksRootPane],
  segment: "t/:taskId",
  component: TaskDetailBody,
  provides: type<{ task: Task }>(),
  width: 480,
});

function TasksRoot(): ReactElement {
  const openPane = useOpenPane();
  const selectedId = taskDetailPane.useChainEntry()?.params.taskId;

  return (
    <div className="h-full p-4">
      <Tasks.Host
        selectedId={selectedId}
        onSelect={(id) => openPane(taskDetailPane, { taskId: id }, { mode: "push" })}
      />
    </div>
  );
}

function TaskDetailBody(): ReactElement {
  const { taskId } = taskDetailPane.useParams();
  const task = useTask(taskId);

  const body = (
    <div className="h-full overflow-auto">
      <TaskDetail key={taskId} taskId={taskId} />
    </div>
  );

  const wrapped = (
    <TaskDetailFlushProvider>
      <PaneChrome pane={taskDetailPane} title={task?.title}>
        {body}
      </PaneChrome>
    </TaskDetailFlushProvider>
  );

  // Only mount the Provider once the task is loaded so descendants reading
  // useData() get a non-null task.
  if (!task) return wrapped;
  return (
    <taskDetailPane.Provider value={{ task }}>{wrapped}</taskDetailPane.Provider>
  );
}

