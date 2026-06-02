import { useCallback, useMemo, useState } from "react";
import { PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { TaskTreeDetail } from "@plugins/tasks/plugins/task-detail/web";
import { convTasksPane } from "../panes";
import { TasksPaneContext } from "./tasks-pane-context";

export function TasksPane() {
  // The root task lives in the URL (`/tp/:taskId`), so the pane is
  // self-describing and deep-linkable. `resolve` guarantees the task exists
  // before this renders.
  const { taskId } = convTasksPane.useParams();
  return <TasksPaneInner taskId={taskId} />;
}

function TasksPaneInner({ taskId }: { taskId: string }) {
  const openPane = useOpenPane();
  const [selectedId, setSelectedId] = useState<string>(taskId);

  // Re-rooting swaps this pane's own URL param in place, keeping the URL
  // truthful and the new root shareable. Selection stays ephemeral state.
  const setViewRootId = useCallback(
    (id: string) => openPane(convTasksPane, { taskId: id }, { mode: "swap" }),
    [openPane],
  );

  const ctx = useMemo(
    () => ({ viewRootId: taskId, selectedId, setViewRootId, setSelectedId }),
    [taskId, selectedId, setViewRootId],
  );

  return (
    <TasksPaneContext.Provider value={ctx}>
      <PaneChrome pane={convTasksPane} title="Tasks">
        <TaskTreeDetail
          rootTaskId={taskId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </PaneChrome>
    </TasksPaneContext.Provider>
  );
}
