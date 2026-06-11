import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, countTransitiveDependents } from "@plugins/tasks/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";

export function DependentCountChip() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const tasksResult = useResource(tasksResource);

  if (!conversation) return null;
  if (tasksResult.pending) return null;

  const count = conversation.taskId
    ? countTransitiveDependents(conversation.taskId, tasksResult.data)
    : 0;

  if (count === 0) return null;

  return (
    <Badge title={`${count} task${count === 1 ? "" : "s"} blocked on this task`}>
      {count} blocked
    </Badge>
  );
}
