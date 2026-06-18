import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane, type } from "@plugins/primitives/plugins/pane/web";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { tasksResource } from "@plugins/tasks/core";
import { useTask } from "@plugins/tasks/web";
import { TaskDetailFlushProvider } from "./context";
import { TaskDetail } from "./components/task-detail";
import { TaskTreeDetail } from "./components/task-tree-detail";
import { TasksPaneContext } from "./tasks-pane-context";

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
  // Input is serialized into history.state, so values must be strings.
  // "true" → focused/detail-only mode (no inline tree).
  input: type<{ focused?: string }>(),
});

function TasksRoot(): ReactElement {
  const openPane = useOpenPane();
  const selectedId = taskDetailPane.useRouteEntry()?.params.taskId;

  return (
    <Tasks.Host
      className="h-full p-lg"
      selectedId={selectedId}
      onSelect={(id) => openPane(taskDetailPane, { taskId: id }, { mode: "push" })}
    />
  );
}

// The pane body dispatches between two modes:
//   showTree = (tasksRootPane absent) AND (input.focused !== true)
// showTree → conversation-panel mode (inline tree + detail), else focused/detail.
function TaskDetailBody(): ReactElement {
  const { taskId } = taskDetailPane.useParams();
  const { focused } = taskDetailPane.useInput();
  const inTasksApp = tasksRootPane.useRouteEntry() !== null;
  if (!inTasksApp && focused !== "true") return <ConversationTasksBody key={taskId} rootTaskId={taskId} />;
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
