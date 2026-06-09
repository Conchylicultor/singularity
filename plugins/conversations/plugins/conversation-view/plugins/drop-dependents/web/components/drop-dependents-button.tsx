import { useMemo } from "react";
import { MdDeleteSweep } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/notifications/web";
import { tasksResource, countTransitiveDependents } from "@plugins/tasks/core";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { dropDependents } from "../../shared";

export function DropDependentsItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const tasksResult = useResource(tasksResource);
  const allTasks = useMemo(() => (tasksResult.pending ? [] : tasksResult.data), [tasksResult]);
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
      {isPending ? "Dropping…" : `Drop task + ${dependentCount} dependent(s) & Exit`}
    </DropdownMenuItem>
  );
}
