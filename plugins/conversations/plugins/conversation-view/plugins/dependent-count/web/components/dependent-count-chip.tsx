import { useMemo } from "react";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, countTransitiveDependents } from "@plugins/tasks/core";

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
    <span
      className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
      title={`${count} task${count === 1 ? "" : "s"} blocked on this task`}
    >
      {count} blocked
    </span>
  );
}
