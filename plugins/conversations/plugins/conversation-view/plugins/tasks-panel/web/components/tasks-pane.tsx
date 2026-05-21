import { useMemo, useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { TaskTreeDetail } from "@plugins/tasks/plugins/task-detail/web";
import { convTasksPane } from "../panes";
import { TasksPaneContext } from "./tasks-pane-context";

export function TasksPane() {
  const { convId: inputConvId } = convTasksPane.useInput();
  const chainEntry = conversationPane.useChainEntry();
  const convId = inputConvId ?? chainEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  if (!conversation) return null;
  return <TasksPaneInner taskId={conversation.taskId} />;
}

function TasksPaneInner({ taskId }: { taskId: string }) {
  const [viewRootId, setViewRootId] = useState<string>(taskId);
  const [selectedId, setSelectedId] = useState<string>(taskId);

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
