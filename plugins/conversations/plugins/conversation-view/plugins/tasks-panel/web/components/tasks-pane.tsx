import { useMemo, useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { TaskTreeDetail } from "@plugins/tasks/plugins/task-detail/web";
import { convTasksPane } from "../panes";
import { TasksPaneContext } from "./tasks-pane-context";

export function TasksPane() {
  const { conversation } = conversationPane.useData();
  const convRootId = conversation.taskId;
  const [viewRootId, setViewRootId] = useState<string>(convRootId);
  const [selectedId, setSelectedId] = useState<string>(convRootId);

  const ctx = useMemo(
    () => ({ viewRootId, selectedId, setViewRootId, setSelectedId }),
    [viewRootId, selectedId],
  );

  return (
    <TasksPaneContext.Provider value={ctx}>
      <PaneChrome pane={convTasksPane} title="Tasks">
        <TaskTreeDetail
          rootTaskId={viewRootId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </PaneChrome>
    </TasksPaneContext.Provider>
  );
}
