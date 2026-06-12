import { DropdownMenuItem } from "@plugins/primitives/plugins/ui-kit/web";
import { MdPauseCircle } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/notifications/web";
import { holdAndExit } from "../../shared";

export function HoldAndExitItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { mutate, isPending } = useEndpointMutation(holdAndExit, {
    onSuccess: () => toast({ type: "conversation", title: "Task held", description: "Task held and conversation closed", variant: "success" }),
    onError: (err) => toast({ type: "conversation", title: "Hold & Close failed", description: err.message, variant: "error" }),
  });

  const disabled = isPending || live.status === "gone" || live.status === "done" || live.status === "starting";

  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <MdPauseCircle className="size-4" />
      {isPending ? "Holding…" : "Hold & Close"}
    </DropdownMenuItem>
  );
}
