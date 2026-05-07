import { useCallback } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { TaskTreeDetail } from "@plugins/tasks/plugins/task-detail/web";
import { useTask } from "@plugins/tasks/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
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
      <TaskTreeDetail
        key={taskId}
        rootTaskId={taskId}
        selectedId={taskId}
        onSelect={navigate}
      />
    </PaneChrome>
  );
}
