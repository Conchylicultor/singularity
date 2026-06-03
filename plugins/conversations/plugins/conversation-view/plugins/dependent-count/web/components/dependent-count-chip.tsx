import { useMemo } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, countTransitiveDependents } from "@plugins/tasks/core";
import { Badge } from "@plugins/primitives/plugins/badge/web";

export function DependentCountChip() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const tasksResult = useResource(tasksResource);
  const allTasks = useMemo(
    () => (tasksResult.pending ? [] : tasksResult.data),
    [tasksResult],
  );

  const count = useMemo(() => {
    if (!conversation?.taskId) return 0;
    return countTransitiveDependents(conversation.taskId, allTasks);
  }, [conversation?.taskId, allTasks]);

  if (!conversation || count === 0) return null;

  return (
    <Badge title={`${count} task${count === 1 ? "" : "s"} blocked on this task`}>
      {count} blocked
    </Badge>
  );
}
