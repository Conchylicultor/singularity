import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { TaskDetail } from "@plugins/tasks/plugins/task-detail/web";
import { tasksResource } from "@plugins/tasks/shared";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convFilePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskSidePane } from "../panes";

export function SideTaskBody() {
  const { taskId } = taskSidePane.useParams();
  const { conversation } = conversationPane.useData();
  const { data } = useResource(tasksResource);
  const task = (data ?? []).find((t) => t.id === taskId) ?? null;

  return (
    <PaneChrome pane={taskSidePane} title={task?.title ?? "Task"}>
      <div className="h-full min-h-0 overflow-auto">
        <TaskDetail
          key={taskId}
          taskId={taskId}
          onFileOpen={(path) =>
            convFilePeekPane.open({
              convId: conversation.id,
              worktree: "main",
              filePath: path,
            })
          }
        />
      </div>
    </PaneChrome>
  );
}
