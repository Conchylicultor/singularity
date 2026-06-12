import { useMemo } from "react";
import { MdDeleteSweep } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/notifications/web";
import { tasksResource, countTransitiveDependents, type TaskListItem } from "@plugins/tasks/core";
import { DropdownMenuItem } from "@plugins/primitives/plugins/ui-kit/web";
import { dropDependents } from "../../shared";

export function DropDependentsItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const tasksResult = useResource(tasksResource);
  if (tasksResult.pending) return null;
  return <DropDependentsItemInner conversation={conversation} allTasks={tasksResult.data} />;
}

function DropDependentsItemInner({
  conversation,
  allTasks,
}: {
  conversation: ConversationRecord;
  allTasks: TaskListItem[];
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const dependentCount = useMemo(
    () => countTransitiveDependents(conversation.taskId, allTasks),
    [conversation.taskId, allTasks],
  );

  const { mutate, isPending } = useEndpointMutation(dropDependents, {
    onSuccess: (data) => {
      toast({
        type: "conversation",
        title: "Dependents dropped",
        description: `Dropped ${data.dropped} task(s) and closed conversation`,
        variant: "success",
      });
    },
    onError: (err) => toast({
      type: "conversation",
      title: "Drop dependents failed",
      description: err.message,
      variant: "error",
    }),
  });

  if (dependentCount === 0) return null;

  const disabled = isPending || live.status === "gone" || live.status === "done" || live.status === "starting";

  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <MdDeleteSweep className="size-4" />
      {isPending ? "Dropping…" : `Drop task + ${dependentCount} dependent(s) & Close`}
    </DropdownMenuItem>
  );
}
