import { MdAdd } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { TaskDraftPopover } from "@plugins/tasks/plugins/task-draft-form/web";
import { buttonVariants } from "@/components/ui/button";

export function NewChildTaskAction() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  if (!conversation) return null;
  return (
    <TaskDraftPopover
      trigger={<MdAdd className="size-4" />}
      triggerClassName={buttonVariants({ variant: "ghost", size: "icon" })}
      triggerTitle="New child task"
      target={{ kind: "child", parentTaskId: conversation.taskId }}
      captures={["url", "parentTask"]}
      relate={{ taskId: conversation.taskId, defaultMode: "followup" }}
      heading="Create child task"
    />
  );
}
