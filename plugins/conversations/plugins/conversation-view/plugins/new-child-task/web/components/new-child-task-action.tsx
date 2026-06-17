import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdAdd } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";

export function NewChildTaskAction() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <TaskDraftPopover
      trigger={
        <Button variant="ghost" size="icon" aria-label="New child task" title="New child task">
          <MdAdd />
        </Button>
      }
      target={{ kind: "folder", folderTaskId: conversation.taskId }}
      captures={["url"]}
      relate={{ taskId: conversation.taskId, defaultMode: "followup" }}
      heading="Create child task"
    />
  );
}
