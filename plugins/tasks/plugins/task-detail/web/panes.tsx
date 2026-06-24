import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane, type } from "@plugins/primitives/plugins/pane/web";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { tasksResource, tasksRootRoute, taskDetailRoute } from "@plugins/tasks/plugins/tasks-core/core";
import { useTask } from "@plugins/tasks/web";
import { TaskDetailFlushProvider } from "./context";
import { TaskDetail } from "./components/task-detail";
import { TaskTreeDetail } from "./components/task-tree-detail";
import { TasksPaneContext } from "./tasks-pane-context";

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
  // `focused: true` → focused/detail-only mode (no inline tree). Input lives in
  // history.state (structured-clone), so a real boolean round-trips faithfully.
  input: type<{ focused?: boolean }>(),
});

function TasksRoot(): ReactElement {
  const openPane = useOpenPane();
  const selectedId = taskDetailPane.useRouteEntry()?.params.taskId;

  return (
    <PaneChrome pane={tasksRootPane} title="Tasks">
      <Tasks.Host
        className="h-full p-lg"
        selectedId={selectedId}
        onSelect={(id) => openPane(taskDetailPane, { taskId: id }, { mode: "push" })}
      />
    </PaneChrome>
  );
}

// The pane body dispatches between two modes:
//   showTree = (tasksRootPane absent) AND (input.focused !== true)
// showTree → conversation-panel mode (inline tree + detail), else focused/detail.
function TaskDetailBody(): ReactElement {
  const { taskId } = taskDetailPane.useParams();
  const { focused } = taskDetailPane.useInput();
  const inTasksApp = tasksRootPane.useRouteEntry() !== null;
  if (!inTasksApp && !focused) return <ConversationTasksBody key={taskId} rootTaskId={taskId} />;
  return <FocusedTaskBody key={taskId} taskId={taskId} />;
}

function FocusedTaskBody({ taskId }: { taskId: string }): ReactElement {
  const task = useTask(taskId);

  return (
    <TaskDetailFlushProvider>
      <PaneChrome pane={taskDetailPane} title={task?.title}>
        <TaskDetail taskId={taskId} />
      </PaneChrome>
    </TaskDetailFlushProvider>
  );
}

function ConversationTasksBody({ rootTaskId }: { rootTaskId: string }): ReactElement {
  const openPane = useOpenPane();
  const [selectedId, setSelectedId] = useState<string>(rootTaskId);

  // Re-rooting swaps this pane's own URL param in place, keeping the URL
  // truthful and the new root shareable. Selection stays ephemeral state.
  const setViewRootId = useCallback(
    (id: string) => openPane(taskDetailPane, { taskId: id }, { mode: "swap" }),
    [openPane],
  );

  const ctx = useMemo(
    () => ({ viewRootId: rootTaskId, selectedId, setViewRootId, setSelectedId }),
    [rootTaskId, selectedId, setViewRootId],
  );

  // Provider is OUTSIDE PaneChrome so the chrome-header actions can read it.
  return (
    <TasksPaneContext.Provider value={ctx}>
      <PaneChrome pane={taskDetailPane} title="Tasks">
        <TaskTreeDetail
          rootTaskId={rootTaskId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </PaneChrome>
    </TasksPaneContext.Provider>
  );
}
