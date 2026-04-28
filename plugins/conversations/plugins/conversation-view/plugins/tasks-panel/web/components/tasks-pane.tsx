import { useMemo, useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convFilePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { TasksList, TaskDetail } from "@plugins/tasks/web";
import { tasksResource } from "@plugins/tasks/shared";
import { convTasksPane } from "../panes";
import { TasksPaneContext } from "./tasks-pane-context";

export function TasksPane() {
  const { conversation } = conversationPane.useData();
  const convRootId = conversation.taskId;
  const [viewRootId, setViewRootId] = useState<string>(convRootId);
  const [selectedId, setSelectedId] = useState<string>(convRootId);

  useResource(tasksResource);

  const ctx = useMemo(
    () => ({ viewRootId, setViewRootId, setSelectedId }),
    [viewRootId],
  );

  return (
    <TasksPaneContext.Provider value={ctx}>
      <PaneChrome pane={convTasksPane} title="Tasks">
        <div className="flex h-full min-h-0 flex-col">
          <div className="max-h-[40%] min-h-0 shrink-0 overflow-auto border-b p-2">
            <TasksList
              rootTaskId={viewRootId}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <TaskDetail
              key={selectedId}
              taskId={selectedId}
              onFileOpen={(path) =>
                convFilePeekPane.open({
                  convId: conversation.id,
                  worktree: "main",
                  filePath: path,
                })
              }
            />
          </div>
        </div>
      </PaneChrome>
    </TasksPaneContext.Provider>
  );
}
