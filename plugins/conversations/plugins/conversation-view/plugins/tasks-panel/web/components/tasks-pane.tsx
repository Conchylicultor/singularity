import { useMemo, useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convFilePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { TasksList } from "@plugins/tasks/plugins/task-list/web";
import { TaskDetail, TaskDetailSlots, TaskFileOpenProvider } from "@plugins/tasks/plugins/task-detail/web";
import { tasksResource } from "@plugins/tasks/shared";
import { convTasksPane } from "../panes";
import { TasksPaneContext } from "./tasks-pane-context";

export function TasksPane() {
  const { conversation } = conversationPane.useData();
  const convRootId = conversation.taskId;
  const [viewRootId, setViewRootId] = useState<string>(convRootId);
  const [selectedId, setSelectedId] = useState<string>(convRootId);

  useResource(tasksResource);

  const aboveBands = TaskDetailSlots.Above.useContributions();
  const orderedAbove = useMemo(
    () => [...aboveBands].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [aboveBands],
  );

  const ctx = useMemo(
    () => ({ viewRootId, selectedId, setViewRootId, setSelectedId }),
    [viewRootId, selectedId],
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
          {orderedAbove.map((band) => (
            <band.component key={band.id} taskId={selectedId} />
          ))}
          <div className="min-h-0 flex-1 overflow-auto">
            <TaskFileOpenProvider
              value={(path) =>
                convFilePeekPane.open({
                  convId: conversation.id,
                  worktree: "main",
                  filePath: path,
                })
              }
            >
              <TaskDetail key={selectedId} taskId={selectedId} />
            </TaskFileOpenProvider>
          </div>
        </div>
      </PaneChrome>
    </TasksPaneContext.Provider>
  );
}
