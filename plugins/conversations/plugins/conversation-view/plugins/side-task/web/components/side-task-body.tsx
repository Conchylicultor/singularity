import { useCallback } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { TaskDetail, TaskFileOpenProvider, TaskNavigateProvider } from "@plugins/tasks/plugins/task-detail/web";
import { useTask } from "@plugins/tasks/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convFilePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskSidePane } from "../panes";

export function SideTaskBody() {
  const { taskId } = taskSidePane.useParams();
  const { conversation } = conversationPane.useData();
  const task = useTask(taskId);
  const navigate = useCallback(
    (id: string) => taskSidePane.open({ convId: conversation.id, taskId: id }),
    [conversation.id],
  );

  return (
    <PaneChrome pane={taskSidePane} title={task?.title ?? "Task"}>
      <div className="h-full min-h-0 overflow-auto">
        <TaskNavigateProvider value={navigate}>
          <TaskFileOpenProvider
            value={(path) =>
              convFilePeekPane.open({
                convId: conversation.id,
                worktree: "main",
                filePath: path,
              })
            }
          >
            <TaskDetail key={taskId} taskId={taskId} />
          </TaskFileOpenProvider>
        </TaskNavigateProvider>
      </div>
    </PaneChrome>
  );
}
