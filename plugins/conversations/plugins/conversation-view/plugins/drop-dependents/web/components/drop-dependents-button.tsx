import { MdDeleteSweep } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useActiveDependentCount } from "@plugins/tasks/web";
import { DropdownMenuItem } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { dropDependents } from "../../shared";

export function DropDependentsItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const blocked = useActiveDependentCount(conversation.taskId);

  const { mutate, isPending } = useEndpointMutation(dropDependents, {
    onSuccess: (data) => {
      toast({
        type: "conversation",
        title: "Dependents dropped",
        description: `Dropped ${data.dropped} task(s) and closed conversation`,
        variant: "success",
      });
    },
    onError: (err) =>
      toast({
        type: "conversation",
        title: "Drop dependents failed",
        description: err.message,
        variant: "error",
      }),
  });

  // Nothing is waiting on this task (or we do not know yet) ⇒ no sweep to offer.
  if (blocked.pending || blocked.count === 0) return null;
  const dependentCount = blocked.count;

  const disabled =
    isPending ||
    live.status === "gone" ||
    live.status === "done" ||
    live.status === "starting";

  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <MdDeleteSweep className="size-4" />
      {isPending
        ? "Dropping…"
        : `Drop task + ${dependentCount} dependent(s) & Close`}
    </DropdownMenuItem>
  );
}
