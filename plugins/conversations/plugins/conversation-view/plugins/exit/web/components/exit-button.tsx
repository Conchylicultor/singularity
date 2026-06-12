import { DropdownMenuItem } from "@plugins/primitives/plugins/ui-kit/web";
import { MdLogout } from "react-icons/md";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/notifications/web";
import { exitConversation } from "../../core";

export function ExitItem({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { mutate, isPending } = useEndpointMutation(exitConversation, {
    onSuccess: () => toast({ type: "conversation", title: "Conversation closed", description: "Closed without changing task state", variant: "success" }),
    onError: (err) => toast({ type: "conversation", title: "Close failed", description: err.message, variant: "error" }),
  });

  const disabled = isPending || live.status === "gone" || live.status === "done" || live.status === "starting";

  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={() => mutate({ params: { id: conversation.id } })}
    >
      <MdLogout className="size-4" />
      {isPending ? "Closing…" : "Close"}
    </DropdownMenuItem>
  );
}
